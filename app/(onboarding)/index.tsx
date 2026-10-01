import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  DAILY_CAPACITY_OPTIONS,
  applyOnboardingSetup,
  normalizeDailyCapacity,
} from '@/src/features/onboarding/onboarding-engine';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { createTopic, makeRecordId } from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Step = 0 | 1;

const SUBJECTS = ['Mathematics', 'Science', 'Social Science', 'English'];

const CAPACITY_COPY: Record<number, { label: string; note: string }> = {
  45: { label: 'Light', note: 'One focused block' },
  60: { label: 'Steady', note: 'A realistic focused hour' },
  90: { label: 'Balanced', note: 'Two useful study chunks' },
  120: { label: 'Deep', note: 'A genuinely open study day' },
};

export default function OnboardingScreen() {
  const { workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const { finish } = useOnboarding();

  const [step, setStep] = useState<Step>(0);
  const [capacity, setCapacity] = useState(
    normalizeDailyCapacity(workspace?.settings.dailyMinutes ?? 90),
  );
  const [subject, setSubject] = useState('');
  const [topicName, setTopicName] = useState('');
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const topicId = useRef(makeRecordId('topic'));

  async function skip() {
    if (finishing) return;
    setFinishing(true);
    setError('');

    try {
      await finish('skipped');
      router.replace('/(app)/today');
    } catch {
      setError('Could not save the setup choice on this device. Try again.');
      setFinishing(false);
    }
  }

  async function complete(createFirstTopic: boolean) {
    if (finishing || !workspace) return;

    const cleanSubject = subject.trim();
    const cleanName = topicName.trim();

    if (createFirstTopic && !cleanSubject) {
      setError('Choose or enter a subject for your first topic.');
      return;
    }
    if (createFirstTopic && !cleanName) {
      setError('Give your first topic a name.');
      return;
    }

    setFinishing(true);
    setError('');

    const firstTopic = createFirstTopic
      ? createTopic(
          {
            name: cleanName,
            subject: cleanSubject,
            status: 'new',
            priority: 2,
            estimate: Math.min(45, normalizeDailyCapacity(capacity)),
            notes: '',
          },
          Date.now(),
          topicId.current,
        )
      : undefined;

    const next = updateWorkspace((draft) => {
      applyOnboardingSetup(draft, capacity, firstTopic);
    });

    if (!next) {
      setError('The workspace is not ready yet.');
      setFinishing(false);
      return;
    }

    try {
      await waitForSaves();
      await finish('completed');
      router.replace('/(app)/today');
    } catch {
      setError('Setup could not be finished on this device. Your study data was left intact.');
      setFinishing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>MYELIN</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={() => void skip()}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && styles.pressed,
            finishing && styles.disabled,
          ]}>
          <Text style={styles.skipText}>Skip setup</Text>
        </Pressable>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressMeta}>
          <Text style={styles.progressLabel}>QUICK SETUP</Text>
          <Text style={styles.progressCount}>{step + 1} / 2</Text>
        </View>
        <AnimatedProgress
          value={(step + 1) / 2}
          accessibilityLabel={`Setup step ${step + 1} of 2`}
        />
      </View>

      <View style={styles.flex}>
        {step === 0 ? (
          <Reveal key="capacity" distance={10} style={styles.flex}>
            <CapacityStep
              capacity={capacity}
              onChange={setCapacity}
              onContinue={() => {
                setError('');
                setStep(1);
              }}
            />
          </Reveal>
        ) : null}

        {step === 1 ? (
          <Reveal key="topic" distance={10} style={styles.flex}>
            <TopicStep
              subject={subject}
              topicName={topicName}
              error={error}
              finishing={finishing}
              onSubject={setSubject}
              onTopicName={setTopicName}
              onBack={() => {
                setError('');
                setStep(0);
              }}
              onCreate={() => void complete(true)}
              onFinishWithoutTopic={() => void complete(false)}
            />
          </Reveal>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function CapacityStep({
  capacity,
  onChange,
  onContinue,
}: {
  capacity: number;
  onChange: (value: number) => void;
  onContinue: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>ONE USEFUL DECISION AT A TIME</Text>
      <Text style={styles.title}>MYELIN decides what matters next.</Text>
      <Text style={styles.lead}>
        Topics, exams and tasks feed one study plan. You focus or recall. The result helps the next recommendation get better.
      </Text>

      <View style={styles.loop}>
        <LoopRow label="TODAY" text="One clear next move instead of an impossible list." />
        <LoopRow label="FOCUS / RECALL" text="Do the work in one cognitive mode at a time." />
        <LoopRow label="LEARN" text="Mistakes and results feed tomorrow’s plan." />
      </View>

      <View style={styles.questionHeader}>
        <Text style={styles.questionTitle}>How much focused study is realistic on a normal day?</Text>
        <Text style={styles.questionHint}>This is a ceiling, not a streak target.</Text>
      </View>

      <View style={styles.capacityList}>
        {DAILY_CAPACITY_OPTIONS.map((minutes) => {
          const active = capacity === minutes;
          const copy = CAPACITY_COPY[minutes];

          return (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(minutes)}
              style={({ pressed }) => [
                styles.capacityRow,
                active && styles.capacityRowActive,
                pressed && styles.pressed,
              ]}>
              <View style={[styles.capacityRail, active && styles.capacityRailActive]} />
              <View style={styles.capacityMinutesWrap}>
                <Text style={[styles.capacityMinutes, active && styles.activeText]}>{minutes}</Text>
                <Text style={styles.capacityUnit}>min</Text>
              </View>
              <View style={styles.capacityCopy}>
                <Text style={[styles.capacityLabel, active && styles.activeText]}>{copy.label}</Text>
                <Text style={styles.capacityNote}>{copy.note}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="Use this capacity" onPress={onContinue} />
    </ScrollView>
  );
}

function TopicStep({
  subject,
  topicName,
  error,
  finishing,
  onSubject,
  onTopicName,
  onBack,
  onCreate,
  onFinishWithoutTopic,
}: {
  subject: string;
  topicName: string;
  error: string;
  finishing: boolean;
  onSubject: (value: string) => void;
  onTopicName: (value: string) => void;
  onBack: () => void;
  onCreate: () => void;
  onFinishWithoutTopic: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>MAKE IT REAL</Text>
        <Text style={styles.title}>Add one topic you actually need to study.</Text>
        <Text style={styles.lead}>
          Not your whole syllabus. One real topic is enough for MYELIN to show a useful Today recommendation.
        </Text>

        <Text style={styles.fieldLabel}>SUBJECT</Text>
        <TextInput
          accessibilityLabel="First topic subject"
          value={subject}
          onChangeText={onSubject}
          placeholder="e.g. Mathematics"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          maxLength={120}
          style={styles.input}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subjectRow}>
          {SUBJECTS.map((item) => {
            const active = subject.trim() === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSubject(item)}
                style={({ pressed }) => [
                  styles.subjectChip,
                  active && styles.subjectChipActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.subjectChipText, active && styles.activeText]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.fieldLabel}>TOPIC</Text>
        <TextInput
          accessibilityLabel="First topic name"
          value={topicName}
          onChangeText={onTopicName}
          placeholder="e.g. Quadratic Equations"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          maxLength={300}
          style={styles.input}
          returnKeyType="done"
        />

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>WHAT HAPPENS NEXT</Text>
          <Text style={styles.previewTitle}>
            {topicName.trim() || 'Your topic'} becomes a candidate for Today.
          </Text>
          <Text style={styles.previewText}>
            MYELIN will combine it with your available time, future exams and recall state before recommending what to do.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label={finishing ? 'Finishing setup…' : 'Create topic & enter MYELIN'}
          onPress={onCreate}
          disabled={finishing}
        />

        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={onFinishWithoutTopic}
          style={({ pressed }) => [
            styles.textButton,
            pressed && styles.pressed,
            finishing && styles.disabled,
          ]}>
          <Text style={styles.textButtonText}>Finish without a topic</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={onBack}
          style={({ pressed }) => [
            styles.backLink,
            pressed && styles.pressed,
            finishing && styles.disabled,
          ]}>
          <Text style={styles.backLinkText}>← Back to daily capacity</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoopRow({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.loopRow}>
      <Text style={styles.loopLabel}>{label}</Text>
      <Text style={styles.loopText}>{text}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
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
        styles.primaryButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Text style={styles.primaryArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topbar: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent },
  brandName: { color: colors.textDim, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.9 },
  skipButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  progressWrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: 2,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  progressLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.7 },
  progressCount: { color: colors.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
  stepContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 34,
    paddingBottom: 44,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.75,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1.1,
    marginTop: 9,
  },
  lead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 590,
  },
  loop: {
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  loopRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  loopLabel: {
    width: 88,
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.45,
  },
  loopText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
  questionHeader: { marginTop: spacing.xl, marginBottom: 9 },
  questionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  questionHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  capacityList: { borderTopWidth: 1, borderTopColor: colors.line },
  capacityRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 8,
  },
  capacityRowActive: { backgroundColor: colors.accentFaint },
  capacityRail: { width: 2, height: 38, borderRadius: 2, backgroundColor: colors.lineStrong },
  capacityRailActive: { backgroundColor: colors.accent },
  capacityMinutesWrap: { width: 54, alignItems: 'flex-start' },
  capacityMinutes: { color: colors.text, fontSize: 22, lineHeight: 25, fontWeight: '700' },
  capacityUnit: { color: colors.muted, fontSize: 11, lineHeight: 14, marginTop: 1 },
  capacityCopy: { flex: 1 },
  capacityLabel: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  capacityNote: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.accent },
  activeText: { color: colors.accent },
  fieldLabel: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.35,
    marginTop: spacing.xl,
    marginBottom: 8,
  },
  input: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
    backgroundColor: 'rgba(16,16,19,0.36)',
    paddingHorizontal: 2,
    color: colors.text,
    fontSize: 14,
  },
  subjectRow: { gap: 7, paddingTop: 10 },
  subjectChip: {
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectChipActive: { borderColor: colors.accentLine, backgroundColor: colors.accentFaint },
  subjectChipText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  preview: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  previewLabel: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  previewTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 6 },
  previewText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 12 },
  primaryButton: {
    minHeight: 56,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButtonText: { color: '#25140e', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 20, fontWeight: '700' },
  textButton: {
    minHeight: layout.minTouch,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  backLink: {
    minHeight: layout.minTouch,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLinkText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
});
