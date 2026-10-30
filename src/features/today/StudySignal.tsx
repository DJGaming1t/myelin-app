import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

// One signal travels through the MYELIN axon sheaths when a recommendation arrives.
// It settles with a bioluminescent corona instead of competing in an endless loop.
export function StudySignal({ identity }: { identity: string }) {
  const reduced = useReducedMotion();
  const signal = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(signal);
    signal.set(reduced ? 1 : 0);
    if (!reduced) signal.set(withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(signal);
  }, [identity, reduced, signal]);
  const signalStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + signal.get() * 0.45,
    transform: [{ translateX: (signal.get() - 1) * 54 }],
  }));
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mark}>
      <View style={styles.somaTerminal} />
      <View style={styles.path} />
      <View style={[styles.sheath, styles.first]}><View style={styles.sheathCore} /></View>
      <View style={[styles.sheath, styles.second]}><View style={styles.sheathCore} /></View>
      <View style={[styles.sheath, styles.third]}><View style={[styles.sheathCore, styles.sheathCoreActive]} /></View>
      <Animated.View style={[styles.signalWrap, signalStyle]}>
        <View style={styles.signalHalo} />
        <View style={styles.signal} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: 88, height: 42, justifyContent: 'center' },
  somaTerminal: {
    position: 'absolute',
    left: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentLine,
  },
  path: { marginLeft: 4, marginRight: 4, height: 1.5, backgroundColor: colors.accentLine },
  sheath: {
    position: 'absolute',
    width: 18,
    height: 28,
    top: 7,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderRadius: 9,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheathCore: {
    width: 8,
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,130,93,0.12)',
  },
  sheathCoreActive: {
    backgroundColor: 'rgba(76,224,210,0.16)',
  },
  first: { left: 9 },
  second: { left: 34 },
  third: { left: 59, borderColor: colors.synapseLine },
  signalWrap: {
    position: 'absolute',
    right: 3,
    top: 13,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalHalo: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.synapseGlow,
  },
  signal: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.synapseBright,
  },
});
