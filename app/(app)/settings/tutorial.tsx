import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type TutorialStep = 0 | 1 | 2;

const STEPS = [
  {
    eyebrow: 'ACTIVE RECALL',
    title: 'Try the answer before you reveal it.',
    lead: 'MYELIN is built to make memory do the work first. Looking at the answer too early can feel easy without proving that you can actually recall it.',
    cards: [
      ['01', 'Answer', 'Attempt the question from memory before opening the reference.'],
      ['02', 'Reveal', 'Compare what you produced with the reference answer or notes.'],
      ['03', 'Grade', 'Mark how it went so MYELIN can place the next review at a useful time.'],
    ],
    tip: 'Hints are allowed. MYELIN records hint use so a successful answer with help is not treated exactly like clean recall.',
  },
  {
    eyebrow: 'TODAY + FOCUS',
    title: 'Plan from the time you really have.',
    lead: 'Today uses your available minutes, due reviews, nearby exams, priority and subject variety to choose a realistic order instead of generating an endless task list.',
    cards: [
      ['01', 'Choose capacity', 'Use an ordinary-day estimate, not the biggest study day you can imagine.'],
      ['02', 'Start one block', 'The next move should be concrete: a topic, a mode and a block length.'],
      ['03', 'Recover cleanly', 'Focus timers and breaks are stored so closing or backgrounding the app does not erase the session.'],
    ],
    tip: 'The five-minute launch exists for starting resistance. It is a smaller doorway into the same study session, not a fake streak or punishment.',
  },
  {
    eyebrow: 'REVIEW LOOP',
    title: 'Turn mistakes into the next useful attempt.',
    lead: 'Topics, recall questions, mistakes and exams feed the same loop: study something, retrieve it later, notice what failed, correct it, then retest.',
    cards: [
      ['01', 'Capture', 'Add recall questions and record mistakes that reveal a real gap.'],
      ['02', 'Retest', 'Use Review and the mistake notebook to test the corrected idea again.'],
      ['03', 'Calibrate', 'Progress compares confidence, results and planned-versus-actual time instead of pretending every session means mastery.'],
    ],
    tip: 'You can change daily capacity, focus length, breaks, reminders and reduced motion in Settings at any time.',
  },
] as const;

export default function TutorialReplayScreen() {
  const [step, setStep] = useState<TutorialStep>(0);
  const current = STEPS[step];

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
      <View style={styles.page}>
        <ScreenHeader
          eyebrow="HELP"
          title="How MYELIN works"
          subtitle="A replayable guide. Nothing on this screen changes your workspace or onboarding status."
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
          <Text style={styles.eyebrow}>{current.eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{current.title}</Text>
          <Text style={styles.lead}>{current.lead}</Text>

          <View style={styles.cardGroup}>
            {current.cards.map(([number, title, note]) => (
              <View key={number} style={styles.card}>
                <View style={styles.numberWrap}>
                  <Text style={styles.number}>{number}</Text>
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.cardText}>{note}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipMark}>i</Text>
            <Text style={styles.tipText}>{current.tip}</Text>
          </View>

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
            Tutorial replay is read-only. Your topics, settings, history and first-run completion remain unchanged.
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
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 9,
  },
  lead: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
  },
  cardGroup: { gap: 9, marginTop: spacing.xl },
  card: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  numberWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  number: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  cardText: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  tip: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.18)',
    backgroundColor: 'rgba(255,128,91,0.05)',
    padding: 12,
    flexDirection: 'row',
    gap: 9,
  },
  tipMark: {
    width: 20,
    height: 20,
    borderRadius: 20,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 10,
    fontWeight: '900',
  },
  tipText: { flex: 1, color: colors.muted, fontSize: 9.5, lineHeight: 15 },
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
  secondaryText: { color: colors.text, fontSize: 11, fontWeight: '800' },
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
  primaryText: { color: '#24120D', fontSize: 11, fontWeight: '900' },
  primaryArrow: { color: '#24120D', fontSize: 17, fontWeight: '800' },
  readOnlyNote: {
    color: colors.subtle,
    fontSize: 8.8,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.7 },
});
