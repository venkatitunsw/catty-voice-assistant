import json
from typing import Optional

try:
    from langchain_core.tools import tool
except ImportError:
    def tool(fn):
        fn.name = fn.__name__
        fn.invoke = lambda args: fn(**args) if isinstance(args, dict) else fn(args)
        return fn
from app.rag.memory import memory_store
from app.models.schemas import ActionType

@tool
def navigate(destination: str, mode: str = "driving") -> str:
    """Trigger Google Maps navigation to a specific destination.
    Args:
        destination: Address, place name, or city (e.g. 'Central Park', 'Times Square').
        mode: Navigation mode, one of 'driving', 'walking', 'bicycling', or 'transit'.
    """
    payload = {
        "action": ActionType.NAVIGATE.value,
        "params": {
            "destination": destination,
            "mode": mode
        },
        "description": f"Starting navigation to {destination} ({mode})"
    }
    return json.dumps(payload)

@tool
def make_call(contact_or_number: str) -> str:
    """Initiate a phone call to a contact name or phone number.
    Args:
        contact_or_number: Name of the contact or direct phone number (e.g. 'Mom', '+1234567890').
    """
    payload = {
        "action": ActionType.CALL.value,
        "params": {
            "target": contact_or_number
        },
        "description": f"Calling {contact_or_number}"
    }
    return json.dumps(payload)

@tool
def send_whatsapp(contact_or_number: str, message: str) -> str:
    """Pre-fill and prepare a WhatsApp message for a contact or phone number.
    Args:
        contact_or_number: Name of contact or phone number (e.g. 'David', '+1234567890').
        message: The text content of the message to send.
    """
    payload = {
        "action": ActionType.WHATSAPP.value,
        "params": {
            "target": contact_or_number,
            "message": message
        },
        "description": f"Opening WhatsApp to send message to {contact_or_number}: '{message}'"
    }
    return json.dumps(payload)

@tool
def play_music(query: str) -> str:
    """Search and play a song, artist, album, or playlist on YouTube Music.
    Args:
        query: Song name or artist (e.g. 'Bohemian Rhapsody by Queen', 'Coldplay playlist').
    """
    payload = {
        "action": ActionType.PLAY_MUSIC.value,
        "params": {
            "query": query
        },
        "description": f"Playing '{query}' on YouTube Music"
    }
    return json.dumps(payload)

@tool
def set_alarm(hour: int, minute: int, label: str = "Alarm") -> str:
    """Set an alarm on the device's clock.
    Args:
        hour: Hour in 24-hour format (0-23, e.g. 7 for 7 AM, 19 for 7 PM).
        minute: Minute (0-59).
        label: Description or label for the alarm (e.g. 'Gym', 'Wake up').
    """
    payload = {
        "action": ActionType.SET_ALARM.value,
        "params": {
            "hour": hour,
            "minute": minute,
            "label": label
        },
        "description": f"Setting alarm for {hour:02d}:{minute:02d} labelled '{label}'"
    }
    return json.dumps(payload)

@tool
def set_timer(duration_seconds: int, label: str = "Timer") -> str:
    """Set a countdown timer on the device's clock.
    Args:
        duration_seconds: Duration of the timer in seconds (e.g. 480 for 8 minutes).
        label: Description or label (e.g. 'Pasta', 'Workout').
    """
    payload = {
        "action": ActionType.SET_TIMER.value,
        "params": {
            "duration_seconds": duration_seconds,
            "label": label
        },
        "description": f"Setting timer for {duration_seconds} seconds labelled '{label}'"
    }
    return json.dumps(payload)

@tool
def toggle_flashlight(state: bool) -> str:
    """Turn the device's flashlight / torch on or off.
    Args:
        state: True to turn flashlight ON, False to turn OFF.
    """
    payload = {
        "action": ActionType.TOGGLE_FLASHLIGHT.value,
        "params": {
            "state": state
        },
        "description": f"Turning flashlight {'ON' if state else 'OFF'}"
    }
    return json.dumps(payload)

@tool
def get_device_status() -> str:
    """Query the device hardware status including battery percentage and charging state."""
    payload = {
        "action": ActionType.GET_BATTERY_STATUS.value,
        "params": {},
        "description": "Checking battery and device status"
    }
    return json.dumps(payload)

@tool
def save_personal_note(note_content: str, category: str = "general") -> str:
    """Store a personal note, fact, reminder, or preference into Catty's long-term Pinecone memory.
    Use this when the user says 'remember that...', 'note down...', or gives personal preferences.
    Args:
        note_content: The text of the note or fact to remember.
        category: Optional category ('general', 'fact', 'preference', 'reminder').
    """
    saved = memory_store.upsert_note(content=note_content, category=category)
    payload = {
        "action": ActionType.SAVE_NOTE.value,
        "params": {
            "content": note_content,
            "category": category,
            "id": saved.get("id")
        },
        "description": f"Saved to memory: '{note_content}'"
    }
    return json.dumps(payload)

@tool
def search_personal_notes(query: str) -> str:
    """Search Catty's long-term Pinecone memory for user notes, facts, past locations, or preferences.
    Use this when the user asks questions like 'where did I put my...', 'what is my...', or requests saved info.
    Args:
        query: What to search memory for.
    """
    memories = memory_store.search_notes(query=query, top_k=3)
    if not memories:
        return "No memories found matching that query."
    
    formatted = "\n".join([f"- ({m['category']}) {m['content']} [Saved on {m['timestamp']}]" for m in memories])
    return f"Retrieved memories:\n{formatted}"

@tool
def get_morning_briefing() -> str:
    """Generate a morning briefing routine: checks pending notes/reminders, date/time, and prepares morning music."""
    memories = memory_store.search_notes(query="reminder today morning priority", top_k=3)
    notes_summary = ", ".join([m["content"] for m in memories]) if memories else "No pending reminders."
    
    payload = {
        "action": ActionType.MORNING_BRIEFING.value,
        "params": {
            "notes_summary": notes_summary
        },
        "description": "Triggering morning briefing routine"
    }
    return json.dumps(payload)

# Full tool collection for LangChain agent
ALL_TOOLS = [
    navigate,
    make_call,
    send_whatsapp,
    play_music,
    set_alarm,
    set_timer,
    toggle_flashlight,
    get_device_status,
    save_personal_note,
    search_personal_notes,
    get_morning_briefing
]
