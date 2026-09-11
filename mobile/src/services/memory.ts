import * as FileSystem from 'expo-file-system';
import { CONFIG } from '../config';

export interface InteractionLog {
  id: string;
  timestamp: string;
  user_text: string;
  assistant_reply: string;
  type: 'voice' | 'vision' | 'text';
}

export interface NoteMemory {
  id: string;
  text: string;
  timestamp: string;
}

export class MemoryService {
  private static historyFile = (FileSystem.documentDirectory || '') + 'catty_history.json';
  private static notesFile = (FileSystem.documentDirectory || '') + 'catty_notes.json';

  /**
   * Log every question and answer for persistent history
   */
  static async logInteraction(userText: string, replyText: string, type: 'voice' | 'vision' | 'text' = 'voice'): Promise<void> {
    try {
      const history = await this.getHistory();
      const newEntry: InteractionLog = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        user_text: userText,
        assistant_reply: replyText,
        type,
      };
      const updated = [newEntry, ...history].slice(0, 100);
      await FileSystem.writeAsStringAsync(this.historyFile, JSON.stringify(updated));
      console.log('[MemoryService] Logged interaction:', newEntry.id);
    } catch (e) {
      console.warn('[MemoryService] Failed to log interaction:', e);
    }
  }

  /**
   * Get all interaction logs
   */
  static async getHistory(): Promise<InteractionLog[]> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.historyFile);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(this.historyFile);
        return JSON.parse(content);
      }
    } catch (e) {
      console.warn('[MemoryService] Error reading history:', e);
    }
    return [];
  }

  /**
   * Generate 768-dimensional embedding via Google Gemini Embedding API
   */
  private static async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${CONFIG.GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.embedding?.values || null;
      } else {
        const err = await response.text();
        console.warn('[MemoryService] Embedding error:', response.status, err);
      }
    } catch (e) {
      console.error('[MemoryService] Embedding fetch failed:', e);
    }
    return null;
  }

  /**
   * Save a note / memory: Upserts to Pinecone vector DB & local backup
   */
  static async saveNote(content: string): Promise<{ success: boolean; message: string }> {
    try {
      const noteId = `note_${Date.now()}`;
      const timestamp = new Date().toISOString();

      // 1. Generate 768-dim vector embedding
      const vector = await this.getEmbedding(content);

      // 2. Upsert to Pinecone Serverless directly via REST API (No local server needed!)
      if (vector && CONFIG.PINECONE_API_KEY && CONFIG.PINECONE_INDEX_HOST) {
        console.log('[MemoryService] Upserting note to Pinecone Serverless:', content);
        const pineconeRes = await fetch(`${CONFIG.PINECONE_INDEX_HOST}/vectors/upsert`, {
          method: 'POST',
          headers: {
            'Api-Key': CONFIG.PINECONE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vectors: [
              {
                id: noteId,
                values: vector,
                metadata: {
                  text: content,
                  timestamp,
                },
              },
            ],
          }),
        });

        if (pineconeRes.ok) {
          console.log('[MemoryService] Successfully saved note to Pinecone vector memory!');
        } else {
          console.warn('[MemoryService] Pinecone upsert returned status:', pineconeRes.status);
        }
      }

      // 3. Save to on-device persistent storage as backup
      const localNotes = await this.getLocalNotes();
      localNotes.unshift({ id: noteId, text: content, timestamp });
      await FileSystem.writeAsStringAsync(this.notesFile, JSON.stringify(localNotes));

      return {
        success: true,
        message: `I've saved that to memory: "${content}"`,
      };
    } catch (e: any) {
      console.error('[MemoryService] Error saving note:', e);
      return {
        success: false,
        message: `Could not save note: ${e.message}`,
      };
    }
  }

  /**
   * Search notes / memories: Semantic vector search in Pinecone + local fallback
   */
  static async searchNotes(query: string): Promise<{ text: string; speech_reply: string }> {
    try {
      console.log('[MemoryService] Searching Pinecone vector memory for:', query);
      const vector = await this.getEmbedding(query);

      if (vector && CONFIG.PINECONE_API_KEY && CONFIG.PINECONE_INDEX_HOST) {
        const queryRes = await fetch(`${CONFIG.PINECONE_INDEX_HOST}/query`, {
          method: 'POST',
          headers: {
            'Api-Key': CONFIG.PINECONE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vector,
            topK: 3,
            includeMetadata: true,
          }),
        });

        if (queryRes.ok) {
          const queryData = await queryRes.json();
          const matches = queryData.matches || [];
          if (matches.length > 0 && matches[0].score > 0.45) {
            const best = matches[0];
            const memoryText = best.metadata?.text || 'Saved note';
            console.log('[MemoryService] Pinecone matched memory:', memoryText, 'score:', best.score);
            return {
              text: `Memory recalled: ${memoryText}`,
              speech_reply: `I recall you noted: ${memoryText}`,
            };
          }
        }
      }

      // Local fallback search
      const localNotes = await this.getLocalNotes();
      const queryLower = query.toLowerCase();
      const match = localNotes.find((n) => queryLower.split(' ').some((word) => word.length > 3 && n.text.toLowerCase().includes(word)));
      if (match) {
        return {
          text: `Found local note: ${match.text}`,
          speech_reply: `I found this in your notes: ${match.text}`,
        };
      }
    } catch (e) {
      console.error('[MemoryService] Search error:', e);
    }

    return {
      text: `I searched my memory for "${query}", but found no matching notes.`,
      speech_reply: `I couldn't find any notes matching "${query}".`,
    };
  }

  private static async getLocalNotes(): Promise<NoteMemory[]> {
    try {
      const info = await FileSystem.getInfoAsync(this.notesFile);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(this.notesFile);
        return JSON.parse(content);
      }
    } catch (e) {
      console.warn('[MemoryService] Error reading local notes:', e);
    }
    return [];
  }
}
