from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class ActionType(str, Enum):
    NAVIGATE = "NAVIGATE"
    CALL = "CALL"
    WHATSAPP = "WHATSAPP"
    PLAY_MUSIC = "PLAY_MUSIC"
    SET_ALARM = "SET_ALARM"
    SET_TIMER = "SET_TIMER"
    TOGGLE_FLASHLIGHT = "TOGGLE_FLASHLIGHT"
    GET_BATTERY_STATUS = "GET_BATTERY_STATUS"
    SAVE_NOTE = "SAVE_NOTE"
    SEARCH_NOTES = "SEARCH_NOTES"
    MORNING_BRIEFING = "MORNING_BRIEFING"
    NONE = "NONE"

class ActionPayload(BaseModel):
    action: ActionType
    params: Dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_user"
    device_info: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    speech_reply: str
    action: Optional[ActionPayload] = None
    awaiting_followup: bool = False
    pending_action: Optional[str] = None
    session_id: str

class NoteItem(BaseModel):
    id: Optional[str] = None
    content: str
    category: str = "general"
    timestamp: Optional[str] = None
