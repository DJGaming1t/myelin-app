import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

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
  const progress = useSharedValue(clamp(value));

  useEffect(() => {
    const target = clamp(value);
    cancelAnimation(progress);

    if (reduceMotion) {
      progress.value = target;
      return;
    }

    progress.value = withSpring(target, {
      stiffness: 170,
      damping: 22,
      mass: 0.68,
      overshootClamping: true,
    });
  }, [progress, reduceMotion, value]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
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
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 5,
    backgroundColor: colors.accent,
    transformOrigin: 'left center',
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
