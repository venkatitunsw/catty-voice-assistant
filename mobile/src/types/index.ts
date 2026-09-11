export type ActionType =
  | 'NAVIGATE'
  | 'CALL'
  | 'WHATSAPP'
  | 'PLAY_MUSIC'
  | 'TOGGLE_FLASHLIGHT'
  | 'GET_BATTERY_STATUS'
  | 'WEB_SEARCH'
  | 'ANALYZE_VISION'
  | 'SAVE_NOTE'
  | 'SEARCH_NOTES'
  | 'SET_ALARM'
  | 'SET_TIMER'
  | 'NONE';

export interface ActionPayload {
  action: ActionType;
  params: Record<string, any>;
  description?: string;
}

export interface ChatResponse {
  speech_reply: string;
  action?: ActionPayload | null;
  awaiting_followup: boolean;
  pending_action?: string | null;
  session_id: string;
}

export type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'EXECUTING';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'catty';
  text: string;
  timestamp: string;
  action?: ActionPayload | null;
}
