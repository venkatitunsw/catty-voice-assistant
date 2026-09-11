import * as Speech from 'expo-speech';
import { CONFIG } from '../config';

export class TTSService {
  private static isSpeaking = false;

  /**
   * Speak text using native Android TextToSpeech
   */
  static speak(text: string, onDone?: () => void): void {
    if (!text || text.trim().length === 0) return;

    // Stop any existing utterance
    this.stop();

    this.isSpeaking = true;
    console.log(`[TTS] Speaking: "${text}"`);

    Speech.speak(text, {
      language: CONFIG.TTS_LANGUAGE,
      pitch: CONFIG.TTS_PITCH,
      rate: CONFIG.TTS_RATE,
      onDone: () => {
        this.isSpeaking = false;
        console.log('[TTS] Finished speaking.');
        if (onDone) onDone();
      },
      onError: (err) => {
        this.isSpeaking = false;
        console.warn('[TTS] Speech error:', err);
      }
    });
  }

  /**
   * Stop audio playback immediately (Barge-in)
   */
  static stop(): void {
    if (this.isSpeaking) {
      Speech.stop();
      this.isSpeaking = false;
    }
  }

  static getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}
