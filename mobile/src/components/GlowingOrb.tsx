import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { AssistantState } from '../types';

interface GlowingOrbProps {
  state: AssistantState;
  size?: number;
}

export const GlowingOrb: React.FC<GlowingOrbProps> = ({ state, size = 160 }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // 1. Rotation animation
    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: state === 'THINKING' ? 3000 : 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateLoop.start();

    // 2. Pulse & Glow based on Assistant State
    let pulseLoop: Animated.CompositeAnimation;

    if (state === 'LISTENING') {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.9, duration: 600, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 0.95, duration: 600, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
          ]),
        ])
      );
    } else if (state === 'SPEAKING') {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.8, duration: 400, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.6, duration: 400, useNativeDriver: true }),
          ]),
        ])
      );
    } else if (state === 'THINKING') {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.75, duration: 500, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 0.9, duration: 500, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.35, duration: 500, useNativeDriver: true }),
          ]),
        ])
      );
    } else {
      // IDLE breathing
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.5, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 0.95, duration: 2000, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
          ]),
        ])
      );
    }

    pulseLoop.start();

    return () => {
      rotateLoop.stop();
      pulseLoop.stop();
    };
  }, [state]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Dynamic colors by state
  const getColors = () => {
    switch (state) {
      case 'LISTENING':
        return { outer: '#00F0FF', mid: '#0077FE', core: '#7000FF' };
      case 'THINKING':
        return { outer: '#FFB800', mid: '#FF007A', core: '#7928CA' };
      case 'SPEAKING':
        return { outer: '#FF007A', mid: '#7928CA', core: '#00F0FF' };
      default:
        return { outer: '#6366F1', mid: '#8B5CF6', core: '#3B82F6' };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.container, { width: size * 1.5, height: size * 1.5 }]}>
      {/* Outer Glowing Halo */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: (size * 1.4) / 2,
            backgroundColor: colors.outer,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      {/* Mid Orbiting Ring */}
      <Animated.View
        style={[
          styles.midRing,
          {
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: (size * 1.15) / 2,
            borderColor: colors.mid,
            transform: [{ rotate: spin }, { scale: pulseAnim }],
          },
        ]}
      />

      {/* Inner Glowing Core */}
      <Animated.View
        style={[
          styles.core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.core,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    filter: 'blur(30px)',
  },
  midRing: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 15,
  },
});
