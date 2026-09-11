import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { GlowingOrb } from '../components/GlowingOrb';
import { TranscriptCard } from '../components/TranscriptCard';
import { AssistantState, ChatMessage, ActionPayload } from '../types';
import { ApiService } from '../services/api';
import { IntentDispatcher } from '../services/intentDispatcher';
import { DeviceControls } from '../services/deviceControls';
import { TTSService } from '../services/tts';
import { SpeechService } from '../services/speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ContactService } from '../services/contactService';
import { MemoryService } from '../services/memory';

export const AssistantScreen: React.FC = () => {
  const [state, setState] = useState<AssistantState>('IDLE');
  const [lastMessage, setLastMessage] = useState<ChatMessage | null>(null);
  const [statusText, setStatusText] = useState<string>('Ready');
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isVisionMode, setIsVisionMode] = useState<boolean>(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    checkServerConnection();
    SpeechService.init();
    // Request contacts & camera permissions on app launch so voice commands work seamlessly
    ContactService.requestPermission();
    if (!cameraPermission?.granted) {
      requestCameraPermission();
    }
  }, []);

  const checkServerConnection = async () => {
    const health = await ApiService.checkHealth();
    setIsBackendOnline(health.status === 'healthy');
  };

  /**
   * Unified action executor for device commands, web search, and vision
   */
  const executeAction = async (action: ActionPayload, userQuery?: string): Promise<string | null> => {
    console.log(`[AssistantScreen] Executing action: ${action.action}`, action.params);
    setStatusText(`Executing ${action.action}...`);

    // 1. Live Google Search Grounding
    if (action.action === 'WEB_SEARCH') {
      setStatusText('Searching Google live with Gemini...');
      const searchResult = await ApiService.performWebSearch(action.params?.query || userQuery || '');
      return searchResult.speech_reply;
    }

    // 2. Multimodal Camera Vision
    if (action.action === 'ANALYZE_VISION') {
      setIsVisionMode(true);
      if (cameraRef.current) {
        try {
          setStatusText('Catty Vision snapping photo...');
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.7,
            base64: true,
            skipProcessing: false,
          });
          if (photo?.base64) {
            setStatusText('Gemini 2.5 Flash analyzing what you see...');
            const visionResult = await ApiService.analyzeImage(photo.base64, userQuery);
            return visionResult.speech_reply;
          }
        } catch (err: any) {
          console.error('[AssistantScreen] Vision capture error:', err);
        }
      }
      return "Switched to Catty Vision! Point your camera and tap Snap & Ask.";
    }

    // 3. Hardware LED Flashlight
    if (action.action === 'TOGGLE_FLASHLIGHT') {
      const nextState = action.params?.state !== undefined ? action.params.state : !isTorchOn;
      if (!cameraPermission?.granted) {
        const perm = await requestCameraPermission();
        if (!perm.granted) {
          return "Please grant camera permission to control the flashlight.";
        }
      }
      setIsTorchOn(nextState);
      await DeviceControls.toggleFlashlight(nextState);
      return nextState ? "Flashlight turned on." : "Flashlight turned off.";
    }

    // 4. Battery Status
    if (action.action === 'GET_BATTERY_STATUS') {
      const battery = await DeviceControls.getBatteryStatus();
      return battery.text;
    }

    // 5. Pinecone Serverless Vector Memory (Save Note)
    if (action.action === 'SAVE_NOTE') {
      setStatusText('Saving note to Pinecone memory...');
      const saveRes = await MemoryService.saveNote(action.params?.content || userQuery || '');
      return saveRes.message;
    }

    // 6. Pinecone Serverless Vector Memory (Search Notes)
    if (action.action === 'SEARCH_NOTES') {
      setStatusText('Searching Pinecone vector memory...');
      const searchRes = await MemoryService.searchNotes(action.params?.query || userQuery || '');
      return searchRes.speech_reply;
    }

    // 7. System Intents (Maps, Phone Call, WhatsApp, YouTube Music)
    const result = await IntentDispatcher.dispatch(action);
    if (!result.success) {
      return result.message;
    }

    return null; // Keep default speech reply
  };

  /**
   * Push-to-Talk Utterance Processor (Text or Followup)
   */
  const handleUserUtterance = async (utterance: string) => {
    if (!utterance.trim()) return;

    setState('THINKING');
    setStatusText('Thinking...');
    setLastMessage({
      id: Date.now().toString(),
      sender: 'user',
      text: utterance,
      timestamp: new Date().toLocaleTimeString(),
    });

    try {
      const response = await ApiService.sendMessage(utterance);
      console.log('[AssistantScreen] Backend response:', response);

      setLastMessage({
        id: Date.now().toString(),
        sender: 'catty',
        text: response.speech_reply,
        timestamp: new Date().toLocaleTimeString(),
        action: response.action,
      });

      if (response.action) {
        const updatedReply = await executeAction(response.action, utterance);
        if (updatedReply) {
          response.speech_reply = updatedReply;
          setLastMessage(prev => prev ? { ...prev, text: updatedReply } : null);
        }
      }

      setState('SPEAKING');
      setStatusText('Speaking...');
      MemoryService.logInteraction(utterance, response.speech_reply, 'text');
      TTSService.speak(response.speech_reply, () => {
        if (response.awaiting_followup) {
          startVoiceListening();
        } else {
          setState('IDLE');
          setStatusText('Ready');
        }
      });
    } catch (error: any) {
      console.error('[AssistantScreen] Error processing utterance:', error);
      setState('IDLE');
      setStatusText('Error connecting to backend');
      TTSService.speak("Sorry, I had trouble processing your request. Please try again.");
    }
  };

  /**
   * Push-to-Talk toggle
   */
  const toggleListening = async () => {
    if (state === 'LISTENING') {
      stopVoiceListening();
    } else {
      startVoiceListening();
    }
  };

  const startVoiceListening = async () => {
    TTSService.stop();
    setState('LISTENING');
    setStatusText('Listening... Speak now!');
    const started = await SpeechService.startRecording();
    if (!started) {
      setState('IDLE');
      setStatusText('Ready');
      Alert.alert('Permission Required', 'Please enable microphone permission in app settings.');
    }
  };

  const stopVoiceListening = async () => {
    setState('THINKING');
    setStatusText('Listening to your speech...');
    const audioUri = await SpeechService.stopRecording();

    if (audioUri) {
      try {
        setStatusText('Gemini 2.5 Flash is listening...');
        const response = await ApiService.sendAudio(audioUri);
        console.log('[AssistantScreen] Voice response from Gemini:', response);

        // 1. Show verbatim spoken words
        if (response.user_transcript) {
          setLastMessage({
            id: Date.now().toString(),
            sender: 'user',
            text: response.user_transcript,
            timestamp: new Date().toLocaleTimeString(),
          });
        }

        // 2. Initial Catty response
        setLastMessage({
          id: (Date.now() + 1).toString(),
          sender: 'catty',
          text: response.speech_reply,
          timestamp: new Date().toLocaleTimeString(),
          action: response.action,
        });

        // 3. Execute device / web search / vision action
        if (response.action) {
          const updatedReply = await executeAction(response.action, response.user_transcript);
          if (updatedReply) {
            response.speech_reply = updatedReply;
            setLastMessage(prev => prev ? { ...prev, text: updatedReply } : null);
          }
        }

        // 4. Speak aloud via Android TextToSpeech
        setState('SPEAKING');
        setStatusText('Speaking...');
        MemoryService.logInteraction(response.user_transcript || 'Voice input', response.speech_reply, 'voice');
        TTSService.speak(response.speech_reply, () => {
          if (response.awaiting_followup) {
            startVoiceListening();
          } else {
            setState('IDLE');
            setStatusText('Ready');
          }
        });
      } catch (err: any) {
        console.error('[AssistantScreen] Error processing voice:', err);
        setState('IDLE');
        setStatusText('Could not process audio');
        TTSService.speak("Sorry, I had trouble processing that audio. Please try again.");
      }
    } else {
      setState('IDLE');
      setStatusText('Ready');
    }
  };

  /**
   * Catty Vision: Manual "Snap & Ask" shutter handler
   */
  const handleSnapAndAsk = async (customQuestion?: string) => {
    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert('Camera Permission Required', 'Please enable camera permission for Catty Vision.');
        return;
      }
    }

    if (!cameraRef.current) {
      Alert.alert('Camera Initializing', 'Please wait a moment for the camera viewfinder.');
      return;
    }

    try {
      TTSService.stop();
      setState('THINKING');
      setStatusText('Capturing photo...');

      setLastMessage({
        id: Date.now().toString(),
        sender: 'user',
        text: customQuestion || '📸 [Catty Vision: "What is this?"]',
        timestamp: new Date().toLocaleTimeString(),
      });

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });

      if (!photo?.base64) {
        throw new Error('Failed to retrieve base64 data from camera photo.');
      }

      setStatusText('Gemini 2.5 Flash analyzing image...');
      const result = await ApiService.analyzeImage(photo.base64, customQuestion);

      setLastMessage({
        id: (Date.now() + 1).toString(),
        sender: 'catty',
        text: result.speech_reply,
        timestamp: new Date().toLocaleTimeString(),
      });

      setState('SPEAKING');
      setStatusText('Speaking...');
      MemoryService.logInteraction(customQuestion || '📸 [Catty Vision Photo]', result.speech_reply, 'vision');
      TTSService.speak(result.speech_reply, () => {
        setState('IDLE');
        setStatusText('Ready');
      });
    } catch (error: any) {
      console.error('[AssistantScreen] Snap & Ask error:', error);
      setState('IDLE');
      setStatusText('Vision analysis failed');
      TTSService.speak("Sorry, I could not analyze the image. Please try snapping again.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090A0F" />

      {/* Header Bar with Brand & Mode Switcher */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>CATTY</Text>
          <View style={[styles.onlineBadge, { backgroundColor: isBackendOnline ? '#10B981' : '#EF4444' }]} />
        </View>

        {/* Mode Toggle Tabs: Voice vs Vision */}
        <View style={styles.modeToggleContainer}>
          <TouchableOpacity
            style={[styles.modeTab, !isVisionMode && styles.modeTabActive]}
            onPress={() => setIsVisionMode(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeTabText, !isVisionMode && styles.modeTabTextActive]}>
              🎙️ Voice
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, isVisionMode && styles.modeTabActive]}
            onPress={async () => {
              if (!cameraPermission?.granted) {
                const perm = await requestCameraPermission();
                if (!perm.granted) {
                  Alert.alert('Camera Permission', 'Catty Vision requires camera access to identify objects.');
                  return;
                }
              }
              setIsVisionMode(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeTabText, isVisionMode && styles.modeTabTextActive]}>
              👁️ Vision
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Center View: Glowing Orb (Voice Mode) OR Live Viewfinder (Vision Mode) */}
      <View style={styles.centerSection}>
        {/* Always-mounted CameraView: switches style seamlessly between hidden torch & live preview */}
        {cameraPermission?.granted && (
          <View style={isVisionMode ? styles.cameraCard : styles.hiddenCameraContainer}>
            <CameraView
              ref={cameraRef}
              facing="back"
              enableTorch={isTorchOn}
              style={isVisionMode ? styles.cameraPreview : styles.hiddenCamera}
            />

            {/* Viewfinder HUD Overlay in Vision Mode */}
            {isVisionMode && (
              <View style={styles.cameraOverlay}>
                <View style={styles.hudBadge}>
                  <Text style={styles.hudBadgeText}>● CATTY EYE</Text>
                </View>

                {/* Reticle guide in center */}
                <View style={styles.reticleBox} />

                {/* Torch toggle button in top-right */}
                <TouchableOpacity
                  style={[styles.torchIconButton, isTorchOn && styles.torchIconButtonActive]}
                  onPress={async () => {
                    const next = !isTorchOn;
                    setIsTorchOn(next);
                    await DeviceControls.toggleFlashlight(next);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.torchIconText}>{isTorchOn ? '🔦 ON' : '🔦 OFF'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Siri-like Glowing Orb when in Voice Mode */}
        {!isVisionMode && (
          <View style={styles.orbContainer}>
            <GlowingOrb state={state} size={150} />
          </View>
        )}
      </View>

      {/* Live Transcript & Action Feedback Card */}
      <TranscriptCard lastMessage={lastMessage} statusText={statusText} />

      {/* Dynamic Hint text */}
      <View style={styles.voicePromptHint}>
        <Text style={styles.voiceHintText}>
          {isVisionMode
            ? 'Point camera at any object, document, or sign, then tap "Snap & Ask" or speak to Catty.'
            : 'Speak naturally: "What is the weather in Tokyo?", "Call Mom", "WhatsApp John", or "Look at this"...'}
        </Text>
      </View>

      {/* Bottom Controls */}
      <View style={styles.footer}>
        {isVisionMode ? (
          <View style={styles.visionControlsRow}>
            {/* Voice question button in Vision Mode */}
            <TouchableOpacity
              style={[styles.visionVoiceBtn, state === 'LISTENING' && styles.micButtonActive]}
              onPress={toggleListening}
              activeOpacity={0.8}
            >
              <Text style={styles.visionVoiceBtnText}>
                {state === 'LISTENING' ? '⏹️ STOP' : '🎙️ ASK'}
              </Text>
            </TouchableOpacity>

            {/* Shutter Snap & Ask Button */}
            <TouchableOpacity
              style={styles.shutterButton}
              onPress={() => handleSnapAndAsk()}
              activeOpacity={0.8}
            >
              <Text style={styles.shutterButtonText}>📸 SNAP & ASK CATTY</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Pure Voice Mode Push-to-Talk */
          <TouchableOpacity
            style={[
              styles.micButton,
              state === 'LISTENING' && styles.micButtonActive,
            ]}
            onPress={toggleListening}
            activeOpacity={0.8}
          >
            <Text style={styles.micButtonText}>
              {state === 'LISTENING' ? '⏹️ TAP TO STOP' : '🎙️ TAP TO TALK'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  onlineBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E2230',
    borderRadius: 20,
    padding: 3,
  },
  modeTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  modeTabActive: {
    backgroundColor: '#4F46E5',
  },
  modeTabText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  orbContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCard: {
    width: '100%',
    height: 270,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E2230',
    borderWidth: 1.5,
    borderColor: '#374151',
    position: 'relative',
  },
  cameraPreview: {
    width: '100%',
    height: '100%',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12,
  },
  hudBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  hudBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  reticleBox: {
    width: 140,
    height: 140,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    alignSelf: 'center',
    borderStyle: 'dashed',
  },
  torchIconButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  torchIconButtonActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  torchIconText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  hiddenCameraContainer: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenCamera: {
    width: 1,
    height: 1,
  },
  voicePromptHint: {
    paddingHorizontal: 24,
    marginVertical: 10,
    alignItems: 'center',
  },
  voiceHintText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  micButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  micButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  visionControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  visionVoiceBtn: {
    backgroundColor: '#374151',
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  shutterButton: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 26,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  shutterButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
