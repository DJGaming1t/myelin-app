import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

export function AmbientBackdrop() {
  const reduceMotion = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    drift.stopAnimation();
    breathe.stopAnimation();

    if (reduceMotion) {
      drift.setValue(0.5);
      breathe.setValue(0.35);
      return;
    }

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 12000,
          easing: Easing.inOut(Easing.sin),
          isInteraction: false,
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 12000,
          easing: Easing.inOut(Easing.sin),
          isInteraction: false,
          useNativeDriver: true,
        }),
      ]),
    );

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 7600,
          easing: Easing.inOut(Easing.quad),
          isInteraction: false,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 7600,
          easing: Easing.inOut(Easing.quad),
          isInteraction: false,
          useNativeDriver: true,
        }),
      ]),
    );

    driftLoop.start();
    breatheLoop.start();

    return () => {
      driftLoop.stop();
      breatheLoop.stop();
    };
  }, [breathe, drift, reduceMotion]);

  const topMotion = {
    transform: [
      {
        translateX: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 24],
        }),
      },
      {
        translateY: breathe.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 14],
        }),
      },
      {
        scale: breathe.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.06],
        }),
      },
    ],
    opacity: breathe.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0.92],
    }),
  };

  const sideMotion = {
    transform: [
      {
        translateX: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [18, -14],
        }),
      },
      {
        translateY: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [16, -18],
        }),
      },
    ],
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <View style={styles.grid}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={[styles.gridLine, { top: 72 + index * 74 }]} />
        ))}
      </View>
      <Animated.View style={[styles.orb, styles.orbTop, topMotion]} />
      <Animated.View style={[styles.orb, styles.orbSide, sideMotion]} />
      <View style={[styles.ring, styles.ringTop]} />
      <View style={[styles.ring, styles.ringSide]} />
      <View style={styles.topHairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
  },
  gridLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.022)',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  orbTop: {
    width: 380,
    height: 380,
    top: -245,
    right: -130,
    opacity: 0.07,
  },
  orbSide: {
    width: 300,
    height: 300,
    top: '40%',
    left: -235,
    opacity: 0.035,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,130,93,0.06)',
  },
  ringTop: {
    width: 270,
    height: 270,
    top: -92,
    right: -74,
  },
  ringSide: {
    width: 210,
    height: 210,
    top: '49%',
    left: -138,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: colors.accentLine,
    opacity: 0.36,
  },
});
