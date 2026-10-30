import { sleepingAt } from '@/src/features/adaptive/sleep-engine';
import { taskUrgency } from '@/src/features/planning/task-urgency';
import { TaskQuickActions, TaskDueLabel } from '@/src/features/planning/TaskQuickActions';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useScreenClock } from '@/src/features/planning/useScreenClock';
import { StudyInboxCard } from '@/src/features/planning/StudyInboxCard';
import { postponeTask } from '@/src/features/planning/task-engine';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { buildTodayPlan, nextLocalDayStart, PlanBlock } from '@/src/features/today/planner';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';
import { ScreenGuide } from '@/src/features/guides/ScreenGuide';
import { useTodayGuide } from '@/src/features/guides/useTodayGuide';

const BUDGETS = [10, 15, 30, 60, 90, 120, 180];

export default function TodayScreen() {
  const { status, workspace, updateWorkspace, saveError, ownerKey } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const { session: activeReview } = useReview();
  const { style: heroMotion, busy: deferAnimating, transition } = useRecommendationMotion();
  const [showAdjust, setShowAdjust] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [lastDeferred, setLastDeferred] = useState<
    | {
        source: 'topic';
        id: string;
        name: string;
        previousSnoozeUntil: number;
        previousPostponements: number;
      }
    | {
        source: 'task';
        id: string;
        name: string;
        previousPlanState: 'inbox' | 'today' | 'scheduled' | 'postponed';
        previousPostponedUntil: number;
        previousPostponements: number;
        previousLastPostponedAt: number;
        previousScheduledStart: number;
        previousScheduledEnd: number;
      }
    | null
  >(null);

  const now = useScreenClock();
  const plan = useMemo(
    () => (workspace ? buildTodayPlan(workspace, now) : null),
    [workspace, now],
  );
  const mistakeSummary = useMemo(
    () => (workspace ? mistakeCounts(workspace, now) : { due: 0, open: 0, resolved: 0, total: 0 }),
    [workspace, now],
  );
  const nextExam = useMemo(
    () => (workspace ? nearestUpcomingExam(workspace, now) : null),
    [workspace, now],
  );
  const guide = useTodayGuide(
    status !== 'loading' && status !== 'idle' && !!workspace && !!plan,
    ownerKey,
    activeReview ? 'review' : activeFocus ? 'focus' : plan && plan.remainingBudgetMinutes <= 0 ? 'rest' : plan?.nextBlock ? 'ready' : 'empty',
  );
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
  const laterBlocks = currentPlan.blocks
    .filter((block) => !next || block.id !== next.id)
    .slice(0, 3);
  const budgetFinished = currentPlan.remainingBudgetMinutes <= 0;
  const quickSession = shortSession(currentPlan);
  const overdueCount = currentWorkspace.tasks.filter(task => taskUrgency(task, now)?.overdue).length;
  const openTaskCount = currentWorkspace.tasks.filter(task => task.status === 'open').length;
  const restCount = laterBlocks.length + (mistakeSummary.due > 0 ? 1 : 0) + (nextExam ? 1 : 0);

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
    if (block.source === 'task' && block.taskId) {
      const task = currentWorkspace.tasks.find((item) => item.id === block.taskId);
      if (!task) return;
      setLastDeferred({
        source: 'task',
        id: task.id,
        name: task.title,
        previousPlanState: task.planState,
        previousPostponedUntil: task.postponedUntil,
        previousPostponements: task.postponements ?? 0,
        previousLastPostponedAt: task.lastPostponedAt ?? 0,
        previousScheduledStart: task.scheduledStart,
        previousScheduledEnd: task.scheduledEnd,
      });
      updateWorkspace((draft) => {
        const target = draft.tasks.find((item) => item.id === task.id);
        if (target) postponeTask(target, nextLocalDayStart(Date.now()));
      });
      return;
    }

    if (!block.topicId) return;
    const topic = currentWorkspace.topics.find((item) => item.id === block.topicId);
    if (!topic) return;

    const previousSnoozeUntil = topic.snoozeUntil;
    updateWorkspace((draft) => {
      const target = draft.topics.find((item) => item.id === block.topicId);
      if (target) { target.snoozeUntil = nextLocalDayStart(Date.now()); target.postponements = Math.min(100000, (target.postponements ?? 0) + 1); }
    });
    setLastDeferred({
      source: 'topic',
      id: topic.id,
      name: topic.name,
      previousSnoozeUntil,
      previousPostponements: topic.postponements ?? 0,
    });
  }

  function deferWithTransition(block: PlanBlock) {
    setShowWhy(false);
    transition(() => deferForToday(block));
  }

  function undoDefer() {
    if (!lastDeferred) return;
    updateWorkspace((draft) => {
      if (lastDeferred.source === 'topic') {
        const target = draft.topics.find((item) => item.id === lastDeferred.id);
        if (target) { target.snoozeUntil = lastDeferred.previousSnoozeUntil; target.postponements = lastDeferred.previousPostponements; }
        return;
      }

      const target = draft.tasks.find((item) => item.id === lastDeferred.id);
      if (!target) return;
      target.planState = lastDeferred.previousPlanState;
      target.postponedUntil = lastDeferred.previousPostponedUntil;
      target.postponements = lastDeferred.previousPostponements;
      target.lastPostponedAt = lastDeferred.previousLastPostponedAt;
      target.scheduledStart = lastDeferred.previousScheduledStart;
      target.scheduledEnd = lastDeferred.previousScheduledEnd;
      target.updatedAt = Date.now();
    });
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

          {overdueCount > 0 ? <Pressable
            accessibilityRole="button" accessibilityLabel="Show overdue tasks"
            accessibilityState={{ expanded: showOverdue }}
            onPress={() => { setShowOverdue(value => !value); setShowInbox(false); }}
            style={styles.overdueToggle}>
            <Text style={styles.overdueText}>● {overdueCount} overdue</Text>
            <Text style={styles.summaryMeta}>{showOverdue ? 'Hide' : 'View tasks'} {showOverdue ? '−' : '+'}</Text>
          </Pressable> : null}
          <AnimatedDisclosure visible={showOverdue}><StudyInboxCard overdueOnly /></AnimatedDisclosure>

          {lastDeferred ? (
            <MotionItem key={`undo:${lastDeferred.source}:${lastDeferred.id}`} style={styles.undoRow}>
              <View style={styles.undoCopy}>
                <Text style={styles.undoTitle}>Moved out of today</Text>
                <Text numberOfLines={1} style={styles.undoText}>{lastDeferred.name}</Text>
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

          {saveError ? <Text accessibilityRole="alert" style={styles.saveError}>Save issue: {saveError}</Text> : null}

          <View style={styles.capacity}>
            <View style={styles.capacityTop}>
              <View style={styles.capacityCopy}>
                <Text style={styles.capacityTitle}>{currentPlan.remainingBudgetMinutes} min available</Text>
                <Text style={styles.capacityMeta}>
                  {currentPlan.alreadyUsedMinutes} min done{workspace.settings.energy === 'low' ? ' · low energy' : ''}
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
            <StudyInboxCard />
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

const styles = StyleSheet.create({
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

  overdueToggle: { minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xxs },
  overdueText: { color: colors.danger, ...type.meta, fontWeight: '700' },
  summaryMeta: { color: colors.muted, ...type.meta, flexShrink: 1 },
  shortcuts: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  shortcutAnchor: { flex: 1, minWidth: 0 },
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
