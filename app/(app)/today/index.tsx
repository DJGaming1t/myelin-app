import { TaskUnstuck, TaskScheduleRequest } from '@/src/features/today/TaskUnstuck';
import { sleepingAt } from '@/src/features/adaptive/sleep-engine';
import { TodayAdaptationInsight } from '@/src/features/adaptive/AdaptationInsights';
import { taskUrgency } from '@/src/features/planning/task-urgency';
import { TaskQuickActions, TaskDueLabel } from '@/src/features/planning/TaskQuickActions';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppButton } from '@/src/components/app/AppButton';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { StudySignal } from '@/src/features/today/StudySignal';
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
import { applyDeferral, canDefer, DeferralReceipt, restoreDeferral, undoAvailability } from '@/src/features/today/deferral';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { buildTodayPlan, nextLocalDayStart, PlanBlock } from '@/src/features/today/planner';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';

const BUDGETS = [10, 15, 30, 60, 90, 120, 180];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function TodayScreen() {
  const params = useLocalSearchParams<{
    reminderExpired?: string | string[];
    reminderKind?: string | string[];
  }>();
  const { status, workspace, updateWorkspace, saveError, ownerKey } = useWorkspace();
  const { session: activeFocus, ready: focusReady } = useFocus();
  const { session: activeReview, ready: reviewReady } = useReview();
  const { ready: onboardingReady, shouldShow: onboardingPending } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();
  const { style: heroMotion, busy: deferAnimating, transition } = useRecommendationMotion();
  const [showAdjust, setShowAdjust] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [scheduleRequest, setScheduleRequest] = useState<TaskScheduleRequest | null>(null);
  useEffect(() => { setScheduleRequest(null); }, [ownerKey]);
  const [showRest, setShowRest] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [reflow, setReflow] = useState<AutopilotReflowSummary | null>(null);
  const [lastDeferred, setLastDeferred] = useState<DeferralReceipt | null>(null);
  const [deferNotice, setDeferNotice] = useState<{ ownerKey: string; message: string } | null>(null);
  useEffect(() => { setLastDeferred(null); setDeferNotice(null); setReflow(null); }, [ownerKey]);

  const now = useScreenClock();
  const plan = useMemo(
    () => (workspace ? buildTodayPlan(workspace, now) : null),
    [workspace, now],
  );
  const recoveredWindows = useMemo(() => {
    if (!workspace) return [];
    const activeFocusRemaining =
      activeFocus?.phase === 'focus'
        ? timerRemainingMs(activeFocus, now)
        : 0;
    return buildAppliedReclaimedWindows(workspace, now, {
      horizonDays: 1,
      protectionLeadMinutes: 10,
      ...(activeFocusRemaining > 0
        ? {
            unavailableUntil:
              now + activeFocusRemaining,
            activeFocusTopicId:
              activeFocus?.topicId ?? null,
            activeFocusStartedAt:
              activeFocus?.startedAt ?? null,
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
  const guideReady = status === 'ready' && !!workspace && !!plan && !deferAnimating &&
    focusReady && reviewReady && onboardingReady && !onboardingPending && !transitionPending;
  const guide = useTodayGuide(
    guideReady,
    ownerKey,
    activeReview ? 'review' : activeFocus ? 'focus' : plan && plan.remainingBudgetMinutes <= 0 ? 'rest' : plan?.nextBlock ? 'ready' : 'empty',
  );
  const guideOffer = useTodayGuideOffer(ownerKey, guideReady && !activeFocus && !activeReview, guide.open);
  if (status === 'loading' || status === 'idle' || !workspace || !plan) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Choosing what matters next…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;
  const currentPlan = plan;
  const next = currentPlan.nextBlock;
  const expiredReminder =
    firstParam(params.reminderExpired) === '1';
  const expiredReminderKind =
    firstParam(params.reminderKind) ?? 'study';
  const laterBlocks = currentPlan.blocks
    .filter((block) => !next || block.id !== next.id)
    .slice(0, 3);
  const budgetFinished = currentPlan.remainingBudgetMinutes <= 0;
  const quickSession = shortSession(currentPlan);
  const overdueCount = currentWorkspace.tasks.filter(task => taskUrgency(task, now)?.overdue).length;
  const openTaskCount = currentWorkspace.tasks.filter(task => task.status === 'open').length;
  const deadlineBreak = currentPlan.deadlineFeasibility.firstOverloadedDeadline;
  const deadlineRelief = deadlineBreak?.reliefCandidates[0] ?? null;
  const restCount = laterBlocks.length + (mistakeSummary.due > 0 ? 1 : 0) + (nextExam ? 1 : 0);
  const recoveredWindow = recoveredWindows.find(
    (window) =>
      window.placements.some(
        (placement) => placement.end > now,
      ) ||
      window.protection,
  ) ?? null;
  const recoveredPlacement =
    recoveredWindow?.placements.find(
      (placement) => placement.end > now,
    ) ?? null;

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

  function openRecoveredPlacement(
    placement: ReclaimedStudyPlacement,
  ) {
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
        breakMinutes: String(
          currentWorkspace.settings.breakMinutes,
        ),
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
    let receipt: DeferralReceipt | null = null;
    const nextWorkspace = updateWorkspace(draft => {
      receipt = applyDeferral(draft, ownerKey, source, id, nextLocalDayStart(at), at);
    }, { ownerKey, canApply: current => canDefer(current, source, id, at) });
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
    const nextWorkspace = updateWorkspace(draft => { restoreDeferral(draft, receipt, at); }, {
      ownerKey: receipt.ownerKey,
      canApply: current => { availability = undoAvailability(current, receipt, at); return availability === 'available'; },
    });
    if (nextWorkspace) {
      setReflow(buildAutopilotReflowSummary(currentWorkspace, nextWorkspace, at));
      setDeferNotice({ ownerKey: receipt.ownerKey, message: 'Previous plan restored.' });
    } else setDeferNotice({ ownerKey: receipt.ownerKey, message: availability === 'expired'
      ? 'That deferral has ended. Your current plan was kept.'
      : 'This item changed after Not now. Your latest changes were kept.' });
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

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.screen}>
        <ScreenHeader
          variant="compact"
          title={greeting(now)}
          actionLabel="Settings"
          onAction={() => router.push('/(app)/settings')}
          onHelp={guide.start}
        />

        <ScrollView
          ref={guide.scroll}
          testID="today-scroll"
          onScroll={event => { guide.offset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.nextHeading}>
            <Text style={styles.nextLabel}>
              {activeReview || activeFocus ? 'CONTINUE' : 'NEXT'}
            </Text>
            <Text style={styles.todayDate}>{new Date(now).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
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
                <View ref={guide.anchors['today.next']} collapsable={false} testID="guide-today-next">
                  <AppButton label="Resume review" onPress={() => router.push('/(app)/review')} />
                </View>
              </View>
            ) : activeFocus ? (
              <View style={styles.hero}>
                <Text style={styles.heroMeta}>
                  {activeFocus.phase === 'break' ? 'BREAK IN PROGRESS' : 'FOCUS IN PROGRESS'}
                </Text>
                <Text style={styles.heroTitle}>{activeFocus.topicName}</Text>
                <Text style={styles.heroReason}>The timer stays intact while you are away.</Text>
                <View ref={guide.anchors['today.next']} collapsable={false} testID="guide-today-next">
                  <AppButton label="Resume focus" onPress={() => router.push('/(app)/focus')} />
                </View>
              </View>
            ) : budgetFinished ? (
              <View style={styles.heroQuiet}>
                <Text style={styles.heroTitle}>{sleepingAt(workspace.settings, now) ? 'Your sleep window is protected.' : 'You have used today’s study capacity.'}</Text>
                <Text style={styles.heroReason}>
                  {sleepingAt(workspace.settings, now) ? 'Your tasks are saved. Day Map can find a slot after you wake.' : 'MYELIN will stay quiet unless your available time changes.'}
                </Text>
                <View ref={guide.anchors['today.next']} collapsable={false} testID="guide-today-next"><AppButton
                  label={sleepingAt(workspace.settings, now) ? 'Plan after rest' : 'Adjust today'}
                  variant="secondary"
                  onPress={() => sleepingAt(workspace.settings, now) ? router.push('/(app)/today/day-map') : setShowAdjust(true)}
                /></View>
              </View>
            ) : next ? (
              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <View style={styles.heroIdentity}>
                    <Text style={styles.heroMeta}>{next.subject}</Text>
                    <Text style={styles.heroTime}>
                      {next.source === 'task' && !next.focusable ? 'Task' : next.mode === 'review' && next.dueQuestionCount > 0 ? 'Active recall' : 'Focus session'} · {next.minutes} min
                    </Text>
                  </View>
                  <StudySignal identity={next.id} />
                </View>

                <Text style={styles.heroTitle}>{next.topicName}</Text>
                {next.taskId ? <TaskDueLabel task={currentWorkspace.tasks.find(task => task.id === next.taskId)!} now={now} /> : null}
                {!(next.taskId && taskUrgency(currentWorkspace.tasks.find(task => task.id === next.taskId)!, now)) ? <Text style={styles.heroReason}>
                  {next.reasons[0] === 'overdue' ? 'A short session can help you catch up.' : next.reasons[0] ?? (next.mode === 'review' ? 'Ready for recall' : 'Worth continuing')}
                </Text> : null}

                <AnimatedDisclosure visible={showWhy} style={styles.whyBox}>
                  {next.reasons.map((reason) => (
                    <Text key={reason} style={styles.whyText}>• {sentenceCase(reason)}</Text>
                  ))}
                </AnimatedDisclosure>

                <View style={styles.heroActions}>
                  <View ref={guide.anchors['today.next']} collapsable={false} testID="guide-today-next">
                  {next.taskId ? <TaskQuickActions task={currentWorkspace.tasks.find(task => task.id === next.taskId)!} /> : <AppButton
                    label={
                      next.source === 'task' && !next.focusable
                        ? 'Open task'
                        : next.mode === 'review' && next.dueQuestionCount > 0
                          ? 'Start recall'
                          : 'Start focus'
                    }
                    onPress={() => startBlock(next)}
                    style={styles.primaryAction}
                  />}
                  </View>
                  <View style={styles.heroSecondary}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showWhy }}
                    accessibilityLabel={showWhy ? 'Hide recommendation reasons' : 'Why this recommendation'}
                    onPress={() => setShowWhy((current) => !current)}
                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                    <Text style={styles.textActionText}>{showWhy ? 'Hide why' : 'Why this?'}</Text>
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
                  {next.taskId ? <TaskUnstuck task={currentWorkspace.tasks.find(task => task.id === next.taskId)!}
                    enabled={!deferAnimating && !guide.open && !transitionPending && focusReady && reviewReady}
                    onSchedule={request => { setScheduleRequest(request); setShowInbox(true); setShowOverdue(false); }} /> : null}
                </View>
              </View>
            ) : (
              <View style={styles.heroQuiet}>
                <Text style={styles.heroTitle}>Nothing urgent right now.</Text>
                <Text style={styles.heroReason}>
                  You can add something new or come back when the next study item is ready.
                </Text>
                <View ref={guide.anchors['today.next']} collapsable={false} testID="guide-today-next">
                  <AppButton label="Add something" onPress={() => router.push('/(app)/quick-add')} />
                </View>
              </View>
            )}
          </Animated.View>

          {lastDeferred && lastDeferred.ownerKey === ownerKey ? (
            <MotionItem key={`undo:${lastDeferred.source}:${lastDeferred.id}`} style={styles.undoRow}>
              <View testID="today-defer-feedback" style={styles.undoCopy}>
                <Text style={styles.undoTitle}>Moved out of today</Text>
                <Text numberOfLines={1} style={styles.undoText}>{lastDeferred.name}</Text>
                <Text style={styles.undoText}>{lastDeferred.source === 'task' ? 'Until tomorrow. Deadline unchanged.' : 'Until tomorrow. Recall dates unchanged.'}</Text>
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

          {deferNotice?.ownerKey === ownerKey && deferNotice ? <MotionItem key={deferNotice.message} style={styles.deferNotice}><Text testID="today-defer-notice" accessibilityLiveRegion="polite" style={styles.undoText}>{deferNotice.message}</Text></MotionItem> : null}

          <TodayGuideOffer visible={guideOffer.visible} saveFailed={guideOffer.saveFailed}
            onShow={() => { guideOffer.choose('shown'); guide.start(); }}
            onLater={() => guideOffer.choose('later')} onRetry={guideOffer.retry} />

          {!activeFocus && !activeReview && next?.topicId ? (
            <TodayAdaptationInsight
              workspace={currentWorkspace}
              topicId={next.topicId}
              now={now}
            />
          ) : null}

          {expiredReminder ? (
            <View
              accessibilityRole="alert"
              style={styles.expiredReminder}>
              <View style={styles.expiredReminderCopy}>
                <Text style={styles.expiredReminderKicker}>
                  REMINDER UPDATED
                </Text>
                <Text style={styles.expiredReminderTitle}>
                  Reminder expired while MYELIN was opening
                </Text>
                <Text style={styles.expiredReminderText}>
                  The old {expiredReminderKind} timing is no longer trusted.
                  MYELIN is showing your latest safe plan instead.
                </Text>
                <Text style={styles.expiredReminderMeta}>
                  {activeReview
                    ? 'Current action · Resume review'
                    : activeFocus
                      ? `Current action · Resume ${activeFocus.topicName}`
                      : next
                        ? `Current action · ${next.topicName} · ${next.minutes}m`
                        : 'Current action · Open Day Map'}
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
                  <Text style={styles.expiredReminderPrimaryText}>
                    {activeReview
                      ? 'Resume review'
                      : activeFocus
                        ? 'Resume focus'
                        : next
                          ? next.mode === 'review' &&
                            next.dueQuestionCount > 0
                            ? 'Start current recall'
                            : 'Start current focus'
                          : 'Open Day Map'}
                  </Text>
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
                  <Text style={styles.expiredReminderDismissText}>
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {recoveredWindow && recoveredPlacement ? (
            <View style={styles.recoveredToday}>
              <View style={styles.recoveredTodayTop}>
                <View style={styles.recoveredTodayCopy}>
                  <Text style={styles.recoveredTodayKicker}>
                    RECOVERED WINDOW
                  </Text>
                  <Text style={styles.recoveredTodayTitle}>
                    {recoveredPlacement.topicName}
                  </Text>
                  <Text style={styles.recoveredTodayMeta}>
                    {new Date(recoveredPlacement.start).toLocaleDateString(
                      undefined,
                      {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      },
                    )}{' '}
                    ·{' '}
                    {new Intl.DateTimeFormat(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(
                      new Date(recoveredPlacement.start),
                    )}{' '}
                    · {recoveredPlacement.minutes}m
                  </Text>
                </View>
                <Text style={styles.recoveredTodayBadge}>
                  AUTOPILOT
                </Text>
              </View>
              <Text style={styles.recoveredTodayReason}>
                {recoveredWindow.protection?.reason === 'active-focus'
                  ? 'Protected from your current Focus session. MYELIN moved this block instead of letting it become a miss.'
                  : recoveredWindow.protection?.reason === 'schedule-change'
                    ? 'Repacked around a later schedule change before it could become a miss.'
                    : 'This block uses time recovered from a skipped tuition/coaching occurrence.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  recoveredWindow.protection ||
                  activeFocus ||
                  activeReview ||
                  recoveredPlacement.start >
                    now + 15 * 60_000
                    ? 'Open recovered block in Day Map'
                    : `Start recovered focus for ${recoveredPlacement.topicName}`
                }
                onPress={() =>
                  openRecoveredPlacement(recoveredPlacement)
                }
                style={({ pressed }) => [
                  styles.recoveredTodayAction,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.recoveredTodayActionText}>
                  {recoveredWindow.protection ||
                  activeFocus ||
                  activeReview ||
                  recoveredPlacement.start >
                    now + 15 * 60_000
                    ? 'View in Day Map'
                    : 'Start recovered focus'}
                </Text>
                <Text style={styles.recoveredTodayArrow}>→</Text>
              </Pressable>
            </View>
          ) : null}

          {deadlineBreak ? (
            <View
              accessibilityRole="alert"
              style={styles.deadlineWarning}>
              <View style={styles.deadlineWarningCopy}>
                <Text style={styles.deadlineWarningKicker}>CAPACITY WARNING</Text>
                <Text style={styles.deadlineWarningTitle}>
                  {formatMinutes(deadlineBreak.overloadMinutes)} will not fit before{' '}
                  {formatDeadline(deadlineBreak.deadlineAt)}.
                </Text>
                <Text style={styles.deadlineWarningText}>
                  {deadlineRelief
                    ? `${deadlineRelief.movable ? 'Move or reduce' : 'Reduce scope or add capacity for'} ${formatMinutes(deadlineRelief.suggestedMinutes)} from ${deadlineRelief.label}.`
                    : deadlineBreak.extraMinutesPerAvailableDay
                      ? `You need about ${formatMinutes(deadlineBreak.extraMinutesPerAvailableDay)} more per available day.`
                      : 'The current deadline window has no remaining safe capacity.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  deadlineRelief?.kind === 'task'
                    ? 'Review tasks causing the capacity warning'
                    : 'Review exams causing the capacity warning'
                }
                onPress={() => {
                  if (deadlineRelief?.kind === 'task') {
                    setShowInbox(true);
                    setShowOverdue(false);
                    return;
                  }
                  router.push('/(app)/exams');
                }}
                style={({ pressed }) => [styles.deadlineWarningAction, pressed && styles.pressed]}>
                <Text style={styles.deadlineWarningActionText}>
                  {deadlineRelief?.kind === 'task' ? 'Review tasks' : 'Review exams'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {overdueCount > 0 ? <Pressable
            accessibilityRole="button" accessibilityLabel="Show overdue tasks"
            accessibilityState={{ expanded: showOverdue }}
            onPress={() => { setShowOverdue(value => !value); setShowInbox(false); }}
            style={styles.overdueToggle}>
            <Text style={styles.overdueText}>● {overdueCount} overdue</Text>
            <Text style={styles.summaryMeta}>{showOverdue ? 'Hide' : 'View tasks'} {showOverdue ? '−' : '+'}</Text>
          </Pressable> : null}
          <AnimatedDisclosure visible={showOverdue}><StudyInboxCard overdueOnly /></AnimatedDisclosure>


          {saveError ? <Text accessibilityRole="alert" style={styles.saveError}>Save issue: {saveError}</Text> : null}

          <AutopilotReflowNotice summary={reflow} />

          <View style={styles.capacity}>
            <View style={styles.capacityTop}>
              <View style={styles.capacityCopy}>
                <Text style={styles.capacityTitle}>{currentPlan.remainingBudgetMinutes} min available</Text>
                <Text style={styles.capacityMeta}>
                  {currentPlan.alreadyUsedMinutes} min done{workspace.settings.energy === 'low' ? ' · low energy' : ''}
                </Text>
                <Text style={styles.capacityLedgerMeta}>
                  Tasks + exam work share one mileage pool
                  {currentPlan.workloadLedger.deduplicatedMinutes > 0
                    ? ` · ${currentPlan.workloadLedger.deduplicatedMinutes} min merged`
                    : ''}
                </Text>
              </View>
              <View ref={guide.anchors['today.adjust']} collapsable={false} testID="guide-today-adjust"><SpringPressable
                accessibilityRole="button"
                accessibilityLabel="Adjust today's available time"
                accessibilityState={{ expanded: showAdjust }}
                onPress={() => setShowAdjust((value) => !value)}
                lift={0}
                style={styles.capacityAction}>
                <Text style={styles.capacityActionText}>{showAdjust ? 'Done' : 'Adjust'}</Text>
              </SpringPressable></View>
            </View>
            <AnimatedProgress
              value={currentPlan.budgetMinutes ? currentPlan.alreadyUsedMinutes / currentPlan.budgetMinutes : 0}
              accessibilityLabel={`${currentPlan.alreadyUsedMinutes} of ${currentPlan.budgetMinutes} available minutes used, including breaks`}
            />
          </View>

          <AnimatedDisclosure visible={showAdjust} style={styles.adjustPanel}>
              <View style={styles.adjustHeader}>
                <View style={styles.adjustCopy}>
                  <Text style={styles.adjustTitle}>Available study time</Text>
                  <Text style={styles.adjustMeta}>
                    {workspace.settings.dailyMinutes} min · {currentPlan.remainingBudgetMinutes} min still open
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
                    label={minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`}
                    active={workspace.settings.dailyMinutes === minutes}
                    onPress={() => setBudget(minutes)}
                  />
                ))}
              </ScrollView>

              <Text style={styles.adjustTitle}>Energy right now</Text>
              <View style={styles.energyRow}>
                <Choice
                  label="Low"
                  active={workspace.settings.energy === 'low'}
                  onPress={() => setEnergy('low')}
                  wide
                />
                <Choice
                  label="Normal"
                  active={workspace.settings.energy === 'normal'}
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
                  <Text style={styles.paceChipText}>Just {quickSession.minutes} minutes →</Text>
                </SpringPressable>
              ) : null}
            </View>
          </AnimatedDisclosure>


          <View style={styles.shortcuts}>
            <View ref={guide.anchors['today.day-map']} collapsable={false} testID="guide-today-day-map" style={styles.shortcutAnchor}>
            <SpringPressable accessibilityRole="button" accessibilityLabel="Open Day Map"
              onPress={() => router.push('/(app)/today/day-map')} style={styles.shortcut}>
              <Text style={styles.shortcutTitle}>Day Map</Text><Text style={styles.summaryMeta}>Your schedule →</Text>
            </SpringPressable>
            </View>
            <SpringPressable accessibilityRole="button" accessibilityLabel="Show study tasks"
              accessibilityState={{ expanded: showInbox }}
              onPress={() => { setShowInbox(value => !value); setShowOverdue(false); }} style={styles.shortcut}>
              <Text style={styles.shortcutTitle}>Tasks · {openTaskCount}</Text><Text style={styles.summaryMeta}>{showInbox ? 'Hide tasks −' : 'View all +'}</Text>
            </SpringPressable>
          </View>

          <AnimatedDisclosure
            visible={showInbox}
            style={styles.inboxWrap}>
            <StudyInboxCard scheduleRequest={scheduleRequest} onScheduleRequestHandled={request => setScheduleRequest(current => current === request ? null : current)} />
          </AnimatedDisclosure>

          {restCount > 0 ? <>
            <Pressable accessibilityRole="button" accessibilityLabel="Rest of today"
              accessibilityState={{ expanded: showRest }} onPress={() => setShowRest(value => !value)}
              style={styles.restToggle}>
              <View style={styles.capacityCopy}><Text style={styles.shortcutTitle}>Rest of today</Text>
                <Text style={styles.summaryMeta}>{[laterBlocks.length ? `${laterBlocks.length} later` : '', mistakeSummary.due ? `${mistakeSummary.due} corrections due` : '', nextExam ? 'Upcoming exam' : ''].filter(Boolean).join(' · ')}</Text>
              </View><Text style={styles.summaryMeta}>{showRest ? '−' : '+'}</Text>
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
                    style={({ pressed }) => [styles.laterRow, pressed && styles.pressed]}>
                    <View style={styles.laterCopy}>
                      <Text style={styles.laterTitle}>{block.topicName}</Text>
                      <Text style={styles.laterMeta}>
                        {block.subject} · {block.mode === 'review' ? 'Recall' : 'Focus'}
                      </Text>
                    </View>
                    <Text style={styles.laterTime}>{block.minutes}m</Text>
                  </Pressable>
                  {block.taskId ? <View style={{ paddingBottom: 12 }}><TaskDueLabel task={currentWorkspace.tasks.find(task => task.id === block.taskId)!} now={now} /><TaskQuickActions task={currentWorkspace.tasks.find(task => task.id === block.taskId)!} /></View> : null}
                  </MotionItem>
                ))}
              </View>
            </View>
          ) : null}

          {(nextExam || mistakeSummary.due > 0) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <View style={styles.flatList}>
                {mistakeSummary.due > 0 ? (
                  <ActionRow
                    icon="review"
                    title={`${mistakeSummary.due} ${mistakeSummary.due === 1 ? 'correction' : 'corrections'} due`}
                    detail="Retry them before they settle in."
                    meta="Review"
                    accent
                    onPress={() => router.push('/(app)/mistakes/retest')}
                  />
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
              </View>
            </View>
          ) : null}

            </AnimatedDisclosure>
          </> : null}

          <View style={styles.bottomSpace} />
        </ScrollView>

        <AppNav />
      </View>
      {guide.open ? <ScreenGuide steps={guide.steps} anchors={guide.anchors} revealAnchor={guide.revealAnchor} onClose={guide.close} /> : null}
    </SafeAreaView>
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

function greeting(now: number) {
  const hour = new Date(now).getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 17) return 'Good afternoon.';
  return 'Good evening.';
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
  shortcutAnchor: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  loadingText: { color: colors.muted, ...type.meta },

  expiredReminder: {
    marginTop: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    padding: space.md,
  },
  expiredReminderCopy: {
    minWidth: 0,
  },
  expiredReminderKicker: {
    color: colors.accent,
    ...type.label,
    fontSize: 10,
  },
  expiredReminderTitle: {
    color: colors.text,
    ...type.bodyStrong,
    marginTop: 4,
  },
  expiredReminderText: {
    color: colors.textDim,
    ...type.meta,
    marginTop: 4,
  },
  expiredReminderMeta: {
    color: colors.muted,
    ...type.meta,
    marginTop: space.xs,
    fontWeight: '600',
  },
  expiredReminderActions: {
    marginTop: space.sm,
    gap: space.xxs,
  },
  expiredReminderPrimary: {
    minHeight: layout.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panel,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expiredReminderPrimaryText: {
    color: colors.accent,
    ...type.label,
  },
  expiredReminderArrow: {
    color: colors.accent,
    fontSize: 17,
    lineHeight: 19,
  },
  expiredReminderDismiss: {
    minHeight: layout.minTouch,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  expiredReminderDismissText: {
    color: colors.textDim,
    ...type.meta,
    fontWeight: '600',
  },
  recoveredToday: {
    marginTop: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panel,
    padding: space.md,
  },
  recoveredTodayTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  recoveredTodayCopy: {
    flex: 1,
    minWidth: 0,
  },
  recoveredTodayKicker: {
    color: colors.accent,
    ...type.label,
    fontSize: 10,
  },
  recoveredTodayTitle: {
    color: colors.text,
    ...type.bodyStrong,
    marginTop: 3,
  },
  recoveredTodayMeta: {
    color: colors.muted,
    ...type.meta,
    marginTop: 2,
  },
  recoveredTodayBadge: {
    color: colors.accent,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  recoveredTodayReason: {
    color: colors.textDim,
    ...type.meta,
    marginTop: space.sm,
  },
  recoveredTodayAction: {
    minHeight: layout.minTouch,
    marginTop: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveredTodayActionText: {
    color: colors.accent,
    ...type.label,
  },
  recoveredTodayArrow: {
    color: colors.accent,
    fontSize: 17,
    lineHeight: 19,
  },
  deadlineWarning: {
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.22)',
    backgroundColor: 'rgba(255,165,150,0.055)',
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  deadlineWarningCopy: { flex: 1, minWidth: 0 },
  deadlineWarningKicker: { color: colors.danger, ...type.label, fontSize: 10 },
  deadlineWarningTitle: { color: colors.text, ...type.bodyStrong, marginTop: 2 },
  deadlineWarningText: { color: colors.textDim, ...type.meta, marginTop: 3 },
  deadlineWarningAction: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  deadlineWarningActionText: { color: colors.accent, ...type.label },
  overdueToggle: { minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xxs },
  overdueText: { color: colors.danger, ...type.meta, fontWeight: '700' },
  summaryMeta: { color: colors.muted, ...type.meta, flexShrink: 1 },
  shortcuts: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  shortcut: { flex: 1, minWidth: 0, minHeight: 66, padding: space.sm, gap: space.xxs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  shortcutTitle: { color: colors.text, ...type.bodyStrong },
  restToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  nextHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs, marginBottom: space.sm },
  todayDate: { color: colors.muted, ...type.meta },
  nextLabel: {
    color: colors.accent,
    ...type.label,
  },
  hero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderCurve: 'continuous',
    borderTopWidth: 2,
  },
  heroQuiet: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  heroIdentity: { flex: 1, minWidth: 0, gap: space.xxs },
  heroMeta: { color: colors.accent, ...type.label },
  heroTime: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  heroTitle: {
    color: colors.text,
    ...type.hero,
    marginTop: space.sm,
  },
  heroReason: {
    color: colors.muted,
    ...type.body,
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  whyBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.sm,
    marginBottom: space.md,
    gap: space.xs,
  },
  whyText: { color: colors.textDim, ...type.meta },
  heroActions: { gap: space.xxs, marginTop: space.sm },
  heroSecondary: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  primaryAction: { alignSelf: 'stretch' },
  textAction: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textActionText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  textActionMuted: { color: colors.subtle, ...type.meta, fontWeight: '600' },

  deferNotice: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  undoRow: {
    minHeight: 58,
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
  },
  undoCopy: { flex: 1 },
  undoTitle: { color: colors.text, ...type.meta, fontWeight: '600' },
  undoText: { color: colors.muted, ...type.meta, marginTop: 1 },
  undoButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: { color: colors.accent, ...type.meta, fontWeight: '700' },
  saveError: { color: colors.danger, ...type.meta, marginTop: space.sm },

  capacity: { marginTop: space.sm, gap: space.xs },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  capacityCopy: { flex: 1, minWidth: 0 },
  capacityLedgerMeta: { color: colors.subtle, ...type.meta, fontSize: 11, marginTop: 2 },
  capacityTitle: { color: colors.text, ...type.bodyStrong },
  capacityMeta: { color: colors.muted, ...type.meta, marginTop: space.xxs },
  capacityAction: { minHeight: layout.minTouch, paddingHorizontal: space.sm, justifyContent: 'center' },
  capacityActionText: { color: colors.accent, ...type.meta },
  paceActions: { marginTop: space.sm, flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  paceChip: { minHeight: layout.minTouch, paddingHorizontal: space.sm, paddingVertical: space.xs, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel },
  paceChipText: { color: colors.textDim, ...type.meta },
  section: { marginTop: space.xl },
  sectionTitle: { color: colors.text, ...type.section, marginBottom: space.xs },
  flatList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  laterRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  laterCopy: { flex: 1 },
  laterTitle: { color: colors.text, ...type.bodyStrong },
  laterMeta: { color: colors.muted, ...type.meta, marginTop: 2 },
  laterTime: { color: colors.textDim, ...type.meta, fontWeight: '600' },

  adjustPanel: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  adjustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  adjustCopy: { flex: 1 },
  adjustTitle: { color: colors.text, ...type.bodyStrong },
  adjustMeta: { color: colors.muted, ...type.meta, marginTop: 2 },
  choiceRow: { gap: space.xs, paddingVertical: space.md, paddingRight: space.lg },
  choice: {
    minHeight: layout.minTouch,
    minWidth: 62,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceWide: { flex: 1 },
  choiceActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  choiceText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  choiceTextActive: { color: colors.accent },
  energyRow: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  inboxWrap: { marginTop: space.sm },
  bottomSpace: { height: space.xl },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: motion.pressScale }],
  },
});
