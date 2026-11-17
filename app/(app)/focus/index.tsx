import { FocusSupport, DistractionShield } from '@/src/features/adaptive/FocusSupport';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { PaperGrain } from '@/src/components/app/ChalkGrain';
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
  timerElapsedMs,
  focusActualMinutes,
  breakReminderDue,
} from '@/src/features/focus/focus-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { FocusTimerMode } from '@/src/features/focus/types';
import { FocusAllocation, suggestFocusInterval, validateFocusAllocations } from '@/src/features/focus/focus-personalization';
import {
  focusDialMarkPosition,
  focusDialMarkState,
  focusDialSize,
  focusDurationPresets,
} from '@/src/features/focus/focus-dial-layout';
import {
  FocusShieldActiveBanner,
  useFocusShieldSession,
} from '@/src/features/focus/FocusShieldStudio';
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
import { chalkTheme, colors, layout, motion, radius, spacing } from '@/src/theme/tokens';
import { paperSurfaces } from '@/src/theme/paperSurfaces';
import { NativeProgressVisual } from '@/src/features/today/NativeProgressVisual';

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
    free?: string | string[];
    quick?: string | string[];
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
    extendFocus,
    configureReminders,
    acknowledgeReminder,
    park,
    removeParked,
    completeFocus,
    startBreak,
    completeBreak,
    skipBreak,
    discard,
  } = useFocus();
  const { session: activeReview, ready: reviewReady } = useReview();
  const { ready: onboardingReady, shouldShow: onboardingPending } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();

  const topicId = param(params.topicId);
  const taskId = param(params.taskId);
  const freeFocus = param(params.free) === '1';
  const task = workspace && taskId ? workspace.tasks.find((item) => item.id === taskId) ?? null : null;
  const topic = workspace ? findTopic(workspace, task?.topicId || topicId) : null;
  const suggestedMinutes = Math.max(
    5,
    Math.min(240, intParam(params.minutes, workspace?.settings.focusMinutes ?? 45)),
  );
  const defaultBreakMinutes = Math.max(
    1,
    Math.min(30, intParam(params.breakMinutes, workspace?.settings.breakMinutes ?? 10)),
  );

  const [timerMode, setTimerMode] = useState<FocusTimerMode>('countdown');
  const pomodoroConfigured = useRef(false);
  const autoStarted = useRef(false);
  const [plannedBreaks, setPlannedBreaks] = useState(3);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const [reminderInterval, setReminderInterval] = useState('25');
  const [reminderCount, setReminderCount] = useState('3');
  const [allocations, setAllocations] = useState<FocusAllocation[]>([]);
  const [allocationSubject, setAllocationSubject] = useState('');
  const [allocationMinutes, setAllocationMinutes] = useState('');
  const [allocationTopic, setAllocationTopic] = useState<{ id: string; name: string } | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(defaultBreakMinutes);
  const [customFocus, setCustomFocus] = useState('');
  const [customBreak, setCustomBreak] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const plannedMinutes = selectedMinutes ?? suggestedMinutes;
  const durationPresets = useMemo(
    () => focusDurationPresets(suggestedMinutes),
    [suggestedMinutes],
  );
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
  const [breakTransition, setBreakTransition] = useState<'finish' | 'retrieve' | 'skip' | 'next' | null>(null);
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
  const shield = useFocusShieldSession({
    ownerKey,
    session,
    remainingMs: remaining,
    onParkThought: park,
    onOpenParking: () => setShowParking(true),
  });
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
    : activeReview ? 'review' : ((!topic && !task && !freeFocus) || task?.status === 'completed') ? 'empty' : 'setup';
  const guideReady = ready && reviewReady && !!workspace && !savingFocus && !breakTransition;
  const guide = useFocusGuide(guideReady, ownerKey, guideState);
  const guideOffer = useGuideOffer('focus', ownerKey,
    guideReady && guideState === 'setup' && onboardingReady && !onboardingPending && !transitionPending,
    guide.open && guideState === 'setup');
  const guideOverlay = guide.open ? <ScreenGuide key={guideState} title="Focus" steps={guide.steps}
    anchors={guide.anchors} revealAnchor={guide.revealAnchor} onClose={guide.close} /> : null;

  const habitualInterval = useMemo(() => suggestFocusInterval(workspace?.focusOutcomes ?? [], Date.now()), [workspace?.focusOutcomes]);

  useEffect(() => {
    if (!freeFocus || param(params.quick) !== '1' || autoStarted.current || !ready || !reviewReady || !workspace || activeReview || session) return;
    autoStarted.current = true;
    void start({ freeFocus: true, timerMode: 'stopwatch', plannedMinutes: 240, breakMinutes: defaultBreakMinutes, launchMode: 'full', tinyStep: '' })
      .then(next => { if (next) setNow(Date.now()); else setFocusError('Could not start focus. Please try again.'); })
      .catch(() => setFocusError('Could not start focus. Please try again.'));
  }, [freeFocus, params.quick, ready, reviewReady, workspace, activeReview, session, start, defaultBreakMinutes]);

  async function begin(launchMode: 'full' | 'five-minute', firstStep = tinyStep) {
    if (!topic && !task && !freeFocus) return;
    setFocusError('');
    const typedFocus = customFocus.trim() ? Number(customFocus) : plannedMinutes;
    const typedBreak = customBreak.trim() ? Number(customBreak) : breakMinutes;
    if ((timerMode !== 'stopwatch' && (!Number.isInteger(typedFocus) || typedFocus < 5 || typedFocus > 240)) ||
      !Number.isInteger(typedBreak) || typedBreak < 1 || typedBreak > 30) {
      setFocusError('Choose 5–240 minutes for focus and 1–30 minutes for your suggested break.');
      return;
    }
    try {
      const next = await start({
        ...(topic ? { topicId: topic.id } : {}),
        ...(task ? { taskId: task.id } : {}),
        ...(freeFocus && !task && !topic ? { freeFocus: true } : {}),
        plannedMinutes: timerMode === 'stopwatch' ? (launchMode === 'five-minute' ? suggestedMinutes : 240) : typedFocus,
        breakMinutes: typedBreak,
        timerMode: launchMode === 'five-minute' ? 'countdown' : timerMode,
        ...(timerMode === 'pomodoro' && launchMode === 'full' ? { breaksRemaining: plannedBreaks } : {}),
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

  function addAllocation() {
    if (!session?.freeFocus) return;
    const entry: FocusAllocation = {
      subject: allocationSubject.trim(),
      minutes: Number(allocationMinutes),
      ...(allocationTopic ? { topicId: allocationTopic.id, topicName: allocationTopic.name } : {}),
    };
    const issue = validateFocusAllocations([...allocations, entry], focusActualMinutes(session, Date.now()));
    if (issue) { setFocusError(issue); return; }
    setAllocations(previous => [...previous, entry]);
    setAllocationSubject(''); setAllocationMinutes(''); setAllocationTopic(null); setFocusError('');
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
    let finalAllocations = allocations;
    if (session?.freeFocus) {
      if (allocationSubject.trim() || allocationMinutes.trim()) {
        finalAllocations = [...allocations, {
          subject: allocationSubject.trim(), minutes: Number(allocationMinutes),
          ...(allocationTopic ? { topicId: allocationTopic.id, topicName: allocationTopic.name } : {}),
        }];
      }
      const issue = validateFocusAllocations(finalAllocations, Math.round(Math.min(timerElapsedMs(session, Date.now()), 240 * 60_000) / 60_000));
      if (issue) { setFocusError(issue); return; }
    }
    setSavingFocus(true); setFocusError('');
    try {
      const finishedPlan = session?.timerMode === 'pomodoro' && session.breaksRemaining === 0;
      await completeFocus(effort, Date.now(), session?.freeFocus ? finalAllocations : []);
      setFinishing(false); setNow(Date.now());
      setAllocations([]); setAllocationSubject(''); setAllocationMinutes(''); setAllocationTopic(null);
      if (finishedPlan) router.replace('/(app)/today');
    } catch { setFocusError('Your session could not be saved. Tap Complete focus to retry.'); }
    finally { setSavingFocus(false); }
  }

  async function runBreakTransition(action: 'finish' | 'retrieve' | 'skip' | 'next') {
    // Use an immediate ref guard: state-only disabling does not stop two
    // rapid presses before React has rendered the disabled button.
    if (breakTransitionLock.current || session?.phase !== 'break') return;
    breakTransitionLock.current = true;
    setBreakTransition(action);
    setFocusError('');

    try {
      // Snapshot the optional retrieval destination before clearing the break.
      const suggestion = action === 'retrieve' ? retrievalSuggestion : null;
      if (action === 'next') {
        const previous = session;
        if (previous.breakSuggested) await skipBreak(Date.now());
        else await completeBreak(Date.now());
        const next = await start({
          ...(previous.topicId ? { topicId: previous.topicId } : {}),
          ...(previous.taskId ? { taskId: previous.taskId } : {}),
          ...(previous.freeFocus ? { freeFocus: true } : {}),
          plannedMinutes: previous.fullTargetMinutes,
          breakMinutes: previous.breakMinutes,
          launchMode: 'full', timerMode: 'pomodoro', tinyStep: previous.tinyStep,
          ...(previous.breaksRemaining == null ? {} : { breaksRemaining: Math.max(0, previous.breaksRemaining - 1) }),
        });
        if (!next) {
          router.replace('/(app)/today');
          return;
        }
        setNow(Date.now());
        return;
      } else if (action === 'skip') {
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
        <StatusBar style="light" />
        <View style={styles.center}>
          <Text style={styles.loading}>Restoring focus session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session && activeReview) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <AmbientBackdrop darkTop />
        <View style={styles.setupPage}>
          <TopBar onHelp={guide.start} label="Focus" backLabel="Review" onBack={() => router.replace('/(app)/review')} />
          <View style={styles.missing}>
            <Text style={styles.missingTitle}>A review queue is already active.</Text>
            <Text style={styles.missingText}>
              Resume or end that recall queue before starting a separate focus timer.
            </Text>
            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary">
              <SpringPressable
                accessibilityRole="button"
                scaleTo={0.985}
                onPress={() => router.replace('/(app)/review')}
                style={styles.primary}>
                <Text style={styles.primaryText}>Resume review</Text>
                <Text style={styles.buttonArrow}>→</Text>
              </SpringPressable>
            </View>
          </View>
        </View>
        {guideOverlay}
      </SafeAreaView>
    );
  }

  if (!session) {
    if ((!topic && !task && !freeFocus) || (task && task.status !== 'open')) {
      return (
        <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
          <AmbientBackdrop darkTop />
          <View style={styles.setupPage}>
            <TopBar onHelp={guide.start} label="Focus" onBack={() => router.replace('/(app)/today')} />
            <View style={styles.missing}>
              <Text style={styles.missingTitle}>Choose an open task or topic.</Text>
              <Text style={styles.missingText}>
                Start Focus from any task card or from a topic in Library.
              </Text>
              <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary">
                <SpringPressable
                  accessibilityRole="button"
                  scaleTo={0.985}
                  onPress={() => router.replace('/(app)/today')}
                  style={styles.primary}>
                  <Text style={styles.primaryText}>Back to Today</Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </SpringPressable>
              </View>
            </View>
          </View>
          {guideOverlay}
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <AmbientBackdrop darkTop />
        <View style={styles.setupPage}>
          <TopBar onHelp={guide.start} label="Focus" backLabel="Back" onBack={() => router.back()} />

          <ScrollView
            ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.setupContent}
            showsVerticalScrollIndicator={false}>
            <Reveal delay={15} distance={8}>
              <View style={styles.setupHeaderBlock}>
                <View style={styles.eyebrowRow}>
                  <View style={styles.eyebrowDot} />
                  <Text style={styles.eyebrow}>
                    {(task?.subject || topic?.subject || 'OPEN SESSION').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.setupTitle}>{task?.title || topic?.name || 'Free focus'}</Text>
                {task ? (
                  <View style={styles.taskContextPill}>
                    <Text style={styles.taskContext}>
                      {topic ? `Linked topic · ${topic.name}` : 'Time is saved to this task and today’s used time'}
                    </Text>
                  </View>
                ) : null}

              </View>
            </Reveal>

            <Reveal delay={55} distance={8}>
              <View style={styles.cadenceCard}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}><PaperGrain /></View>
                <Text accessibilityRole="header" style={styles.cadenceHeading}>Your focus session</Text>
                <Text style={styles.cadenceIntro}>Choose how you want to focus today.</Text>
                <View style={styles.modeRow}>
                  {([['countdown', 'Timer'], ['pomodoro', 'Pomodoro'], ['stopwatch', 'Stopwatch']] as const).map(([mode, label]) => (
                    <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: timerMode === mode }}
                      onPress={() => { setTimerMode(mode); setFocusError(''); if (mode === 'pomodoro' && !pomodoroConfigured.current) { pomodoroConfigured.current = true; setSelectedMinutes(25); setBreakMinutes(5); setCustomFocus(''); setCustomBreak(''); } }}
                      style={[styles.modeChoice, timerMode === mode && styles.modeChoiceActive]}>
                      <Text style={[styles.modeChoiceText, timerMode === mode && styles.modeChoiceTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.modeHint}>{timerMode === 'stopwatch' ? 'Count up at your own pace, up to 4 hours.' : timerMode === 'pomodoro' ? 'A focused block followed by an optional break.' : 'Choose a target and finish when you are ready.'}</Text>
                {habitualInterval && timerMode !== 'stopwatch' ? (
                  <Pressable accessibilityRole="button" onPress={() => { setSelectedMinutes(habitualInterval.minutes); setCustomFocus(''); }} style={styles.habitSuggestion}>
                    <Text style={styles.habitSuggestionText}>Try {habitualInterval.minutes} min · based on {habitualInterval.samples} completed sessions</Text>
                  </Pressable>
                ) : null}
                <View
                  ref={guide.anchors['focus.primary']}
                  collapsable={false}
                  testID="guide-focus-primary"
                  style={styles.durationChipRow}>
                  {timerMode !== 'stopwatch' && durationPresets.map(minutes => {
                    const selected = !customFocus.trim() && plannedMinutes === minutes;
                    return (
                      <SpringPressable
                        key={minutes}
                        accessibilityRole="button"
                        accessibilityLabel={`Focus for ${minutes} minutes`}
                        accessibilityState={{ selected }}
                        scaleTo={0.975}
                        lift={0}
                        onPress={() => { setSelectedMinutes(minutes); setCustomFocus(''); }}
                        style={[
                          styles.secondary,
                          styles.durationChip,
                          selected && styles.effortActive,
                        ]}>
                        <Text
                          style={[
                            styles.secondaryText,
                            selected && styles.durationChipTextActive,
                          ]}>
                          {minutes} min
                        </Text>
                      </SpringPressable>
                    );
                  })}
                </View>
                <View style={styles.customTimeRow}>
                  {timerMode !== 'stopwatch' ? <View style={styles.customTimeField}>
                    <Text style={styles.customTimeLabel}>Custom focus · min</Text>
                    <TextInput accessibilityLabel="Custom focus minutes, 5 to 240" keyboardType="number-pad" maxLength={3}
                      value={customFocus} onChangeText={setCustomFocus} placeholder={String(plannedMinutes)} placeholderTextColor={colors.subtle} style={styles.customTimeInput} />
                  </View> : null}
                  <View style={styles.customTimeField}>
                    <Text style={styles.customTimeLabel}>Suggested break · min</Text>
                    <TextInput accessibilityLabel="Suggested break minutes, 1 to 30" keyboardType="number-pad" maxLength={2}
                      value={customBreak} onChangeText={setCustomBreak} placeholder={String(breakMinutes)} placeholderTextColor={colors.subtle} style={styles.customTimeInput} />
                  </View>
                </View>
                {timerMode === 'pomodoro' ? <View style={styles.breakPlan}>
                  <View style={styles.breakPlanCopy}>
                    <Text style={styles.customTimeLabel}>Planned break suggestions</Text>
                    <Text style={styles.breakPlanDetail}>{plannedBreaks + 1} focus blocks · one optional break after each block except the last.</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Fewer planned breaks" disabled={plannedBreaks <= 0} onPress={() => setPlannedBreaks(value => Math.max(0, value - 1))} style={styles.breakCountButton}><Text style={styles.breakCountGlyph}>−</Text></Pressable>
                  <Text accessibilityLabel={`${plannedBreaks} planned breaks`} style={styles.breakCount}>{plannedBreaks}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="More planned breaks" disabled={plannedBreaks >= 8} onPress={() => setPlannedBreaks(value => Math.min(8, value + 1))} style={styles.breakCountButton}><Text style={styles.breakCountGlyph}>+</Text></Pressable>
                </View> : null}
              </View>
            </Reveal>

            <FocusSupport key={task?.id ?? topic?.id} task={task} topicPostponements={topic?.postponements} onStep={setTinyStep} onLaunch={step => begin('five-minute', step)} />

            <Reveal delay={95} distance={8}>
              <Text style={styles.fieldLabel}>First tiny step · optional</Text>
              <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary">
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
              </View>

              <SpringPressable
                accessibilityRole="button"
                scaleTo={0.985}
                lift={1}
                onPress={() => begin('full')}
                style={styles.primary}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.primaryText}>{timerMode === 'stopwatch' ? 'Start stopwatch' : `Start ${customFocus || plannedMinutes}-minute focus`}</Text>
  
                </View>
                <Text style={styles.buttonArrow}>→</Text>
              </SpringPressable>
              {focusError ? <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError}</Text> : null}

              <View ref={guide.anchors['focus.support']} collapsable={false} testID="guide-focus-support">
                <SpringPressable
                  accessibilityRole="button"
                  scaleTo={0.988}
                  lift={1}
                  onPress={() => begin('five-minute')}
                  style={styles.launchButton}>
                  <View style={styles.launchMark}>
                    <Text style={styles.launchMarkText}>5</Text>
                  </View>
                  <View style={styles.launchCopy}>
                    <Text style={styles.launchTitle}>Five-minute launch</Text>
                    <Text style={styles.launchText}>Start small, then decide whether to continue.</Text>
                  </View>
                </SpringPressable>
              </View>
            </Reveal>

            <GuideOffer tutorialId="focus" screenName="Focus"
              description="See block length, your first tiny step and the five-minute launch. Replay anytime from ?."
              visible={guideOffer.visible} saveFailed={guideOffer.saveFailed}
              onShow={() => { guideOffer.choose('shown'); guide.start(); }}
              onLater={() => guideOffer.choose('later')} onRetry={guideOffer.retry} />

            <DistractionShield />
            {saveError ? (
              <Text accessibilityRole="alert" style={styles.storageWarning}>{saveError}</Text>
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
        <StatusBar style="light" />
        <AmbientBackdrop darkTop />
        <View style={styles.sessionPage}>
          <TopBar
            onHelp={guide.start}
            label="Break"
            onBack={() => router.replace('/(app)/today')}
            helper={session.breakSuggested ? 'Your break is optional' : timerDone ? 'Timer complete' : session.runningSince ? 'Timer stays active' : 'Timer paused'}
          />

          <ScrollView
            ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            contentContainerStyle={styles.timerArea}
            showsVerticalScrollIndicator={false}>
            <View style={styles.sessionModePillBreak}>
              <Text style={styles.sessionModePillBreakText}>
                {session.breakSuggested ? 'SUGGESTED' : 'RECOVERY'} · {session.breakMinutes} MIN BREAK
              </Text>
            </View>
            <Text style={styles.sessionTitle}>{session.breakSuggested ? 'Time for a break?' : 'Leave the work alone.'}</Text>
            {session.focusLogged ? (
              <Reveal key={`focus-saved:${session.id}`} distance={5}>
                <Text style={styles.focusSavedCue}>
                  ✓ Focus logged · {session.focusActualMinutes} min
                </Text>
              </Reveal>
            ) : null}

            <TimerDial
              value={formatTimer(remaining)}
              label={session.breakSuggested ? 'READY WHEN YOU ARE' : timerDone ? 'BREAK COMPLETE' : session.runningSince ? 'BREAK' : 'PAUSED'}
              complete={timerDone}
              paused={!session.runningSince && !timerDone}
              phase="break"
              progress={phaseProgress}
              size={timerDialSize}
            />
            <View style={styles.phaseProgress}>
              <AnimatedProgress
                value={phaseProgress}
                tone="success"
                accessibilityLabel={`Break progress: ${Math.round(phaseProgress * 100)}%`}
              />
              <View style={styles.phaseMetaRow}>
                <Text style={styles.phaseMetaText}>
                  {session.breakSuggested ? 'Not started' : timerDone ? 'Rest complete' : session.runningSince ? 'Resting' : 'Break paused'}
                </Text>
                <Text style={styles.phaseMetaText}>{Math.round(phaseProgress * 100)}%</Text>
              </View>
            </View>

            {focusError || saveError ? (
              <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError || saveError}</Text>
            ) : null}
            <Text style={styles.breakPrompt}>
              {session.focusActualMinutes >= 25 ? 'Step away from the screen. Walk a little, stretch gently, or get water.' : 'Let your eyes rest on something far away. Take a few unhurried breaths.'}
              {session.distractions.length ? ` You parked ${session.distractions.length} thought${session.distractions.length === 1 ? '' : 's'}. Check them before leaving this break.` : ' You do not need to earn the break.'}
            </Text>
            {session.distractions.length ? (
              <ScrollView nestedScrollEnabled style={styles.breakParkedList}>
                {session.distractions.map(item => (
                  <View key={item.id} style={styles.breakParkedItem}>
                    <View style={styles.parkDot} />
                    <Text style={styles.breakParkedText}>{item.text}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

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
                    scaleTo={0.98}
                    lift={0}
                    onPress={session.breakSuggested ? startBreak : session.runningSince ? pause : resume}
                    style={[styles.secondary, session.breakSuggested && styles.sessionActionPrimary]}>
                    <Text style={[styles.secondaryText, session.breakSuggested && styles.sessionActionPrimaryText]}>{session.breakSuggested ? 'Start break' : session.runningSince ? 'Pause' : 'Resume'}</Text>
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
                      {breakTransition === 'skip' ? 'Saving…' : session.breakSuggested ? 'Skip break' : 'End break'}
                    </Text>
                  </Pressable>
                </View>
              )}
              {session.timerMode === 'pomodoro' && (session.breakSuggested || timerDone) ? (
                <Pressable accessibilityRole="button" disabled={Boolean(breakTransition)}
                  accessibilityState={{ disabled: Boolean(breakTransition), busy: breakTransition === 'next' }}
                  onPress={() => void runBreakTransition('next')}
                  style={({ pressed }) => [styles.textButton, breakTransition && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.textButtonText}>{breakTransition === 'next' ? 'Starting…' : session.breakSuggested ? 'Skip break & start next block' : 'Start next focus block'}</Text>
                </Pressable>
              ) : null}
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
        <StatusBar style="light" />
      <AmbientBackdrop darkTop />
      <View style={styles.sessionPage}>
        <TopBar
          onHelp={guide.start}
          label="Focus"
          onBack={() => router.replace('/(app)/today')}
        />

        <ScrollView
          ref={guide.scroll} onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          contentContainerStyle={[styles.sessionContent, styles.focusSessionContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <FocusShieldActiveBanner shield={shield} />
          {saveError ? <Text accessibilityRole="alert" style={styles.storageWarning}>{saveError}</Text> : null}
          <FocusStopwatch
            value={formatTimer(session.timerMode === 'stopwatch' ? Math.min(timerElapsedMs(session, now), 240 * 60_000) : remaining)}
            readoutLabel={session.timerMode === 'stopwatch' ? 'TIME ELAPSED' : 'TIME REMAINING'}
            title={session.topicName}
            subject={session.subject}
            detail={session.timerMode === 'stopwatch' ? 'STOPWATCH · UP TO 4 HOURS' : session.launchMode === 'five-minute'
              ? `5 MIN LAUNCH · ${session.fullTargetMinutes} MIN TARGET`
              : `${session.plannedFocusMinutes} MIN FOCUS · ${session.breakMinutes} MIN BREAK SUGGESTED${session.breaksRemaining == null ? '' : ` · ${session.breaksRemaining} LEFT`}`}
            tinyStep={session.tinyStep}
            label={
              timerDone
                ? session.launchMode === 'five-minute'
                  ? 'FIVE MINUTES DONE'
                  : 'BLOCK COMPLETE'
                : session.runningSince
                  ? 'FOCUSING'
                  : 'PAUSED'
            }
            progress={session.timerMode === 'stopwatch' ? 0 : phaseProgress}
          />
          {session.timerMode !== 'stopwatch' ? <View style={styles.phaseProgress}>
            <AnimatedProgress
              value={phaseProgress}
              tone={timerDone ? 'success' : 'accent'}
              accessibilityLabel={`Focus progress: ${Math.round(phaseProgress * 100)}%`}
            />
            <View style={styles.phaseMetaRow}>
              <Text style={styles.phaseMetaText}>
                {timerDone
                  ? 'Target reached'
                  : session.runningSince
                    ? 'In progress'
                    : 'Paused'}
              </Text>
              <Text style={styles.phaseMetaText}>{Math.round(phaseProgress * 100)}%</Text>
            </View>
          </View> : null}

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
              <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary">
                <SpringPressable
                  accessibilityRole="button"
                  scaleTo={0.985}
                  lift={1}
                  onPress={extendLaunch}
                  style={[styles.primary, styles.wideButton]}>
                  <Text style={styles.primaryText}>
                    Continue to {session.fullTargetMinutes} minutes
                  </Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </SpringPressable>
              </View>
              <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary">
                <SpringPressable
                  accessibilityRole="button"
                  scaleTo={0.99}
                  lift={0}
                  onPress={() => setFinishing(true)}
                  style={styles.textButton}>
                  <Text style={styles.textButtonText}>Finish after five minutes</Text>
                </SpringPressable>
              </View>
            </View>
          ) : finishing || timerDone ? (
            <View style={styles.finishPanel}>
              <Text style={styles.finishTitle}>
                {timerDone ? 'Block complete.' : session.timerMode === 'stopwatch' ? 'Finish this session?' : 'Finish this block early?'}
              </Text>
              <Text style={styles.finishText}>
                How demanding did this block feel? This is about workload calibration, not judging
                whether you studied “well.”
              </Text>
              {session.freeFocus ? <View style={styles.allocationPanel}>
                <Text style={styles.allocationTitle}>Where did your time go?</Text>
                <Text style={styles.allocationHint}>{focusActualMinutes(session, now)} min recorded · {Math.max(0, focusActualMinutes(session, now) - allocations.reduce((sum, item) => sum + item.minutes, 0))} min unassigned. You can save any remainder without a subject.</Text>
                {allocations.map((item, index) => <View key={`${index}-${item.subject}`} style={styles.allocationItem}>
                  <Text style={styles.allocationItemText}>{item.topicName ? `${item.subject} · ${item.topicName}` : item.subject} · {item.minutes} min</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.subject} allocation`} onPress={() => setAllocations(previous => previous.filter((_, i) => i !== index))} style={styles.allocationRemove}><Text style={styles.allocationRemoveText}>Remove</Text></Pressable>
                </View>)}
                <View style={styles.allocationInputs}>
                  <TextInput accessibilityLabel="Subject or topic search" value={allocationSubject} onChangeText={text => { setAllocationSubject(text); setAllocationTopic(null); }} placeholder="Subject, or search a topic" placeholderTextColor={colors.subtle} maxLength={120} style={[styles.customTimeInput, styles.allocationSubject]} />
                  <TextInput accessibilityLabel="Minutes for this subject" value={allocationMinutes} onChangeText={setAllocationMinutes} placeholder="min" placeholderTextColor={colors.subtle} keyboardType="number-pad" maxLength={3} style={styles.allocationNumber} />
                </View>
                {allocationSubject.trim() && !allocationTopic ? workspace.topics.filter(item => `${item.name} ${item.subject}`.toLowerCase().includes(allocationSubject.trim().toLowerCase())).slice(0, 8).map(item => (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Choose ${item.name}, ${item.subject}`} onPress={() => { setAllocationTopic({ id: item.id, name: item.name }); setAllocationSubject(item.subject || 'Study'); }} style={styles.topicOption}>
                    <Text style={styles.topicOptionText}>{item.name} · {item.subject || 'Study'}</Text>
                  </Pressable>
                )) : null}
                {allocationTopic ? <Text style={styles.allocationHint}>Topic: {allocationTopic.name}</Text> : null}
                <Pressable accessibilityRole="button" onPress={addAllocation} style={styles.addAllocation}><Text style={styles.addAllocationText}>+ Add time split</Text></Pressable>
              </View> : null}
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
              <View style={styles.effortLegendRow}>
                <Text style={styles.effortLegendText}>1 · Light</Text>
                <Text style={styles.effortLegendText}>3 · Steady</Text>
                <Text style={styles.effortLegendText}>5 · Intense</Text>
              </View>
              <View ref={guide.anchors['focus.secondary']} collapsable={false} testID="guide-focus-secondary">
                <SpringPressable
                  accessibilityRole="button"
                  accessibilityLabel="Complete focus"
                  accessibilityState={{ disabled: savingFocus, busy: savingFocus }}
                  disabled={savingFocus}
                  scaleTo={0.985}
                  lift={1}
                  onPress={finishFocus}
                  style={[styles.primary, styles.wideButton, savingFocus && styles.disabled]}>
                  <Text style={styles.primaryText}>{savingFocus ? 'Saving…' : 'Complete focus'}</Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </SpringPressable>
              </View>
              {focusError ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 10 }}>{focusError}</Text> : null}
              {timerDone && session.timerMode !== 'stopwatch' && session.launchMode === 'full' && session.plannedFocusMinutes < 240 ? (
                <Pressable accessibilityRole="button" onPress={() => { setFinishing(false); void extendFocus(); }} style={styles.textButton}>
                  <Text style={styles.textButtonText}>Add 5 minutes and continue</Text>
                </Pressable>
              ) : null}
              {!timerDone ? (
                <SpringPressable
                  accessibilityRole="button"
                  scaleTo={0.99}
                  lift={0}
                  onPress={() => {
                    setFinishing(false);
                    void resume();
                  }}
                  style={styles.textButton}>
                  <Text style={styles.textButtonText}>Keep going</Text>
                </SpringPressable>
              ) : null}
            </View>
          ) : (
            <View ref={guide.anchors['focus.primary']} collapsable={false} testID="guide-focus-primary" style={styles.timerActions}>
              <SpringPressable
                accessibilityRole="button"
                scaleTo={0.98}
                lift={0}
                onPress={session.runningSince ? pause : resume}
                style={[styles.secondary, styles.sessionActionPrimary]}>
                <Text style={styles.sessionActionPrimaryText}>{session.runningSince ? 'Pause' : 'Resume'}</Text>
              </SpringPressable>
              <SpringPressable
                accessibilityRole="button"
                scaleTo={0.98}
                lift={0}
                onPress={requestFinishEarly}
                style={styles.secondary}>
                <Text style={styles.secondaryText}>{session.timerMode === 'stopwatch' ? 'Finish' : 'Finish early'}</Text>
              </SpringPressable>
            </View>
          )}
          </Reveal>

          {!finishing && !timerDone && session.timerMode !== 'stopwatch' && session.launchMode === 'full' && session.plannedFocusMinutes < 240 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Add five minutes to this focus block" onPress={() => void extendFocus()} style={styles.extendControl}>
              <Text style={styles.extendControlText}>+ 5 min</Text>
            </Pressable>
          ) : null}

          </Animated.View>

          {session.timerMode === 'stopwatch' && !finishing && !timerDone ? <View style={styles.reminderPanel}>
            {breakReminderDue(session, now) ? <View style={styles.reminderDue}>
              <Text style={styles.reminderTitle}>Ready for a breather?</Text>
              <Text style={styles.reminderCopy}>You have focused for {formatTimer(timerElapsedMs(session, now))}. Take a break if it feels right.</Text>
              <View style={styles.reminderActions}>
                <Pressable accessibilityRole="button" onPress={() => void acknowledgeReminder(true)} style={styles.reminderPrimary}><Text style={styles.reminderPrimaryText}>Pause for a break</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => void acknowledgeReminder(false)} style={styles.reminderQuiet}><Text style={styles.reminderQuietText}>Keep going</Text></Pressable>
              </View>
            </View> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showReminderSettings }} onPress={() => setShowReminderSettings(value => !value)} style={styles.reminderToggle}>
              <View style={styles.breakPlanCopy}><Text style={styles.reminderTitle}>Break suggestions</Text><Text style={styles.reminderCopy}>{session.breakReminder?.remaining ? `Every ${session.breakReminder.intervalMinutes} min · ${session.breakReminder.remaining} left` : 'Optional · set your own rhythm'}</Text></View>
              <Text style={styles.reminderToggleMark}>{showReminderSettings ? '−' : '+'}</Text>
            </Pressable>
            {showReminderSettings ? <View style={styles.reminderSettings}>
              <Text style={styles.reminderCopy}>Suggestions appear here while Focus is open. The stopwatch keeps running until you choose to pause it.</Text>
              <View style={styles.customTimeRow}>
                <View style={styles.customTimeField}><Text style={styles.customTimeLabel}>Every · minutes</Text><TextInput accessibilityLabel="Suggest a break every 5 to 180 focus minutes" value={reminderInterval} onChangeText={setReminderInterval} keyboardType="number-pad" maxLength={3} style={styles.customTimeInput} /></View>
                <View style={styles.customTimeField}><Text style={styles.customTimeLabel}>How many · 0 to turn off</Text><TextInput accessibilityLabel="Number of break suggestions, zero to eight" value={reminderCount} onChangeText={setReminderCount} keyboardType="number-pad" maxLength={1} style={styles.customTimeInput} /></View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => {
                const interval = Number(reminderInterval), count = Number(reminderCount);
                if (!reminderInterval.trim() || !reminderCount.trim() || !Number.isInteger(interval) || interval < 5 || interval > 180 || !Number.isInteger(count) || count < 0 || count > 8) { setFocusError('Choose an interval from 5–180 minutes and 0–8 suggestions.'); return; }
                setFocusError(''); void configureReminders(interval, count); setShowReminderSettings(false);
              }} style={styles.addAllocation}><Text style={styles.addAllocationText}>Save suggestions</Text></Pressable>
              {focusError ? <Text accessibilityRole="alert" style={styles.storageWarning}>{focusError}</Text> : null}
            </View> : null}
          </View> : null}

          <View style={styles.parkingShell}>
            <View ref={guide.anchors['focus.support']} collapsable={false} testID="guide-focus-support">
              <SpringPressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showParking }}
                accessibilityLabel="Distraction parking"
                scaleTo={0.99}
                lift={0}
                onPress={() => setShowParking((current) => !current)}
                style={styles.parkingToggle}>
                <View style={styles.parkingCopy}>
                  <View style={styles.parkingTitleRow}>
                    <Text style={styles.parkingTitle}>Park a distraction</Text>
                    {session.distractions.length > 0 ? (
                      <View style={styles.parkingCountBadge}>
                        <Text style={styles.parkingCountText}>{session.distractions.length}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.parkingSubtitle}>
                    {session.distractions.length
                      ? `${session.distractions.length} saved for later`
                      : 'Capture it without leaving Focus'}
                  </Text>
                </View>
                <Text style={styles.parkingToggleMark}>{showParking ? '−' : '+'}</Text>
              </SpringPressable>
            </View>

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
                  <SpringPressable
                    accessibilityRole="button"
                    accessibilityLabel="Save distraction for later"
                    disabled={!distraction.trim()}
                    scaleTo={0.96}
                    lift={0}
                    onPress={addDistraction}
                    style={[
                      styles.parkAdd,
                      !distraction.trim() && styles.disabled,
                    ]}>
                    <Text style={styles.parkAddText}>+</Text>
                  </SpringPressable>
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

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricBottomRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function FocusStopwatch({ value, label, progress, title, subject, detail, tinyStep, readoutLabel }: {
  value: string;
  label: string;
  progress: number;
  title: string;
  subject: string;
  detail: string;
  tinyStep?: string;
  readoutLabel: string;
}) {
  const { width } = useWindowDimensions();
  const visualHeight = Math.max(144, Math.min(180, width - 160));
  return (
    <View style={styles.stopwatchPanel}>
      <View style={styles.stopwatchHeader}>
        <Text style={styles.stopwatchKicker}>{subject.toUpperCase() || 'FOCUS SESSION'}</Text>
        <View style={styles.stopwatchStatus}><View style={styles.stopwatchStatusDot} /><Text style={styles.stopwatchCounter}>{label}</Text></View>
      </View>
      <Text accessibilityRole="header" style={styles.stopwatchTitle}>{title}</Text>
      <Text style={styles.stopwatchDetail}>{detail}</Text>
      {tinyStep ? <Text style={styles.stopwatchStep}>First step · {tinyStep}</Text> : null}
      <View style={styles.stopwatchStage}>
        <View pointerEvents="none" style={styles.stopwatchOrbit} />
        <View style={[styles.stopwatchVisual, { height: visualHeight }]}>
          <NativeProgressVisual model="stopwatch" progress={progress * 100} viewportHeight={visualHeight} />
        </View>
      </View>
      <View accessible accessibilityLabel={`${value} ${readoutLabel === 'TIME ELAPSED' ? 'elapsed' : 'remaining'}. ${label.toLowerCase()}.`} style={styles.stopwatchReadout}>
        <Text style={styles.stopwatchValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={styles.stopwatchLabel}>{readoutLabel}</Text>
      </View>
    </View>
  );
}

function TimerDial({
  value,
  label,
  complete,
  paused,
  phase = 'focus',
  progress,
  size,
}: {
  value: string;
  label: string;
  complete?: boolean;
  paused?: boolean;
  phase?: 'focus' | 'break';
  progress: number;
  size: number;
}) {
  const reduceMotion = useReducedMotion();
  const innerSize = size - 40;
  const dialScale = useSharedValue(1);
  const ringOpacity = useSharedValue(paused && !complete ? 0.62 : 1);

  useEffect(() => {
    cancelAnimation(dialScale);
    cancelAnimation(ringOpacity);

    const targetScale = complete ? 1.015 : paused ? 0.988 : 1;
    const targetOpacity = paused && !complete ? 0.62 : 1;

    if (reduceMotion) {
      dialScale.set(1);
      ringOpacity.set(targetOpacity);
      return;
    }

    dialScale.set(withSpring(targetScale, { ...motion.revealSpring }));
    ringOpacity.set(withTiming(targetOpacity, { duration: motion.stateMs }));
  }, [complete, dialScale, paused, reduceMotion, ringOpacity]);

  const animatedDialStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dialScale.get() }],
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.get() * 0.55 }));

  const isBreakPhase = phase === 'break';
  const activeTickColor = complete || isBreakPhase ? colors.success : colors.accent;
  const headTickColor = complete || isBreakPhase ? colors.success : colors.accentBright;

  return (
    <Reveal distance={8} style={{ alignSelf: 'center' }}>
      <Animated.View
        style={[
          styles.dial,
          { width: size, height: size, borderRadius: size / 2 },
          isBreakPhase && styles.dialBreak,
          paused && !complete && styles.dialPaused,
          complete && styles.dialComplete,
          animatedDialStyle,
        ]}>
        <Animated.View style={[styles.dialOuterRing, animatedRingStyle]} />
        <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 40 }, (_, index) => {
            const mark = focusDialMarkState(index, progress, { complete, paused });
            const backgroundColor = mark.isCurrent
              ? headTickColor
              : mark.lit
                ? activeTickColor
                : colors.lineStrong;
            return (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  width: 3,
                  height: 9,
                  ...focusDialMarkPosition(size, index),
                  borderRadius: 2,
                  opacity: mark.opacity,
                  transform: [{ rotate: (index * 9) + 'deg' }],
                  backgroundColor,
                }}
              />
            );
          })}
        </View>
        <View
          style={[
            styles.dialInner,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
            paused && !complete && styles.dialInnerPaused,
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
                complete || isBreakPhase
                  ? styles.timerStatusDotSuccess
                  : paused
                    ? styles.timerStatusDotPaused
                    : styles.timerStatusDotActive,
              ]}
            />
            <Text numberOfLines={2} style={styles.timerLabel}>{label}</Text>
          </View>
        </View>
      </Animated.View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: chalkTheme.hero },
  setupPage: { flex: 1 },
  sessionPage: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  storageWarning: { color: colors.danger, fontSize: 12.5, lineHeight: 19, paddingVertical: 9, paddingHorizontal: 12, marginTop: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, alignSelf: 'stretch' },
  topBar: {
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(242,231,208,.14)',
    backgroundColor: chalkTheme.hero,
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
  back: { color: chalkTheme.onStage, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  modeTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    color: chalkTheme.onStage,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  topBarSpacer: { width: 96, alignItems: 'flex-end' },
  helpButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: chalkTheme.onStage, fontSize: 18, fontWeight: '600' },
  topHelper: {
    color: chalkTheme.mutedCream,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingBottom: 9,
  },
  setupContent: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: 48,
  },
  setupHeaderBlock: { backgroundColor: chalkTheme.hero, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 26, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', marginBottom: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentFill },
  eyebrow: { color: '#D9A58D', fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.2 },
  setupTitle: { color: chalkTheme.onStage, fontSize: 38, lineHeight: 45, fontWeight: '500', letterSpacing: -1.1, marginTop: 12 },
  setupSubtitle: { color: chalkTheme.mutedCream, fontSize: 14, lineHeight: 21, marginTop: 13, maxWidth: 540 },
  taskContextPill: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingVertical: 2,
  },
  taskContext: { color: chalkTheme.mutedCream, fontSize: 11.5, lineHeight: 17 },
  cadenceCard: {
    marginTop: -1,
    marginHorizontal: -spacing.lg,
    backgroundColor: chalkTheme.paper,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: 22,
    paddingBottom: 14,
  },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  modeChoice: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: paperSurfaces.border, borderRadius: 12, paddingHorizontal: 4 },
  modeChoiceActive: { backgroundColor: chalkTheme.hero, borderColor: chalkTheme.hero },
  modeChoiceText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  modeChoiceTextActive: { color: chalkTheme.onStage },
  modeHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 12 },
  habitSuggestion: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: paperSurfaces.card, borderRadius: 12, marginBottom: 8 },
  habitSuggestionText: { color: colors.textDim, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  breakPlan: { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: paperSurfaces.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakPlanCopy: { flex: 1, minWidth: 0 },
  breakPlanDetail: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  breakCountButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: paperSurfaces.border, alignItems: 'center', justifyContent: 'center' },
  breakCountGlyph: { color: colors.text, fontSize: 20 },
  breakCount: { minWidth: 20, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '700' },
  allocationPanel: { marginTop: 18, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: paperSurfaces.border },
  allocationTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  allocationHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  allocationInputs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  allocationSubject: { flex: 1, minWidth: 0 },
  allocationNumber: { width: 70, minHeight: 46, borderWidth: 1, borderColor: paperSurfaces.border, borderRadius: 12, paddingHorizontal: 10, backgroundColor: chalkTheme.paper, color: colors.text, fontSize: 16 },
  allocationItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  allocationItemText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 },
  allocationRemove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  allocationRemoveText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  topicOption: { minHeight: 44, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: paperSurfaces.border },
  topicOptionText: { color: colors.text, fontSize: 12, lineHeight: 17 },
  addAllocation: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 15 },
  addAllocationText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  customTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  customTimeField: { flex: 1, minWidth: 120 },
  customTimeLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  customTimeInput: { minHeight: 46, borderWidth: 1, borderColor: paperSurfaces.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: chalkTheme.paper, color: colors.text, fontSize: 16 },
  cadenceHeading: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: '500', letterSpacing: -.5 },
  cadenceIntro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  cadenceKicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  planStrip: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 15, backgroundColor: '#E6D8C3', borderRadius: 16 },
  metric: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingVertical: 3,
    justifyContent: 'space-between',
  },
  metricLabel: { color: colors.subtle, fontSize: 10.5, lineHeight: 14, fontWeight: '800', letterSpacing: 0.6 },
  metricBottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 6,
  },
  metricValue: { color: colors.text, fontSize: 17, fontWeight: '700' },
  metricDetail: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  durationChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  durationChip: { flex: 0, flexGrow: 1, flexBasis: '20%', minWidth: 56, borderRadius: 12, backgroundColor: '#EDE1CD', borderColor: paperSurfaces.border },
  durationChipTextActive: { color: colors.accent, fontWeight: '800' },
  fieldLabel: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: spacing.lg, marginBottom: 8 },
  tinyInput: {
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: chalkTheme.paper,
    padding: 13,
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 20,
  },
  primary: {
    minHeight: 58,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: paperSurfaces.accent,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wideButton: { width: '100%' },
  primaryText: { flexShrink: 1, color: paperSurfaces.onAccent, fontSize: 13.5, fontWeight: '800' },
  primarySubtext: { color: paperSurfaces.onAccent, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  buttonArrow: { color: paperSurfaces.onAccent, fontSize: 20, fontWeight: '700' },
  launchButton: {
    minHeight: 66,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: paperSurfaces.border,
    backgroundColor: 'transparent',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  launchMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  launchMarkText: { color: '#25140e', fontSize: 17, fontWeight: '800' },
  launchCopy: { flex: 1 },
  launchTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  launchText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  recoveryNote: { color: colors.subtle, fontSize: 12, lineHeight: 17, marginTop: spacing.lg, textAlign: 'center' },
  missing: { flex: 1, justifyContent: 'center', padding: spacing.xl, maxWidth: layout.readingMax, alignSelf: 'center', width: '100%' },
  missingTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  missingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  sessionContent: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: 56,
  },
  focusSessionContent: { paddingTop: 0 },
  sessionHeading: { alignItems: 'center' },
  stopwatchPanel: { marginTop: 0, marginHorizontal: -spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, backgroundColor: chalkTheme.hero, paddingHorizontal: spacing.lg, paddingTop: 22, paddingBottom: 24, overflow: 'hidden' },
  stopwatchStage: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', width: 200, height: 200, marginTop: 12 },
  stopwatchOrbit: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderStyle: 'dotted', borderColor: 'rgba(242,231,208,0.23)' },
  stopwatchHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stopwatchStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(242,231,208,0.28)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 },
  stopwatchStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D98A60' },
  stopwatchKicker: { color: chalkTheme.mutedCream, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, flexShrink: 1 },
  stopwatchCounter: { color: chalkTheme.mutedCream, fontSize: 10, fontWeight: '700', letterSpacing: .8, flexShrink: 1, textAlign: 'right' },
  stopwatchTitle: { color: chalkTheme.onStage, fontSize: 25, lineHeight: 31, letterSpacing: -.6, marginTop: 14, fontWeight: '600' },
  stopwatchDetail: { color: chalkTheme.mutedCream, fontSize: 11, lineHeight: 16, letterSpacing: .5, marginTop: 4 },
  stopwatchStep: { color: chalkTheme.onStage, fontSize: 12, lineHeight: 18, marginTop: 10 },
  stopwatchVisual: { width: '100%', maxWidth: 208, alignSelf: 'center' },
  stopwatchReadout: { alignItems: 'center', marginTop: 8 },
  stopwatchValue: { color: chalkTheme.onStage, fontSize: 52, lineHeight: 60, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  stopwatchLabel: { color: chalkTheme.mutedCream, fontSize: 10, lineHeight: 16, letterSpacing: 1.3, fontWeight: '800' },
  sessionModePill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  modePillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.subtle },
  sessionModeMeta: { flexShrink: 1, textAlign: 'center', color: colors.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6 },
  sessionModePillBreak: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(184,221,177,0.28)',
    backgroundColor: 'rgba(184,221,177,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sessionModePillBreakText: {
    color: colors.success,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  sessionTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  stepCard: {
    marginTop: spacing.md,
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  stepLabel: { color: colors.accent, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.9, textAlign: 'center' },
  stepText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4, textAlign: 'center' },
  timerArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingBottom: 40 },
  breakActions: { width: '100%', maxWidth: 430 },
  dial: {
    position: 'relative',
    overflow: 'visible',
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: 'rgba(255,128,91,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialBreak: {
    borderColor: 'rgba(184,221,177,0.28)',
    backgroundColor: 'rgba(184,221,177,0.025)',
  },
  dialPaused: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  dialComplete: { borderColor: 'rgba(180,216,174,0.38)', backgroundColor: 'rgba(180,216,174,0.05)' },
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
  phaseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  phaseMetaText: {
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dialInner: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  dialInnerPaused: {
    backgroundColor: colors.bgRaised,
  },
  timerValue: {
    color: colors.text,
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '600',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  timerValueCompact: { fontSize: 38, lineHeight: 46 },
  timerValueTiny: { fontSize: 27, lineHeight: 34, letterSpacing: -1.2 },
  timerValueComplete: { color: colors.success },
  timerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 5,
    paddingHorizontal: 6,
  },
  timerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timerStatusDotActive: { backgroundColor: colors.accentFill },
  timerStatusDotPaused: { backgroundColor: colors.subtle },
  timerStatusDotSuccess: { backgroundColor: colors.success },
  timerLabel: { flexShrink: 1, color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center', paddingHorizontal: 4 },
  timerActions: { flexDirection: 'row', alignSelf: 'center', gap: 9, marginTop: spacing.lg, width: '100%', maxWidth: 430 },
  secondary: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: paperSurfaces.border, backgroundColor: chalkTheme.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  sessionActionPrimary: { borderColor: paperSurfaces.accent, backgroundColor: paperSurfaces.accent },
  sessionActionPrimaryText: { color: paperSurfaces.onAccent, fontSize: 12, fontWeight: '800' },
  extendControl: { minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 18 },
  extendControlText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  reminderPanel: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: paperSurfaces.border },
  reminderToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  reminderTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  reminderCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  reminderToggleMark: { color: colors.accent, fontSize: 22, paddingHorizontal: 6 },
  reminderSettings: { paddingBottom: 12 },
  reminderDue: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: paperSurfaces.card },
  reminderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  reminderPrimary: { minHeight: 44, borderRadius: 12, backgroundColor: paperSurfaces.accent, paddingHorizontal: 12, justifyContent: 'center' },
  reminderPrimaryText: { color: paperSurfaces.onAccent, fontSize: 12, fontWeight: '700' },
  reminderQuiet: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  reminderQuietText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  finishPanel: { width: '100%', maxWidth: 500, alignSelf: 'center', marginTop: spacing.lg, borderRadius: radius.lg, backgroundColor: paperSurfaces.card, padding: spacing.md },
  finishTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  finishText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  effortRow: { flexDirection: 'row', gap: 7, marginTop: spacing.md },
  effort: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  effortActive: { borderColor: 'rgba(255,128,91,0.5)', backgroundColor: colors.accentSoft },
  effortText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  effortTextActive: { color: colors.accent, fontWeight: '800' },
  effortLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
    paddingHorizontal: 4,
  },
  effortLegendText: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  textButton: { minHeight: layout.minTouch, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  parkingShell: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: paperSurfaces.border,
    paddingHorizontal: 2,
    paddingVertical: 5,
  },
  parkingToggle: { minHeight: layout.minTouch, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  parkingCopy: { flex: 1, minWidth: 0 },
  parkingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parkingCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  parkingCountText: { color: colors.accent, fontSize: 10.5, fontWeight: '800' },
  parkingToggleMark: { color: colors.accent, fontSize: 22, lineHeight: 24, fontWeight: '400' },
  parking: { paddingBottom: spacing.sm },
  parkingTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  parkingSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  parkInputRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  parkInput: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bgRaised, paddingHorizontal: 12, color: colors.text, fontSize: 12.5 },
  parkAdd: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.md, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  parkAddText: { color: '#25140e', fontSize: 21, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  parkedItem: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 9, paddingTop: 9 },
  parkDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.accentFill },
  parkedText: { flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  parkRemove: { color: colors.subtle, fontSize: 19 },
  discard: { alignSelf: 'center', marginTop: spacing.xl, padding: 9 },
  discardText: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  breakPrompt: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 380, marginTop: spacing.lg },
  breakParkedList: {
    maxHeight: 136,
    flexShrink: 0,
    alignSelf: 'stretch',
    maxWidth: 430,
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  breakParkedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  breakParkedText: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12.5,
    lineHeight: 18,
  },
  focusSavedCue: {
    alignSelf: 'center',
    color: colors.success,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 9,
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
