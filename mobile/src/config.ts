import { Platform } from 'react-native';

/**
 * Catty Assistant Configuration
 * If testing on a physical Android phone via Expo Go, replace this with your computer's local Wi-Fi IP.
 * (e.g. 'http://192.168.1.15:8000')
 * If testing on an Android Emulator, 'http://10.0.2.2:8000' automatically maps to your PC's localhost:8000.
 */
export const CONFIG = {
  // Google Gemini API Configuration (Direct Cloud Access)
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE',
  GEMINI_MODEL: 'gemini-2.5-flash',

  // Local Backend URL (Optional fallback)
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8005',

  // Pinecone Serverless Vector Database (Direct Cloud Access)
  PINECONE_API_KEY: process.env.EXPO_PUBLIC_PINECONE_API_KEY || 'YOUR_PINECONE_API_KEY_HERE',
  PINECONE_INDEX_NAME: process.env.EXPO_PUBLIC_PINECONE_INDEX_NAME || 'catty-memory',
  PINECONE_INDEX_HOST: process.env.EXPO_PUBLIC_PINECONE_INDEX_HOST || 'https://your-index-host.pinecone.io',
  
  // Audio configuration
  SAMPLE_RATE: 16000,
  AUTO_RELISTEN_ON_FOLLOWUP: true,
  
  // TTS configuration
  TTS_RATE: 1.0,
  TTS_PITCH: 1.0,
  TTS_LANGUAGE: 'en-US'
};
