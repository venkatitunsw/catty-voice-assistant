import re
import json
import logging
from typing import Dict, Any, Optional, Tuple

try:
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
except ImportError:
    class SystemMessage:
        def __init__(self, content=""): self.content = content
    class HumanMessage:
        def __init__(self, content=""): self.content = content
    class AIMessage:
        def __init__(self, content="", tool_calls=None):
            self.content = content
            self.tool_calls = tool_calls or []
    class ToolMessage:
        def __init__(self, tool_call_id="", content=""):
            self.content = content
            self.tool_call_id = tool_call_id
from app.config import settings
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import ALL_TOOLS, navigate, make_call, send_whatsapp, play_music, set_alarm, set_timer, toggle_flashlight, get_device_status, save_personal_note, search_personal_notes, get_morning_briefing
from app.agent.session_store import session_store
from app.models.schemas import ActionType, ActionPayload, ChatResponse

logger = logging.getLogger("catty.engine")

class CattyAgentEngine:
    """
    Main LangChain Agent Engine orchestrating Gemini 2.0 Flash, tool calling,
    multi-turn confirmation sessions, and Pinecone RAG memory.
    """
    def __init__(self):
        self.llm = None
        self.tools_by_name = {tool.name: tool for tool in ALL_TOOLS}
        self._initialize_llm()

    def _initialize_llm(self):
        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self.llm = ChatGoogleGenerativeAI(
                    model=settings.GEMINI_MODEL,
                    google_api_key=settings.GEMINI_API_KEY,
                    temperature=0.3,
                    convert_system_message_to_human=False
                )
                logger.info(f"Initialized ChatGoogleGenerativeAI with model: {settings.GEMINI_MODEL}")
            except Exception as e:
                logger.error(f"Failed to initialize ChatGoogleGenerativeAI ({e}). Using rule engine fallback.")
                self.llm = None
        else:
            logger.info("GEMINI_API_KEY not set. Using rule-based fallback agent.")
            self.llm = None

    def process_message(self, message: str, session_id: str = "default_user") -> ChatResponse:
        """
        Process user voice command with multi-turn context and tool calling.
        """
        session = session_store.get_session(session_id)
        pending = session_store.get_pending_action(session_id)
        
        # 1. Handle Pending Confirmation Flow ("Yes", "Sure", "Cancel")
        clean_msg = message.strip().lower()
        if pending:
            if any(affirm in clean_msg for affirm in ["yes", "yeah", "sure", "do it", "send it", "confirm", "ok", "okay", "open"]):
                session_store.clear_pending_action(session_id)
                action_payload = ActionPayload(**pending["action_payload"])
                reply = pending.get("confirm_speech", f"Executing {action_payload.action.value}.")
                return ChatResponse(
                    speech_reply=reply,
                    action=action_payload,
                    awaiting_followup=False,
                    session_id=session_id
                )
            elif any(negate in clean_msg for negate in ["no", "cancel", "don't", "stop", "never mind", "nevermind"]):
                session_store.clear_pending_action(session_id)
                return ChatResponse(
                    speech_reply="Cancelled. Let me know if you need anything else.",
                    action=None,
                    awaiting_followup=False,
                    session_id=session_id
                )

        # 2. Process via Gemini LangChain LLM if available
        if self.llm:
            try:
                return self._run_llm_agent(message, session_id)
            except Exception as e:
                logger.error(f"LLM execution error ({e}). Falling back to rule-based engine.")

        # 3. Fast Rule-Based Fallback (Handles all commands if no API key or offline)
        return self._run_rule_agent(message, session_id)

    def _run_llm_agent(self, user_text: str, session_id: str) -> ChatResponse:
        history = session_store.get_history(session_id)
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        messages.extend(history)
        messages.append(HumanMessage(content=user_text))

        llm_with_tools = self.llm.bind_tools(ALL_TOOLS)
        ai_msg = llm_with_tools.invoke(messages)

        # Check for tool calls
        if ai_msg.tool_calls:
            for tool_call in ai_msg.tool_calls:
                t_name = tool_call["name"]
                t_args = tool_call["args"]
                tool_fn = self.tools_by_name.get(t_name)
                
                if tool_fn:
                    tool_output = tool_fn.invoke(t_args)
                    
                    # Try to parse as action payload JSON
                    try:
                        parsed = json.loads(tool_output)
                        if isinstance(parsed, dict) and "action" in parsed:
                            action_type = ActionType(parsed["action"])
                            action_payload = ActionPayload(
                                action=action_type,
                                params=parsed.get("params", {}),
                                description=parsed.get("description")
                            )

                            # Determine natural speech reply
                            speech_reply = parsed.get("description", f"Executing {action_type.value}.")
                            if ai_msg.content and isinstance(ai_msg.content, str) and len(ai_msg.content.strip()) > 0:
                                speech_reply = ai_msg.content.strip()

                            # Save to session history
                            session_store.add_message(session_id, HumanMessage(content=user_text))
                            session_store.add_message(session_id, AIMessage(content=speech_reply))

                            return ChatResponse(
                                speech_reply=speech_reply,
                                action=action_payload,
                                awaiting_followup=False,
                                session_id=session_id
                            )
                    except Exception:
                        pass
                    
                    # If tool returned text memory (e.g. search_personal_notes)
                    messages.append(ai_msg)
                    messages.append(ToolMessage(tool_call_id=tool_call["id"], content=str(tool_output)))
                    final_reply_msg = self.llm.invoke(messages)
                    final_text = final_reply_msg.content if isinstance(final_reply_msg.content, str) else str(final_reply_msg.content)
                    
                    session_store.add_message(session_id, HumanMessage(content=user_text))
                    session_store.add_message(session_id, AIMessage(content=final_text))
                    
                    return ChatResponse(
                        speech_reply=final_text,
                        action=None,
                        awaiting_followup=False,
                        session_id=session_id
                    )

        # Standard conversational response
        reply_text = ai_msg.content if isinstance(ai_msg.content, str) else str(ai_msg.content)
        awaiting = "?" in reply_text or "would you like" in reply_text.lower() or "should i" in reply_text.lower()

        session_store.add_message(session_id, HumanMessage(content=user_text))
        session_store.add_message(session_id, AIMessage(content=reply_text))

        return ChatResponse(
            speech_reply=reply_text,
            action=None,
            awaiting_followup=awaiting,
            session_id=session_id
        )

    def _run_rule_agent(self, text: str, session_id: str) -> ChatResponse:
        """Deterministic rule-based agent for testing actions offline or without an API key."""
        lower = text.lower().strip()

        # 1. Navigation
        nav_match = re.search(r"(navigate|directions?|take me|drive|go)\s+to\s+(.+)", lower)
        if nav_match:
            dest = nav_match.group(2).strip()
            payload = ActionPayload(action=ActionType.NAVIGATE, params={"destination": dest, "mode": "driving"})
            return ChatResponse(speech_reply=f"Navigating to {dest} on Google Maps.", action=payload, session_id=session_id)

        # 2. WhatsApp
        wa_match = re.search(r"(?:send\s+a\s+)?(?:whatsapp|message)\s+(?:to\s+)?([a-zA-Z0-9]+)\s+(?:saying|that)\s+(.+)", lower)
        if wa_match:
            target = wa_match.group(1).strip()
            msg = wa_match.group(2).strip()
            payload = ActionPayload(action=ActionType.WHATSAPP, params={"target": target, "message": msg})
            return ChatResponse(speech_reply=f"Opening WhatsApp to message {target}: '{msg}'", action=payload, session_id=session_id)
        
        wa_contact_only = re.search(r"(?:send\s+a\s+)?(?:whatsapp|message)\s+(?:to\s+)?([a-zA-Z0-9]+)", lower)
        if wa_contact_only and not lower.startswith("what "):
            target = wa_contact_only.group(1).strip()
            session_store.set_pending_action(session_id, {
                "action_payload": {"action": ActionType.WHATSAPP.value, "params": {"target": target, "message": "Hello"}},
                "confirm_speech": f"Opening WhatsApp for {target}."
            })
            return ChatResponse(
                speech_reply=f"What message would you like to send to {target}?",
                action=None,
                awaiting_followup=True,
                pending_action="WHATSAPP",
                session_id=session_id
            )

        # 3. Phone Call
        call_match = re.search(r"call\s+([a-zA-Z0-9\+\s]+)", lower)
        if call_match:
            target = call_match.group(1).strip()
            payload = ActionPayload(action=ActionType.CALL, params={"target": target})
            return ChatResponse(speech_reply=f"Calling {target}.", action=payload, session_id=session_id)

        # 4. Music
        music_match = re.search(r"play\s+(.+)", lower)
        if music_match:
            query = music_match.group(1).strip()
            payload = ActionPayload(action=ActionType.PLAY_MUSIC, params={"query": query})
            return ChatResponse(speech_reply=f"Playing {query} on YouTube Music.", action=payload, session_id=session_id)

        # 5. Alarm
        alarm_match = re.search(r"(?:set\s+an?\s+alarm\s+(?:for\s+)?|alarm\s+at\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", lower)
        if alarm_match:
            hr = int(alarm_match.group(1))
            mn = int(alarm_match.group(2)) if alarm_match.group(2) else 0
            ampm = alarm_match.group(3)
            if ampm == "pm" and hr < 12:
                hr += 12
            elif ampm == "am" and hr == 12:
                hr = 0
            payload = ActionPayload(action=ActionType.SET_ALARM, params={"hour": hr, "minute": mn, "label": "Alarm"})
            return ChatResponse(speech_reply=f"Setting alarm for {hr:02d}:{mn:02d}.", action=payload, session_id=session_id)

        # 6. Timer
        timer_match = re.search(r"(?:set\s+a?\s*timer\s+(?:for\s+)?|timer\s+for\s+)(\d+)\s*(minute|minutes|min|second|seconds|sec)", lower)
        if timer_match:
            amount = int(timer_match.group(1))
            unit = timer_match.group(2)
            secs = amount * 60 if "min" in unit else amount
            payload = ActionPayload(action=ActionType.SET_TIMER, params={"duration_seconds": secs, "label": "Timer"})
            return ChatResponse(speech_reply=f"Setting timer for {amount} {unit}.", action=payload, session_id=session_id)

        # 7. Flashlight
        if "flashlight" in lower or "torch" in lower:
            state = "on" in lower or "enable" in lower or "start" in lower
            payload = ActionPayload(action=ActionType.TOGGLE_FLASHLIGHT, params={"state": state})
            return ChatResponse(speech_reply=f"Turning flashlight {'on' if state else 'off'}.", action=payload, session_id=session_id)

        # 8. Battery
        if "battery" in lower or "charge" in lower:
            payload = ActionPayload(action=ActionType.GET_BATTERY_STATUS, params={})
            return ChatResponse(speech_reply="Checking your battery status.", action=payload, session_id=session_id)

        # 9. Notes / Memory
        rem_match = re.search(r"(?:remember\s+(?:that\s+)?|note\s+down\s+)(.+)", lower)
        if rem_match:
            note_text = rem_match.group(1).strip()
            from app.rag.memory import memory_store
            memory_store.upsert_note(content=note_text, category="fact")
            payload = ActionPayload(action=ActionType.SAVE_NOTE, params={"content": note_text})
            return ChatResponse(speech_reply=f"I've saved that to memory: {note_text}", action=payload, session_id=session_id)

        # 10. Morning Briefing
        if "morning" in lower:
            payload = ActionPayload(action=ActionType.MORNING_BRIEFING, params={"notes_summary": "Ready for today"})
            return ChatResponse(speech_reply="Good morning! Today is looking great. Starting your morning briefing.", action=payload, session_id=session_id)

        # Default conversational
        return ChatResponse(
            speech_reply=f"I heard: '{text}'. How can I help with maps, calls, music, alarms, or your notes?",
            action=None,
            awaiting_followup=False,
            session_id=session_id
        )

# Global engine instance
agent_engine = CattyAgentEngine()
