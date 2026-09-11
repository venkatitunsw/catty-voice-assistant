"""
Automated Test Suite for Catty Assistant Backend
Validates all actions: Maps, Calls, WhatsApp, YT Music, Alarms, Timers, Flashlight, Battery, Notes RAG, and Two-Way Confirmations.
"""
import sys
import os

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.agent.engine import agent_engine
from app.models.schemas import ActionType
from app.agent.session_store import session_store

def run_tests():
    print("=" * 60)
    print("  CATTY VOICE ASSISTANT - BACKEND VERIFICATION SUITE")
    print("=" * 60)

    test_cases = [
        ("Navigation (Google Maps)", "Navigate to Central Station", ActionType.NAVIGATE),
        ("Phone Call", "Call Mom", ActionType.CALL),
        ("WhatsApp Direct Message", "Send a WhatsApp to Alex saying I will arrive in 10 minutes", ActionType.WHATSAPP),
        ("YouTube Music", "Play Bohemian Rhapsody", ActionType.PLAY_MUSIC),
        ("Clock Alarm", "Set an alarm for 7:30 AM", ActionType.SET_ALARM),
        ("Countdown Timer", "Set a timer for 8 minutes", ActionType.SET_TIMER),
        ("Flashlight Toggle", "Turn on the flashlight", ActionType.TOGGLE_FLASHLIGHT),
        ("Battery Status", "Check my battery percentage", ActionType.GET_BATTERY_STATUS),
        ("Memory Note Save", "Remember that my car keys are on the kitchen shelf", ActionType.SAVE_NOTE),
        ("Morning Briefing", "Good morning Catty", ActionType.MORNING_BRIEFING),
    ]

    passed = 0
    total = len(test_cases)

    for name, prompt, expected_action in test_cases:
        response = agent_engine.process_message(message=prompt, session_id="test_suite")
        action_received = response.action.action if response.action else None
        
        status = "PASSED" if action_received == expected_action else "FAILED"
        if status == "PASSED":
            passed += 1
            print(f"[{status}] {name}")
            print(f"         Prompt:   \"{prompt}\"")
            print(f"         Action:   {action_received.value}")
            print(f"         Spoken:   \"{response.speech_reply}\"\n")
        else:
            print(f"[{status}] {name}")
            print(f"         Prompt:   \"{prompt}\"")
            print(f"         Expected: {expected_action.value} | Got: {action_received}\n")

    # Test Multi-Turn Two-Way Confirmation Flow
    print("-" * 60)
    print("Testing Multi-Turn Two-Way Confirmation Flow...")
    session_id = "test_multiturn"
    session_store.clear_session(session_id)

    # Step 1: User says ambiguous WhatsApp command
    step1 = agent_engine.process_message(message="Send a WhatsApp to David", session_id=session_id)
    print(f"Step 1 - User: 'Send a WhatsApp to David'")
    print(f"         Catty: '{step1.speech_reply}'")
    print(f"         Awaiting Followup: {step1.awaiting_followup}")
    assert step1.awaiting_followup is True, "Step 1 should await follow-up"

    # Step 2: User provides the message content
    step2 = agent_engine.process_message(message="Yes", session_id=session_id)
    print(f"Step 2 - User: 'Yes' (Confirming)")
    print(f"         Catty: '{step2.speech_reply}'")
    print(f"         Action: {step2.action.action.value if step2.action else None}")
    assert step2.action is not None and step2.action.action == ActionType.WHATSAPP, "Step 2 should dispatch WHATSAPP action upon confirmation"

    print("\n" + "=" * 60)
    print(f"TEST RESULTS: {passed}/{total} Basic Action Tests Passed + Multi-turn Confirmation Verified!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
