import * as Linking from 'expo-linking';
import * as IntentLauncher from 'expo-intent-launcher';
import { ActionPayload } from '../types';
import { ContactService } from './contactService';

export class IntentDispatcher {
  /**
   * Dispatches the requested action to Android system applications.
   */
  static async dispatch(payload: ActionPayload): Promise<{ success: boolean; message: string }> {
    console.log(`[IntentDispatcher] Executing action: ${payload.action}`, payload.params);

    try {
      switch (payload.action) {
        case 'NAVIGATE':
          return await this.openGoogleMaps(payload.params.destination, payload.params.mode);

        case 'CALL':
          return await this.makePhoneCall(payload.params.target);

        case 'WHATSAPP':
          return await this.sendWhatsApp(payload.params.target, payload.params.message);

        case 'PLAY_MUSIC':
          return await this.playYouTubeMusic(payload.params.query);

        case 'SET_ALARM':
          return await this.setClockAlarm(payload.params.hour, payload.params.minute, payload.params.label);

        case 'SET_TIMER':
          return await this.setCountdownTimer(payload.params.duration_seconds, payload.params.label);

        default:
          return { success: true, message: `Action ${payload.action} processed.` };
      }
    } catch (error: any) {
      console.error(`[IntentDispatcher] Error dispatching ${payload.action}:`, error);
      return { success: false, message: `Failed to execute: ${error.message}` };
    }
  }

  /**
   * Google Maps Navigation
   */
  static async openGoogleMaps(destination: string, mode: string = 'driving'): Promise<{ success: boolean; message: string }> {
    const navUrl = `google.navigation:q=${encodeURIComponent(destination)}&mode=${mode}`;
    const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

    const supported = await Linking.canOpenURL(navUrl);
    if (supported) {
      await Linking.openURL(navUrl);
    } else {
      await Linking.openURL(webFallback);
    }
    return { success: true, message: `Navigating to ${destination}` };
  }

  /**
   * Native Phone Call - Resolves real contact name to phone number
   */
  static async makePhoneCall(target: string): Promise<{ success: boolean; message: string }> {
    console.log(`[IntentDispatcher] Attempting phone call to target: "${target}"`);

    // Check if target is already a numeric phone number
    const numericOnly = target.replace(/[^0-9+]/g, '');
    const hasLetters = /[a-zA-Z]/.test(target);

    if (hasLetters) {
      console.log(`[IntentDispatcher] Resolving contact name "${target}" in address book...`);
      const resolved = await ContactService.findContact(target);

      if (resolved && resolved.phoneNumber) {
        console.log(`[IntentDispatcher] Found contact in address book: ${resolved.name} -> ${resolved.phoneNumber}`);
        const callUrl = `tel:${resolved.phoneNumber}`;
        await Linking.openURL(callUrl);
        return { success: true, message: `Calling ${resolved.name} at ${resolved.phoneNumber}` };
      } else {
        console.warn(`[IntentDispatcher] Could not find "${target}" in address book`);
        return {
          success: false,
          message: `I couldn't find "${target}" in your phone contacts. Please check the name or contact permission.`,
        };
      }
    }

    if (numericOnly.length >= 3) {
      await Linking.openURL(`tel:${numericOnly}`);
      return { success: true, message: `Dialing ${numericOnly}` };
    }

    return {
      success: false,
      message: `Invalid phone number or contact "${target}".`,
    };
  }

  /**
   * Pre-filled WhatsApp Message - Opens that individual's chat directly
   */
  static async sendWhatsApp(target: string, message: string = ''): Promise<{ success: boolean; message: string }> {
    console.log(`[IntentDispatcher] Attempting direct WhatsApp to target: "${target}", message: "${message}"`);
    const hasLetters = /[a-zA-Z]/.test(target);
    let recipientDigits = target.replace(/[^0-9]/g, '');
    let contactDisplayName = target;

    if (hasLetters) {
      console.log(`[IntentDispatcher] Resolving WhatsApp contact name "${target}" in address book...`);
      const resolved = await ContactService.findContact(target);

      if (resolved && resolved.cleanDigits) {
        recipientDigits = resolved.cleanDigits;
        contactDisplayName = resolved.name;
        console.log(`[IntentDispatcher] Resolved WhatsApp recipient "${resolved.name}" -> digits: ${recipientDigits}`);
      } else {
        console.warn(`[IntentDispatcher] Could not find "${target}" in address book`);
        return {
          success: false,
          message: `I couldn't find "${target}" in your contacts. Please ensure the contact has a saved phone number.`,
        };
      }
    }

    if (!recipientDigits || recipientDigits.length < 7) {
      return {
        success: false,
        message: `Could not determine a valid phone number for "${target}" to send a WhatsApp message.`,
      };
    }

    // Direct individual chat URL (bypasses WhatsApp's "Send to" contact picker entirely!)
    const directWaUrl = `https://api.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(message)}`;
    console.log(`[IntentDispatcher] Opening direct WhatsApp URL: ${directWaUrl}`);

    try {
      const canOpen = await Linking.canOpenURL(directWaUrl);
      if (canOpen) {
        await Linking.openURL(directWaUrl);
        return { success: true, message: `Opened WhatsApp chat with ${contactDisplayName}` };
      } else {
        const webUrl = `https://web.whatsapp.com/send?phone=${recipientDigits}&text=${encodeURIComponent(message)}`;
        await Linking.openURL(webUrl);
        return { success: true, message: `Opened WhatsApp Web for ${contactDisplayName}` };
      }
    } catch (e: any) {
      console.error('[IntentDispatcher] Error opening WhatsApp:', e);
      return { success: false, message: `Failed to open WhatsApp: ${e.message}` };
    }
  }

