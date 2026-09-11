# Catty: Multimodal Voice, Vision & Search Assistant 🐾

> An open-source, 100% zero-cost multimodal AI assistant for Android (Siri & Google Assistant alternative) powered by **Google Gemini 2.5 Flash**, **Pinecone Serverless Vector Memory**, and **Android Native Hardware Controls**.

Catty runs **100% serverless and cloud-native** directly from your phone or tablet—no local computer or backend server required!

---

## ✨ Key Capabilities

- **🎙️ Zero-Lag Voice Recognition**: 1-channel mono acoustic audio streaming directly to Google Gemini 2.5 Flash with deterministic greedy decoding (	emperature: 0.0), eliminating microphone phase cancellation and transcription delays.
- **👁️ Multimodal Camera Vision (Catty Eye)**:
  - Live high-definition camera viewfinder with scanner reticle, HUD status indicator, and quick torch toggle.
  - **📸 SNAP & ASK CATTY** Shutter: Takes a high-resolution photo and analyzes objects, text, food, documents, and environments using Gemini 2.5 Flash Vision.
  - **Voice-Triggered Vision**: Say *Look at this*, *What is this?*, or *Read this text* in Voice or Vision mode, and Catty automatically captures the frame and describes it aloud.
- **🌐 Live Web Browsing & Google Search Grounding**:
  - Uses Gemini 2.5 Flash's real-time Google Search grounding tool (	ools: [{ google_search: {} }]).
  - Answers live internet queries: weather forecasts, breaking news, sports scores, stock prices, and general web facts.
- **🌲 Direct Cloud Pinecone Vector Memory (RAG)**:
  - Connects directly to Pinecone Serverless via HTTPS REST API.
  - Uses Google Gemini gemini-embedding-001 (768 dimensions) to vectorize and store personal memories (*Remember that my passport is in the blue drawer*).
  - Semantic similarity search recalls notes on command (*Where did I put my passport?*).
- **📜 On-Device Question & Interaction Logs**:
  - Automatically logs every question, voice command, Google web search, and camera vision snapshot with timestamps to persistent on-device storage.
