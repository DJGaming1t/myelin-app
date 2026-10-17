import { FocusSupport, DistractionShield } from '@/src/features/adaptive/FocusSupport';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { Reveal } from '@/src/components/motion/Reveal';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import {
  formatTimer,
  timerIsComplete,
  timerRemainingMs,
} from '@/src/features/focus/focus-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import {
  focusDialMarkPosition,
  focusDialSize,
  focusDialTickState,
  focusDurationPresets,
} from '@/src/features/focus/focus-dial-layout';
import { buildPostFocusRetrievalSuggestion } from '@/src/features/focus/post-focus-retrieval';
import { useReview } from '@/src/features/review/ReviewProvider';
import { findTopic } from '@/src/features/topics/topic-operations';
import { useFocusGuide } from '@/src/features/guides/useFocusGuide';
import { ScreenGuide } from '@/src/features/guides/ScreenGuide';
import { FocusGuideState } from '@/src/features/guides/guide-registry';
import { useGuideOffer } from '@/src/features/guides/useGuideOffer';
import { GuideOffer } from '@/src/features/guides/GuideOffer';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, layout, motion, radius, spacing } from '@/src/theme/tokens';

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

  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // Reserve content padding and the outer-ring overshoot on small screens.
  const timerDialSize = focusDialSize(windowWidth, spacing.lg);
  const { workspace, ownerKey } = useWorkspace();
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
  const { session: activeReview, ready: reviewReady } = useReview();
  const { ready: onboardingReady, shouldShow: onboardingPending } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();

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
  const durationPresets = useMemo(
    () => focusDurationPresets(suggestedMinutes),
    [suggestedMinutes],
  );

  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const plannedMinutes = selectedMinutes ?? suggestedMinutes;
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusError, setFocusError] = useState('');
  const [tinyStep, setTinyStep] = useState('');
  const [distraction, setDistraction] = useState('');
  const [showParking, setShowParking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [finishing, setFinishing] = useState(false);
  const [effort, setEffort] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [breakTransition, setBreakTransition] = useState<'finish' | 'retrieve' | 'skip' | null>(null);
  const breakTransitionLock = useRef(false);

  // Android suspends JS intervals while the app is backgrounded. The timer
  // itself stays anchored to persisted timestamps, never to interval ticks.
  // Snap the display to wall-clock time as soon as MYELIN is foregrounded.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      setAppIsActive(active);
      if (active) setNow(Date.now());
    });
    return () => listener.remove();
  }, []);

  // The screen may stay mounted while the user visits another in-app route.
  // Refresh on navigation focus too, without changing the running session.
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
  }, []));

  useEffect(() => {
    if (session?.runningSince == null || !appIsActive) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [appIsActive, session?.runningSince, session?.phase]);

  useEffect(() => {
    setNow(Date.now());
  }, [session?.id, session?.phase, session?.plannedFocusMinutes]);

  // Release a completed break's interaction lock when the persisted session
  // changes phase or a different focus session begins.
  useEffect(() => {
    if (session?.phase === 'break') return;
    breakTransitionLock.current = false;
    setBreakTransition(null);
  }, [session?.id, session?.phase]);

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
  const canExtend = !!session && session.phase === 'focus' && !finishing &&
    session.launchMode === 'five-minute' &&
    session.fullTargetMinutes > session.plannedFocusMinutes && timerDone;
  const guideState: FocusGuideState = session
    ? session.phase === 'break' ? timerDone ? 'break-done' : 'break'
      : canExtend ? 'checkpoint' : finishing || timerDone ? 'finish' : 'active'
    : activeReview ? 'review' : (!topic && !task) || task?.status === 'completed' ? 'empty' : 'setup';
  const guideReady = ready && reviewReady && !!workspace && !savingFocus && !breakTransition;
  const guide = useFocusGuide(guideReady, ownerKey, guideState);
  const guideOffer = useGuideOffer('focus', ownerKey,
    guideReady && guideState === 'setup' && onboardingReady && !onboardingPending && !transitionPending,
    guide.open && guideState === 'setup');
  const guideOverlay = guide.open ? <ScreenGuide key={guideState} title="Focus" steps={guide.steps}
    anchors={guide.anchors} revealAnchor={guide.revealAnchor} onClose={guide.close} /> : null;

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

  async function runBreakTransition(action: 'finish' | 'retrieve' | 'skip') {
    // Use an immediate ref guard: state-only disabling does not stop two
    // rapid presses before React has rendered the disabled button.
    if (breakTransitionLock.current || session?.phase !== 'break') return;
    breakTransitionLock.current = true;
    setBreakTransition(action);
    setFocusError('');

    try {
      // Snapshot the optional retrieval destination before clearing the break.
      const suggestion = action === 'retrieve' ? retrievalSuggestion : null;
      if (action === 'skip') {
        await skipBreak(Date.now());
      } else {
        await completeBreak(Date.now());
      }

      if (suggestion) {
        router.replace({
          pathname: '/(app)/review',
          params: {
            topicId: suggestion.topicId,
            autoStart: '1',
            limit: String(suggestion.count),
            source: 'focus',
          },
        });
      } else {
        router.replace('/(app)/today');
      }
      // Keep the action disabled through navigation, not just the save.
    } catch {
      breakTransitionLock.current = false;
      setBreakTransition(null);
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
          <TopBar onHelp={guide.start} label="Focus" backLabel="Review" onBack={() => router.replace('/(app)/review')} />
          <View style={styles.missing}>
            <Text style={styles.missingTitle}>A review queue is already active.</Text>
            <Text style={styles.missingText}>
              Resume or end that recall queue before starting a separate focus timer.
            </Text>
            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary"><SpringPressable
              accessibilityRole="button"
              onPress={() => router.replace('/(app)/review')}
              style={styles.primary}>
              <Text style={styles.primaryText}>Resume review</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </SpringPressable></View>
          </View>
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  if (!session) {
    if ((!topic && !task) || (task && task.status !== 'open')) {
      return (
        <SafeAreaView style={styles.safe}>
          <AmbientBackdrop />
          <View style={styles.setupPage}>
            <TopBar onHelp={guide.start} label="Focus" onBack={() => router.replace('/(app)/today')} />
            <View style={styles.missing}>
              <Text style={styles.missingTitle}>Choose an open task or topic.</Text>
              <Text style={styles.missingText}>
                Start Focus from any task card or from a topic in Library.
              </Text>
              <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary"><SpringPressable
                accessibilityRole="button"
                onPress={() => router.replace('/(app)/today')}
                style={styles.primary}>
                <Text style={styles.primaryText}>Back to Today</Text>
              </SpringPressable></View>
            </View>
          </View>
          {guideOverlay}
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.setupPage}>
          <TopBar onHelp={guide.start} label="Focus" backLabel="Back" onBack={() => router.back()} />

          <ScrollView
            ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
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
              <Metric
                label="ENERGY"
                value={workspace.settings.energy === 'low' ? 'Low pace' : 'Standard'}
              />
            </View>

            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary" style={styles.durationRow}>
              {durationPresets.map((minutes) => {
                const selected = plannedMinutes === minutes;
                return (
                  <SpringPressable
                    key={minutes}
                    accessibilityRole="button"
                    accessibilityLabel={`Focus for ${minutes} minutes`}
                    accessibilityState={{ selected }}
                    scaleTo={0.98}
                    lift={0}
                    onPress={() => setSelectedMinutes(minutes)}
                    style={[styles.durationChip, selected && styles.durationChipActive]}>
                    <Text style={[styles.durationChipText, selected && styles.durationChipTextActive]}>
                      {minutes} min
                    </Text>
                  </SpringPressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>First tiny step · optional</Text>
            <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary"><TextInput
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
            /></View>

            <SpringPressable
              accessibilityRole="button"
              onPress={() => begin('full')}
              scaleTo={0.985}
              style={styles.primary}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.primaryText}>Start {plannedMinutes}-minute focus</Text>
                <Text style={styles.primarySubtext}>One task. A little more progress.</Text>
              </View>
              <Text style={styles.buttonArrow}>→</Text>
            </SpringPressable>

            <View ref={guide.anchors['focus.support']} collapsable={false} testID="guide-focus-support"><SpringPressable
              accessibilityRole="button"
              onPress={() => begin('five-minute')}
              scaleTo={0.988}
              style={styles.launchButton}>
              <View style={styles.launchMark}>
                <Text style={styles.launchMarkText}>5</Text>
              </View>
              <View style={styles.launchCopy}>
                <Text style={styles.launchTitle}>Five-minute launch</Text>
                <Text style={styles.launchText}>
                  Only promise five minutes. If momentum arrives, continue into the full block.
                </Text>
              </View>
            </SpringPressable></View>

            <GuideOffer tutorialId="focus" screenName="Focus"
              description="See block length, your first tiny step and the five-minute launch. Replay anytime from ?."
              visible={guideOffer.visible} saveFailed={guideOffer.saveFailed}
              onShow={() => { guideOffer.choose('shown'); guide.start(); }}
              onLater={() => guideOffer.choose('later')} onRetry={guideOffer.retry} />

            <DistractionShield />
            {focusError || saveError ? (
              <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError || saveError}</Text>
            ) : null}
            <Text style={styles.recoveryNote}>
              The timer survives leaving or closing MYELIN.
            </Text>
          </ScrollView>
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  if (session.phase === 'break') {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.sessionPage}>
          <TopBar
            onHelp={guide.start}
            label="Break"
            onBack={() => router.replace('/(app)/today')}
            helper={timerDone ? 'Timer complete' : session.runningSince ? 'Timer stays active' : 'Timer paused'}
          />

          <ScrollView
            ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            contentContainerStyle={styles.timerArea}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>RECOVERY</Text>
            <Text style={styles.sessionTitle}>Leave the work alone.</Text>
            {session.focusLogged ? (
              <Reveal key={`focus-saved:${session.id}`} distance={5}>
                <View style={styles.focusSavedPill}>
                  <Text style={styles.focusSavedCue}>
                    ✓ Focus logged · {session.focusActualMinutes} min
                  </Text>
                </View>
              </Reveal>
            ) : null}

            <TimerDial
              value={formatTimer(remaining)}
              label={timerDone ? 'BREAK COMPLETE' : session.runningSince ? 'BREAK' : 'PAUSED'}
              complete={timerDone}
              paused={!session.runningSince && !timerDone}
              progress={phaseProgress}
              size={timerDialSize}
              sublabel={`${session.breakMinutes}m recovery`}
            />
            <View style={styles.phaseProgress}>
              <AnimatedProgress
                value={phaseProgress}
                tone="success"
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

            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary" style={{ alignSelf: 'stretch' }}>
            <Reveal key={timerDone ? 'break-done' : 'break-running'} distance={6} style={styles.breakActions}>
              {timerDone ? (
                retrievalSuggestion ? (
                  <View style={styles.retrieveActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Finish break and retrieve ${retrievalSuggestion.count} recall prompts`}
                      accessibilityState={{ disabled: Boolean(breakTransition), busy: Boolean(breakTransition) }}
                      disabled={Boolean(breakTransition)}
                      onPress={() => void runBreakTransition('retrieve')}
                      style={({ pressed }) => [
                        styles.primary,
                        styles.wideButton,
                        breakTransition && styles.disabled,
                        pressed && !breakTransition && styles.pressed,
                      ]}>
                      <View style={styles.retrieveActionCopy}>
                        <Text style={styles.primaryText}>
                          {breakTransition === 'retrieve' ? 'Saving break…' : (
                            <>
                              Retrieve {retrievalSuggestion.count}{' '}
                              {retrievalSuggestion.count === 1 ? 'prompt' : 'prompts'}
                            </>
                          )}
                        </Text>
                        <Text style={styles.primarySubtext}>
                          Short recall, then back to Today
                        </Text>
                      </View>
                      <Text style={styles.buttonArrow}>→</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(breakTransition), busy: Boolean(breakTransition) }}
                      disabled={Boolean(breakTransition)}
                      onPress={() => void runBreakTransition('finish')}
                      style={({ pressed }) => [
                        styles.textButton,
                        breakTransition && styles.disabled,
                        pressed && !breakTransition && styles.pressed,
                      ]}>
                      <Text style={styles.textButtonText}>
                        {breakTransition === 'finish' ? 'Saving break…' : 'Finish break without recall'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(breakTransition), busy: Boolean(breakTransition) }}
                    disabled={Boolean(breakTransition)}
                    onPress={() => void runBreakTransition('finish')}
                    style={({ pressed }) => [
                      styles.primary,
                      styles.wideButton,
                      breakTransition && styles.disabled,
                      pressed && !breakTransition && styles.pressed,
                    ]}>
                    <Text style={styles.primaryText}>
                      {breakTransition === 'finish' ? 'Saving break…' : 'Finish break'}
                    </Text>
                    <Text style={styles.buttonArrow}>→</Text>
                  </Pressable>
                )
              ) : (
                <View style={styles.timerActions}>
                  <SpringPressable
                    accessibilityRole="button"
                    onPress={session.runningSince ? pause : resume}
                    scaleTo={0.985}
                    style={styles.secondary}>
                    <Text style={styles.secondaryText}>{session.runningSince ? 'Pause' : 'Resume'}</Text>
                  </SpringPressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(breakTransition), busy: Boolean(breakTransition) }}
                    disabled={Boolean(breakTransition)}
                    onPress={() => void runBreakTransition('skip')}
                    style={({ pressed }) => [
                      styles.secondary,
                      breakTransition && styles.disabled,
                      pressed && !breakTransition && styles.pressed,
                    ]}>
                    <Text style={styles.secondaryText}>
                      {breakTransition === 'skip' ? 'Saving…' : 'End break'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Reveal>
            </View>
          </ScrollView>
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.sessionPage}>
        <TopBar
          onHelp={guide.start}
          label="Focus"
          onBack={() => router.replace('/(app)/today')}
          helper={timerDone ? 'Timer complete' : session.runningSince ? 'Timer stays active' : 'Timer paused'}
        />

        <ScrollView
          ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
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
            paused={!session.runningSince && !timerDone}
            progress={phaseProgress}
            size={timerDialSize}
            sublabel={
              session.launchMode === 'five-minute'
                ? `5m launch · ${session.fullTargetMinutes}m target`
                : `${session.plannedFocusMinutes}m target`
            }
          />
          <View style={styles.phaseProgress}>
            <AnimatedProgress
              value={phaseProgress}
              tone={timerDone ? 'success' : 'accent'}
              accessibilityLabel={`Focus progress: ${Math.round(phaseProgress * 100)}%`}
            />
            <View style={styles.sessionMetaStrip}>
              <Text style={styles.sessionMetaText}>
                {session.launchMode === 'five-minute'
                  ? `5-min launch · ${session.fullTargetMinutes}m full block`
                  : `${session.plannedFocusMinutes}m focus block`}
              </Text>
              <Text style={styles.sessionMetaText}>
                {session.breakMinutes}m break next
              </Text>
            </View>
          </View>

          <Animated.View
            layout={reduceMotion ? undefined : LinearTransition.duration(motion.stateMs)}>
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
              <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary"><SpringPressable
                accessibilityRole="button"
                onPress={extendLaunch}
                scaleTo={0.985}
                style={[styles.primary, styles.wideButton]}>
                <Text style={styles.primaryText}>
                  Continue to {session.fullTargetMinutes} minutes
                </Text>
                <Text style={styles.buttonArrow}>→</Text>
              </SpringPressable></View>
              <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary"><Pressable
                accessibilityRole="button"
                onPress={() => setFinishing(true)}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={styles.textButtonText}>Finish after five minutes</Text>
              </Pressable></View>
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
              <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary" style={styles.effortRow}>
                {([1, 2, 3, 4, 5] as const).map((value) => (
                  <SpringPressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: effort === value }}
                    accessibilityLabel={`Effort ${value} out of 5`}
                    scaleTo={0.96}
                    lift={0}
                    onPress={() => setEffort(value)}
                    style={[
                      styles.effort,
                      effort === value && styles.effortActive,
                    ]}>
                    <Text style={[styles.effortText, effort === value && styles.effortTextActive]}>
                      {value}
                    </Text>
                  </SpringPressable>
                ))}
              </View>
              <View style={styles.effortLegendRow} accessible={false}>
                <Text style={styles.effortLegendText}>1 · Light</Text>
                <Text style={styles.effortLegendText}>5 · Very demanding</Text>
              </View>
              <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary"><SpringPressable
                accessibilityRole="button"
                accessibilityLabel="Complete focus"
                accessibilityState={{ disabled: savingFocus, busy: savingFocus }}
                disabled={savingFocus}
                onPress={finishFocus}
                scaleTo={0.985}
                style={[styles.primary, styles.wideButton, savingFocus && styles.disabled]}>
                <Text style={styles.primaryText}>{savingFocus ? 'Saving…' : 'Complete focus'}</Text>
                <Text style={styles.buttonArrow}>→</Text>
              </SpringPressable></View>
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
            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary" style={styles.timerActions}>
              <SpringPressable
                accessibilityRole="button"
                onPress={session.runningSince ? pause : resume}
                scaleTo={0.982}
                style={styles.secondary}>
                <Text style={styles.secondaryText}>{session.runningSince ? 'Pause' : 'Resume'}</Text>
              </SpringPressable>
              <SpringPressable
                accessibilityRole="button"
                onPress={requestFinishEarly}
                scaleTo={0.982}
                style={styles.secondary}>
                <Text style={styles.secondaryText}>Finish early</Text>
              </SpringPressable>
            </View>
          )}
          </Reveal>
          </Animated.View>

          <View style={styles.parkingShell}>
            <View ref={guide.anchors['focus.support']} collapsable={false} testID="guide-focus-support"><SpringPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showParking }}
              accessibilityLabel="Distraction parking"
              scaleTo={0.99}
              lift={0}
              onPress={() => setShowParking((current) => !current)}
              style={styles.parkingToggle}>
              <View style={styles.parkingCopy}>
                <Text style={styles.parkingTitle}>Park a distraction</Text>
                <Text style={styles.parkingSubtitle}>
                  {session.distractions.length
                    ? `${session.distractions.length} saved for later`
                    : 'Capture it without leaving Focus'}
                </Text>
              </View>
              <View style={styles.parkingRight}>
                {session.distractions.length > 0 ? (
                  <View style={styles.parkingCountBadge}>
                    <Text style={styles.parkingCountText}>{session.distractions.length}</Text>
                  </View>
                ) : null}
                <Text style={styles.parkingToggleMark}>{showParking ? '−' : '+'}</Text>
              </View>
            </SpringPressable></View>

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
      {guideOverlay}
    </SafeAreaView>
  );
}

function TopBar({
  label,
  onBack,
  helper,
  onHelp,
  backLabel = 'Today',
}: {
  label: string;
  onBack: () => void;
  helper?: string;
  onHelp?: () => void;
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
        {onHelp ? <View style={styles.topBarSpacer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Teach me this screen"
            onPress={onHelp} style={styles.helpButton}><Text style={styles.helpText}>?</Text></Pressable>
        </View> : <View style={styles.topBarSpacer} accessible={false} />}
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
  paused,
  progress,
  size,
  sublabel,
}: {
  value: string;
  label: string;
  complete?: boolean;
  paused?: boolean;
  progress: number;
  size: number;
  sublabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const dialScale = useSharedValue(1);
  const innerOpacity = useSharedValue(paused && !complete ? 0.88 : 1);
  const innerSize = size - 40;

  useEffect(() => {
    cancelAnimation(dialScale);
    cancelAnimation(innerOpacity);
    if (reduceMotion) {
      dialScale.set(1);
      innerOpacity.set(paused && !complete ? 0.88 : 1);
      return;
    }
    dialScale.set(
      withSpring(complete ? 1.015 : paused ? 0.988 : 1, {
        ...motion.revealSpring,
      }),
    );
    innerOpacity.set(
      withTiming(paused && !complete ? 0.88 : 1, {
        duration: motion.stateMs,
      }),
    );
  }, [complete, dialScale, innerOpacity, paused, reduceMotion]);

  const animatedDialStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dialScale.get() }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    opacity: innerOpacity.get(),
  }));

  return (
    <Reveal distance={8} style={{ alignSelf: 'center' }}>
      <Animated.View
        style={[
          styles.dial,
          { width: size, height: size, borderRadius: size / 2 },
          paused && !complete && styles.dialPaused,
          complete && styles.dialComplete,
          animatedDialStyle,
        ]}>
        <View style={styles.dialOuterRing} />
        <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 40 }, (_, index) => {
            const tickState = focusDialTickState(index, progress, complete);
            const lit = tickState !== 'unlit';
            return <View key={index} style={{ position: 'absolute', width: 3, height: 9,
              ...focusDialMarkPosition(size, index),
              borderRadius: 2, transform: [{ rotate: (index * 9) + 'deg' }],
              opacity: tickState === 'lead' ? 1 : tickState === 'unlit' ? 0.55 : 0.92,
              backgroundColor: lit
                ? complete
                  ? colors.success
                  : tickState === 'lead'
                    ? colors.accentBright
                    : colors.accent
                : colors.lineStrong }} />;
          })}
        </View>
        <Animated.View
          style={[
            styles.dialInner,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
            animatedInnerStyle,
          ]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.64}
            style={[
              styles.timerValue,
              size < 196 && styles.timerValueCompact,
              size < 160 && styles.timerValueTiny,
              complete && styles.timerValueComplete,
            ]}>
            {value}
          </Text>
          <View style={styles.timerStatusRow}>
            <View
              style={[
                styles.timerStatusDot,
                paused && !complete && styles.timerStatusDotPaused,
                complete && styles.timerStatusDotComplete,
              ]}
            />
            <Text numberOfLines={2} style={styles.timerLabel}>{label}</Text>
          </View>
          {sublabel && size >= 168 ? (
            <Text numberOfLines={1} style={styles.timerSublabel}>
              {sublabel}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
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
  topBarSpacer: { width: 96, alignItems: 'flex-end' },
  helpButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.accent, fontSize: 18, fontWeight: '600' },
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
  metric: { flex: 1, minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panelRaised, padding: 12, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.4 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  durationChip: {
    flex: 1,
    minWidth: 68,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  durationChipText: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  durationChipTextActive: { color: colors.accent, fontWeight: '800' },
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  stepLabel: { color: colors.accent, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.8 },
  stepText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  timerArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingBottom: 40 },
  breakActions: { width: '100%', maxWidth: 430 },
  dial: {
    position: 'relative',
    overflow: 'visible',
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: 'rgba(255,128,91,0.022)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialPaused: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.015)',
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
  sessionMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  sessionMetaText: {
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  dialInner: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  timerValue: { color: colors.text, fontSize: 48, lineHeight: 56, fontWeight: '600', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerValueCompact: { fontSize: 38, lineHeight: 46 },
  timerValueTiny: { fontSize: 27, lineHeight: 34, letterSpacing: -1.2 },
  timerValueComplete: { color: colors.success },
  timerStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingHorizontal: 6 },
  timerStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  timerStatusDotPaused: { backgroundColor: colors.subtle },
  timerStatusDotComplete: { backgroundColor: colors.success },
  timerLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center', paddingHorizontal: 4 },
  timerSublabel: { color: colors.muted, fontSize: 10.5, lineHeight: 14, marginTop: 4, fontWeight: '600' },
  timerActions: { flexDirection: 'row', gap: 9, marginTop: spacing.lg, width: '100%', maxWidth: 430 },
  secondary: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  finishPanel: { width: '100%', maxWidth: 500, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  finishTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  finishText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  effortRow: { flexDirection: 'row', gap: 7, marginTop: spacing.md },
  effort: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  effortActive: { borderColor: 'rgba(255,128,91,0.5)', backgroundColor: colors.accentSoft },
  effortText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  effortTextActive: { color: colors.accent },
  effortLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },
  effortLegendText: { color: colors.subtle, fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  textButton: { minHeight: layout.minTouch, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  parkingShell: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.line },
  parkingToggle: { minHeight: layout.minTouch, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  parkingCopy: { flex: 1, minWidth: 0 },
  parkingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parkingCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parkingCountText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
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
  focusSavedPill: {
    alignSelf: 'center',
    marginTop: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.28)',
    backgroundColor: 'rgba(180,216,174,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  focusSavedCue: {
    alignSelf: 'center',
    color: colors.success,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
  },
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