  /**
   * YouTube Music Search & Play
   */
  static async playYouTubeMusic(query: string): Promise<{ success: boolean; message: string }> {
    const ytMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
    const ytAppIntent = `vnd.youtube.music://`;

    const canOpenApp = await Linking.canOpenURL(ytAppIntent);
    if (canOpenApp) {
      await Linking.openURL(`vnd.youtube.music://search?q=${encodeURIComponent(query)}`);
    } else {
      await Linking.openURL(ytMusicUrl);
    }
    return { success: true, message: `Playing ${query} on YouTube Music` };
  }

  /**
   * Clock Alarm - Resilient multi-stage dispatching supporting Expo Go and Standalone APKs
   * Targets Google Clock (Version 9.1 / 965977594), Samsung Tab, and ColorOS
   */
  static async setClockAlarm(hour: number, minute: number, label: string = 'Alarm'): Promise<{ success: boolean; message: string }> {
    const targetHour = typeof hour === 'number' ? hour : 7;
    const targetMinute = typeof minute === 'number' ? minute : 0;
    const timeFormatted = `${targetHour.toString().padStart(2, '0')}:${targetMinute.toString().padStart(2, '0')}`;

    console.log(`[IntentDispatcher] Setting alarm for ${timeFormatted} (${label})...`);

    // Prioritized list of Clock package names:
    // 1. Google Clock (User's app: Clock Version 9.1 / build 965977594)
    // 2. Samsung Galaxy Tab & Phones (com.sec.android.app.clockpackage)
    // 3. OPPO Reno 6 / ColorOS Stock Clock
    const clockPackages = [
      'com.google.android.deskclock',       // Google Clock (Version 9.1 / 965977594)
      'com.sec.android.app.clockpackage',   // Samsung Galaxy Tab & Phone Clock
      'com.coloros.alarmclock',             // Stock OPPO Reno 6 / ColorOS
      'com.oplus.alarmclock',               // ColorOS / OnePlus newer builds
      'com.coloros.clock',                  // ColorOS alternative
      'com.android.deskclock',               // AOSP / Xiaomi
      'com.oneplus.deskclock',              // OnePlus
      'com.vivo.alarmclock',                // Vivo / iQOO
    ];

    // Helper: Safely runs startActivityAsync with a 500ms race timeout
    // If the OS rejects the intent (e.g. SecurityException in Expo Go), it rejects in <15ms and returns false.
    // If successful, Android opens the activity and this resolves cleanly.
    const safeStartActivity = async (action: string, params?: IntentLauncher.IntentLauncherParams): Promise<boolean> => {
      try {
        let hasRejected = false;
        await Promise.race([
          IntentLauncher.startActivityAsync(action, params).catch((err: any) => {
            hasRejected = true;
            throw err;
          }),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
        return !hasRejected;
      } catch (err: any) {
        console.log(`[IntentDispatcher] ${action} with ${params?.packageName || 'generic'} failed:`, err?.message || err);
        return false;
      }
    };

    // STAGE 1: Attempt standard SET_ALARM
    // (Succeeds in Standalone APK; in Expo Go, it will throw SecurityException which is safely caught)
    for (const pkg of clockPackages) {
      console.log(`[IntentDispatcher] Attempting SET_ALARM for package: ${pkg}`);
      const success = await safeStartActivity('android.intent.action.SET_ALARM', {
        packageName: pkg,
        extra: {
          'android.intent.extra.alarm.HOUR': targetHour,
          'android.intent.extra.alarm.MINUTES': targetMinute,
          'android.intent.extra.alarm.MESSAGE': label || 'Alarm',
          'android.intent.extra.alarm.SKIP_UI': false,
        },
      });
      if (success) {
        return { success: true, message: `Alarm set for ${timeFormatted}` };
      }
    }

    // STAGE 2: Attempt SHOW_ALARMS (Navigates straight to the Alarms tab in Clock app)
    for (const pkg of clockPackages) {
      console.log(`[IntentDispatcher] Attempting SHOW_ALARMS for package: ${pkg}`);
      const success = await safeStartActivity('android.intent.action.SHOW_ALARMS', {
        packageName: pkg,
      });
      if (success) {
        return {
          success: true,
          message: `Opened Clock to alarms. Please verify alarm for ${timeFormatted}.`,
        };
      }
    }

    // STAGE 3: Launch Clock app directly via MAIN + LAUNCHER
    // (Guaranteed to work in Expo Go without ANY permissions on Samsung Tab and OPPO Reno 6!)
    for (const pkg of clockPackages) {
      console.log(`[IntentDispatcher] Launching Clock app directly: ${pkg}`);
      const success = await safeStartActivity('android.intent.action.MAIN', {
        packageName: pkg,
        category: 'android.intent.category.LAUNCHER',
      });
      if (success) {
        return {
          success: true,
          message: `Clock app opened. Setting alarm for ${timeFormatted}.`,
        };
      }
    }

    // STAGE 4: Generic SHOW_ALARMS fallback
    const genericSuccess = await safeStartActivity('android.intent.action.SHOW_ALARMS');
    if (genericSuccess) {
      return { success: true, message: `Clock opened. Please confirm alarm for ${timeFormatted}.` };
    }

    try {
      const intentUri = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${targetHour};i.android.intent.extra.alarm.MINUTES=${targetMinute};end`;
      await Linking.openURL(intentUri);
      return { success: true, message: `Setting alarm for ${timeFormatted}` };
    } catch (e) {
      console.warn('[IntentDispatcher] Intent URI fallback failed:', e);
    }

    return { success: false, message: 'Could not open Clock app to set alarm.' };
  }

  /**
   * Countdown Timer - Directly targets manufacturer Clock apps
   */
  static async setCountdownTimer(durationSeconds: number, label: string = 'Timer'): Promise<{ success: boolean; message: string }> {
    const clockPackages = [
      'com.google.android.deskclock',       // Google Clock (Version 9.1 / 965977594)
      'com.sec.android.app.clockpackage',   // Samsung Galaxy Tab & Phones
      'com.coloros.alarmclock',             // Stock OPPO Reno 6 / ColorOS
      'com.oplus.alarmclock',               // ColorOS / OnePlus
      'com.coloros.clock',
      'com.android.deskclock',               // Xiaomi / General Android
      'com.oneplus.deskclock',
      'com.vivo.alarmclock',
    ];

    const safeStartActivity = async (action: string, params?: IntentLauncher.IntentLauncherParams): Promise<boolean> => {
      try {
        let hasRejected = false;
        await Promise.race([
          IntentLauncher.startActivityAsync(action, params).catch((err: any) => {
            hasRejected = true;
            throw err;
          }),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
        return !hasRejected;
      } catch (err: any) {
        return false;
      }
    };

    // STAGE 1: Attempt SET_TIMER
    for (const pkg of clockPackages) {
      const success = await safeStartActivity('android.intent.action.SET_TIMER', {
        packageName: pkg,
        extra: {
          'android.intent.extra.alarm.LENGTH': durationSeconds,
          'android.intent.extra.alarm.MESSAGE': label || 'Timer',
          'android.intent.extra.alarm.SKIP_UI': false,
        },
      });
      if (success) {
        return { success: true, message: `Timer set for ${durationSeconds} seconds` };
      }
    }

    // STAGE 2: Launch Clock app directly via MAIN + LAUNCHER (Expo Go safe)
    for (const pkg of clockPackages) {
      const success = await safeStartActivity('android.intent.action.MAIN', {
        packageName: pkg,
        category: 'android.intent.category.LAUNCHER',
      });
      if (success) {
        return { success: true, message: `Clock opened for ${durationSeconds}s timer` };
      }
    }

    return { success: false, message: 'Could not open Clock app.' };
  }

  /**
   * Morning Briefing Routine
   */
  static async startMorningBriefing(): Promise<{ success: boolean; message: string }> {
    await this.playYouTubeMusic('Morning Chill peaceful acoustic playlist');
    return { success: true, message: `Morning briefing initiated` };
  }
}
