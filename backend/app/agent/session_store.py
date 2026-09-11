import time
from typing import Dict, Any, List, Optional

try:
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
except ImportError:
    class BaseMessage:
        def __init__(self, content="", **kwargs):
            self.content = content
    class HumanMessage(BaseMessage): pass
    class AIMessage(BaseMessage): pass

class SessionStore:
    """
    Manages in-memory conversational sessions, message history, and pending actions
    for two-way multi-turn confirmation flows.
    """
    def __init__(self, max_history: int = 10, ttl_seconds: int = 1800):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.max_history = max_history
        self.ttl_seconds = ttl_seconds

    def get_session(self, session_id: str) -> Dict[str, Any]:
        self._cleanup_expired()
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "history": [],
                "pending_action": None,
                "awaiting_followup": False,
                "last_active": time.time()
            }
        else:
            self.sessions[session_id]["last_active"] = time.time()
        return self.sessions[session_id]

    def add_message(self, session_id: str, message: BaseMessage):
        session = self.get_session(session_id)
        session["history"].append(message)
        if len(session["history"]) > self.max_history:
            session["history"] = session["history"][-self.max_history:]

    def get_history(self, session_id: str) -> List[BaseMessage]:
        return self.get_session(session_id)["history"]

    def set_pending_action(self, session_id: str, action: Optional[Dict[str, Any]], awaiting_followup: bool = True):
        session = self.get_session(session_id)
        session["pending_action"] = action
        session["awaiting_followup"] = awaiting_followup

    def get_pending_action(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.get_session(session_id).get("pending_action")

    def clear_pending_action(self, session_id: str):
        session = self.get_session(session_id)
        session["pending_action"] = None
        session["awaiting_followup"] = False

    def clear_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]

    def _cleanup_expired(self):
        now = time.time()
        expired = [sid for sid, data in self.sessions.items() if now - data["last_active"] > self.ttl_seconds]
        for sid in expired:
            del self.sessions[sid]

session_store = SessionStore()
