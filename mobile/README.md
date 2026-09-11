# Catty Mobile Client 📱 (React Native / Expo SDK 52)

> The standalone Android mobile client for **Catty**, featuring **Multimodal Camera Vision**, **Live Google Search Grounding**, **Pinecone Vector Memory**, and **Deep Android Native System Automations**.

---

## ⚡ Key Highlights

- **100% Serverless & Standalone**: Communicates directly from your phone with Google Gemini 2.5 Flash and Pinecone Serverless over HTTPS. No local PC or backend server required.
- **Dual Mode Experience**:
  - **🎙️ Voice Mode**: Push-to-talk voice interface with Siri-like fluid animated glowing orb.
  - **👁️ Vision Mode**: Real-time camera viewfinder with HUD reticle, quick torch toggle, and 📸 Snap & Ask Catty shutter.
- **Live Google Search Grounding**: Real-time weather, breaking news, sports scores, and search facts.
- **Pinecone Vector Memory (RAG)**: Voice note saving and semantic recall powered by gemini-embedding-001 (768d).
- **Persistent On-Device History**: Automatic timestamped logs of all questions and answers in local storage (catty_history.json).
- **Deep Android Hardware Integrations**: Google Maps navigation, phone dialer with fuzzy address book matching, WhatsApp direct recipient messaging, rear camera LED torch, and battery level reading.

---

## 🚀 Running Locally (Expo Go)

1. Install dependencies:
   `ash
   npm install
   `
2. Start the development bundler:
   `ash
   npx expo start -c
   `
3. Scan the QR code with **Expo Go** on your Android phone or tablet.

---

## 📦 Building the Standalone APK

To build an installable .apk file that runs 24/7 on your phone without Expo Go or your computer:

`ash
# 1. Log in to your free Expo account
npx eas login

# 2. Build the standalone preview APK
npx eas build -p android --profile preview
`

When the build finishes on Expo cloud servers (~5-8 mins), download and install **Catty.apk** from the provided link or QR code.
