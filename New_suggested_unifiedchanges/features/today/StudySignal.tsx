import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

// One signal travels through the MYELIN mark when a recommendation arrives.
// It settles instead of competing with the study task in an endless loop.
export function StudySignal({ identity }: { identity: string }) {
  const reduced = useReducedMotion();
  const signal = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(signal);
    signal.set(reduced ? 1 : 0);
    if (!reduced) signal.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(signal);
  }, [identity, reduced, signal]);
  const signalStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + signal.get() * 0.5,
    transform: [{ translateX: (signal.get() - 1) * 48 }],
  }));
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mark}>
      <View style={styles.path} />
      <View style={[styles.sheath, styles.first]} />
      <View style={[styles.sheath, styles.second]} />
      <View style={[styles.sheath, styles.third]} />
      <Animated.View style={[styles.signal, signalStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: 80, height: 40, justifyContent: 'center' },
  path: { height: 1, backgroundColor: colors.accentLine },
  sheath: { position: 'absolute', width: 16, height: 28, top: 6, borderWidth: 1, borderColor: colors.accentLine, borderRadius: 8, backgroundColor: colors.accentFaint },
  first: { left: 8 },
  second: { left: 32 },
  third: { left: 56 },
  signal: { position: 'absolute', width: 6, height: 6, right: 5, top: 17, borderRadius: 3, backgroundColor: colors.accentBright },
});
