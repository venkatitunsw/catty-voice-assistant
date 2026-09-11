import * as FileSystem from 'expo-file-system';
import { CONFIG } from '../config';
import { ChatResponse, ActionPayload } from '../types';

export class ApiService {
  private static sessionId: string = 'mobile_user_' + Math.random().toString(36).substring(7);

  /**
   * Process voice audio directly with Google Gemini 2.5 Flash
   * Eliminates firewall, local network, and proxy connection errors!
   */
  static async sendAudio(audioUri: string): Promise<{
    user_transcript: string;
    speech_reply: string;
    action?: ActionPayload | null;
    awaiting_followup: boolean;
    pending_action?: string | null;
    session_id: string;
  }> {
    try {
      console.log('[ApiService] Reading audio file as base64 for Gemini 2.5 Flash:', audioUri);
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

      const promptText = `You are Catty, an intelligent Android voice assistant with live web search and camera vision.
Listen carefully to the user's speech audio. The audio contains English speech commands and may feature various English accents (such as Indian English, South Asian, British, or American), conversational pacing, and background environment sounds.

Task 1: Transcribe the user's spoken words verbatim into "user_transcript".
Phonetic & Acoustic Guidance:
- If words sound like: "flashlight", "torch", "light", "flash" -> transcribe as "turn on/off flashlight".
- If words sound like: "call", "dial", "phone" -> transcribe as "call [target]".
- If words sound like: "whatsapp", "message", "text" -> transcribe as "whatsapp [target] saying [message]".
- If words sound like: "navigate", "directions to", "take me to", "go to" -> transcribe as "navigate to [destination]".
- If words sound like: "battery", "percentage", "charge" -> transcribe as "check battery status".
- If words sound like: "play", "listen to" -> transcribe as "play [query]".
- If words sound like: "look at this", "what is this", "read this", "what am I holding", "scan this" -> transcribe as "look at this".
- If words sound like questions about weather, news, sports, facts, people, or places -> transcribe verbatim.
Transcribe what the person actually meant to say accurately.

Task 2: Identify the user's intended action and extract parameters:
- "NAVIGATE": If user says navigate, directions, take me to, go to, drive to [destination]. Extract "destination" (string) and "mode" (default "driving").
- "CALL": If user says call, phone, or dial [someone or number]. Extract "target" (clean name of the person or numeric phone number ONLY; do NOT include words like 'to', 'call', 'the individual', 'contact', 'my').
- "WHATSAPP": If user says whatsapp, message, or text [someone] saying [message]. Extract "target" (clean name of the person or phone number ONLY; omit 'to', 'the individual', 'contact') and "message" (the message body to send).
- "PLAY_MUSIC": If user says play, listen to [song or artist]. Extract "query" (string).
- "TOGGLE_FLASHLIGHT": If user asks to turn on/off flashlight or torch. Extract "state" (boolean: true for on, false for off).
- "GET_BATTERY_STATUS": If user asks about battery percentage, battery level, or charging.
- "ANALYZE_VISION": If user says look at this, what is this, what am I holding, read this, scan this, describe what you see.
- "WEB_SEARCH": If user asks about current events, live news, weather forecast, facts, who won a match, stocks, definitions, or search queries. Extract "query" (the search query string).
- "SAVE_NOTE": If user says remember that, save note, note that, or remember [content]. Extract "content" (string).
- "SEARCH_NOTES": If user asks where did I put, where is my, what did I say about, search my notes for, or recall [query]. Extract "query" (string).
- "NONE": For general conversational talk.

Task 3: Spoken reply:
Provide a natural, concise 1-sentence reply in "speech_reply" confirming what you are doing (e.g. "Looking up the weather for you.", "Calling David.", "Turning on the flashlight.", "Analyzing what you're looking at.", "Saving that to memory.").

Return ONLY a valid JSON object matching this schema:
{
  "user_transcript": "exact words spoken by user",
  "speech_reply": "short 1-sentence response",
  "action": {
    "action": "NAVIGATE" | "CALL" | "WHATSAPP" | "PLAY_MUSIC" | "TOGGLE_FLASHLIGHT" | "GET_BATTERY_STATUS" | "WEB_SEARCH" | "ANALYZE_VISION" | "SAVE_NOTE" | "SEARCH_NOTES" | "NONE",
    "params": { ... }
  },
  "awaiting_followup": false
}`;

      const body = {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'audio/mp4',
                  data: base64Audio,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.0,
        },
      };

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsed = JSON.parse(rawJsonText);
          console.log('[ApiService] Gemini recognized voice & action:', parsed);
          return {
            user_transcript: parsed.user_transcript || 'Voice Command',
            speech_reply: parsed.speech_reply || 'Understood.',
            action: parsed.action?.action && parsed.action.action !== 'NONE' ? parsed.action : null,
            awaiting_followup: parsed.awaiting_followup || false,
            pending_action: null,
            session_id: this.sessionId,
          };
        }
      } else {
        const errText = await response.text();
        console.warn(`[ApiService] Gemini direct API returned ${response.status}:`, errText);
      }
    } catch (error) {
      console.error('[ApiService] Direct Gemini audio processing error:', error);
    }

    return {
      user_transcript: 'Voice Command',
      speech_reply: 'Sorry, I had trouble processing your speech with Gemini. Please try again.',
      action: null,
      awaiting_followup: false,
      session_id: this.sessionId,
    };
  }

  /**
   * Process text command with Gemini 2.5 Flash directly
   */
  static async sendMessage(message: string): Promise<ChatResponse> {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const prompt = `You are Catty, an Android voice and vision assistant.
User command: "${message}".
Extract the task: NAVIGATE, CALL, WHATSAPP, PLAY_MUSIC, TOGGLE_FLASHLIGHT, GET_BATTERY_STATUS, WEB_SEARCH, ANALYZE_VISION, SAVE_NOTE, SEARCH_NOTES, or NONE.
- NAVIGATE: params { destination: string, mode: string }
- CALL: params { target: string (clean contact name or digits) }
- WHATSAPP: params { target: string, message: string }
- PLAY_MUSIC: params { query: string }
- TOGGLE_FLASHLIGHT: params { state: boolean }
- GET_BATTERY_STATUS: params {}
- WEB_SEARCH: If user asks about weather, live news, facts, current events, or search queries. params { query: string }
- ANALYZE_VISION: If user says look at this, what is this, what am I holding, read this. params {}
- SAVE_NOTE: If user says remember that, save note, note that, or remember [content]. params { content: string }
- SEARCH_NOTES: If user asks where did I put, where is my, what did I say about, search my notes for, or recall [query]. params { query: string }
- NONE: General conversational talk.
Return JSON:
{
  "speech_reply": "short spoken response (1 sentence)",
  "action": { "action": "ACTION_NAME", "params": { ... } },
  "awaiting_followup": false
}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            speech_reply: parsed.speech_reply,
            action: parsed.action?.action !== 'NONE' ? parsed.action : null,
            awaiting_followup: parsed.awaiting_followup || false,
            pending_action: null,
            session_id: this.sessionId,
          };
        }
      }
    } catch (e) {
      console.warn('[ApiService] Text sendMessage error:', e);
    }

    return {
      speech_reply: `I heard "${message}".`,
      action: null,
      awaiting_followup: false,
      session_id: this.sessionId,
    };
  }

  /**
   * Real-Time Live Web Search using Gemini 2.5 Flash Google Search Grounding
   */
  static async performWebSearch(query: string): Promise<{ text: string; speech_reply: string }> {
    try {
      console.log('[ApiService] Performing live Google Search grounding for:', query);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are Catty, an intelligent assistant. Answer the user's question clearly and concisely in 2-3 sentences max for TextToSpeech playback based on live Google search data. Question: "${query}"`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const searchResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (searchResult) {
          console.log('[ApiService] Web Search Result:', searchResult);
          return {
            text: searchResult,
            speech_reply: searchResult,
          };
        }
      } else {
        const err = await response.text();
        console.warn('[ApiService] Web search failed with status:', response.status, err);
      }
    } catch (e) {
      console.error('[ApiService] Web search error:', e);
    }

    return {
      text: `I searched the web for "${query}", but couldn't retrieve live results right now.`,
      speech_reply: `I searched for "${query}", but couldn't retrieve results right now.`,
    };
  }

  /**
   * Multimodal Camera Vision: Analyze what the camera sees with Gemini 2.5 Flash
   */
  static async analyzeImage(base64Image: string, question?: string): Promise<{ text: string; speech_reply: string }> {
    try {
      console.log('[ApiService] Analyzing image with Gemini 2.5 Flash Vision...');
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const prompt = question && question.trim()
        ? `You are Catty Vision. Look closely at this image from the device camera and answer the user's question concisely in 2-3 spoken sentences. User asks: "${question}"`
        : `You are Catty Vision. Look at this camera image and describe what you see, identify key objects or text, and summarize it in 2-3 spoken sentences.`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Image,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const visionText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (visionText) {
          console.log('[ApiService] Vision result:', visionText);
          return {
            text: visionText,
            speech_reply: visionText,
          };
        }
      } else {
        const err = await response.text();
        console.warn('[ApiService] Vision API error:', response.status, err);
      }
    } catch (e) {
      console.error('[ApiService] Vision error:', e);
    }

    return {
      text: "I couldn't analyze the image properly. Please try snapping again.",
      speech_reply: "I had trouble analyzing that image. Please try again.",
    };
  }

  static async checkHealth(): Promise<{ status: string; gemini_configured: boolean; pinecone_configured: boolean }> {
    return {
      status: 'healthy',
      gemini_configured: !!CONFIG.GEMINI_API_KEY,
      pinecone_configured: true,
    };
  }

  static getSessionId(): string {
    return this.sessionId;
  }
}
