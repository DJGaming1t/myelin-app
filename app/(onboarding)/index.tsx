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
import {
  createTopic,
  makeRecordId,
} from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Step = 0 | 1 | 2;

const SUBJECTS = ['Mathematics', 'Science', 'Social Science', 'English'];

const CAPACITY_COPY: Record<number, { label: string; note: string }> = {
  45: {
    label: 'Light',
    note: 'One focused block. Good for packed school days.',
  },
  60: {
    label: 'Steady',
    note: 'A focused hour with enough room to stay consistent.',
  },
  90: {
    label: 'Balanced',
    note: 'Two solid chunks for most normal study days.',
  },
  120: {
    label: 'Deep',
    note: 'For days when you genuinely have a larger study window.',
  },
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
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>M</Text>
          </View>
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
          <Text style={styles.progressLabel}>SETUP</Text>
          <Text style={styles.progressCount}>{step + 1} / 3</Text>
        </View>
        <AnimatedProgress
          value={(step + 1) / 3}
          accessibilityLabel={`Setup step ${step + 1} of 3`}
        />
      </View>

      <View style={styles.flex}>
        {step === 0 ? (
          <Reveal key="intro" distance={14} style={styles.flex}>
            <IntroStep
              onContinue={() => {
                setError('');
                setStep(1);
              }}
            />
          </Reveal>
        ) : null}

        {step === 1 ? (
          <Reveal key="capacity" distance={14} style={styles.flex}>
            <CapacityStep
              capacity={capacity}
              onChange={setCapacity}
              onBack={() => {
                setError('');
                setStep(0);
              }}
              onContinue={() => {
                setError('');
                setStep(2);
              }}
            />
          </Reveal>
        ) : null}

        {step === 2 ? (
          <Reveal key="topic" distance={14} style={styles.flex}>
            <TopicStep
              subject={subject}
              topicName={topicName}
              error={error}
              finishing={finishing}
              onSubject={setSubject}
              onTopicName={setTopicName}
              onBack={() => {
                setError('');
                setStep(1);
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

function IntroStep({ onContinue }: { onContinue: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.heroVisual}>
        <View style={[styles.node, styles.nodeA]}>
          <Text style={styles.nodeText}>?</Text>
        </View>
        <View style={[styles.connector, styles.connectorA]} />
        <View style={[styles.node, styles.nodeB, styles.nodeAccent]}>
          <Text style={[styles.nodeText, styles.nodeTextDark]}>A</Text>
        </View>
        <View style={[styles.connector, styles.connectorB]} />
        <View style={[styles.node, styles.nodeC]}>
          <Text style={styles.nodeText}>↻</Text>
        </View>
        <View style={styles.heroHalo} />
      </View>

      <Text style={styles.eyebrow}>BUILD MEMORY, NOT JUST NOTES</Text>
      <Text style={styles.title}>Study by pulling the answer out.</Text>
      <Text style={styles.lead}>
        MYELIN is built around active recall: try the answer first, reveal the reference second, then grade how well you actually knew it.
      </Text>

      <View style={styles.recallCard}>
        <FlowStep number="01" title="Answer" note="Try from memory before looking." />
        <FlowDivider />
        <FlowStep number="02" title="Reveal" note="Compare with the reference." />
        <FlowDivider />
        <FlowStep number="03" title="Grade" note="Schedule the next useful review." />
      </View>

      <View style={styles.callout}>
        <Text style={styles.calloutMark}>⌁</Text>
        <View style={styles.calloutCopy}>
          <Text style={styles.calloutTitle}>No fake productivity</Text>
          <Text style={styles.calloutText}>
            Your plan is limited by the study time you actually have. MYELIN would rather give you one doable next action than an impossible list.
          </Text>
        </View>
      </View>

      <PrimaryButton label="Set up in about a minute" onPress={onContinue} />
    </ScrollView>
  );
}

function CapacityStep({
  capacity,
  onChange,
  onBack,
  onContinue,
}: {
  capacity: number;
  onChange: (value: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>YOUR REAL DAY</Text>
      <Text style={styles.title}>How much focused study time is usually realistic?</Text>
      <Text style={styles.lead}>
        Think about an ordinary day—not your most motivated day. You can change this anytime in Settings or Today.
      </Text>

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
                styles.capacityCard,
                active && styles.capacityCardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.capacityMinutesWrap}>
                <Text style={[styles.capacityMinutes, active && styles.activeText]}>
                  {minutes}
                </Text>
                <Text style={styles.capacityUnit}>min/day</Text>
              </View>
              <View style={styles.capacityCopy}>
                <Text style={[styles.capacityLabel, active && styles.activeText]}>
                  {copy.label}
                </Text>
                <Text style={styles.capacityNote}>{copy.note}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tipRow}>
        <Text style={styles.tipMark}>i</Text>
        <Text style={styles.tipText}>
          This is a planning ceiling, not a target you have to “win” every day.
        </Text>
      </View>

      <View style={styles.actions}>
        <SecondaryButton label="Back" onPress={onBack} />
        <PrimaryButton label="Use this capacity" onPress={onContinue} compact />
      </View>
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
        <Text style={styles.eyebrow}>ONE REAL THING</Text>
        <Text style={styles.title}>Add the first topic you actually need to study.</Text>
        <Text style={styles.lead}>
          Don’t build your whole syllabus here. One topic is enough to make Today and Focus immediately useful.
        </Text>

        <Text style={styles.fieldLabel}>Subject</Text>
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
                <Text style={[styles.subjectChipText, active && styles.activeText]}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.fieldLabel}>Topic</Text>
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

        <View style={styles.firstTopicPreview}>
          <View style={styles.previewTop}>
            <Text style={styles.previewEyebrow}>FIRST TOPIC</Text>
            <Text style={styles.previewPriority}>NORMAL PRIORITY</Text>
          </View>
          <Text style={styles.previewTitle}>
            {topicName.trim() || 'Your topic'}
          </Text>
          <Text style={styles.previewSubject}>
            {subject.trim() || 'Subject'} · 45 min estimate
          </Text>
          <View style={styles.previewAction}>
            <Text style={styles.previewActionText}>Today will turn this into a doable next action</Text>
            <Text style={styles.previewArrow}>→</Text>
          </View>
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

function FlowStep({
  number,
  title,
  note,
}: {
  number: string;
  title: string;
  note: string;
}) {
  return (
    <View style={styles.flowStep}>
      <Text style={styles.flowNumber}>{number}</Text>
      <Text style={styles.flowTitle}>{title}</Text>
      <Text style={styles.flowNote}>{note}</Text>
    </View>
  );
}

function FlowDivider() {
  return <Text style={styles.flowDivider}>→</Text>;
}

function PrimaryButton({
  label,
  onPress,
  compact = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.buttonCompact,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Text style={styles.primaryArrow}>→</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: { color: '#24120D', fontSize: 12, fontWeight: '900' },
  brandName: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.1,
  },
  skipButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: colors.subtle, fontSize: 10, fontWeight: '700' },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  progressLabel: {
    color: colors.subtle,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  progressCount: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '800',
  },
  stepContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 32,
    paddingBottom: 44,
  },
  heroVisual: {
    height: 128,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.18)',
    backgroundColor: colors.panel,
    marginBottom: 30,
    overflow: 'hidden',
  },
  heroHalo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 150,
    right: 38,
    top: -65,
    backgroundColor: 'rgba(255,128,91,0.08)',
  },
  node: {
    position: 'absolute',
    width: 43,
    height: 43,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeA: { left: 28, top: 42 },
  nodeB: { left: '44%', top: 21 },
  nodeC: { right: 28, top: 57 },
  nodeAccent: {
    borderColor: 'rgba(255,128,91,0.55)',
    backgroundColor: colors.accent,
  },
  nodeText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  nodeTextDark: { color: '#24120D' },
  connector: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,128,91,0.34)',
    zIndex: 1,
  },
  connectorA: {
    width: '34%',
    left: 65,
    top: 57,
    transform: [{ rotate: '-9deg' }],
  },
  connectorB: {
    width: '31%',
    right: 62,
    top: 65,
    transform: [{ rotate: '13deg' }],
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.45,
  },
  title: {
    color: colors.text,
    fontSize: 30,
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
  recallCard: {
    marginTop: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flowStep: { flex: 1 },
  flowNumber: {
    color: colors.accent,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  flowTitle: { color: colors.text, fontSize: 11, fontWeight: '800', marginTop: 4 },
  flowNote: { color: colors.subtle, fontSize: 8, lineHeight: 12, marginTop: 3 },
  flowDivider: { color: colors.subtle, fontSize: 13, marginHorizontal: 4 },
  callout: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.018)',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  calloutMark: { color: colors.accent, fontSize: 18, lineHeight: 22 },
  calloutCopy: { flex: 1 },
  calloutTitle: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  calloutText: { color: colors.subtle, fontSize: 8.8, lineHeight: 14, marginTop: 3 },
  capacityList: { marginTop: 22, gap: 9 },
  capacityCard: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  capacityCardActive: {
    borderColor: 'rgba(255,128,91,0.50)',
    backgroundColor: colors.accentSoft,
  },
  capacityMinutesWrap: { width: 63 },
  capacityMinutes: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  capacityUnit: { color: colors.subtle, fontSize: 7.8, marginTop: -2 },
  capacityCopy: { flex: 1 },
  capacityLabel: { color: colors.text, fontSize: 11.5, fontWeight: '800' },
  capacityNote: { color: colors.subtle, fontSize: 8.6, lineHeight: 13, marginTop: 3 },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.accent },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    backgroundColor: colors.accent,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 13,
  },
  tipMark: {
    width: 18,
    height: 18,
    borderRadius: 18,
    backgroundColor: colors.panelRaised,
    color: colors.muted,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 9,
    fontWeight: '800',
  },
  tipText: { flex: 1, color: colors.subtle, fontSize: 8.8, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 24 },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 15,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonCompact: { flex: 1, marginTop: 0 },
  primaryButtonText: {
    flex: 1,
    color: '#24120D',
    fontSize: 11,
    fontWeight: '900',
  },
  primaryArrow: { color: '#24120D', fontSize: 17, fontWeight: '700' },
  secondaryButton: {
    minHeight: 52,
    minWidth: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  fieldLabel: {
    color: colors.muted,
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 7,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 13,
    color: colors.text,
    fontSize: 14,
  },
  subjectRow: { gap: 7, paddingTop: 9, paddingRight: 16 },
  subjectChip: {
    minHeight: layout.minTouch,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectChipActive: {
    borderColor: 'rgba(255,128,91,0.45)',
    backgroundColor: colors.accentSoft,
  },
  subjectChipText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  activeText: { color: colors.accent },
  firstTopicPreview: {
    marginTop: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.20)',
    backgroundColor: colors.panel,
    padding: 14,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewEyebrow: {
    color: colors.accent,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  previewPriority: { color: colors.subtle, fontSize: 6.8, fontWeight: '800' },
  previewTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 11 },
  previewSubject: { color: colors.muted, fontSize: 9, marginTop: 4 },
  previewAction: {
    marginTop: 13,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewActionText: { flex: 1, color: colors.subtle, fontSize: 8.4, lineHeight: 13 },
  previewArrow: { color: colors.accent, fontSize: 13 },
  error: { color: colors.danger, fontSize: 9.5, lineHeight: 15, marginTop: 12 },
  textButton: {
    minHeight: layout.minTouch,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonText: { color: colors.muted, fontSize: 9.8, fontWeight: '700' },
  backLink: {
    minHeight: layout.minTouch,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLinkText: { color: colors.subtle, fontSize: 9 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.45 },
});
