import { Audio, InterruptionModeAndroid } from 'expo-av';
import * as Haptics from 'expo-haptics';

/**
 * Dedicated Voice Speech Recording Profile
 * - numberOfChannels: 1 (MONO) is critical on Android (especially OPPO Reno 6)
 *   to prevent dual-mic phase cancellation where the top noise-canceling mic
 *   cancels out the voice frequencies of the bottom primary mic.
 * - sampleRate: 16000 Hz or 44100 Hz mono AAC provides maximum clarity for speech models.
 */
export const VOICE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1, // Single channel (mono) speech recording
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export class SpeechService {
  private static recording: Audio.Recording | null = null;
  private static preparedRecording: Audio.Recording | null = null;
  private static isRecording = false;
  private static isInitialized = false;
  private static hasPermission = false;

  /**
   * Pre-initialize audio system and pre-prepare recording instance for zero-lag speech capture
   */
  static async init(): Promise<void> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      this.hasPermission = status === 'granted';

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      this.isInitialized = true;
      console.log('[SpeechService] Audio system initialized with mono voice profile.');

      if (this.hasPermission) {
        await this.prepareNextRecording();
      }
    } catch (e) {
      console.warn('[SpeechService] Init warning:', e);
    }
  }

  /**
   * Pre-prepares an Audio.Recording instance in the background ahead of time.
   * This eliminates the 300-500ms device initialization lag when the user taps Talk,
   * ensuring the first spoken syllable is never truncated!
   */
  private static async prepareNextRecording(): Promise<void> {
    try {
      if (this.preparedRecording) {
        try {
          await this.preparedRecording.stopAndUnloadAsync();
        } catch {}
        this.preparedRecording = null;
      }
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      this.preparedRecording = rec;
      console.log('[SpeechService] Pre-prepared recording instance ready for instant start.');
    } catch (e) {
      console.warn('[SpeechService] Could not pre-prepare recording:', e);
      this.preparedRecording = null;
    }
  }

  /**
   * Start microphone recording with instant zero-millisecond latency
   */
  static async startRecording(): Promise<boolean> {
    try {
      if (!this.isInitialized || !this.hasPermission) {
        await this.init();
      }

      if (!this.hasPermission) {
        console.warn('[SpeechService] Microphone permission not granted.');
        return false;
      }

      if (this.recording) {
        try {
          await this.recording.stopAndUnloadAsync();
        } catch {}
        this.recording = null;
      }

      let activeRec = this.preparedRecording;
      this.preparedRecording = null;

      // If no pre-prepared instance was ready, prepare one immediately
      if (!activeRec) {
        console.log('[SpeechService] Preparing recording on the fly...');
        activeRec = new Audio.Recording();
        await activeRec.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      }

      await activeRec.startAsync();
      this.recording = activeRec;
      this.isRecording = true;

      // Heavy haptic click confirming recording has begun
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      console.log('[SpeechService] Microphone is hot and recording NOW.');
      return true;
    } catch (error) {
      console.error('[SpeechService] Failed to start recording:', error);
      this.isRecording = false;
      this.recording = null;
      this.prepareNextRecording();
      return false;
    }
  }

  /**
   * Stop recording, return URI, and immediately prepare the next recording in background
   */
  static async stopRecording(): Promise<string | null> {
    if (!this.recording) return null;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;
      this.isRecording = false;

      // Haptic confirmation
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      console.log('[SpeechService] Recording stopped. File URI:', uri);

      // Pre-prepare next recording immediately for next voice utterance
      this.prepareNextRecording();

      return uri;
    } catch (error) {
      console.error('[SpeechService] Failed to stop recording:', error);
      this.isRecording = false;
      this.recording = null;
      this.prepareNextRecording();
      return null;
    }
  }

  static getIsRecording(): boolean {
    return this.isRecording;
  }
}