- **📱 Deep Native Android Hardware Automations**:
  - 🗺️ **Navigation**: Google Maps turn-by-turn driving, transit, or walking directions (google.navigation:q=).
  - 📞 **Phone Calls**: Multi-tier 6-pass address book matching (exact, component, prefix, token overlap, substring, and Levenshtein distance $\le 2$) launching direct dialer calls.
  - 💬 **WhatsApp Direct Messaging**: Resolves contact phone numbers to direct chat URLs (https://api.whatsapp.com/send?phone=...), bypassing the generic Send to contact chooser.
  - 🎵 **YouTube Music**: Queries and plays songs/artists.
  - 🔦 **Hardware LED Flashlight**: Hardware torch toggle via always-mounted <CameraView enableTorch={state} />.
  - 🔋 **Battery Telemetry**: Reads battery percentage and charging state.
- **🎨 Siri-like Fluid Animated UI**:
  - Glowing animated orb visualizer transitioning smoothly across states (IDLE, LISTENING, THINKING, SPEAKING).
  - Dual Mode Switcher: [ 🎙️ Voice Mode ] | [ 👁️ Vision Mode ].

---

## 📁 Repository Structure

`
catty-voice-assistant/
├── mobile/                               # React Native (Expo SDK 52) Mobile App
│   ├── App.tsx                           # Main application wrapper
│   ├── app.json                          # Expo configuration & Android permissions
│   ├── eas.json                          # EAS configuration for standalone .apk build
│   ├── package.json                      # Pinned Expo SDK 52 dependencies
│   └── src/
│       ├── config.ts                     # Gemini API key, Pinecone settings
│       ├── types/
│       │   └── index.ts                  # ActionType (WEB_SEARCH, ANALYZE_VISION, SAVE_NOTE, etc.)
│       ├── components/
│       │   ├── GlowingOrb.tsx            # Siri-like animated fluid glowing orb
│       │   └── TranscriptCard.tsx        # Live speech transcription & action UI card
│       ├── screens/
│       │   └── AssistantScreen.tsx       # Dual-mode screen: Voice & Vision viewfinder
│       └── services/
│           ├── api.ts                    # Direct Gemini 2.5 Flash client (Audio, Vision, Search)
│           ├── memory.ts                 # Direct Pinecone Serverless RAG & on-device history
│           ├── speech.ts                 # Zero-lag mono audio recording service
│           ├── tts.ts                    # Android TextToSpeech wrapper
│           ├── contactService.ts         # Multi-tier device address book resolver
│           ├── intentDispatcher.ts       # Android Intent & Linking dispatcher
│           └── deviceControls.ts         # Hardware torch & battery reader
│
└── backend/                              # Optional Python FastAPI / LangChain Agent Brain
    ├── app/
    │   ├── main.py                       # FastAPI server endpoints
    │   ├── config.py                     # Backend settings & environment
    │   ├── agent/                        # LangChain tool-calling agent
    │   └── rag/                          # Pinecone vector memory module
    ├── requirements.txt
    ├── Dockerfile
    └── test_agent.py                     # Automated backend verification suite
`

---

## 🚀 Quick Start Guide

### Option 1: Test Instantly via Expo Go

1. Navigate to the mobile folder:
   `ash
   cd mobile
   npm install
   `
2. Start the Expo development bundler:
   `ash
   npx expo start -c
   `
3. Open **Expo Go** on your Android phone or tablet (OPPO Reno 6, Samsung Tab, Pixel, etc.) and scan the QR code displayed in your terminal.

---

### Option 2: Build the Standalone APK (No PC / Server Required!)

To install Catty as a standalone .apk app on your Android phone that runs 24/7 without needing your computer:

1. Navigate to the mobile folder:
   `ash
   cd mobile
   `
2. Log in to your free Expo account:
   `ash
   npx eas login
   `
3. Trigger the standalone cloud APK build:
   `ash
   npx eas build -p android --profile preview
   `
4. EAS Build packages and compiles the .apk on Expo's cloud servers in ~5–8 minutes.
5. Download and install **Catty.apk** directly from the generated QR code or download link!

---

## 🗣️ Voice & Vision Commands Cheat Sheet

| Feature | Spoken Command or Action | What Catty Does |
| :--- | :--- | :--- |
| **Camera Vision** | Tap *Snap & Ask* or say *What is this?* | Snaps camera viewfinder and describes the scene/object via Gemini 2.5 Flash Vision. |
| **Live Web Search** | *What's the weather in Tokyo today?* | Grounds live internet data via Google Search and speaks the forecast aloud. |
| **Save Memory** | *Remember that my passport is in the top drawer* | Vectorizes fact with gemini-embedding-001 and upserts to Pinecone Serverless. |
| **Recall Memory** | *Where did I put my passport?* | Performs semantic vector similarity search in Pinecone and reads the note. |
| **Flashlight** | *Turn on the flashlight* | Toggles physical rear camera LED torch. |
| **Navigation** | *Navigate to Central Station* | Opens turn-by-turn driving directions in Google Maps. |
| **Phone Call** | *Call Mom* | Resolves contact name to phone number and launches dialer. |
| **WhatsApp** | *WhatsApp Alex saying I will arrive in 10 minutes* | Opens WhatsApp private chat with Alex directly with the pre-filled text. |
| **Battery Status** | *Check my battery percentage* | Reads battery level and charging state aloud. |
| **Music** | *Play Bohemian Rhapsody* | Searches and plays song on YouTube Music. |

---

## 🔒 Security & Privacy

- All API requests to Google Gemini and Pinecone use HTTPS TLS 1.3 encryption.
- Direct-to-cloud architecture means your voice recordings and photos never pass through unverified third-party proxy servers.
- Address book searches are processed 100% on-device using local Android SQLite databases (ContactsContract).

---

## 📄 License

MIT License. Open source and free for personal and community development.
