import sys
import os

# Ensure backend root is in python path when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.schemas import ChatRequest, ChatResponse, NoteItem
from app.agent.engine import agent_engine
from app.rag.memory import memory_store
from app.agent.session_store import session_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("catty.api")

def transcribe_audio_bytes(audio_bytes: bytes, mime_type: str = "audio/m4a") -> str:
    """Uses Gemini 2.0 Flash to accurately transcribe real user speech audio."""
    if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                    "Transcribe the user's speech audio verbatim. Return ONLY the spoken words with no extra quotes, commentary, or timestamps."
                ]
            )
            transcript = response.text.strip() if response.text else ""
            logger.info(f"Gemini Speech-To-Text recognized: '{transcript}'")
            return transcript
        except Exception as e:
            logger.error(f"Gemini audio transcription error: {e}")
            return ""
    return ""

app = FastAPI(
    title="Catty Voice Assistant Brain API",
    description="Backend agent powering Catty Voice Assistant with Gemini, Pinecone RAG, and Android Action Tools",
    version="1.0.0"
)

# Enable CORS for local network and mobile devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": "catty-voice-assistant",
        "gemini_model": settings.GEMINI_MODEL,
        "gemini_configured": bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here"),
        "pinecone_configured": bool(settings.PINECONE_API_KEY and settings.PINECONE_API_KEY != "your_pinecone_api_key_here")
    }

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """
    Main voice/text interaction endpoint.
    Receives user utterance and returns speech response + executable device action.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    logger.info(f"Received query [Session: {request.session_id}]: {request.message}")
    response = agent_engine.process_message(
        message=request.message,
        session_id=request.session_id
    )
    logger.info(f"Returning reply: {response.speech_reply} | Action: {response.action.action.value if response.action else 'None'}")
    return response

@app.post("/audio-chat")
async def audio_chat_endpoint(file: UploadFile = File(...), session_id: str = Form("default_user")):
    """
    Direct Voice Audio Endpoint.
    Receives recorded speech audio from phone, transcribes what the user actually said
    using Gemini 2.0 Flash, and executes the dynamic agent tool pipeline.
    """
    audio_bytes = await file.read()
    mime = file.content_type or "audio/m4a"
    logger.info(f"Received audio file ({len(audio_bytes)} bytes, mime: {mime}) for session: {session_id}")
    
    # Real transcription via Gemini 2.0 Flash
    transcript = transcribe_audio_bytes(audio_bytes, mime)
    logger.info(f"Transcribed user speech: '{transcript}'")
    
    if not transcript or not transcript.strip():
        return {
            "user_transcript": "",
            "speech_reply": "I couldn't hear that clearly. Could you please say that again?",
            "action": None,
            "awaiting_followup": True,
            "pending_action": None,
            "session_id": session_id
        }

    # Process user query through Gemini LangChain Agent
    agent_response = agent_engine.process_message(message=transcript, session_id=session_id)
    
    return {
        "user_transcript": transcript,
        "speech_reply": agent_response.speech_reply,
        "action": agent_response.action.model_dump() if agent_response.action else None,
        "awaiting_followup": agent_response.awaiting_followup,
        "pending_action": agent_response.pending_action,
        "session_id": session_id
    }

@app.get("/memory")
def get_memories(query: str = ""):
    """Retrieve saved notes/memories from Pinecone or local store."""
    if query:
        return memory_store.search_notes(query=query, top_k=5)
    return memory_store.in_memory_store

@app.post("/memory")
def add_memory(item: NoteItem):
    """Save a note directly into vector memory."""
    saved = memory_store.upsert_note(content=item.content, category=item.category)
    return {"status": "saved", "note": saved}

@app.delete("/session/{session_id}")
def reset_session(session_id: str):
    """Clear conversation history and any pending confirmations for a session."""
    session_store.clear_session(session_id)
    return {"status": "session_cleared", "session_id": session_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
