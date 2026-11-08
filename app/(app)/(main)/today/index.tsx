import { ChalkGrain } from '@/src/components/app/ChalkGrain';
import { CHALK_DIGITS } from '@/src/features/today/chalkDigits';
import { DayMapPath } from '@/src/features/today/DayMapPath';
import { DayMapSequence } from '@/src/features/today/DayMapSequence';
import { TimeBrick } from '@/src/features/planning/TimeBrick';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import {
  NativeProgressVisual as ProgressVisual,
  TodayHeroVisualModel,
} from '@/src/features/today/NativeProgressVisual';
import {
  DayMapStep,
  buildDayMapSteps,
  computeCompletedFocusMinutesToday,
  computeStudyStreakDays,
  computeTodayProgress,
  formatCompletedFocusDuration,
  isBrickDone,
} from '@/src/features/today/today-progress';
import { TaskUnstuck, TaskScheduleRequest } from '@/src/features/today/TaskUnstuck';
import { sleepingAt } from '@/src/features/adaptive/sleep-engine';
import { TodayAdaptationInsight } from '@/src/features/adaptive/AdaptationInsights';
import { taskUrgency } from '@/src/features/planning/task-urgency';
import {
  TaskQuickActions,
  TaskDueLabel,
} from '@/src/features/planning/TaskQuickActions';
import { buildDayMap } from '@/src/features/planning/day-engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AppButton } from '@/src/components/app/AppButton';
import { AppIcon } from '@/src/components/app/AppIcon';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { useDayMapCompletion } from '@/src/features/today/useDayMapCompletion';
import { dayMapSnapTarget, shouldCollapseFromScroll } from '@/src/features/today/day-map-snap';
import { dayMapSheetLayout } from '@/src/features/today/day-map-sheet-layout';
import { shortSession } from '@/src/features/today/short-session';
import { useRecommendationMotion } from '@/src/features/today/useRecommendationMotion';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { examStatus, nearestUpcomingExam } from '@/src/features/exams/exam-engine';
import { AutopilotReflowNotice } from '@/src/features/exams/AutopilotReflowNotice';
import {
  AutopilotReflowSummary,
  buildAutopilotReflowSummary,
} from '@/src/features/exams/autopilot-reflow';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { ScreenGuide } from '@/src/features/guides/ScreenGuide';
import { useTodayGuide } from '@/src/features/guides/useTodayGuide';
import { useTodayGuideOffer } from '@/src/features/guides/useTodayGuideOffer';
import { TodayGuideOffer } from '@/src/features/guides/TodayGuideOffer';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { timerRemainingMs } from '@/src/features/focus/focus-engine';
import {
  ReclaimedStudyPlacement,
  buildAppliedReclaimedWindows,
} from '@/src/features/exams/autopilot-recovery';
import { useScreenClock } from '@/src/features/planning/useScreenClock';
import { StudyInboxCard } from '@/src/features/planning/StudyInboxCard';
import {
  applyDeferral,
  canDefer,
  DeferralReceipt,
  restoreDeferral,
  undoAvailability,
} from '@/src/features/today/deferral';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { buildTodayPlan, nextLocalDayStart, PlanBlock } from '@/src/features/today/planner';
import {
  ThemePaletteId,
  applyThemePalette,
  chalkTheme,
  colors,
  getChalkThemeTokens,
  layout,
  motion,
  radius,
  space,
  type,
} from '@/src/theme/tokens';

