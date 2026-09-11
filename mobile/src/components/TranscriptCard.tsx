import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../types';

interface TranscriptCardProps {
  lastMessage?: ChatMessage | null;
  statusText: string;
}

export const TranscriptCard: React.FC<TranscriptCardProps> = ({ lastMessage, statusText }) => {
  return (
    <View style={styles.cardContainer}>
      {/* Live Status Header */}
      <View style={styles.statusRow}>
        <View style={styles.liveDot} />
        <Text style={styles.statusLabel}>{statusText}</Text>
      </View>

      {/* Message Content */}
      {lastMessage ? (
        <View style={styles.messageContent}>
          <Text style={styles.userQuery}>
            "{lastMessage.sender === 'user' ? lastMessage.text : '...'}"
          </Text>
          
          {lastMessage.sender === 'catty' && (
            <Text style={styles.cattyReply}>{lastMessage.text}</Text>
          )}

          {/* Action Badge */}
          {lastMessage.action && (
            <View style={styles.actionBadge}>
              <Text style={styles.actionText}>
                ⚡ {lastMessage.action.action}: {lastMessage.action.description || 'Dispatched to Android'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.placeholderText}>
          Tap the microphone or say "Catty" to start...
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 20,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    minHeight: 110,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00F0FF',
    marginRight: 6,
  },
  statusLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  messageContent: {
    marginTop: 4,
  },
  userQuery: {
    color: '#E5E7EB',
    fontSize: 16,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  cattyReply: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 22,
  },
  actionBadge: {
    backgroundColor: 'rgba(0, 240, 255, 0.15)',
    borderColor: '#00F0FF',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  actionText: {
    color: '#00F0FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
  },
});
