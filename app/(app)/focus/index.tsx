import { FocusSupport, DistractionShield } from '@/src/features/adaptive/FocusSupport';
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
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  formatTimer,
  timerIsComplete,
  timerRemainingMs,
} from '@/src/features/focus/focus-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { buildPostFocusRetrievalSuggestion } from '@/src/features/focus/post-focus-retrieval';
import { useReview } from '@/src/features/review/ReviewProvider';
import { findTopic } from '@/src/features/topics/topic-operations';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

function intParam(value: string | string[] | undefined, fallback: number) {
  const raw = param(value);
  if (!raw.trim()) return fallback;
  const parsed = Number(raw);
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
    saveError,
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
  const task = workspace && taskId ? workspace.tasks.find((item) => item.id === taskId) ?? null : null;
  const topic = workspace ? findTopic(workspace, task?.topicId || topicId) : null;
  const suggestedMinutes = Math.max(
    5,
    Math.min(240, intParam(params.minutes, workspace?.settings.focusMinutes ?? 45)),
  );
  const breakMinutes = Math.max(
    1,
    Math.min(30, intParam(params.breakMinutes, workspace?.settings.breakMinutes ?? 10)),
  );

  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const plannedMinutes = selectedMinutes ?? suggestedMinutes;
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusError, setFocusError] = useState('');
  const [tinyStep, setTinyStep] = useState('');
  const [distraction, setDistraction] = useState('');
  const [showParking, setShowParking] = useState(false);
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
  const retrievalSuggestion = useMemo(
    () =>
      workspace && session?.phase === 'break'
        ? buildPostFocusRetrievalSuggestion(
            workspace,
            session.topicId,
            session.focusActualMinutes,
            now,
          )
        : null,
    [now, session?.focusActualMinutes, session?.phase, session?.topicId, workspace],
  );

  async function begin(launchMode: 'full' | 'five-minute', firstStep = tinyStep) {
    if (!topic && !task) return;
    setFocusError('');
    try {
      const next = await start({
        ...(topic ? { topicId: topic.id } : {}),
        ...(task ? { taskId: task.id } : {}),
        plannedMinutes,
        breakMinutes,
        launchMode,
        tinyStep: firstStep,
      });
      if (next) {
        setNow(Date.now());
        setFinishing(false);
      }
    } catch {
      setFocusError('Could not save the Focus session. Check device storage and try starting again.');
    }
  }

  async function addDistraction() {
    const value = distraction.trim();
    if (!value) return;
    setFocusError('');
    try {
      await park(value);
      setDistraction('');
    } catch {
      setFocusError('The thought could not be saved. Your text is still here; try again.');
    }
  }

  function requestFinishEarly() {
    setFinishing(true);
    void pause();
  }

  function requestDiscard() {
    Alert.alert(
      'Discard this focus session?',
      'The timer and parked distractions will be removed. No study time will be added to history.',
      [
        { text: 'Keep session', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              setFocusError('');
              await discard();
              router.replace('/(app)/today');
            } catch {
              setFocusError('Could not clear this session. Stay here and retry.');
            }
          },
        },
      ],
    );
  }

  async function finishFocus() {
    if (savingFocus) return;
    setSavingFocus(true); setFocusError('');
    try {
      await completeFocus(effort, Date.now());
      setFinishing(false); setNow(Date.now());
    } catch { setFocusError('Your session could not be saved. Tap Complete focus to retry.'); }
    finally { setSavingFocus(false); }
  }

  async function finishBreak() {
    try {
      setFocusError('');
      await completeBreak(Date.now());
      router.replace('/(app)/today');
    } catch {
      setFocusError('Break progress could not be saved. Stay here and retry.');
    }
  }

  async function finishBreakAndRetrieve() {
    const suggestion = retrievalSuggestion;
    if (!suggestion) {
      await finishBreak();
      return;
    }

    try {
      setFocusError('');
      await completeBreak(Date.now());
      router.replace({
        pathname: '/(app)/review',
        params: {
          topicId: suggestion.topicId,
          autoStart: '1',
          limit: String(suggestion.count),
          source: 'focus',
        },
      });
    } catch {
      setFocusError('Break progress could not be saved. Stay here and retry.');
    }
  }

  async function leaveBreak() {
    try {
      setFocusError('');
      await skipBreak(Date.now());
      router.replace('/(app)/today');
    } catch {
      setFocusError('Break progress could not be saved. Stay here and retry.');
    }
  }

  if (!ready || !workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Restoring focus session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session && activeReview) {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.setupPage}>
          <TopBar label="Focus" backLabel="Review" onBack={() => router.replace('/(app)/review')} />
          <View style={styles.missing}>
            <Text style={styles.missingTitle}>A review queue is already active.</Text>
            <Text style={styles.missingText}>
              Resume or end that recall queue before starting a separate focus timer.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(app)/review')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Resume review</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    if ((!topic && !task) || (task && task.status !== 'open')) {
      return (
        <SafeAreaView style={styles.safe}>
          <AmbientBackdrop />
          <View style={styles.setupPage}>
            <TopBar label="Focus" onBack={() => router.replace('/(app)/today')} />
            <View style={styles.missing}>
              <Text style={styles.missingTitle}>Choose an open task or topic.</Text>
              <Text style={styles.missingText}>
                Start Focus from any task card or from a topic in Library.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(app)/today')}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Back to Today</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.setupPage}>
          <TopBar label="Focus" backLabel="Back" onBack={() => router.back()} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.setupContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>{(task?.subject || topic?.subject || 'STUDY TASK').toUpperCase()}</Text>
            <Text style={styles.setupTitle}>{task?.title || topic?.name}</Text>
            {task ? (
              <Text style={styles.taskContext}>{topic ? `Linked topic · ${topic.name}` : 'Time is saved to this task and today’s used time'}</Text>
            ) : null}
            <Text style={styles.setupSubtitle}>
              Choose the first action, then let the timer disappear into the background.
            </Text>

            <FocusSupport key={task?.id ?? topic?.id} task={task} topicPostponements={topic?.postponements} onStep={setTinyStep} onLaunch={step => begin('five-minute', step)} />
            <View style={styles.planStrip}>
              <Metric label="FULL BLOCK" value={`${plannedMinutes} min`} />
              <Metric label="BREAK" value={`${breakMinutes} min`} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {[10, 25, 45].map(minutes => <Pressable key={minutes} accessibilityRole="button"
                accessibilityLabel={`Focus for ${minutes} minutes`} accessibilityState={{ selected: plannedMinutes === minutes }}
                onPress={() => setSelectedMinutes(minutes)} style={[styles.secondary, { minWidth: 64 }, plannedMinutes === minutes && styles.effortActive]}>
                <Text style={styles.secondaryText}>{minutes} min</Text>
              </Pressable>)}
            </View>
            <Text style={styles.fieldLabel}>First tiny step · optional</Text>
            <TextInput
              accessibilityLabel="First tiny step"
              value={tinyStep}
              onChangeText={setTinyStep}
              placeholder="e.g. Solve question 1 without notes"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={styles.tinyInput}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => begin('full')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.primaryText}>Start {plannedMinutes}-minute focus</Text>
                <Text style={styles.primarySubtext}>One task. A little more progress.</Text>
              </View>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => begin('five-minute')}
              style={({ pressed }) => [styles.launchButton, pressed && styles.pressed]}>
              <View style={styles.launchMark}>
                <Text style={styles.launchMarkText}>5</Text>
              </View>
              <View style={styles.launchCopy}>
                <Text style={styles.launchTitle}>Five-minute launch</Text>
                <Text style={styles.launchText}>
                  Only promise five minutes. If momentum arrives, continue into the full block.
                </Text>
              </View>
            </Pressable>

            <DistractionShield />
            {focusError || saveError ? (
              <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError || saveError}</Text>
            ) : null}
            <Text style={styles.recoveryNote}>
              The timer survives leaving or closing MYELIN.
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (session.phase === 'break') {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.sessionPage}>
          <TopBar
            label="Break"
            onBack={() => router.replace('/(app)/today')}
            helper={timerDone ? 'Timer complete' : session.runningSince ? 'Timer stays active' : 'Timer paused'}
          />

          <ScrollView
            contentContainerStyle={styles.timerArea}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>RECOVERY</Text>
            <Text style={styles.sessionTitle}>Leave the work alone.</Text>

            <TimerDial
              value={formatTimer(remaining)}
              label={timerDone ? 'BREAK COMPLETE' : session.runningSince ? 'BREAK' : 'PAUSED'}
              complete={timerDone}
              progress={phaseProgress}
            />
            <View style={styles.phaseProgress}>
              <AnimatedProgress
                value={phaseProgress}
                accessibilityLabel={`Break progress: ${Math.round(phaseProgress * 100)}%`}
              />
            </View>

            {focusError || saveError ? (
              <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError || saveError}</Text>
            ) : null}
            <Text style={styles.breakPrompt}>
              {session.focusActualMinutes >= 25 ? 'Step away from the screen. Walk a little, stretch gently, or get water.' : 'Let your eyes rest on something far away. Take a few unhurried breaths.'}
              {session.distractions.length ? ` You parked ${session.distractions.length} thought${session.distractions.length === 1 ? '' : 's'}. Check them before leaving this break.` : ' You do not need to earn the break.'}
            </Text>
            {session.distractions.length ? <ScrollView nestedScrollEnabled style={{ maxHeight: 120, flexShrink: 0, alignSelf: 'stretch' }}>{session.distractions.map(item => <Text key={item.id} style={styles.breakPrompt}>• {item.text}</Text>)}</ScrollView> : null}

            {retrievalSuggestion ? (
              <View style={styles.retrieveCue}>
                <Text style={styles.retrieveCueKicker}>AFTER THE BREAK · RETRIEVE</Text>
                <Text style={styles.retrieveCueTitle}>
                  {retrievalSuggestion.count} quick recall{' '}
                  {retrievalSuggestion.count === 1 ? 'prompt' : 'prompts'} ·{' '}
                  {retrievalSuggestion.topicName}
                </Text>
                <Text style={styles.retrieveCueText}>
                  These are already ready in Memory Engine. MYELIN will not pull
                  future cards forward just to fill this step.
                </Text>
              </View>
            ) : null}

            <Reveal key={timerDone ? 'break-done' : 'break-running'} distance={6} style={styles.breakActions}>
              {timerDone ? (
                retrievalSuggestion ? (
                  <View style={styles.retrieveActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Finish break and retrieve ${retrievalSuggestion.count} recall prompts`}
                      onPress={() => void finishBreakAndRetrieve()}
                      style={({ pressed }) => [styles.primary, styles.wideButton, pressed && styles.pressed]}>
                      <View style={styles.retrieveActionCopy}>
                        <Text style={styles.primaryText}>
                          Retrieve {retrievalSuggestion.count}{' '}
                          {retrievalSuggestion.count === 1 ? 'prompt' : 'prompts'}
                        </Text>
                        <Text style={styles.primarySubtext}>
                          Short recall, then back to Today
                        </Text>
                      </View>
                      <Text style={styles.buttonArrow}>→</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={finishBreak}
                      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                      <Text style={styles.textButtonText}>Finish break without recall</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={finishBreak}
                    style={({ pressed }) => [styles.primary, styles.wideButton, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>Finish break</Text>
                    <Text style={styles.buttonArrow}>→</Text>
                  </Pressable>
                )
              ) : (
                <View style={styles.timerActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={session.runningSince ? pause : resume}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>{session.runningSince ? 'Pause' : 'Resume'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={leaveBreak}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>End break</Text>
                  </Pressable>
                </View>
              )}
            </Reveal>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  const canExtend =
    !finishing &&
    session.launchMode === 'five-minute' &&
    session.fullTargetMinutes > session.plannedFocusMinutes &&
    timerDone;

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.sessionPage}>
        <TopBar
          label="Focus"
          onBack={() => router.replace('/(app)/today')}
          helper={timerDone ? 'Timer complete' : session.runningSince ? 'Timer stays active' : 'Timer paused'}
        />

        <ScrollView
          contentContainerStyle={styles.sessionContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.sessionHeading}>
            <Text style={styles.eyebrow}>{session.subject.toUpperCase()}</Text>
            <Text style={styles.sessionTitle}>{session.topicName}</Text>
            {session.tinyStep ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepLabel}>FIRST TINY STEP</Text>
                <Text style={styles.stepText}>{session.tinyStep}</Text>
              </View>
            ) : null}
          </View>

          {saveError ? <Text accessibilityRole="alert" style={styles.storageWarning}>{saveError}</Text> : null}
          <TimerDial
            value={formatTimer(remaining)}
            label={
              timerDone
                ? session.launchMode === 'five-minute'
                  ? 'FIVE MINUTES DONE'
                  : 'BLOCK COMPLETE'
                : session.runningSince
                  ? 'FOCUSING'
                  : 'PAUSED'
            }
            complete={timerDone}
            progress={phaseProgress}
          />
          <View style={styles.phaseProgress}>
            <AnimatedProgress
              value={phaseProgress}
              accessibilityLabel={`Focus progress: ${Math.round(phaseProgress * 100)}%`}
            />
          </View>

          <Reveal
            key={
              canExtend
                ? 'extend'
                : finishing || timerDone
                  ? 'finish'
                  : 'running'
            }
            distance={6}>
          {canExtend ? (
            <View style={styles.finishPanel}>
              <Text style={styles.finishTitle}>You started. Keep the momentum?</Text>
              <Text style={styles.finishText}>
                Continue this same session toward the original {session.fullTargetMinutes}-minute
                block, or finish the five-minute launch here.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={extendLaunch}
                style={({ pressed }) => [styles.primary, styles.wideButton, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>
                  Continue to {session.fullTargetMinutes} minutes
                </Text>
                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFinishing(true)}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={styles.textButtonText}>Finish after five minutes</Text>
              </Pressable>
            </View>
          ) : finishing || timerDone ? (
            <View style={styles.finishPanel}>
              <Text style={styles.finishTitle}>
                {timerDone ? 'Block complete.' : 'Finish this block early?'}
              </Text>
              <Text style={styles.finishText}>
                How demanding did this block feel? This is about workload calibration, not judging
                whether you studied “well.”
              </Text>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Complete focus"
                accessibilityState={{ disabled: savingFocus, busy: savingFocus }}
                disabled={savingFocus}
                onPress={finishFocus}
                style={({ pressed }) => [styles.primary, styles.wideButton, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>{savingFocus ? 'Saving…' : 'Complete focus'}</Text>
                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>
              {focusError ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 10 }}>{focusError}</Text> : null}
              {!timerDone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFinishing(false);
                    void resume();
                  }}
                  style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                  <Text style={styles.textButtonText}>Keep going</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.timerActions}>
              <Pressable
                accessibilityRole="button"
                onPress={session.runningSince ? pause : resume}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>{session.runningSince ? 'Pause' : 'Resume'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={requestFinishEarly}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Finish early</Text>
              </Pressable>
            </View>
          )}
          </Reveal>

          <View style={styles.parkingShell}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showParking }}
              accessibilityLabel="Distraction parking"
              onPress={() => setShowParking((current) => !current)}
              style={({ pressed }) => [styles.parkingToggle, pressed && styles.pressed]}>
              <View style={styles.parkingCopy}>
                <Text style={styles.parkingTitle}>Park a distraction</Text>
                <Text style={styles.parkingSubtitle}>
                  {session.distractions.length
                    ? `${session.distractions.length} saved for later`
                    : 'Capture it without leaving Focus'}
                </Text>
              </View>
              <Text style={styles.parkingToggleMark}>{showParking ? '−' : '+'}</Text>
            </Pressable>

            <AnimatedDisclosure visible={showParking} style={styles.parking}>
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
                    disabled={!distraction.trim()}
                    onPress={addDistraction}
                    style={({ pressed }) => [
                      styles.parkAdd,
                      !distraction.trim() && styles.disabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.parkAddText}>+</Text>
                  </Pressable>
                </View>

                {session.distractions.map((item, index) => (
                  <MotionItem key={item.id} delay={Math.min(index * 25, 75)} style={styles.parkedItem}>
                    <View style={styles.parkDot} />
                    <Text style={styles.parkedText}>{item.text}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove parked distraction"
                      hitSlop={8}
                      onPress={() => removeParked(item.id)}>
                      <Text style={styles.parkRemove}>×</Text>
                    </Pressable>
                  </MotionItem>
                ))}
            </AnimatedDisclosure>
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

function TopBar({
  label,
  onBack,
  helper,
  backLabel = 'Today',
}: {
  label: string;
  onBack: () => void;
  helper?: string;
  backLabel?: string;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarMain}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel === 'Back' ? 'Go back' : 'Back to ' + backLabel}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.back}>← {backLabel}</Text>
        </Pressable>
        <Text style={styles.modeTitle} numberOfLines={1}>{label}</Text>
        <View style={styles.topBarSpacer} accessible={false} />
      </View>
      {helper ? <Text style={styles.topHelper}>{helper}</Text> : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function TimerDial({
  value,
  label,
  complete,
  progress,
}: {
  value: string;
  label: string;
  complete?: boolean;
  progress: number;
}) {
  return (
    <Reveal distance={8} style={{ alignSelf: 'center' }}>
      <View style={[styles.dial, complete && styles.dialComplete]}>
        <View style={styles.dialOuterRing} />
        <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 40 }, (_, index) => {
            const angle = index * Math.PI * 2 / 40;
            const lit = index / 40 < progress;
            return <View key={index} style={{ position: 'absolute', width: 3, height: 9,
              left: 112 + Math.sin(angle) * 103, top: 108 - Math.cos(angle) * 103,
              borderRadius: 2, transform: [{ rotate: `${index * 9}deg` }],
              backgroundColor: lit ? (complete ? colors.success : colors.accent) : colors.lineStrong }} />;
          })}
        </View>
        <View style={styles.dialInner}>
          <Text style={[styles.timerValue, complete && styles.timerValueComplete]}>{value}</Text>
          <Text style={styles.timerLabel}>{label}</Text>
        </View>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  setupPage: { flex: 1 },
  sessionPage: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  storageWarning: { color: colors.danger, fontSize: 12.5, lineHeight: 19, paddingVertical: 9, paddingHorizontal: 12, marginTop: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, alignSelf: 'stretch' },
  topBar: {
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topBarMain: {
    minHeight: layout.minTouch + 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 96,
    minHeight: layout.minTouch,
    justifyContent: 'center',
  },
  back: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  modeTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topBarSpacer: { width: 96 },
  topHelper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingBottom: 9,
  },
  setupContent: { padding: spacing.lg, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.2 },
  setupTitle: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1.2, marginTop: 8 },
  setupSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 540 },
  taskContext: { color: colors.accent, fontSize: 10, fontWeight: '700', marginTop: 7 },
  planStrip: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  metric: { flex: 1, minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 12, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.4 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  fieldLabel: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: spacing.xl, marginBottom: 8 },
  tinyInput: { minHeight: 92, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, padding: 13, color: colors.text, fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 56, marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wideButton: { width: '100%' },
  primaryText: { flexShrink: 1, color: '#25140e', fontSize: 13, fontWeight: '800' },
  primarySubtext: { color: 'rgba(37,20,14,0.72)', fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  buttonArrow: { color: '#25140e', fontSize: 20 },
  launchButton: { minHeight: 82, marginTop: 10, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,128,91,0.22)', backgroundColor: colors.accentSoft, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  launchMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  launchMarkText: { color: '#25140e', fontSize: 17, fontWeight: '800' },
  launchCopy: { flex: 1 },
  launchTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  launchText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  recoveryNote: { color: colors.subtle, fontSize: 12, lineHeight: 17, marginTop: spacing.lg },
  missing: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  missingTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  missingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  sessionContent: { padding: spacing.lg, paddingBottom: 56 },
  sessionHeading: { alignItems: 'center' },
  sessionTitle: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: '700', textAlign: 'center', marginTop: 7 },
  stepCard: {
    marginTop: spacing.md,
    width: '100%',
    maxWidth: 500,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stepLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.5 },
  stepText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 5, textAlign: 'center' },
  timerArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingBottom: 40 },
  breakActions: { width: '100%', maxWidth: 430 },
  dial: {
    position: 'relative',
    overflow: 'visible',
    width: 228,
    height: 228,
    borderRadius: 228,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: 'rgba(255,128,91,0.022)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialComplete: { borderColor: 'rgba(180,216,174,0.34)', backgroundColor: 'rgba(180,216,174,0.04)' },
  dialOuterRing: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    opacity: 0.55,
  },
  phaseProgress: {
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
    marginTop: 18,
  },
  dialInner: { width: 188, height: 188, borderRadius: 188, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  timerValue: { color: colors.text, fontSize: 48, lineHeight: 56, fontWeight: '600', letterSpacing: -2 },
  timerValueComplete: { color: colors.success },
  timerLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  timerActions: { flexDirection: 'row', gap: 9, marginTop: spacing.lg, width: '100%', maxWidth: 430 },
  secondary: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  finishPanel: { width: '100%', maxWidth: 500, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  finishTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  finishText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  effortRow: { flexDirection: 'row', gap: 7, marginTop: spacing.md },
  effort: { flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  effortActive: { borderColor: 'rgba(255,128,91,0.5)', backgroundColor: colors.accentSoft },
  effortText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  effortTextActive: { color: colors.accent },
  textButton: { minHeight: layout.minTouch, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  parkingShell: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line },
  parkingToggle: { minHeight: layout.minTouch, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  parkingCopy: { flex: 1, minWidth: 0 },
  parkingToggleMark: { color: colors.accent, fontSize: 22, lineHeight: 24, fontWeight: '400' },
  parking: { paddingBottom: spacing.sm },
  parkingTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  parkingSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  parkInputRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  parkInput: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg, paddingHorizontal: 12, color: colors.text, fontSize: 11.5 },
  parkAdd: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  parkAddText: { color: '#25140e', fontSize: 21, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  parkedItem: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 9, paddingTop: 9 },
  parkDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.accent },
  parkedText: { flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  parkRemove: { color: colors.subtle, fontSize: 19 },
  discard: { alignSelf: 'center', marginTop: spacing.xl, padding: 9 },
  discardText: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  breakPrompt: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 380, marginTop: spacing.lg },
  retrieveCue: {
    width: '100%',
    maxWidth: 430,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.22)',
    backgroundColor: colors.accentSoft,
    padding: 12,
  },
  retrieveCueKicker: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.65,
  },
  retrieveCueTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  retrieveCueText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  retrieveActions: {
    width: '100%',
    maxWidth: 430,
    marginTop: spacing.lg,
  },
  retrieveActionCopy: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.994 }] },
});