const BUDGETS = [10, 15, 30, 60, 90, 120, 180];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function TodayScreen() {
  const { width: screenWidth, height: screenHeight, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    reminderExpired?: string | string[];
    reminderKind?: string | string[];
  }>();
  const { status, workspace, updateWorkspace, saveError, ownerKey } = useWorkspace();
  const dayMapCompletion = useDayMapCompletion();
  const { session: activeFocus, ready: focusReady } = useFocus();
  const { session: activeReview, ready: reviewReady } = useReview();
  const { ready: onboardingReady, shouldShow: onboardingPending } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();
  const { style: heroMotion, busy: deferAnimating, transition } = useRecommendationMotion();
  const [showAdjust, setShowAdjust] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [scheduleRequest, setScheduleRequest] = useState<TaskScheduleRequest | null>(null);
  useEffect(() => {
    setScheduleRequest(null);
  }, [ownerKey]);
  const [showRest, setShowRest] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [reflow, setReflow] = useState<AutopilotReflowSummary | null>(null);
  const [lastDeferred, setLastDeferred] = useState<DeferralReceipt | null>(null);
  const [deferNotice, setDeferNotice] = useState<{ ownerKey: string; message: string } | null>(
    null,
  );
  useEffect(() => {
    setLastDeferred(null);
    setDeferNotice(null);
    setReflow(null);
  }, [ownerKey]);

  const [heroModel] = useState<TodayHeroVisualModel>('cycle');
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const scrollTouch = useRef<{ x: number; y: number; offset: number } | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const activeThemeId: ThemePaletteId = workspace?.settings?.themePalette ?? 'editorial';
  const chalk = useMemo(
    () => getChalkThemeTokens(workspace?.settings?.themeCustomOverrides),
    [workspace?.settings?.themeCustomOverrides],
  );

  useEffect(() => {
    applyThemePalette(activeThemeId, workspace?.settings?.themeCustomOverrides);
  }, [activeThemeId, workspace?.settings?.themeCustomOverrides]);

  const now = useScreenClock();
  const plan = useMemo(
    () => (workspace ? buildTodayPlan(workspace, now) : null),
    [workspace, now],
  );
  const dayMap = useMemo(
    () => (workspace ? buildDayMap(workspace, now) : null),
    [workspace, now],
  );
  const recoveredWindows = useMemo(() => {
    if (!workspace) return [];
    const activeFocusRemaining =
      activeFocus?.phase === 'focus' ? timerRemainingMs(activeFocus, now) : 0;
    return buildAppliedReclaimedWindows(workspace, now, {
      horizonDays: 1,
      protectionLeadMinutes: 10,
      ...(activeFocusRemaining > 0
        ? {
            unavailableUntil: now + activeFocusRemaining,
            activeFocusTopicId: activeFocus?.topicId ?? null,
            activeFocusStartedAt: activeFocus?.startedAt ?? null,
          }
        : {}),
    });
  }, [
    activeFocus?.elapsedMs,
    activeFocus?.phase,
    activeFocus?.plannedFocusMinutes,
    activeFocus?.runningSince,
    activeFocus?.startedAt,
    activeFocus?.topicId,
    now,
    workspace,
  ]);
  const mistakeSummary = useMemo(
    () => (workspace ? mistakeCounts(workspace, now) : { due: 0, open: 0, resolved: 0, total: 0 }),
    [workspace, now],
  );
  const nextExam = useMemo(
    () => (workspace ? nearestUpcomingExam(workspace, now) : null),
    [workspace, now],
  );

  // ==========================================================================
  // STAGE 1 & 4 SINGLE-SOURCE-OF-TRUTH PROGRESS, FOCUS, STREAK & DAY MAP STEPS
  // ==========================================================================
  const progressSummary = useMemo(
    () =>
      workspace
        ? computeTodayProgress(workspace, now, plan?.nextBlock?.taskId ?? null)
        : { tasks: [], total: 0, done: 0, incomplete: 0, ratio: 0, percent: 0 },
    [workspace, now, plan?.nextBlock?.taskId],
  );
  const completedFocusMinutes = useMemo(
    () => (workspace ? computeCompletedFocusMinutesToday(workspace, now) : 0),
    [workspace, now],
  );
  const streakDays = useMemo(
    () => (workspace ? computeStudyStreakDays(workspace, now) : 0),
    [workspace, now],
  );
  const dayMapStepsSummary = useMemo(
    () =>
      workspace
        ? buildDayMapSteps(workspace, now, plan, { previewLimit: 5 })
        : {
            steps: [],
            previewSteps: [],
            totalSteps: 0,
            completedSteps: 0,
            remainingSteps: 0,
            nextStep: null,
          },
    [workspace, now, plan],
  );

  const isReady = status === 'ready' && !!workspace && !!plan;
  const guideReady =
    isReady &&
    !deferAnimating &&
    focusReady &&
    reviewReady &&
    onboardingReady &&
    !onboardingPending &&
    !transitionPending;
  const guide = useTodayGuide(
    guideReady,
    ownerKey,
    activeReview
      ? 'review'
      : activeFocus
        ? 'focus'
        : plan && plan.remainingBudgetMinutes <= 0
          ? 'rest'
          : plan?.nextBlock
            ? 'ready'
            : 'empty',
  );
  const guideOffer = useTodayGuideOffer(
    ownerKey,
    guideReady && !activeFocus && !activeReview,
    guide.open,
  );

  // ==========================================================================
  // PERSISTENT CREAM DAY MAP SHEET GEOMETRY & REANIMATED GESTURE PHYSICS
  // ==========================================================================
  const reduceMotionEnabled = Boolean(workspace?.settings?.reduceMotion);
  const { dockClearance, collapsedSheetTop, expandedSheetTop, expandDistance, heroStageHeight } =
    dayMapSheetLayout(screenHeight, insets.top, insets.bottom, fontScale);
  const archBorderRadius = Math.round(Math.min(46, screenWidth * .12));

  const sheetTranslateY = useSharedValue(0);
  const sheetStartY = useSharedValue(0);
  const sheetDragActive = useSharedValue(false);

  function snapSheet(expand: boolean, velocityY = 0) {
    setIsSheetExpanded(expand);
    const target = expand ? -expandDistance : 0;
    if (reduceMotionEnabled) {
      sheetTranslateY.value = target;
      return;
    }
    sheetTranslateY.value = withSpring(
      target,
      reduceMotionEnabled
        ? { damping: 32, stiffness: 260, overshootClamping: true }
        : {
            damping: 27,
            stiffness: 190,
            mass: 0.82,
            velocity: velocityY,
            overshootClamping: true,
          },
    );
  }

  useEffect(() => {
    if (Platform.OS !== 'android' || !isSheetExpanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      snapSheet(false);
      return true;
    });
    return () => sub.remove();
  }, [isSheetExpanded, expandDistance]);

  const [crestPanGesture, previewPanGesture] = useMemo(
    () => {
      const makePan = () => Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-18, 18])
        .onStart(() => {
          sheetDragActive.value = true;
          cancelAnimation(sheetTranslateY);
          sheetStartY.value = sheetTranslateY.value;
        })
        .onUpdate((event) => {
          const raw = sheetStartY.value + event.translationY;
          if (raw < -expandDistance) {
            sheetTranslateY.value = -expandDistance + (raw + expandDistance) * 0.2;
          } else if (raw > 0) {
            sheetTranslateY.value = raw * 0.2;
          } else {
            sheetTranslateY.value = raw;
          }
        })
        .onEnd((event) => {
          const shouldExpand = dayMapSnapTarget(sheetStartY.value, event.translationY, event.velocityY, expandDistance);
          runOnJS(snapSheet)(shouldExpand, event.velocityY);
        })
        .onFinalize((_event, success) => {
          // A tap fails the pan recognizer; it must not override the header button.
          if (sheetDragActive.value && !success) runOnJS(snapSheet)(sheetTranslateY.value < -expandDistance / 2);
          sheetDragActive.value = false;
        });
      return [makePan(), makePan()] as const;
    },
    [expandDistance, reduceMotionEnabled],
  );

  // A rotation or resized window must not leave the sheet between old snap points.
  useEffect(() => {
    cancelAnimation(sheetTranslateY);
    sheetTranslateY.value = isSheetExpanded ? -expandDistance : 0;
  }, [expandDistance]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    height: screenHeight - insets.top - collapsedSheetTop - sheetTranslateY.value,
    transform: [{ translateY: sheetTranslateY.value }],
    borderTopLeftRadius: interpolate(-sheetTranslateY.value, [0, expandDistance], [archBorderRadius, 28], Extrapolation.CLAMP),
    borderTopRightRadius: interpolate(-sheetTranslateY.value, [0, expandDistance], [archBorderRadius, 28], Extrapolation.CLAMP),
  }));

  const animatedSeamStyle = useAnimatedStyle(() => ({
    borderTopLeftRadius: interpolate(-sheetTranslateY.value, [0, expandDistance], [archBorderRadius - 3, 25], Extrapolation.CLAMP),
    borderTopRightRadius: interpolate(-sheetTranslateY.value, [0, expandDistance], [archBorderRadius - 3, 25], Extrapolation.CLAMP),
  }));

  // Both compositions keep their own widths throughout a drag. Only opacity and
  // translation follow the UI-thread position; task text never reflows mid-pull.
  const animatedPreviewStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-sheetTranslateY.value, [0, expandDistance * .35], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(-sheetTranslateY.value, [0, expandDistance], [0, -12], Extrapolation.CLAMP) }],
  }));
  const animatedDetailsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-sheetTranslateY.value, [expandDistance * .25, expandDistance * .8], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(-sheetTranslateY.value, [0, expandDistance], [24, 0], Extrapolation.CLAMP) }],
  }));

  const animatedSummaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-sheetTranslateY.value, [0, expandDistance * .65, expandDistance], [0, 0, 1], Extrapolation.CLAMP),
  }));

  const animatedHeroDimStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      -sheetTranslateY.value,
      [0, expandDistance],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(progress, [0, 0.85, 1], [1, 0.12, 0], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(progress, [0, 1], [1, 0.96], Extrapolation.CLAMP),
        },
      ],
    };
  });

  if (status === 'loading' || status === 'idle' || !workspace || !plan) {
    return (
      <SafeAreaView style={styles.safe}>
        <AmbientBackdrop />
        <View style={styles.center}>
          <ActivityIndicator color={chalkTheme.progressBlue} />
          <Text style={styles.loadingText}>Choosing what matters next…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;
  const currentPlan = plan;
  const next = currentPlan.nextBlock;
  const expiredReminder = firstParam(params.reminderExpired) === '1';
  const expiredReminderKind = firstParam(params.reminderKind) ?? 'study';
  const laterBlocks = currentPlan.blocks
    .filter((block) => !next || block.id !== next.id)
    .slice(0, 3);
  const budgetFinished = currentPlan.remainingBudgetMinutes <= 0;
  const quickSession = shortSession(currentPlan);
  const overdueCount = currentWorkspace.tasks.filter(
    (task) => taskUrgency(task, now)?.overdue,
  ).length;
  const openTaskCount = currentWorkspace.tasks.filter((task) => task.status === 'open').length;
  const deadlineBreak = currentPlan.deadlineFeasibility?.firstOverloadedDeadline ?? null;
  const deadlineRelief = deadlineBreak?.reliefCandidates[0] ?? null;
  const restCount =
    laterBlocks.length + (mistakeSummary.due > 0 ? 1 : 0) + (nextExam ? 1 : 0);
  const recoveredWindow =
    recoveredWindows.find(
      (window) =>
        window.placements.some((placement) => placement.end > now) || window.protection,
    ) ?? null;
  const recoveredPlacement =
    recoveredWindow?.placements.find((placement) => placement.end > now) ?? null;

  const todayTaskProgress = progressSummary.percent;
  const progressDigits = String(todayTaskProgress).split('');
  const chalkDigitWidth = Math.min(125, Math.max(48, (screenWidth * .64) / progressDigits.length));
  const chalkDigitHeight = chalkDigitWidth * 220 / 150;
  const totalTaskCount = progressSummary.total;
  const allTasksComplete = totalTaskCount > 0 && progressSummary.done === totalTaskCount;

  function dismissExpiredReminderFallback() {
    router.replace('/(app)/today');
  }

  function openExpiredReminderFallback() {
    dismissExpiredReminderFallback();
    if (activeReview) {
      router.push('/(app)/review');
      return;
    }
    if (activeFocus) {
      router.push('/(app)/focus');
      return;
    }
    if (next) {
      startBlock(next);
      return;
    }
    router.push('/(app)/today/day-map');
  }

  function openRecoveredPlacement(placement: ReclaimedStudyPlacement) {
    if (
      activeFocus ||
      activeReview ||
      recoveredWindow?.protection ||
      placement.start > now + 15 * 60_000
    ) {
      router.push('/(app)/today/day-map');
      return;
    }

    router.push({
      pathname: '/(app)/focus',
      params: {
        topicId: placement.topicId,
        minutes: String(placement.minutes),
        breakMinutes: String(currentWorkspace.settings.breakMinutes),
      },
    });
  }

  function setBudget(minutes: number) {
    updateWorkspace((draft) => {
      draft.settings.dailyMinutes = minutes;
    });
  }

  function setEnergy(energy: 'low' | 'normal') {
    updateWorkspace((draft) => {
      draft.settings.energy = energy;
    });
  }

  function deferForToday(block: PlanBlock) {
    if (!ownerKey || (block.source !== 'task' && block.source !== 'topic')) return;
    const id = block.source === 'task' ? block.taskId : block.topicId;
    if (!id) return;
    const source = block.source;
    const at = Date.now();
    let receipt = null as DeferralReceipt | null;
    const nextWorkspace = updateWorkspace(
      (draft) => {
        receipt = applyDeferral(draft, ownerKey, source, id, nextLocalDayStart(Date.now()), at);
      },
      { ownerKey, canApply: (current) => canDefer(current, source, id, at) },
    );
    if (!nextWorkspace || !receipt) return;
    setLastDeferred(receipt);
    setDeferNotice(null);
    setReflow(buildAutopilotReflowSummary(currentWorkspace, nextWorkspace, at));
  }

  function deferWithTransition(block: PlanBlock) {
    setShowWhy(false);
    transition(() => deferForToday(block));
  }

  function undoDefer() {
    if (!lastDeferred || !ownerKey || lastDeferred.ownerKey !== ownerKey) return;
    const receipt = lastDeferred;
    const at = Date.now();
    let availability = undoAvailability(currentWorkspace, receipt, at);
    const nextWorkspace = updateWorkspace(
      (draft) => {
        restoreDeferral(draft, receipt, at);
      },
      {
        ownerKey: receipt.ownerKey,
        canApply: (current) => {
          availability = undoAvailability(current, receipt, at);
          return availability === 'available';
        },
      },
    );
    if (nextWorkspace) {
      setReflow(buildAutopilotReflowSummary(currentWorkspace, nextWorkspace, at));
      setDeferNotice({ ownerKey: receipt.ownerKey, message: 'Previous plan restored.' });
    } else {
      setDeferNotice({
        ownerKey: receipt.ownerKey,
        message:
          availability === 'expired'
            ? 'That deferral has ended. Your current plan was kept.'
            : 'This item changed after Not now. Your latest changes were kept.',
      });
    }
    setLastDeferred(null);
  }

  function undoWithTransition() {
    if (!lastDeferred) return;
    setShowWhy(false);
    transition(undoDefer);
  }

  function startBlock(block: PlanBlock, focusOnly = false) {
    if (activeReview) {
      router.push('/(app)/review');
      return;
    }
    if (activeFocus) {
      router.push('/(app)/focus');
      return;
    }
    if (!focusOnly && block.mode === 'review' && block.dueQuestionCount > 0 && block.topicId) {
      router.push({
        pathname: '/(app)/review',
        params: { topicId: block.topicId },
      });
      return;
    }
    if (!block.topicId && !block.taskId) return;

    router.push({
      pathname: '/(app)/focus',
      params: {
        ...(block.topicId ? { topicId: block.topicId } : {}),
        ...(block.taskId ? { taskId: block.taskId } : {}),
        minutes: String(block.minutes),
        breakMinutes: String(currentPlan.breakMinutes),
      },
    });
  }

  function openStepDetails(step: DayMapStep) {
    if (step.taskId) {
      router.push({ pathname: '/(app)/today/task/[taskId]', params: { taskId: step.taskId } });
    } else if (step.topicId) {
      router.push({ pathname: '/(app)/topics/[topicId]', params: { topicId: step.topicId } });
    }
  }

  function handleStepPress(step: DayMapStep) {
    if (step.taskId) {
      if (!step.completed) {
        dayMapCompletion.complete(step.taskId);
      } else {
        router.push({
          pathname: '/(app)/today/task/[taskId]',
          params: { taskId: step.taskId },
        });
      }
      return;
    }
    if (next) startBlock(next);
  }


  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.screen}>
        <ChalkGrain />
        {/* ===================================================================
            ZONE 1: EDITORIAL BRAND BAR (MYELIN | ? | Settings)
           =================================================================== */}
        <View style={styles.editorialTop}>
          <Text style={styles.wordmark}>MYELIN</Text>
          <View style={styles.headerActionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Help with Today"
              onPress={() => { snapSheet(true); guide.start(); }}
              style={styles.headerControl}>
              <Text style={styles.headerControlText}>?</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push('/(app)/settings')}
              style={styles.headerControl}>
              <AppIcon name="settings" size={20} color={chalkTheme.mutedCream} />
            </Pressable>
          </View>
        </View>

        {/* ===================================================================
            ZONE 2: CHARCOAL HERO STAGE (zIndex: 1)
            - Editorial heading and isolated progress visual
            - Persistent 3D Bottle / Stopwatch GLView
            - Real task, completed-focus and streak summaries
            - Right visible progressbar callout (${todayTaskProgress}% PROGRESS)
           =================================================================== */}
        <Animated.View
          pointerEvents={isSheetExpanded ? 'none' : 'auto'}
          style={[styles.heroStageContainer, animatedHeroDimStyle]}>
          <View style={styles.headlineWrap}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.editorialTitle}>
              A little progress,{'\n'}every day.
            </Text>

          </View>

          <View
            style={[styles.visualStage, { height: heroStageHeight }]}
            accessibilityLabel="Animated daily task progress">
            {/* Persistent Single-Context 3D Bottle / Stopwatch */}
            <View style={styles.glStageShift}>
              <ProgressVisual progress={todayTaskProgress} model={heroModel} paused={isSheetExpanded} />
            </View>

            {/* Faint chalk typography and pencil marks frame the actual 3D object. */}
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroSketchLayer}>
              <View style={[styles.chalkNumber, { width: chalkDigitWidth * progressDigits.length, height: chalkDigitHeight }]}>
                {progressDigits.map((digit, index) => (
                  <Image key={`${index}-${digit}`} source={{ uri: CHALK_DIGITS[Number(digit)] }}
                    resizeMode="stretch" fadeDuration={0} style={{ width: chalkDigitWidth, height: chalkDigitHeight }} />
                ))}
              </View>
              <View style={styles.chalkArc} />
              <View style={styles.chalkGrid}>
                {Array.from({ length: 9 }, (_, index) => <View key={index} style={styles.chalkDot} />)}
              </View>
              <View style={styles.chalkBox} />
              <View style={styles.chalkBoxSmall} />
            </View>

            {/* Progress readout stays separate from the moving bottle. */}
            <View
              style={[
                styles.meniscusCalloutRow,
                { top: Math.max(20, heroStageHeight * .35) },
              ]}>

              <Pressable
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Today's task progress"
                accessibilityValue={{ min: 0, max: 100, now: todayTaskProgress }}
                style={styles.heroProgressCallout}>
                <Text style={styles.heroProgressPercent}>{todayTaskProgress}%</Text>
                <Text style={styles.heroProgressCaption}>today + next task</Text>
              </Pressable>
            </View>
          </View>
            {/* Three quiet shortcuts beneath the visual. */}
            <View style={styles.telemetryStack}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${totalTaskCount} ${totalTaskCount === 1 ? 'task' : 'tasks'} today`}
                onPress={() => snapSheet(true)}
                style={styles.telemetryPill}>
                <AppIcon name="checkbox-checked" size={14} color={chalk.onStage} />
                <Text style={styles.telemetryPillText}>
                  {totalTaskCount} {totalTaskCount === 1 ? 'task' : 'tasks'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatCompletedFocusDuration(completedFocusMinutes)} completed focus time today`}
                onPress={() => router.push('/(app)/progress')}
                style={styles.telemetryPill}>
                <AppIcon name="stopwatch" size={15} color={chalk.onStage} />
                <Text style={styles.telemetryPillText}>
                  {formatCompletedFocusDuration(completedFocusMinutes)} focus
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${streakDays} day study streak`}
                onPress={() => router.push('/(app)/progress')}
                style={styles.telemetryPill}>
                <AppIcon name="flame" size={14} color={chalk.onStage} />
                <Text style={styles.telemetryPillText}>
                  {streakDays} {streakDays === 1 ? 'day' : 'days'} streak
                </Text>
              </Pressable>
            </View>

        </Animated.View>

        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!isSheetExpanded}
          importantForAccessibility={isSheetExpanded ? 'auto' : 'no-hide-descendants'}
          style={[styles.expandedSummary, expandedSheetTop < 160 && styles.compactSummary, animatedSummaryStyle]}>
          <View style={styles.summaryDateRow}>
            <View style={styles.summaryDayGroup}>
              <Text maxFontSizeMultiplier={1.2} style={[styles.summaryDay, expandedSheetTop < 160 && styles.compactSummaryDay]}>{String(new Date(now).getDate()).padStart(2, '0')}</Text>
              <View style={styles.summaryRedDot} />
            </View>
            <Text style={styles.summaryDate}>
              {new Date(now).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}{'\n'}
              {new Date(now).toLocaleDateString(undefined, { weekday: 'long' })}
            </Text>
          </View>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={[styles.summarySentence, expandedSheetTop < 160 && styles.compactSummarySentence]}>
            <Text style={styles.summaryMuted}>Today, </Text>
            <Text style={styles.summaryBright}>{progressSummary.done} of {totalTaskCount} {totalTaskCount === 1 ? 'task' : 'tasks'}</Text>
            <Text style={styles.summaryMuted}> complete · </Text>
            <Text style={styles.summaryBright}>{formatCompletedFocusDuration(completedFocusMinutes)} focus</Text>
          </Text>
        </Animated.View>

        {/* ===================================================================
            ZONE 3: PERSISTENT CURVED CREAM DAY MAP SHEET (zIndex: 10)
            - Expands and collapses smoothly BEHIND the floating graphite dock
            - Supports both Pan gesture and Tap on the crest header
           =================================================================== */}
        <Animated.View
          style={[
            styles.curvedContent,
            {
              top: collapsedSheetTop,
              height: screenHeight - expandedSheetTop,
              borderTopLeftRadius: archBorderRadius,
              borderTopRightRadius: archBorderRadius,
            },
            animatedSheetStyle,
          ]}>
          <ChalkGrain paper />
          {/* Inner Pencilled Contour Seam Following the Arch */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.archPencilSeam,
              animatedSeamStyle,

            ]}
          />

          {/* Draggable & Tappable Day Map Arch Header */}
          <GestureDetector gesture={crestPanGesture}>
            <View style={styles.archHeaderDragZone}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSheetExpanded ? 'Collapse Day Map' : 'Expand Day Map'}
                accessibilityHint={isSheetExpanded ? 'Tap or pull this handle down to close. Scroll the page below for more.' : 'Tap or pull upward to open the Day Map.'}
                accessibilityActions={[{ name: 'expand', label: 'Open Day Map' }, { name: 'collapse', label: 'Close Day Map' }]}
                onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'expand') snapSheet(true); else if (event.nativeEvent.actionName === 'collapse') snapSheet(false); }}
                accessibilityState={{ expanded: isSheetExpanded }}
                onPress={() => snapSheet(!isSheetExpanded)}
                style={styles.archHeaderPressable}>
                <View style={styles.dragHandlePill} />
                <View style={styles.sheetHeadingRow}>
                  <Text style={styles.dayMapTitle}>Day map</Text>
                  <View style={styles.sheetHeadingMeta}>
                    <Text style={styles.dayMapSubtitle}>{progressSummary.done}/{totalTaskCount} done</Text>
                    <AppIcon name="chevron" size={16} color={chalkTheme.inkSoft} />
                  </View>
                </View>
              </Pressable>
            </View>
          </GestureDetector>

          <GestureDetector gesture={previewPanGesture}>
          <Animated.View
            pointerEvents={isSheetExpanded ? 'none' : 'auto'}
            accessibilityElementsHidden={isSheetExpanded}
            importantForAccessibility={isSheetExpanded ? 'no-hide-descendants' : 'auto'}
            style={[styles.compactPreview, animatedPreviewStyle]}>
            <View style={styles.previewComposition}>
            {dayMapStepsSummary.nextStep || dayMapStepsSummary.previewSteps[0] ? (
              <View style={styles.previewTrail}>
                <View pointerEvents="none" style={styles.previewPencilLine} />
                <TactileDayBrick
                  step={(dayMapStepsSummary.nextStep || dayMapStepsSummary.previewSteps[0])!}
                  xPct={10} yPx={30} scale={1.05}
                  onPress={() => openStepDetails((dayMapStepsSummary.nextStep || dayMapStepsSummary.previewSteps[0])!)}
                />
              </View>
            ) : null}
              <View style={styles.previewDetail}>
              {/* Left Column: NEXT UP */}
              <View style={styles.splitLeftCol}>
                <View style={styles.nextUpPillBadge}>
                  <Text style={styles.nextUpPillBadgeText}>{activeReview || activeFocus ? 'CONTINUE' : next || dayMapStepsSummary.nextStep ? 'NEXT UP' : totalTaskCount > 0 ? 'TODAY' : 'A FRESH PAGE'}</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    next
                      ? `Start ${next.topicName}, ${next.minutes} minutes`
                      : dayMapStepsSummary.nextStep
                        ? `Open ${dayMapStepsSummary.nextStep.title}`
                        : 'Add a study task'
                  }
                  onPress={() => {
                    if (activeReview) router.push('/(app)/review');
                    else if (activeFocus) router.push('/(app)/focus');
                    else if (next) startBlock(next);
                    else if (dayMapStepsSummary.nextStep) openStepDetails(dayMapStepsSummary.nextStep);
                    else router.push('/(app)/quick-add');
                  }}
                  style={({ pressed }) => [
                    styles.nextUpFocusCard,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.nextUpCopy}>
                    <Text numberOfLines={2} maxFontSizeMultiplier={1.6} style={styles.nextUpTitle}>
                      {activeReview
                        ? 'Recall queue'
                        : activeFocus
                          ? activeFocus.topicName
                          : next
                            ? next.topicName
                            : dayMapStepsSummary.nextStep
                              ? dayMapStepsSummary.nextStep.title
                              : totalTaskCount > 0 ? 'Your day is clear' : 'Make room for a task'}
                    </Text>
                    <Text numberOfLines={2} maxFontSizeMultiplier={1.6} style={styles.nextUpMeta}>
                      {activeReview
                        ? 'Resume active recall'
                        : activeFocus
                          ? 'Resume focus timer'
                          : next
                            ? `${next.minutes} min · ${next.mode === 'review' ? 'Active recall' : 'Deep work'}`
                            : dayMapStepsSummary.nextStep
                              ? `${dayMapStepsSummary.nextStep.minutes} min · Study task`
                              : totalTaskCount > 0 ? 'Add a step when you’re ready' : 'Tap to plan your first step'}
                    </Text>
                  </View>
                </Pressable>
              </View>

              </View>
            </View>
          </Animated.View>
          </GestureDetector>

          <Animated.View
            pointerEvents={isSheetExpanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!isSheetExpanded}
            importantForAccessibility={isSheetExpanded ? 'auto' : 'no-hide-descendants'}
            style={[styles.expandedBody, { marginBottom: dockClearance }, animatedDetailsStyle]}>
          <ScrollView
            ref={guide.scroll}
            testID="today-scroll"
            onScroll={(event) => {
              guide.offset.current = event.nativeEvent.contentOffset.y;
            }}
            onTouchStart={(event) => {
              const touch = event.nativeEvent.touches[0];
              scrollTouch.current = touch ? { x: touch.pageX, y: touch.pageY, offset: guide.offset.current } : null;
            }}
            onTouchCancel={() => { scrollTouch.current = null; }}
            onTouchEnd={(event) => {
              const start = scrollTouch.current;
              const touch = event.nativeEvent.changedTouches[0];
              scrollTouch.current = null;
              if (isSheetExpanded && start && touch && shouldCollapseFromScroll(start.offset, touch.pageX - start.x, touch.pageY - start.y)) snapSheet(false);
            }}
            scrollEventThrottle={16}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: dayMapCompletion.receipt || dayMapCompletion.notice ? 104 : 32 },
            ]}
            showsVerticalScrollIndicator={false}>
            {/* ===============================================================
                FULL TODAY RECOMMENDATION, CAPACITY & PLANNING DETAILS
                (Accessible via scrolling or expanding the Day Map sheet)
               =============================================================== */}
            <View style={styles.expandedDetailsSection}>
              <View style={styles.nextHeading}>
                <Text style={styles.nextLabel}>
                  {activeReview || activeFocus ? 'CONTINUE' : allTasksComplete && !next ? 'ALL DONE' : budgetFinished ? 'TODAY' : next ? 'UP NEXT' : 'TODAY'}
                </Text>
                <Text style={styles.todayDate}>
                  {new Date(now).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>

              <Animated.View
                pointerEvents={deferAnimating ? 'none' : 'auto'}
                accessibilityElementsHidden={deferAnimating}
                importantForAccessibility={deferAnimating ? 'no-hide-descendants' : 'auto'}
                style={heroMotion}>
                {activeReview ? (
                  <View style={styles.hero}>
                    <Text style={styles.heroMeta}>REVIEW IN PROGRESS</Text>
                    <Text style={styles.heroTitle}>
                      {activeReview.mixed ? 'Mixed recall queue' : 'Topic recall queue'}
                    </Text>
                    <Text style={styles.heroReason}>Your place is saved.</Text>
                    <View
                      ref={guide.anchors['today.next']}
                      collapsable={false}
                      testID="guide-today-next">
                      <AppButton
                        label="Resume review"
                        onPress={() => router.push('/(app)/review')}
                      />
                    </View>
                  </View>
                ) : activeFocus ? (
                  <View style={styles.hero}>
                    <Text style={styles.heroMeta}>
                      {activeFocus.phase === 'break' ? 'BREAK IN PROGRESS' : 'FOCUS IN PROGRESS'}
                    </Text>
                    <Text style={styles.heroTitle}>{activeFocus.topicName}</Text>
                    <Text style={styles.heroReason}>
                      The timer stays intact while you are away.
                    </Text>
                    <View
                      ref={guide.anchors['today.next']}
                      collapsable={false}
                      testID="guide-today-next">
                      <AppButton
                        label="Resume focus"
                        onPress={() => router.push('/(app)/focus')}
                      />
                    </View>
                  </View>
                ) : budgetFinished ? (
                  <View style={[styles.heroQuiet, styles.restNotice]}>
                    <Text style={[styles.heroTitle, styles.restTitle]}>
                      {sleepingAt(currentWorkspace.settings, now)
                        ? allTasksComplete ? 'All tasks complete.' : 'Time to rest.'
                        : 'You have used today’s study capacity.'}
                    </Text>
                    <Text style={styles.heroReason}>
                      {sleepingAt(currentWorkspace.settings, now)
                        ? allTasksComplete ? 'Your sleep window is protected. Plan again after you wake.' : 'Your tasks are saved. Plan again after you wake.'
                        : 'MYELIN will stay quiet unless your available time changes.'}
                    </Text>
                    <View
                      ref={guide.anchors['today.next']}
                      collapsable={false}
                      testID="guide-today-next">
                      <AppButton
                        label={
                          sleepingAt(currentWorkspace.settings, now)
                            ? 'Plan after rest'
                            : 'Adjust today'
                        }
                        variant="secondary"
                        onPress={() =>
                          sleepingAt(currentWorkspace.settings, now)
                            ? router.push('/(app)/today/day-map')
                            : setShowAdjust(true)
                        }
                      />
                    </View>
                  </View>
                ) : next ? (
                  <View style={styles.hero}>
                    <View style={styles.heroTop}>
                      <View style={styles.heroIdentity}>
                        <Text style={styles.heroMeta}>{next.subject}</Text>
                        <Text style={styles.heroTime}>
                          {next.source === 'task' && !next.focusable
                            ? 'Task'
                            : next.mode === 'review' && next.dueQuestionCount > 0
                              ? 'Active recall'
                              : 'Focus session'}{' '}
                          · {next.minutes} min
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.heroTitle}>{next.topicName}</Text>
                    {next.taskId ? (
                      <TaskDueLabel
                        task={currentWorkspace.tasks.find((task) => task.id === next.taskId)!}
                        now={now}
                      />
                    ) : null}
                    {!(
                      next.taskId &&
                      taskUrgency(
                        currentWorkspace.tasks.find((task) => task.id === next.taskId)!,
                        now,
                      )
                    ) ? (
                      <Text style={styles.heroReason}>
                        {next.reasons[0] === 'overdue'
                          ? 'A short session can help you catch up.'
                          : next.reasons[0] ??
                            (next.mode === 'review' ? 'Ready for recall' : 'Worth continuing')}
                      </Text>
                    ) : null}

                    <AnimatedDisclosure visible={showWhy} style={styles.whyBox}>
                      {next.reasons.map((reason) => (
                        <Text key={reason} style={styles.whyText}>
                          • {sentenceCase(reason)}
                        </Text>
                      ))}
                    </AnimatedDisclosure>

                    <View style={styles.heroActions}>
                      <View
                        ref={guide.anchors['today.next']}
                        collapsable={false}
                        testID="guide-today-next">
                        {next.taskId ? (
                          <TaskQuickActions
                            paper
                            onComplete={dayMapCompletion.complete}
                            task={currentWorkspace.tasks.find((task) => task.id === next.taskId)!}
                          />
                        ) : (
                          <AppButton
                            label={
                              next.source === 'task' && !next.focusable
                                ? 'Open task'
                                : next.mode === 'review' && next.dueQuestionCount > 0
                                  ? 'Start recall'
                                  : 'Start focus'
                            }
                            onPress={() => startBlock(next)}
                            style={styles.primaryAction}
                          />
                        )}
                      </View>
                      <View style={styles.heroSecondary}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: showWhy }}
                          accessibilityLabel={
                            showWhy ? 'Hide recommendation reasons' : 'Why this recommendation'
                          }
                          onPress={() => setShowWhy((current) => !current)}
                          style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                          <Text style={styles.textActionText}>
                            {showWhy ? 'Hide why' : 'Why this?'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Show the next recommendation instead of ${next.topicName}`}
                          onPress={() => deferWithTransition(next)}
                          disabled={deferAnimating}
                          style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                          <Text style={styles.textActionMuted}>Not now</Text>
                        </Pressable>
                      </View>
                      {next.taskId ? (
                        <View
                          style={{
                            backgroundColor: chalkTheme.paperRaised,
                            borderRadius: 14,
                            paddingHorizontal: 12,
                          }}>
                          <TaskUnstuck
                            task={currentWorkspace.tasks.find((task) => task.id === next.taskId)!}
                            enabled={
                              !deferAnimating &&
                              !guide.open &&
                              !transitionPending &&
                              focusReady &&
                              reviewReady
                            }
                            onSchedule={(request) => {
                              setScheduleRequest(request);
                              setShowInbox(true);
                              setShowOverdue(false);
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <View style={styles.heroQuiet}>
                    <Text style={styles.heroTitle}>Nothing urgent right now.</Text>
                    <Text style={styles.heroReason}>
                      You can add something new or come back when the next study item is ready.
                    </Text>
                    <View
                      ref={guide.anchors['today.next']}
                      collapsable={false}
                      testID="guide-today-next">
                      <AppButton
                        label="Add something"
                        onPress={() => router.push('/(app)/quick-add')}
                      />
                    </View>
                  </View>
                )}
              </Animated.View>

              <View style={[styles.splitRightCol, styles.timelineColumn]}>
                <View style={styles.sequenceHeadingRow}>
                  <Text style={styles.todayChecklistHeader}>DAY SEQUENCE</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Open schedule and adjust the day"
                    onPress={() => router.push('/(app)/today/day-map')} style={styles.scheduleShortcut}>
                    <Text style={styles.scheduleShortcutText}>Schedule & adjust  ›</Text>
                  </Pressable>
                </View>
            <DayMapPath reduceMotion={reduceMotionEnabled} steps={dayMapStepsSummary.steps} selectedId={selectedStepId} onSelect={step => setSelectedStepId(step.id)} />
            {selectedStepId ? (() => {
              const step = dayMapStepsSummary.steps.find(item => item.id === selectedStepId);
              const task = step?.taskId ? currentWorkspace.tasks.find(item => item.id === step.taskId) : null;
              if (!step) return null;
              return <View style={styles.selectedMapPanel}>
                <Text style={styles.selectedMapMeta}>{step.subject} · {step.minutes} min{step.overdue ? ' · Overdue' : ''}</Text>
                <Text style={styles.selectedMapTitle}>{step.title}</Text>
                {task && task.status === 'open' ? <TaskQuickActions task={task} paper onComplete={dayMapCompletion.complete} /> : null}
                <Pressable accessibilityRole="button" onPress={() => openStepDetails(step)} style={styles.selectedMapAction}>
                  <Text style={styles.scheduleShortcutText}>Open details & schedule  ›</Text>
                </Pressable>
              </View>;
            })() : null}
                {dayMapStepsSummary.steps.length > 0 ? (
                  <DayMapSequence
                    steps={dayMapStepsSummary.steps}
                    onOpen={openStepDetails}
                    onComplete={handleStepPress}
                    onReopen={(step) => { if (dayMapCompletion.receipt?.id === step.taskId) dayMapCompletion.undo(); else openStepDetails(step); }}
                  />
                ) : currentPlan.blocks.length > 0 ? (
                  currentPlan.blocks.map((block) => (
                    <Pressable
                      key={block.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${block.topicName}, ${block.minutes} minutes`}
                      onPress={() => startBlock(block)}
                      style={({ pressed }) => [
                        styles.checklistItemRow,
                        pressed && styles.pressed,
                      ]}>
                      <AppIcon name="checkbox" size={16} color={chalkTheme.graphite} />
                      <Text numberOfLines={1} style={styles.checklistItemText}>
                        {block.topicName}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/(app)/today/task/new')}
                    style={styles.checklistEmptyButton}>
                    <Text style={styles.checklistEmptyText}>+ Add today’s first task</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.supportArea}>
                {lastDeferred && lastDeferred.ownerKey === ownerKey ? (
                  <MotionItem key={`undo:${lastDeferred.source}:${lastDeferred.id}`} style={styles.undoRow}>
                    <View testID="today-defer-feedback" style={styles.undoCopy}>
                      <Text style={styles.undoTitle}>Moved out of today</Text>
                      <Text numberOfLines={1} style={styles.undoText}>
                        {lastDeferred.name}
                      </Text>
                      <Text style={styles.undoText}>
                        {lastDeferred.source === 'task'
                          ? 'Until tomorrow. Deadline unchanged.'
                          : 'Until tomorrow. Recall dates unchanged.'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Undo moving ${lastDeferred.name} out of today`}
                      onPress={undoWithTransition}
                      disabled={deferAnimating}
                      style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}>
                      <Text style={styles.undoButtonText}>Undo</Text>
                    </Pressable>
                  </MotionItem>
                ) : null}

                {deferNotice?.ownerKey === ownerKey && deferNotice ? (
                  <MotionItem key={deferNotice.message} style={styles.deferNotice}>
                    <Text
                      testID="today-defer-notice"
                      accessibilityLiveRegion="polite"
                      style={styles.undoText}>
                      {deferNotice.message}
                    </Text>
                  </MotionItem>
                ) : null}

                <TodayGuideOffer
                  visible={guideOffer.visible}
                  saveFailed={guideOffer.saveFailed}
                  onShow={() => {
                    guideOffer.choose('shown');
                    guide.start();
                  }}
                  onLater={() => guideOffer.choose('later')}
                  onRetry={guideOffer.retry}
                />

                {!activeFocus && !activeReview && next?.topicId ? (
                  <TodayAdaptationInsight
                    workspace={currentWorkspace}
                    topicId={next.topicId}
                    now={now}
                  />
                ) : null}

                {expiredReminder ? (
                  <View accessibilityRole="alert" style={styles.expiredReminder}>
                    <View style={styles.expiredReminderCopy}>
                      <Text style={styles.expiredReminderKicker}>REMINDER UPDATED</Text>
                      <Text style={styles.expiredReminderTitle}>
                        Reminder expired while MYELIN was opening
                      </Text>
                      <Text style={styles.expiredReminderText}>
                        The old {expiredReminderKind} timing is no longer trusted. MYELIN is
                        showing your latest safe plan instead.
                      </Text>
                    </View>
                    <View style={styles.expiredReminderActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open the latest safe current action"
                        onPress={openExpiredReminderFallback}
                        style={({ pressed }) => [
                          styles.expiredReminderPrimary,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.expiredReminderPrimaryText}>Open current action</Text>
                        <Text style={styles.expiredReminderArrow}>→</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss expired reminder notice"
                        onPress={dismissExpiredReminderFallback}
                        style={({ pressed }) => [
                          styles.expiredReminderDismiss,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.expiredReminderDismissText}>Dismiss</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {recoveredWindow && recoveredPlacement ? (
                  <View style={styles.recoveredToday}>
                    <View style={styles.recoveredTodayTop}>
                      <View style={styles.recoveredTodayCopy}>
                        <Text style={styles.recoveredTodayKicker}>RECOVERED WINDOW</Text>
                        <Text style={styles.recoveredTodayTitle}>
                          {recoveredPlacement.topicName}
                        </Text>
                      </View>
                      <Text style={styles.recoveredTodayBadge}>AUTOPILOT</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openRecoveredPlacement(recoveredPlacement)}
                      style={({ pressed }) => [
                        styles.recoveredTodayAction,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.recoveredTodayActionText}>View in Day Map</Text>
                      <Text style={styles.recoveredTodayArrow}>→</Text>
                    </Pressable>
                  </View>
                ) : null}

                {deadlineBreak ? (
                  <View accessibilityRole="alert" style={styles.deadlineWarning}>
                    <View style={styles.deadlineWarningCopy}>
                      <Text style={styles.deadlineWarningKicker}>CAPACITY WARNING</Text>
                      <Text style={styles.deadlineWarningTitle}>
                        {formatMinutes(deadlineBreak.overloadMinutes)} will not fit before{' '}
                        {formatDeadline(deadlineBreak.deadlineAt)}.
                      </Text>
                      {deadlineRelief ? (
                        <Text style={styles.deadlineWarningText}>
                          Reduce or reschedule {formatMinutes(deadlineRelief.suggestedMinutes)} from{' '}
                          {deadlineRelief.label}.
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {overdueCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Show overdue tasks"
                    accessibilityState={{ expanded: showOverdue }}
                    onPress={() => {
                      setShowOverdue((value) => !value);
                      setShowInbox(false);
                    }}
                    style={styles.overdueToggle}>
                    <Text style={styles.overdueText}>{overdueCount} overdue</Text>
                    <Text style={styles.summaryMeta}>
                      {showOverdue ? 'Hide' : 'View tasks'} {showOverdue ? '−' : '+'}
                    </Text>
                  </Pressable>
                ) : null}
                <AnimatedDisclosure visible={showOverdue}>
                  <StudyInboxCard overdueOnly />
                </AnimatedDisclosure>

                {saveError ? (
                  <Text accessibilityRole="alert" style={styles.saveError}>
                    Save issue: {saveError}
                  </Text>
                ) : null}

                <AutopilotReflowNotice summary={reflow} />

                <View style={styles.capacity}>
                  <View style={styles.capacityTop}>
                    <View style={styles.capacityCopy}>
                      <Text style={styles.capacityTitle}>
                        {currentPlan.remainingBudgetMinutes} min available
                      </Text>
                      <Text style={styles.capacityMeta}>
                        {currentPlan.alreadyUsedMinutes} min done
                        {currentWorkspace.settings.energy === 'low' ? ' · low energy' : ''}
                      </Text>
                    </View>
                    <View
                      ref={guide.anchors['today.adjust']}
                      collapsable={false}
                      testID="guide-today-adjust">
                      <SpringPressable
                        accessibilityRole="button"
                        accessibilityLabel="Adjust today's available time"
                        accessibilityState={{ expanded: showAdjust }}
                        onPress={() => setShowAdjust((value) => !value)}
                        lift={0}
                        style={styles.capacityAction}>
                        <Text style={styles.capacityActionText}>
                          {showAdjust ? 'Done' : 'Adjust'}
                        </Text>
                      </SpringPressable>
                    </View>
                  </View>
                  <AnimatedProgress
                    value={
                      currentPlan.budgetMinutes
                        ? currentPlan.alreadyUsedMinutes / currentPlan.budgetMinutes
                        : 0
                    }
                    accessibilityLabel={`${currentPlan.alreadyUsedMinutes} of ${currentPlan.budgetMinutes} available minutes used, including breaks`}
                  />
                </View>

                <AnimatedDisclosure visible={showAdjust} style={styles.adjustPanel}>
                  <View style={styles.adjustHeader}>
                    <View style={styles.adjustCopy}>
                      <Text style={styles.adjustTitle}>Available study time</Text>
                      <Text style={styles.adjustMeta}>
                        {currentWorkspace.settings.dailyMinutes} min ·{' '}
                        {currentPlan.remainingBudgetMinutes} min still open
                      </Text>
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.choiceRow}>
                    {BUDGETS.map((minutes) => (
                      <Choice
                        key={minutes}
                        label={
                          minutes < 60
                            ? `${minutes}m`
                            : minutes % 60 === 0
                              ? `${minutes / 60}h`
                              : `${minutes}m`
                        }
                        active={currentWorkspace.settings.dailyMinutes === minutes}
                        onPress={() => setBudget(minutes)}
                      />
                    ))}
                  </ScrollView>

                  <Text style={styles.adjustTitle}>Energy right now</Text>
                  <View style={styles.energyRow}>
                    <Choice
                      label="Low"
                      active={currentWorkspace.settings.energy === 'low'}
                      onPress={() => setEnergy('low')}
                      wide
                    />
                    <Choice
                      label="Normal"
                      active={currentWorkspace.settings.energy === 'normal'}
                      onPress={() => setEnergy('normal')}
                      wide
                    />
                  </View>
                  <View style={styles.paceActions}>
                    {!activeFocus && !activeReview && quickSession ? (
                      <SpringPressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open a ${quickSession.minutes} minute focus session for ${quickSession.topicName}`}
                        onPress={() => startBlock(quickSession, true)}
                        lift={0}
                        style={styles.paceChip}>
                        <Text style={styles.paceChipText}>
                          Just {quickSession.minutes} minutes →
                        </Text>
                      </SpringPressable>
                    ) : null}
                  </View>
                </AnimatedDisclosure>

                <View style={styles.shortcuts}>
                  <View
                    ref={guide.anchors['today.day-map']}
                    collapsable={false}
                    testID="guide-today-day-map"
                    style={styles.shortcutAnchor}>
                    <SpringPressable
                      accessibilityRole="button"
                      accessibilityLabel="Open Day Map"
                      onPress={() => router.push('/(app)/today/day-map')}
                      style={styles.shortcut}>
                      <Text style={styles.shortcutTitle}>Day Map</Text>
                      <Text style={styles.summaryMeta}>
                        {dayMap ? `${dayMap.entries.length} scheduled →` : 'Your schedule →'}
                      </Text>
                    </SpringPressable>
                  </View>
                  <SpringPressable
                    accessibilityRole="button"
                    accessibilityLabel="Show study tasks"
                    accessibilityState={{ expanded: showInbox }}
                    onPress={() => {
                      setShowInbox((value) => !value);
                      setShowOverdue(false);
                    }}
                    style={styles.shortcut}>
                    <Text style={styles.shortcutTitle}>Tasks · {openTaskCount}</Text>
                    <Text style={styles.summaryMeta}>
                      {showInbox ? 'Hide tasks −' : 'View all +'}
                    </Text>
                  </SpringPressable>
                </View>

                <AnimatedDisclosure visible={showInbox} style={styles.inboxWrap}>
                  <StudyInboxCard
                    scheduleRequest={scheduleRequest}
                    onScheduleRequestHandled={(request) =>
                      setScheduleRequest((current) => (current === request ? null : current))
                    }
                  />
                </AnimatedDisclosure>

                {restCount > 0 ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Rest of today"
                      accessibilityState={{ expanded: showRest }}
                      onPress={() => setShowRest((value) => !value)}
                      style={styles.restToggle}>
                      <View style={styles.capacityCopy}>
                        <Text style={styles.shortcutTitle}>Rest of today</Text>
                        <Text style={styles.summaryMeta}>
                          {[
                            laterBlocks.length ? `${laterBlocks.length} later` : '',
                            mistakeSummary.due ? `${mistakeSummary.due} corrections due` : '',
                            nextExam ? 'Upcoming exam' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Text style={styles.summaryMeta}>{showRest ? '−' : '+'}</Text>
                    </Pressable>
                    <AnimatedDisclosure visible={showRest}>
                      {laterBlocks.length ? (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>Later today</Text>
                          <View style={styles.flatList}>
                            {laterBlocks.map((block, index) => (
                              <MotionItem key={block.id} delay={Math.min(index * 35, 90)}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${block.topicName}. ${block.minutes} minutes.`}
                                  onPress={() => startBlock(block)}
                                  style={({ pressed }) => [
                                    styles.laterRow,
                                    pressed && styles.pressed,
                                  ]}>
                                  <View style={styles.laterCopy}>
                                    <Text style={styles.laterTitle}>{block.topicName}</Text>
                                    <Text style={styles.laterMeta}>
                                      {block.subject} ·{' '}
                                      {block.mode === 'review' ? 'Recall' : 'Focus'}
                                    </Text>
                                  </View>
                                  <Text style={styles.laterTime}>{block.minutes}m</Text>
                                </Pressable>
                              </MotionItem>
                            ))}
                          </View>
                        </View>
                      ) : null}
                      {nextExam ? (
                        <ActionRow
                          icon="calendar"
                          title={nextExam.name}
                          detail={examStatus(nextExam.date, now).label}
                          meta="Exam"
                          onPress={() =>
                            router.push({
                              pathname: '/(app)/exams/[examId]',
                              params: { examId: nextExam.id },
                            })
                          }
                        />
                      ) : null}
                    </AnimatedDisclosure>
                  </>
                ) : null}
              </View>
            </View>
          </ScrollView>
          {dayMapCompletion.receipt ? (
            <View accessibilityLiveRegion="polite" style={styles.completionFeedback}>
              <Text numberOfLines={2} style={styles.completionFeedbackText}>Completed {dayMapCompletion.receipt.title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Undo completing ${dayMapCompletion.receipt.title}`}
                onPress={dayMapCompletion.undo} style={styles.completionUndo}>
                <Text style={styles.completionUndoText}>Undo</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss completion message"
                onPress={dayMapCompletion.dismiss} style={styles.completionDismiss}>
                <Text style={styles.completionUndoText}>×</Text>
              </Pressable>
            </View>
          ) : dayMapCompletion.notice ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss task change message"
              accessibilityLiveRegion="polite" onPress={dayMapCompletion.dismiss} style={styles.completionFeedback}>
              <Text style={styles.completionFeedbackText}>{dayMapCompletion.notice}</Text>
              <Text style={styles.completionUndoText}>Dismiss</Text>
            </Pressable>
          ) : null}
          </Animated.View>
        </Animated.View>

        {/* ===================================================================
            ZONE 4: INDEPENDENT FLOATING GRAPHITE NAVIGATION DOCK (zIndex: 30)
            - Always anchored above Android system navigation inset
            - Expanding cream Day Map sheet slides cleanly BEHIND this layer
           =================================================================== */}
        <View pointerEvents="box-none" style={styles.floatingDockOverlay}>
        </View>
      </View>

      {guide.open ? (
        <ScreenGuide
          steps={guide.steps}
          anchors={guide.anchors}
          revealAnchor={guide.revealAnchor}
          onClose={guide.close}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Tactile 2-stud isometric Lego brick positioned along the ascending Day Map trail.
 * - Completed or current active bricks render in dusty blue (#7E98A4).
 * - The current step displays the 3 radiate chalk emphasis ticks (\ | /) above-left.
 * - Upcoming steps render in warm parchment cream (#DFD4C0).
 */
function TactileDayBrick({
  step,
  xPct,
  yPx,
  scale,
  onPress,
}: {
  step: DayMapStep;
  xPct: number;
  yPx: number;
  scale: number;
  onPress: () => void;
}) {
  const done = isBrickDone(step);
  const current = step.current;
  const isBlue = done || current;


  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${done ? 'Completed' : current ? 'Current next' : 'Upcoming'} step: ${step.title}`}
      onPress={onPress}
      style={[
        styles.tactileBrickAnchor,
        {
          left: `${xPct}%`,
          top: yPx,
          transform: [{ scale }],
        },
      ]}>
      {/* 3 Hand-Drawn Radiate Ticks (\ | /) Above Active Brick */}
      {current ? (
        <View pointerEvents="none" style={styles.radiateTicksWrap}>
          <View style={[styles.radiateTick, { transform: [{ rotate: '-28deg' }] }]} />
          <View style={[styles.radiateTick, { height: 11, marginTop: -3 }]} />
          <View style={[styles.radiateTick, { transform: [{ rotate: '28deg' }] }]} />
        </View>
      ) : null}

      {/* Soft Graphite Paper Drop Shadow */}


      <TimeBrick size={84} tone={isBlue ? 'current' : 'fixed'} />
    </Pressable>
  );
}

function Choice({
  label,
  active,
  onPress,
  wide = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        wide && styles.choiceWide,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function sentenceCase(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMinutes(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatDeadline(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

const styles = StyleSheet.create({
  previewPencilLine: { position: 'absolute', left: 0, right: 0, top: 60, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(63,56,46,.3)', transform: [{ rotate: '-12deg' }] },
  sheetHeadingRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
  sheetHeadingMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactPreview: { position: 'absolute', top: 90, left: 22, right: 22 },
  expandedBody: { flex: 1 },
  expandedSummary: { position: 'absolute', top: 58, left: 24, right: 24 },
  compactSummary: { top: 54 },
  compactSummaryDay: { fontSize: 27, lineHeight: 32 },
  compactSummarySentence: { fontSize: 13, lineHeight: 17, marginTop: 3 },
  summaryDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryDayGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDay: { color: chalkTheme.onStage, fontSize: 38, lineHeight: 44, fontWeight: '600', letterSpacing: -1 },
  summaryRedDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#D46A5E', marginTop: 3 },
  summaryDate: { color: chalkTheme.mutedCream, fontSize: 12, lineHeight: 16, textAlign: 'right' },
  summarySentence: { marginTop: 8, fontSize: 16, lineHeight: 22 },
  summaryMuted: { color: '#B7B0A1' },
  summaryBright: { color: chalkTheme.onStage, fontWeight: '600' },
  heroSketchLayer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  chalkNumber: { position: 'absolute', top: 4, left: 16, flexDirection: 'row', opacity: .14 },
  chalkArc: { position: 'absolute', top: 8, right: 38, width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderStyle: 'dotted', borderColor: 'rgba(242,231,208,.23)' },
  chalkGrid: { position: 'absolute', right: 24, top: 12, width: 27, height: 27, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' },
  chalkDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(242,231,208,.55)', marginHorizontal: 3 },
  chalkBox: { position: 'absolute', right: 32, bottom: 18, width: 10, height: 10, borderWidth: 1, borderColor: 'rgba(242,231,208,.26)' },
  chalkBoxSmall: { position: 'absolute', right: 49, bottom: 33, width: 5, height: 5, borderWidth: 1, borderColor: 'rgba(242,231,208,.20)' },
  safe: {
    flex: 1,
    backgroundColor: chalkTheme.hero,
  },
  screen: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: chalkTheme.hero,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  loadingText: {
    color: chalkTheme.mutedCream,
    ...type.meta,
  },

  // Zone 1: Top Editorial Bar
  editorialTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingHorizontal: 22,
    zIndex: 20,
  },
  wordmark: {
    color: chalkTheme.onStage,
    fontSize: 13,
    letterSpacing: 4.8,
    fontWeight: '600',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerControl: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerControlText: {
    color: chalkTheme.mutedCream,
    fontSize: 14,
  },

  // Zone 2: Charcoal Hero Stage
  heroStageContainer: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: 22,
    zIndex: 1,
  },
  headlineWrap: {
    marginTop: 6,
    marginBottom: 2,
  },
  editorialTitle: {
    color: chalkTheme.onStage,
    fontSize: 31,
    lineHeight: 38,
    fontFamily: 'serif',
    fontWeight: '400',
    letterSpacing: -0.6,
  },
  visualStage: {
    marginHorizontal: -22,
    backgroundColor: chalkTheme.hero,
    position: 'relative',
    overflow: 'hidden',
  },
  glStageShift: {
    flex: 1,
    marginLeft: -12,
    marginRight: 94,
  },
  telemetryStack: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(242,231,208,.16)',
  },
  telemetryPill: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  telemetryPillText: {
    color: chalkTheme.mutedCream, fontSize: 11, lineHeight: 16,
  },
  meniscusCalloutRow: {
    position: 'absolute',
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  heroProgressCallout: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  heroProgressPercent: {
    color: chalkTheme.onStage,
    fontSize: 42,
    lineHeight: 48,
    fontFamily: 'serif',
    fontStyle: 'italic',
  },
  heroProgressCaption: {
    color: chalkTheme.mutedCream,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    marginTop: 1,
  },

  // Zone 3: Curved Cream Paper Day Map Sheet (zIndex: 10)
  curvedContent: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: chalkTheme.paper,
    borderTopWidth: 1.5,
    borderColor: chalkTheme.paperContour,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
    zIndex: 10,
    overflow: 'hidden',
  },
  archPencilSeam: {
    position: 'absolute',
    top: 4,
    left: 5,
    right: 5,
    height: 120,
    borderTopWidth: 1,
    borderColor: 'rgba(44, 43, 40, 0.14)',
  },
  archHeaderDragZone: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  archHeaderPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    minHeight: 76,
    width: '100%',
  },
  dragHandlePill: {
    width: 28,
    height: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(63,56,46,.35)',
    marginBottom: 6,
  },
  dayMapTitle: {
    color: chalkTheme.graphite,
    fontSize: 25,
    lineHeight: 32,
    fontFamily: 'serif',
    fontWeight: '400',
    letterSpacing: -0.4,
  },
  dayMapSubtitle: {
    color: chalkTheme.inkSoft,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 0,
  },

  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: 22,
  },

  // Diagonal Isometric Brick Trail
  tactileBrickAnchor: {
    position: 'absolute',
    width: 68,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiateTicksWrap: {
    position: 'absolute',
    top: -14,
    left: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  radiateTick: {
    width: 2,
    height: 9,
    borderRadius: 1,
    backgroundColor: chalkTheme.graphite,
  },
  brickPaperShadow: {
    position: 'absolute',
    bottom: -1,
    width: 62,
    height: 15,
    borderRadius: 12,
    backgroundColor: 'rgba(44, 43, 40, 0.13)',
    shadowColor: '#50483D',
    shadowOpacity: .22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    transform: [{ rotate: '-8deg' }],
  },
  previewComposition: { flexDirection: 'row', alignItems: 'center', minHeight: 104, gap: 12 },
  previewTrail: { width: 82, height: 100, marginTop: 0, marginBottom: 0 },
  previewDetail: { flex: 1, minWidth: 0, paddingTop: 0, paddingBottom: 0 },
  selectedMapPanel: { padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,252,243,.30)', borderWidth: StyleSheet.hairlineWidth, borderColor: chalkTheme.paperLine, marginBottom: 10 },
  selectedMapMeta: { color: chalkTheme.inkSoft, fontSize: 12, lineHeight: 18 },
  selectedMapTitle: { color: chalkTheme.graphite, fontSize: 19, lineHeight: 25, fontWeight: '600', marginTop: 3 },
  selectedMapAction: { minHeight: 44, justifyContent: 'center' },
  sequenceHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scheduleShortcut: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  scheduleShortcutText: { color: chalkTheme.nextUpBadge, fontSize: 12, fontWeight: '600' },
  completionFeedback: { position: 'absolute', left: 18, right: 18, bottom: 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, backgroundColor: '#E2DFD3', borderColor: chalkTheme.paperLine, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, elevation: 5 },
  completionFeedbackText: { flex: 1, color: chalkTheme.graphite, fontSize: 13 },
  completionUndo: { minWidth: 56, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  completionDismiss: { minWidth: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  completionUndoText: { color: chalkTheme.nextUpBadge, fontWeight: '700', fontSize: 13 },
  completionNotice: { marginTop: 8, color: chalkTheme.inkSoft, fontSize: 13, lineHeight: 18 },
  timelineColumn: { width: '100%', flex: 0, gap: 0, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: chalkTheme.paperLine },
  splitLeftCol: {
    width: '100%',
    minWidth: 0,
  },
  nextUpPillBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: 4,
  },
  nextUpPillBadgeText: {
    color: chalkTheme.inkSoft,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.8,
  },
  nextUpFocusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: layout.minTouch,
    paddingVertical: 4,
  },
  nextUpCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextUpTitle: {
    color: chalkTheme.graphite,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  nextUpMeta: {
    color: chalkTheme.inkSoft,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'serif',
    fontStyle: 'italic',
    marginTop: 2,
  },
  splitRightCol: {
    flex: 1.04,
    minWidth: 0,
    gap: 6,
  },
  todayChecklistHeader: {
    color: chalkTheme.graphite,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    paddingVertical: 2,
  },
  checklistItemText: {
    flex: 1,
    color: chalkTheme.graphite,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  checklistEmptyButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  checklistEmptyText: {
    color: chalkTheme.inkSoft,
    fontSize: 13,
    fontFamily: 'serif',
    fontStyle: 'italic',
  },

  // Expanded Sheet Full Details & Support Area
  expandedDetailsSection: {
    marginTop: 6,
    paddingTop: 8,
  },
  nextHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.xs,
  },
  nextLabel: {
    color: chalkTheme.inkSoft,
    ...type.label,
  },
  todayDate: {
    color: chalkTheme.inkSoft,
    ...type.meta,
  },
  hero: {
    paddingTop: 6,
    paddingBottom: 16,
  },
  restNotice: { paddingTop: 2, paddingBottom: 0 },
  restTitle: { fontSize: 21, lineHeight: 27 },
  heroQuiet: {
    paddingVertical: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  heroMeta: {
    color: chalkTheme.nextUpBadge,
    ...type.label,
  },
  heroTime: {
    color: chalkTheme.inkSoft,
    ...type.meta,
    fontWeight: '600',
  },
  heroTitle: {
    color: chalkTheme.graphite,
    fontSize: 27,
    lineHeight: 34,
    fontFamily: 'serif',
    fontWeight: '400',
    marginTop: space.xs,
  },
  heroReason: {
    color: chalkTheme.inkSoft,
    ...type.body,
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  whyBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chalkTheme.paperLine,
    paddingTop: space.sm,
    marginBottom: space.md,
    gap: space.xs,
  },
  whyText: {
    color: chalkTheme.inkSoft,
    ...type.meta,
  },
  heroActions: {
    gap: space.xxs,
    marginTop: space.sm,
  },
  heroSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  primaryAction: {
    alignSelf: 'stretch',
    borderRadius: 30,
    minHeight: 52,
    backgroundColor: chalkTheme.progressBlue,
  },
  textAction: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textActionText: {
    color: chalkTheme.graphite,
    ...type.meta,
    fontWeight: '600',
  },
  textActionMuted: {
    color: chalkTheme.inkSoft,
    ...type.meta,
    fontWeight: '600',
  },
  supportArea: {
    paddingTop: 14,
    paddingBottom: space.lg,
  },
  deferNotice: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  undoRow: {
    minHeight: 58,
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: chalkTheme.paperRaised,
  },
  undoCopy: { flex: 1 },
  undoTitle: { color: chalkTheme.graphite, ...type.meta, fontWeight: '600' },
  undoText: { color: chalkTheme.inkSoft, ...type.meta, marginTop: 1 },
  undoButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: { color: chalkTheme.graphite, ...type.meta, fontWeight: '700' },
  saveError: { color: colors.danger, ...type.meta, marginTop: space.sm },
  expiredReminder: {
    marginTop: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paperRaised,
    padding: space.md,
  },
  expiredReminderCopy: { minWidth: 0 },
  expiredReminderKicker: { color: chalkTheme.graphite, ...type.label, fontSize: 10 },
  expiredReminderTitle: { color: chalkTheme.graphite, ...type.bodyStrong, marginTop: 4 },
  expiredReminderText: { color: chalkTheme.inkSoft, ...type.meta, marginTop: 4 },
  expiredReminderActions: { marginTop: space.sm, gap: space.xxs },
  expiredReminderPrimary: {
    minHeight: layout.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paper,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expiredReminderPrimaryText: { color: chalkTheme.graphite, ...type.label },
  expiredReminderArrow: { color: chalkTheme.graphite, fontSize: 17, lineHeight: 19 },
  expiredReminderDismiss: {
    minHeight: layout.minTouch,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  expiredReminderDismissText: { color: chalkTheme.inkSoft, ...type.meta, fontWeight: '600' },
  recoveredToday: {
    marginTop: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paperRaised,
    padding: space.md,
  },
  recoveredTodayTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  recoveredTodayCopy: { flex: 1, minWidth: 0 },
  recoveredTodayKicker: { color: chalkTheme.nextUpBadge, ...type.label, fontSize: 10 },
  recoveredTodayTitle: { color: chalkTheme.graphite, ...type.bodyStrong, marginTop: 3 },
  recoveredTodayBadge: {
    color: chalkTheme.nextUpBadge,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  recoveredTodayAction: {
    minHeight: layout.minTouch,
    marginTop: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paper,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveredTodayActionText: { color: chalkTheme.graphite, ...type.label },
  recoveredTodayArrow: { color: chalkTheme.graphite, fontSize: 17, lineHeight: 19 },
  deadlineWarning: {
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paperRaised,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  deadlineWarningCopy: { flex: 1, minWidth: 0 },
  deadlineWarningKicker: { color: colors.danger, ...type.label, fontSize: 10 },
  deadlineWarningTitle: { color: chalkTheme.graphite, ...type.bodyStrong, marginTop: 2 },
  deadlineWarningText: { color: chalkTheme.inkSoft, ...type.meta, marginTop: 3 },
  overdueToggle: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xxs,
  },
  overdueText: { color: chalkTheme.inkSoft, ...type.meta, fontWeight: '700' },
  summaryMeta: { color: chalkTheme.inkSoft, ...type.meta, flexShrink: 1 },
  shortcuts: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  shortcutAnchor: { flex: 1 },
  shortcut: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    padding: space.sm,
    gap: space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paperRaised,
    justifyContent: 'center',
  },
  shortcutTitle: { color: chalkTheme.graphite, ...type.bodyStrong },
  restToggle: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chalkTheme.paperLine,
  },
  capacity: { marginTop: space.sm, gap: space.xs },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  capacityCopy: { flex: 1, minWidth: 0 },
  capacityTitle: { color: chalkTheme.graphite, ...type.bodyStrong },
  capacityMeta: { color: chalkTheme.inkSoft, ...type.meta, marginTop: space.xxs },
  capacityAction: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  capacityActionText: { color: chalkTheme.graphite, ...type.meta, fontWeight: '700' },
  paceActions: { marginTop: space.sm, flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  paceChip: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paper,
  },
  paceChipText: { color: chalkTheme.graphite, ...type.meta },
  section: { marginTop: space.lg },
  sectionTitle: { color: chalkTheme.graphite, ...type.section, marginBottom: space.xs },
  flatList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chalkTheme.paperLine,
  },
  laterRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chalkTheme.paperLine,
  },
  laterCopy: { flex: 1 },
  laterTitle: { color: chalkTheme.graphite, ...type.bodyStrong },
  laterMeta: { color: chalkTheme.inkSoft, ...type.meta, marginTop: 2 },
  laterTime: { color: chalkTheme.graphite, ...type.meta, fontWeight: '600' },
  adjustPanel: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    backgroundColor: chalkTheme.paperRaised,
    padding: space.md,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
  },
  adjustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  adjustCopy: { flex: 1 },
  adjustTitle: { color: chalkTheme.graphite, ...type.bodyStrong },
  adjustMeta: { color: chalkTheme.inkSoft, ...type.meta, marginTop: 2 },
  choiceRow: { gap: space.xs, paddingVertical: space.md, paddingRight: space.lg },
  choice: {
    minHeight: layout.minTouch,
    minWidth: 62,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: chalkTheme.paperLine,
    backgroundColor: chalkTheme.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceWide: { flex: 1 },
  choiceActive: {
    borderColor: chalkTheme.graphite,
    backgroundColor: chalkTheme.progressBlue,
  },
  choiceText: { color: chalkTheme.graphite, ...type.meta, fontWeight: '600' },
  choiceTextActive: { color: chalkTheme.onStage },
  energyRow: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  inboxWrap: { marginTop: space.sm },

  // Zone 4: Independent Floating Graphite Dock Overlay (zIndex: 30)
  floatingDockOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 16,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: motion.pressScale }],
  },
});
