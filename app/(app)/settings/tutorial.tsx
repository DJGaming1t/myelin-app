import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated, {
  Easing,
  FadeInRight,
  FadeOutLeft,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type TutorialStep = 0 | 1 | 2;

const STEPS = [
  {
    eyebrow: 'RECALL',
    title: 'Think first. Then check.',
    lead: 'MYELIN works best when your memory gets the first attempt.',
    flow: ['Answer', 'Reveal', 'Grade'],
    note: 'A hint is fine. MYELIN simply remembers that help was used.',
  },
  {
    eyebrow: 'TODAY',
    title: 'One useful move, not a giant list.',
    lead: 'MYELIN uses the time you actually have to choose what matters next.',
    flow: ['Time', 'Next move', 'Focus'],
    note: 'You can always adjust today without rebuilding your whole plan.',
  },
  {
    eyebrow: 'REVIEW',
    title: 'What struggled comes back.',
    lead: 'Mistakes and recall results feed the next review instead of disappearing.',
    flow: ['Study', 'Recall', 'Correct'],
    note: 'Progress is evidence for the next move, not a score of you.',
  },
] as const;

export default function TutorialReplayScreen() {
  const [step, setStep] = useState<TutorialStep>(0);
  const reduceMotion = useReducedMotion();
  const current = STEPS[step];
  const signal = useSharedValue(0);

  useEffect(() => {
    signal.value = reduceMotion
      ? 0.5
      : withRepeat(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
  }, [reduceMotion, signal, step]);

  const signalStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: signal.value * 190 }],
    opacity: 0.55 + signal.value * 0.45,
  }));

  function back() {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((step - 1) as TutorialStep);
  }

  function next() {
    if (step === 2) {
      router.back();
      return;
    }
    setStep((step + 1) as TutorialStep);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.page}>
        <ScreenHeader
          eyebrow="HELP"
          title="How MYELIN works"
          subtitle="Three ideas. About a minute."
          backLabel="Settings"
          onBack={() => router.back()}
        />

        <View style={styles.progress} accessibilityLabel={`Tutorial step ${step + 1} of 3`}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[
                styles.progressSegment,
                index <= step && styles.progressSegmentActive,
              ]}
            />
          ))}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Animated.View
            key={step}
            entering={reduceMotion ? undefined : FadeInRight.duration(190)}
            exiting={reduceMotion ? undefined : FadeOutLeft.duration(130)}
            layout={reduceMotion ? undefined : LinearTransition.duration(180)}>
            <Text style={styles.eyebrow}>{current.eyebrow}</Text>
            <Text accessibilityRole="header" style={styles.title}>{current.title}</Text>
            <Text style={styles.lead}>{current.lead}</Text>

            <View style={styles.signalStage}>
              <View style={styles.signalHalo} />
              <View style={styles.rail}>
                <View style={styles.railLine} />
                <Animated.View style={[styles.signalDot, signalStyle]} />
              </View>

              <View style={styles.flowRow}>
                {current.flow.map((label, index) => (
                  <View key={label} style={styles.flowItem}>
                    <View style={[styles.flowNode, index === 1 && styles.flowNodeAccent]}>
                      <Text style={[styles.flowNumber, index === 1 && styles.flowNumberAccent]}>
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={styles.flowLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.note}>
              <View style={styles.noteDot} />
              <Text style={styles.noteText}>{current.note}</Text>
            </View>
          </Animated.View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step === 0 ? 'Close tutorial' : 'Previous tutorial step'}
              onPress={back}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{step === 0 ? 'Close' : 'Back'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={step === 2 ? 'Finish tutorial' : 'Next tutorial step'}
              onPress={next}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{step === 2 ? 'Done' : 'Next'}</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>
          </View>

          <Text style={styles.readOnlyNote}>
            Tutorial replay is read-only — nothing here changes your study data or setup.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
  progress: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  progressSegmentActive: { backgroundColor: colors.accent },
  content: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 48,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.35,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.85,
    marginTop: 9,
  },
  lead: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    maxWidth: 470,
  },
  signalStage: {
    minHeight: 210,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    padding: spacing.lg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  signalHalo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -72,
    top: -72,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    opacity: 0.7,
  },
  rail: {
    height: 18,
    marginHorizontal: 22,
    justifyContent: 'center',
  },
  railLine: {
    height: 1,
    backgroundColor: colors.lineStrong,
  },
  signalDot: {
    position: 'absolute',
    left: 0,
    width: 11,
    height: 11,
    borderRadius: 11,
    backgroundColor: colors.accentBright,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  flowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 18,
  },
  flowItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  flowNode: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNodeAccent: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  flowNumber: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  flowNumberAccent: { color: colors.accent },
  flowLabel: {
    color: colors.textDim,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  note: {
    marginTop: spacing.md,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  noteDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  noteText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: 9, marginTop: spacing.xl },
  secondary: {
    minHeight: layout.minTouch,
    minWidth: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  primary: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  primaryText: { color: '#24120D', fontSize: 12, fontWeight: '900' },
  primaryArrow: { color: '#24120D', fontSize: 17, fontWeight: '800' },
  readOnlyNote: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.7 },
});
