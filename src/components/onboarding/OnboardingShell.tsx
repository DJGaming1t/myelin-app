import { PropsWithChildren, ReactNode, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  title: ReactNode;
  description?: string;
  topActionLabel?: string;
  onTopAction?: () => void;
  visual?: ReactNode;
}>;

export function OnboardingShell({
  title,
  description,
  topActionLabel,
  onTopAction,
  visual,
  children,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.topbar}>
            <View style={styles.brand} accessible accessibilityLabel="MYELIN">
              <View style={styles.brandMark}><View style={styles.brandCore} /></View>
              <Text style={styles.brandName}>MYELIN</Text>
            </View>

            {topActionLabel && onTopAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={onTopAction}
                hitSlop={8}
                style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
                <Text style={styles.topActionText}>{topActionLabel}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>

          {visual ? <View style={styles.visual}>{visual}</View> : <View style={styles.flexSpacer} />}

          <View style={styles.actions}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function StudyPathVisual() {
  const reduceMotion = useReducedMotion();
  const signal = useSharedValue(0);
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      signal.value = 0.52;
      float.value = 0;
      breathe.value = 0.45;
      return;
    }

    signal.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.linear }),
      -1,
      false,
    );
    float.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [breathe, float, reduceMotion, signal]);

  const signalStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: signal.value * 232 }],
    opacity: 0.55 + Math.sin(signal.value * Math.PI) * 0.45,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { rotate: '-2deg' }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + breathe.value * 0.34,
    transform: [{ scale: 0.88 + breathe.value * 0.18 }],
  }));

  return (
    <View style={visualStyles.stage} accessible={false}>
      <Animated.View style={[visualStyles.backPulse, pulseStyle]} />
      <View style={visualStyles.neuralLineA} />
      <View style={visualStyles.neuralLineB} />
      <View style={visualStyles.neuralNodeA} />
      <View style={visualStyles.neuralNodeB} />
      <View style={visualStyles.neuralNodeC} />

      <View style={visualStyles.track}>
        <View style={[visualStyles.node, visualStyles.nodeMuted]} />
        <View style={visualStyles.trackLine} />
        <View style={[visualStyles.node, visualStyles.nodeAccent]} />
        <View style={visualStyles.trackLine} />
        <View style={[visualStyles.node, visualStyles.nodeMuted]} />
      </View>
      <Animated.View style={[visualStyles.signal, signalStyle]} />

      <View style={visualStyles.orbit} />

      <Animated.View style={[visualStyles.primaryCard, cardStyle]}>
        <View style={visualStyles.cardTop}>
          <Text style={visualStyles.cardEyebrow}>NEXT</Text>
          <View style={visualStyles.livePill}>
            <View style={visualStyles.liveDot} />
            <Text style={visualStyles.liveText}>MYELIN</Text>
          </View>
        </View>
        <Text style={visualStyles.cardTitle}>Trigonometry</Text>
        <View style={visualStyles.cardMetaRow}>
          <Text style={visualStyles.cardMeta}>45 min</Text>
          <View style={visualStyles.dot} />
          <Text style={visualStyles.cardMeta}>exam soon</Text>
        </View>
      </Animated.View>

      <View style={visualStyles.smallCard}>
        <Text style={visualStyles.smallLabel}>RECALL</Text>
        <View style={visualStyles.smallBar} />
        <View style={[visualStyles.smallBar, visualStyles.smallBarShort]} />
      </View>
    </View>
  );
}

export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.primaryText}>{label}</Text>
      <Text style={styles.primaryArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    minHeight: '100%',
    alignSelf: 'center',
  },
  topbar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent },
  brandName: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 2.1,
  },
  topAction: {
    minHeight: layout.minTouch,
    minWidth: layout.minTouch,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
  },
  hero: {
    paddingTop: spacing.xl,
    maxWidth: layout.readingMax,
  },
  title: {
    color: colors.text,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '600',
    letterSpacing: -1.6,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
    maxWidth: 430,
  },
  visual: {
    flex: 1,
    minHeight: 240,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  flexSpacer: { flex: 1, minHeight: spacing.xl },
  actions: { paddingBottom: spacing.sm },
  primary: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryText: { color: '#25140e', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 20, lineHeight: 22, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
});

const visualStyles = StyleSheet.create({
  stage: {
    height: 240,
    position: 'relative',
    justifyContent: 'center',
  },
  backPulse: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 110,
    right: -26,
    top: 5,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  neuralLineA: {
    position: 'absolute',
    width: 126,
    height: 1,
    right: 18,
    top: 58,
    backgroundColor: colors.accentLine,
    transform: [{ rotate: '-22deg' }],
    opacity: 0.6,
  },
  neuralLineB: {
    position: 'absolute',
    width: 104,
    height: 1,
    right: 44,
    top: 138,
    backgroundColor: colors.lineStrong,
    transform: [{ rotate: '31deg' }],
  },
  neuralNodeA: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 9,
    right: 30,
    top: 33,
    backgroundColor: colors.accent,
  },
  neuralNodeB: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 7,
    right: 134,
    top: 77,
    backgroundColor: colors.textDim,
  },
  neuralNodeC: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 5,
    right: 62,
    top: 166,
    backgroundColor: colors.accentBright,
  },
  track: {
    position: 'absolute',
    left: 8,
    width: 256,
    bottom: 24,
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  node: { width: 8, height: 8, borderRadius: 8 },
  nodeMuted: { backgroundColor: colors.subtle },
  nodeAccent: { backgroundColor: colors.accent },
  signal: {
    position: 'absolute',
    left: 10,
    bottom: 30,
    width: 12,
    height: 12,
    borderRadius: 12,
    backgroundColor: colors.accentBright,
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  orbit: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    borderWidth: 1,
    borderColor: colors.accentLine,
    right: -48,
    top: 10,
    opacity: 0.32,
  },
  primaryCard: {
    width: '78%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardEyebrow: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  liveDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.success },
  liveText: {
    color: colors.textDim,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '600',
    marginTop: 10,
    letterSpacing: -0.55,
  },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  cardMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 4, backgroundColor: colors.accent },
  smallCard: {
    position: 'absolute',
    right: 8,
    bottom: 48,
    width: 104,
    height: 78,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 12,
    justifyContent: 'center',
    gap: 7,
    transform: [{ rotate: '4deg' }],
  },
  smallLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  smallBar: {
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.textDim,
    opacity: 0.52,
  },
  smallBarShort: { width: '62%', backgroundColor: colors.accent },
});
