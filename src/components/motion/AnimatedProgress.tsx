import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

export function AnimatedProgress({
  value,
  accessibilityLabel,
}: {
  value: number;
  accessibilityLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(clamp(value))).current;

  useEffect(() => {
    const target = clamp(value);
    progress.stopAnimation();

    if (reduceMotion) {
      progress.setValue(target);
      return;
    }

    Animated.spring(progress, {
      toValue: target,
      stiffness: 145,
      damping: 19,
      mass: 0.72,
      overshootClamping: true,
      isInteraction: false,
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion, value]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={styles.track}>
      <Animated.View style={[styles.fill, { width }]} />
      <View style={styles.highlight} />
    </View>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

const styles = StyleSheet.create({
  track: {
    height: 5,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: colors.lineStrong,
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
