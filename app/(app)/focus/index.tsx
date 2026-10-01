import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppButton } from '@/src/components/app/AppButton';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  formatTimer,
  timerIsComplete,
  timerRemainingMs,
} from '@/src/features/focus/focus-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { findTopic } from '@/src/features/topics/topic-operations';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

function intParam(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(param(value));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export default function FocusScreen() {
  const params = useLocalSearchParams<{
    topicId?: string | string[];
    taskId?: string | string[];
    minutes?: string | string[];
    breakMinutes?: string | string[];
  }>();

  const { workspace } = useWorkspace();
  const {
    ready,
    session,
    start,
    pause,
    resume,
    extendLaunch,
    park,
    removeParked,
    completeFocus,
    completeBreak,
    skipBreak,
    discard,
  } = useFocus();
  const { session: activeReview } = useReview();

  const topicId = param(params.topicId);
  const taskId = param(params.taskId);
  const topic = workspace ? findTopic(workspace, topicId) : null;
  const task = workspace && taskId
    ? workspace.tasks.find((item) => item.id === taskId) ?? null
    : null;

  const plannedMinutes = Math.max(
    5,
    Math.min(240, intParam(params.minutes, workspace?.settings.focusMinutes ?? 45)),
  );
  const breakMinutes = Math.max(
    1,
    Math.min(30, intParam(params.breakMinutes, workspace?.settings.breakMinutes ?? 10)),
  );

  const [tinyStep, setTinyStep] = useState('');
  const [showStep, setShowStep] = useState(false);
  const [showParking, setShowParking] = useState(false);
  const [distraction, setDistraction] = useState('');
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [effort, setEffort] = useState<1 | 2 | 3 | 4 | 5>(3);

  useEffect(() => {
    if (!session?.runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.runningSince, session?.phase]);

  useEffect(() => {
    setNow(Date.now());
    setShowParking(false);
  }, [session?.id, session?.phase, session?.plannedFocusMinutes]);

  const remaining = useMemo(
    () => (session ? timerRemainingMs(session, now) : 0),
    [session, now],
  );
  const timerDone = session ? timerIsComplete(session, now) : false;
  const phaseDurationMs = session
    ? (session.phase === 'break' ? session.breakMinutes : session.plannedFocusMinutes) * 60_000
    : 1;
  const phaseProgress = session
    ? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, phaseDurationMs)))
    : 0;

  async function begin(launchMode: 'full' | 'five-minute') {
    if (!topic) return;

    const next = await start({
      topicId: topic.id,
      ...(task ? { taskId: task.id } : {}),
      plannedMinutes,
      breakMinutes,
      launchMode,
      tinyStep: tinyStep.trim(),
    });

    if (next) {
      setNow(Date.now());
      setFinishing(false);
    }
  }

  async function addDistraction() {
    const value = distraction.trim();
    if (!value) return;
    setDistraction('');
    await park(value);
  }

  function requestFinishEarly() {
    setFinishing(true);
    void pause();
  }

  function requestDiscard() {
    Alert.alert(
      'Discard this focus session?',
      'No study time will be added to history. The timer and parked thoughts will be removed.',
      [
        { text: 'Keep session', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await discard();
            router.replace('/(app)/today');
          },
        },
      ],
    );
  }

  async function finishFocus() {
    await completeFocus(effort, Date.now());
    setFinishing(false);
    setNow(Date.now());
  }

  async function finishBreak() {
    await completeBreak(Date.now());
    router.replace('/(app)/today');
  }

  async function leaveBreak() {
    await skipBreak(Date.now());
    router.replace('/(app)/today');
  }

  if (!ready || !workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Restoring focus…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session && activeReview) {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <ModePage>
          <TopBar label="Focus" onBack={() => router.replace('/(app)/review')} />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Review is already active.</Text>
            <Text style={styles.emptyText}>Resume it first. Your exact place is saved.</Text>
            <AppButton label="Resume review" onPress={() => router.replace('/(app)/review')} />
          </View>
        </ModePage>
      </SafeAreaView>
    );
  }

  if (!session) {
    if (!topic) {
      return (
        <SafeAreaView style={styles.safe}>
          <AmbientBackdrop />
          <ModePage>
            <TopBar label="Focus" onBack={() => router.replace('/(app)/today')} />
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Choose something to focus on.</Text>
              <Text style={styles.emptyText}>Start from Today or from a topic.</Text>
              <AppButton label="Back to Today" onPress={() => router.replace('/(app)/today')} />
            </View>
          </ModePage>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <ModePage>
          <TopBar label="Focus" onBack={() => router.back()} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.setupContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.subject}>{topic.subject}</Text>
            <Text style={styles.setupTitle}>{task?.title || topic.name}</Text>
            {task ? <Text style={styles.context}>Topic · {topic.name}</Text> : null}

            <View style={styles.timeLine}>
              <Text style={styles.timeStrong}>{plannedMinutes} min</Text>
              <Text style={styles.timeDot}>·</Text>
              <Text style={styles.timeQuiet}>{breakMinutes} min break after</Text>
            </View>

            <AppButton
              label={`Start ${plannedMinutes}-minute focus`}
              onPress={() => begin('full')}
              style={styles.startButton}
            />

            <View style={styles.optionalGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showStep }}
                onPress={() => setShowStep((value) => !value)}
                style={({ pressed }) => [styles.optionalRow, pressed && styles.pressed]}>
                <View style={styles.optionalCopy}>
                  <Text style={styles.optionalTitle}>
                    {showStep ? 'Hide first step' : 'Add a first step'}
                  </Text>
                  <Text style={styles.optionalDetail}>
                    Optional. Useful when getting started feels unclear.
                  </Text>
                </View>
                <Text style={styles.optionalMark}>{showStep ? '−' : '+'}</Text>
              </Pressable>

              {showStep ? (
                <TextInput
                  accessibilityLabel="First tiny step"
                  value={tinyStep}
                  onChangeText={setTinyStep}
                  placeholder="Solve question 1 without notes"
                  placeholderTextColor={colors.subtle}
                  selectionColor={colors.accent}
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                  style={styles.stepInput}
                />
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => begin('five-minute')}
                style={({ pressed }) => [styles.fiveMinute, pressed && styles.pressed]}>
                <View style={styles.fiveBadge}><Text style={styles.fiveBadgeText}>5</Text></View>
                <View style={styles.fiveCopy}>
                  <Text style={styles.fiveTitle}>Start with five minutes</Text>
                  <Text style={styles.fiveDetail}>Begin smaller, then continue the same timer if you want.</Text>
                </View>
              </Pressable>
            </View>
          </ScrollView>
        </ModePage>
      </SafeAreaView>
    );
  }

  if (session.phase === 'break') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.modeSolid}>
          <TopBar label="Break" onBack={() => router.replace('/(app)/today')} />
          <View style={styles.timerScreen}>
            <Text style={styles.modeKicker}>{timerDone ? 'BREAK COMPLETE' : 'BREAK'}</Text>
            <Timer value={formatTimer(remaining)} />
            <View style={styles.progressWrap}>
              <AnimatedProgress
                value={phaseProgress}
                accessibilityLabel={`Break progress: ${Math.round(phaseProgress * 100)}%`}
              />
            </View>
            <Text style={styles.breakText}>Move, drink water, or look away from the screen.</Text>

            {timerDone ? (
              <AppButton label="Finish break" onPress={finishBreak} style={styles.modeButton} />
            ) : (
              <View style={styles.actionRow}>
                <AppButton
                  label={session.runningSince ? 'Pause' : 'Resume'}
                  variant="secondary"
                  onPress={session.runningSince ? pause : resume}
                  style={styles.flexButton}
                />
                <AppButton
                  label="End break"
                  variant="quiet"
                  onPress={leaveBreak}
                  style={styles.flexButton}
                />
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const canExtend =
    session.launchMode === 'five-minute' &&
    session.fullTargetMinutes > session.plannedFocusMinutes &&
    timerDone;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.modeSolid}>
        <TopBar
          label="Focus"
          onBack={() => router.replace('/(app)/today')}
          rightLabel={finishing || timerDone ? undefined : 'End'}
          onRight={finishing || timerDone ? undefined : requestFinishEarly}
        />

        <ScrollView
          contentContainerStyle={styles.sessionContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.sessionHeading}>
            <Text style={styles.subject}>{session.subject}</Text>
            <Text style={styles.sessionTitle}>{session.topicName}</Text>
            {session.tinyStep ? <Text style={styles.stepText}>{session.tinyStep}</Text> : null}
          </View>

          <Timer value={formatTimer(remaining)} />
          <Text style={styles.timerState}>
            {timerDone
              ? session.launchMode === 'five-minute'
                ? 'Five minutes complete'
                : 'Block complete'
              : session.runningSince
                ? 'Focus'
                : 'Paused'}
          </Text>
          <View style={styles.progressWrap}>
            <AnimatedProgress
              value={phaseProgress}
              accessibilityLabel={`Focus progress: ${Math.round(phaseProgress * 100)}%`}
            />
          </View>

          {canExtend ? (
            <View style={styles.completion}>
              <Text style={styles.completionTitle}>Keep going?</Text>
              <Text style={styles.completionText}>
                Continue toward the original {session.fullTargetMinutes}-minute block, or finish here.
              </Text>
              <AppButton
                label={`Continue to ${session.fullTargetMinutes} minutes`}
                onPress={extendLaunch}
              />
              <AppButton
                label="Finish after five minutes"
                variant="quiet"
                onPress={() => setFinishing(true)}
              />
            </View>
          ) : finishing || timerDone ? (
            <View style={styles.completion}>
              <Text style={styles.completionTitle}>
                {timerDone ? 'Block complete.' : 'Finish here?'}
              </Text>
              <Text style={styles.completionText}>How demanding did this block feel?</Text>
              <View style={styles.effortRow}>
                {([1, 2, 3, 4, 5] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: effort === value }}
                    accessibilityLabel={`Effort ${value} out of 5`}
                    onPress={() => setEffort(value)}
                    style={({ pressed }) => [
                      styles.effort,
                      effort === value && styles.effortActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.effortText, effort === value && styles.effortTextActive]}>
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <AppButton label="Complete focus" onPress={finishFocus} />
              {!timerDone ? (
                <AppButton
                  label="Keep going"
                  variant="quiet"
                  onPress={() => {
                    setFinishing(false);
                    void resume();
                  }}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.actionRow}>
              <AppButton
                label={session.runningSince ? 'Pause' : 'Resume'}
                variant="secondary"
                onPress={session.runningSince ? pause : resume}
                style={styles.flexButton}
              />
              <AppButton
                label="Finish early"
                variant="quiet"
                onPress={requestFinishEarly}
                style={styles.flexButton}
              />
            </View>
          )}

          <View style={styles.parkingSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showParking }}
              onPress={() => setShowParking((value) => !value)}
              style={({ pressed }) => [styles.parkingToggle, pressed && styles.pressed]}>
              <View>
                <Text style={styles.parkingTitle}>Park a thought</Text>
                <Text style={styles.parkingDetail}>
                  {session.distractions.length
                    ? `${session.distractions.length} saved for later`
                    : 'Capture a distraction without leaving focus'}
                </Text>
              </View>
              <Text style={styles.optionalMark}>{showParking ? '−' : '+'}</Text>
            </Pressable>

            {showParking ? (
              <View style={styles.parkingBody}>
                <View style={styles.parkInputRow}>
                  <TextInput
                    accessibilityLabel="Park a distraction"
                    value={distraction}
                    onChangeText={setDistraction}
                    onSubmitEditing={addDistraction}
                    placeholder="Thing I want to check later…"
                    placeholderTextColor={colors.subtle}
                    selectionColor={colors.accent}
                    returnKeyType="done"
                    maxLength={240}
                    style={styles.parkInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save parked thought"
                    disabled={!distraction.trim()}
                    onPress={addDistraction}
                    style={({ pressed }) => [
                      styles.parkAdd,
                      !distraction.trim() && styles.disabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.parkAddText}>Add</Text>
                  </Pressable>
                </View>

                {session.distractions.map((item) => (
                  <View key={item.id} style={styles.parkedItem}>
                    <Text style={styles.parkedText}>{item.text}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove parked thought"
                      hitSlop={8}
                      onPress={() => removeParked(item.id)}
                      style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={requestDiscard}
            style={({ pressed }) => [styles.discard, pressed && styles.pressed]}>
            <Text style={styles.discardText}>Discard session</Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function ModePage({ children }: { children: React.ReactNode }) {
  return <View style={styles.modePage}>{children}</View>;
}

function TopBar({
  label,
  onBack,
  rightLabel,
  onRight,
}: {
  label: string;
  onBack: () => void;
  rightLabel?: string;
  onRight?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
        <Text style={styles.topActionText}>←</Text>
      </Pressable>
      <Text style={styles.topLabel}>{label}</Text>
      <View style={styles.topRight}>
        {rightLabel && onRight ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRight}
            style={({ pressed }) => [styles.topRightButton, pressed && styles.pressed]}>
            <Text style={styles.topRightText}>{rightLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Timer({ value }: { value: string }) {
  return (
    <View style={styles.timerWrap} accessibilityRole="timer" accessibilityLabel={`Time remaining ${value}`}>
      <Text style={styles.timer}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, ...type.meta },

  modePage: { flex: 1 },
  modeSolid: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topAction: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionText: { color: colors.textDim, fontSize: 22, lineHeight: 24 },
  topLabel: { flex: 1, color: colors.textDim, ...type.meta, fontWeight: '600', textAlign: 'center' },
  topRight: { width: layout.minTouch, alignItems: 'flex-end' },
  topRightButton: { minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: space.xs },
  topRightText: { color: colors.muted, ...type.meta, fontWeight: '600' },

  setupContent: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xxxl,
  },
  subject: { color: colors.accent, ...type.meta, fontWeight: '600' },
  setupTitle: { color: colors.text, ...type.pageTitle, marginTop: space.xs },
  context: { color: colors.muted, ...type.meta, marginTop: space.xs },
  timeLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.lg },
  timeStrong: { color: colors.text, ...type.bodyStrong },
  timeDot: { color: colors.subtle, ...type.body },
  timeQuiet: { color: colors.muted, ...type.body },
  startButton: { marginTop: space.xl },

  optionalGroup: { marginTop: space.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  optionalRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  optionalCopy: { flex: 1 },
  optionalTitle: { color: colors.text, ...type.bodyStrong },
  optionalDetail: { color: colors.muted, ...type.meta, marginTop: 2 },
  optionalMark: { color: colors.accent, fontSize: 22, lineHeight: 24 },
  stepInput: {
    minHeight: 88,
    marginVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    ...type.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fiveMinute: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  fiveBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fiveBadgeText: { color: colors.accent, ...type.bodyStrong },
  fiveCopy: { flex: 1 },
  fiveTitle: { color: colors.text, ...type.bodyStrong },
  fiveDetail: { color: colors.muted, ...type.meta, marginTop: 2 },

  emptyState: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xxxl,
    gap: space.md,
  },
  emptyTitle: { color: colors.text, ...type.hero },
  emptyText: { color: colors.muted, ...type.body },

  sessionContent: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xxxl,
  },
  sessionHeading: { alignItems: 'center', marginBottom: space.lg },
  sessionTitle: { color: colors.text, ...type.hero, textAlign: 'center', marginTop: space.xs },
  stepText: { color: colors.textDim, ...type.body, textAlign: 'center', marginTop: space.sm, maxWidth: 460 },
  timerScreen: {
    flex: 1,
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  timerWrap: { alignItems: 'center', justifyContent: 'center' },
  timer: {
    color: colors.text,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '300',
    letterSpacing: -2.6,
    fontVariant: ['tabular-nums'],
  },
  timerState: { color: colors.muted, ...type.meta, textAlign: 'center', marginTop: space.xs },
  modeKicker: { color: colors.accent, ...type.label, marginBottom: space.md },
  progressWrap: { width: '100%', maxWidth: 380, alignSelf: 'center', marginTop: space.lg },
  breakText: { color: colors.muted, ...type.body, textAlign: 'center', marginTop: space.lg, maxWidth: 360 },
  modeButton: { width: '100%', marginTop: space.lg },

  actionRow: { flexDirection: 'row', gap: space.xs, marginTop: space.xl },
  flexButton: { flex: 1 },

  completion: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: space.sm,
  },
  completionTitle: { color: colors.text, ...type.section },
  completionText: { color: colors.muted, ...type.body },
  effortRow: { flexDirection: 'row', gap: space.xs, marginVertical: space.xs },
  effort: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortActive: { borderColor: colors.accentLine, backgroundColor: colors.accentFaint },
  effortText: { color: colors.textDim, ...type.bodyStrong },
  effortTextActive: { color: colors.accent },

  parkingSection: {
    marginTop: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  parkingToggle: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  parkingTitle: { color: colors.text, ...type.bodyStrong },
  parkingDetail: { color: colors.muted, ...type.meta, marginTop: 2 },
  parkingBody: { paddingBottom: space.sm },
  parkInputRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  parkInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    ...type.body,
    paddingHorizontal: space.md,
  },
  parkAdd: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parkAddText: { color: colors.text, ...type.bodyStrong },
  parkedItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  parkedText: { flex: 1, color: colors.textDim, ...type.body },
  removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  removeText: { color: colors.subtle, ...type.meta },

  discard: { minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  discardText: { color: colors.subtle, ...type.meta },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
});

