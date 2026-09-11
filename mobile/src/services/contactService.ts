import * as Contacts from 'expo-contacts';

export interface ResolvedContact {
  name: string;
  phoneNumber: string;
  cleanDigits: string;
}

export class ContactService {
  private static hasPermission: boolean | null = null;

  /**
   * Request contacts permission from user
   */
  static async requestPermission(): Promise<boolean> {
    try {
      const current = await Contacts.getPermissionsAsync();
      if (current.granted) {
        this.hasPermission = true;
        return true;
      }
      const { status } = await Contacts.requestPermissionsAsync();
      this.hasPermission = status === 'granted';
      console.log('[ContactService] Permission status:', this.hasPermission);
      return this.hasPermission;
    } catch (e) {
      console.warn('[ContactService] Permission check error:', e);
      return false;
    }
  }

  /**
   * Clean speech-to-text artifacts and noise words from contact query
   */
  static cleanQuery(target: string): string {
    if (!target) return '';
    let cleaned = target.trim();

    // Strip common voice assistant prefix phrases
    const prefixes = [
      /^send message to\s+/i,
      /^send text to\s+/i,
      /^send whatsapp to\s+/i,
      /^text to\s+/i,
      /^call to\s+/i,
      /^message to\s+/i,
      /^whatsapp to\s+/i,
      /^the individual\s+/i,
      /^individual\s+/i,
      /^contact person\s+/i,
      /^contact\s+/i,
      /^call\s+/i,
      /^message\s+/i,
      /^text\s+/i,
      /^whatsapp\s+/i,
      /^to\s+/i,
      /^for\s+/i,
      /^my\s+/i,
      /^the\s+/i,
      /^mr\.?\s+/i,
      /^mrs\.?\s+/i,
      /^ms\.?\s+/i,
    ];

    for (const prefix of prefixes) {
      cleaned = cleaned.replace(prefix, '');
    }

    // Strip trailing conversational filler
    cleaned = cleaned.replace(/\s+(please|now|right now)$/i, '');

    return cleaned.trim();
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching speech variations
   */
  private static levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Search device contacts for an individual by name and retrieve their real phone number
   */
  static async findContact(rawTarget: string): Promise<ResolvedContact | null> {
    try {
      if (this.hasPermission === null || !this.hasPermission) {
        const granted = await this.requestPermission();
        if (!granted) {
          console.warn('[ContactService] Contacts permission not granted.');
          return null;
        }
      }

      const query = this.cleanQuery(rawTarget).toLowerCase();
      if (!query) {
        console.warn('[ContactService] Query empty after cleaning');
        return null;
      }

      console.log(`[ContactService] Searching device contacts for: "${query}" (original: "${rawTarget}")`);

      // Retrieve contacts with all name fields and phone numbers
      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Nickname,
          Contacts.Fields.PhoneNumbers,
        ],
        pageSize: 2000, // Query full address book
      });

      if (!contacts || contacts.length === 0) {
        console.warn('[ContactService] No contacts found on device');
        return null;
      }

      console.log(`[ContactService] Retrieved ${contacts.length} device contacts. Running matching passes...`);

      // Filter contacts that actually have at least one phone number
      const phoneContacts = contacts.filter(
        c => c.phoneNumbers && c.phoneNumbers.length > 0 && c.phoneNumbers[0]?.number
      );

      let matchedContact: Contacts.Contact | null = null;

      // PASS 1: Exact full name or nickname match
      matchedContact = phoneContacts.find(c => {
        const name = (c.name || '').toLowerCase().trim();
        const nick = (c.nickname || '').toLowerCase().trim();
        return name === query || nick === query;
      }) || null;

      // PASS 2: Exact First Name or Last Name match
      if (!matchedContact) {
        matchedContact = phoneContacts.find(c => {
          const first = (c.firstName || '').toLowerCase().trim();
          const last = (c.lastName || '').toLowerCase().trim();
          return (first && first === query) || (last && last === query);
        }) || null;
      }

      // PASS 3: Starts with match (e.g. "David" matches "David Smith")
      if (!matchedContact) {
        matchedContact = phoneContacts.find(c => {
          const name = (c.name || '').toLowerCase().trim();
          return name.startsWith(query);
        }) || null;
      }

      // PASS 4: Word token intersection (standalone word in name matches query word)
      if (!matchedContact) {
        const queryWords = query.split(/\s+/).filter(w => w.length > 1);
        matchedContact = phoneContacts.find(c => {
          const nameWords = (c.name || '').toLowerCase().split(/\s+/);
          return queryWords.some(qw => nameWords.includes(qw));
        }) || null;
      }

      // PASS 5: Substring containment
      if (!matchedContact) {
        matchedContact = phoneContacts.find(c => {
          const name = (c.name || '').toLowerCase().trim();
          return name.includes(query) || query.includes(name);
        }) || null;
      }

      // PASS 6: Fuzzy Levenshtein match (handles speech recognition typos like "Jon" vs "John")
      if (!matchedContact && query.length >= 3) {
        let bestDistance = 999;
        let bestFuzzy: Contacts.Contact | null = null;

        for (const c of phoneContacts) {
          const name = (c.name || '').toLowerCase().trim();
          const first = (c.firstName || '').toLowerCase().trim();
          const dist1 = this.levenshtein(query, name);
          const dist2 = first ? this.levenshtein(query, first) : 999;
          const minD = Math.min(dist1, dist2);

          if (minD < bestDistance && minD <= (query.length > 5 ? 2 : 1)) {
            bestDistance = minD;
            bestFuzzy = c;
          }
        }
        matchedContact = bestFuzzy;
      }

      if (matchedContact && matchedContact.phoneNumbers && matchedContact.phoneNumbers.length > 0) {
        // Pick primary number or first number
        const numbers = matchedContact.phoneNumbers;
        const chosen = numbers.find(n => n.isPrimary) || numbers.find(n => n.label === 'mobile') || numbers[0];
        const rawNum = chosen.number || '';
        const phoneFormatted = rawNum.replace(/[^0-9+]/g, '');

        // Format cleanDigits for WhatsApp (digits only, no leading 0 for 11-digit numbers)
        let cleanDigits = phoneFormatted.replace(/[^0-9]/g, '');
        if (cleanDigits.startsWith('0') && cleanDigits.length === 11) {
          cleanDigits = cleanDigits.substring(1);
        }

        const resolved: ResolvedContact = {
          name: matchedContact.name || rawTarget,
          phoneNumber: phoneFormatted,
          cleanDigits,
        };

        console.log(`[ContactService] Successfully matched contact: "${resolved.name}" -> Phone: ${resolved.phoneNumber} (WhatsApp digits: ${resolved.cleanDigits})`);
        return resolved;
      }

      console.log(`[ContactService] No matching contact found for "${query}"`);
      return null;
    } catch (error) {
      console.error('[ContactService] Error reading contacts:', error);
      return null;
    }
  }

  /**
   * Helper returning just the phone number string
   */
  static async findContactPhoneNumber(targetName: string): Promise<string | null> {
    const contact = await this.findContact(targetName);
    return contact ? contact.phoneNumber : null;
  }
}
