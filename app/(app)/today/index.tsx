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

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedProgress } from '@/src/components/motion/AnimatedProgress';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  examStatus,
  nearestUpcomingExam,
} from '@/src/features/exams/exam-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { StudyInboxCard } from '@/src/features/planning/StudyInboxCard';
import { postponeTask } from '@/src/features/planning/task-engine';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { PlanBlockCard } from '@/src/features/today/PlanBlockCard';
import { buildTodayPlan, nextLocalDayStart, PlanBlock } from '@/src/features/today/planner';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const BUDGETS = [30, 60, 90, 120, 180];

export default function TodayScreen() {
  const { status, workspace, updateWorkspace, saveError } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const { session: activeReview } = useReview();
  const [lastDeferred, setLastDeferred] = useState<
    | {
        source: 'topic';
        id: string;
        name: string;
        previousSnoozeUntil: number;
      }
    | {
        source: 'task';
        id: string;
        name: string;
        previousPlanState: 'inbox' | 'today' | 'scheduled' | 'postponed';
        previousPostponedUntil: number;
        previousScheduledStart: number;
        previousScheduledEnd: number;
      }
    | null
  >(null);
  const now = Date.now();

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

  if (status === 'loading' || status === 'idle' || !workspace || !plan) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Building today’s plan…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;
  const next = plan.nextBlock;
  const budgetFinished = plan.remainingBudgetMinutes <= 0;
  const usedRatio = Math.min(1, plan.alreadyUsedMinutes / Math.max(1, plan.budgetMinutes));
  const usedPercent = Math.round(usedRatio * 100);

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
      if (target) target.snoozeUntil = nextLocalDayStart(Date.now());
    });
    setLastDeferred({
      source: 'topic',
      id: topic.id,
      name: topic.name,
      previousSnoozeUntil,
    });
  }

  function undoDefer() {
    if (!lastDeferred) return;
    updateWorkspace((draft) => {
      if (lastDeferred.source === 'topic') {
        const target = draft.topics.find((item) => item.id === lastDeferred.id);
        if (target) target.snoozeUntil = lastDeferred.previousSnoozeUntil;
        return;
      }

      const target = draft.tasks.find((item) => item.id === lastDeferred.id);
      if (!target) return;
      target.planState = lastDeferred.previousPlanState;
      target.postponedUntil = lastDeferred.previousPostponedUntil;
      target.scheduledStart = lastDeferred.previousScheduledStart;
      target.scheduledEnd = lastDeferred.previousScheduledEnd;
      target.updatedAt = Date.now();
    });
    setLastDeferred(null);
  }

  function startBlock(block: PlanBlock, selectedBreakMinutes: number) {
    if (activeReview) {
      router.push('/(app)/review');
      return;
    }

    if (activeFocus) {
      router.push('/(app)/focus');
      return;
    }

    if (block.source === 'task' && block.taskId && !block.topicId) {
      router.push({
        pathname: '/(app)/today/task/[taskId]',
        params: { taskId: block.taskId },
      });
      return;
    }

    if (block.mode === 'review' && block.dueQuestionCount > 0 && block.topicId) {
      router.push({
        pathname: '/(app)/review',
        params: { topicId: block.topicId },
      });
      return;
    }

    if (!block.topicId) return;

    router.push({
      pathname: '/(app)/focus',
      params: {
        topicId: block.topicId,
        ...(block.taskId ? { taskId: block.taskId } : {}),
        minutes: String(block.minutes),
        breakMinutes: String(selectedBreakMinutes),
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.screen}>
        <ScreenHeader
          eyebrow="TODAY"
          title={greeting()}
          subtitle="Know what matters, start the next useful thing, and let the rest stay quiet."
          actionLabel="Settings"
          onAction={() => router.push('/(app)/settings')}
        />

        <View style={styles.modeToggle}>
          <View style={[styles.modeButton, styles.modeButtonActive]}>
            <Text style={[styles.modeButtonText, styles.modeButtonTextActive]}>Flow</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Day Map"
            onPress={() => router.push('/(app)/today/day-map')}
            style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}>
            <Text style={styles.modeButtonText}>Day Map</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, styles.firstSectionLabel]}>
            {activeReview || activeFocus ? 'CONTINUE' : 'NEXT'}
          </Text>

          {activeReview ? (
            <Reveal delay={20} distance={8}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resume active review"
                onPress={() => router.push('/(app)/review')}
                style={({ pressed }) => [styles.activeReviewCard, styles.resumeHero, pressed && styles.pressed]}>
                <View>
                  <Text style={styles.activeReviewLabel}>REVIEW IN PROGRESS</Text>
                  <Text style={styles.resumeHeroTitle}>
                    {activeReview.mixed ? 'Mixed recall queue' : 'Topic recall queue'}
                  </Text>
                  <Text style={styles.resumeHeroMeta}>Your queue is saved exactly where you left it.</Text>
                </View>
                <Text style={styles.resumeHeroArrow}>Resume →</Text>
              </Pressable>
            </Reveal>
          ) : activeFocus ? (
            <Reveal delay={20} distance={8}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resume active focus session"
                onPress={() => router.push('/(app)/focus')}
                style={({ pressed }) => [styles.activeFocusCard, styles.resumeHero, pressed && styles.pressed]}>
                <View style={styles.resumeHeroCopy}>
                  <Text style={styles.activeFocusLabel}>
                    {activeFocus.phase === 'break' ? 'BREAK IN PROGRESS' : 'FOCUS IN PROGRESS'}
                  </Text>
                  <Text style={styles.resumeHeroTitle}>{activeFocus.topicName}</Text>
                  <Text style={styles.resumeHeroMeta}>The timer stays intact while you are away.</Text>
                </View>
                <Text style={styles.resumeHeroArrow}>Resume →</Text>
              </Pressable>
            </Reveal>
          ) : budgetFinished ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneMark}>✓</Text>
              <Text style={styles.doneTitle}>You have used today’s study capacity.</Text>
              <Text style={styles.doneText}>
                MYELIN will not invent more work just to keep the screen busy. Add time only if your
                day genuinely changed.
              </Text>
            </View>
          ) : next ? (
            <Reveal delay={20} distance={10}>
              <View style={styles.nextCard}>
                <View style={styles.nextGlow} />
                <View style={styles.nextTop}>
                  <View style={styles.nextTopCopy}>
                    <Text style={styles.nextSubject}>{next.subject.toUpperCase()}</Text>
                    <Text style={styles.nextMode}>
                      {next.mode === 'review' ? 'RECALL / REVIEW' : 'LEARN / PRACTISE'}
                    </Text>
                  </View>
                  <View style={styles.nextTime}>
                    <Text style={styles.nextMinutes}>{next.minutes}</Text>
                    <Text style={styles.nextMinLabel}>MIN</Text>
                  </View>
                </View>

                <Text style={styles.nextTitle}>{next.topicName}</Text>
                <Text style={styles.nextReason}>{next.reasons.join(' · ')}</Text>

                <View style={styles.nextActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Defer ${next.topicName} for today`}
                    onPress={() => deferForToday(next)}
                    style={({ pressed }) => [styles.deferButton, pressed && styles.pressed]}>
                    <Text style={styles.deferButtonText}>Not now</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Start ${next.topicName}`}
                    onPress={() => startBlock(next, plan.breakMinutes)}
                    style={({ pressed }) => [styles.nextAction, pressed && styles.pressed]}>
                    <Text style={styles.nextActionText}>
                      {next.source === 'task' && !next.focusable
                        ? 'Open task'
                        : next.mode === 'review' && next.dueQuestionCount > 0
                          ? 'Start recall'
                          : 'Start focus'}
                    </Text>
                    <Text style={styles.nextArrow}>→</Text>
                  </Pressable>
                </View>
              </View>
            </Reveal>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nothing needs your attention yet.</Text>
              <Text style={styles.emptyText}>
                Add a study task or Topic and MYELIN can turn it into a concrete next action.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/today/task/new')}
                style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                <Text style={styles.emptyButtonText}>Add study task</Text>
              </Pressable>
            </View>
          )}

          <Reveal delay={55} distance={7}>
            <View style={styles.summaryRow}>
              <SummaryMetric label="LEFT" value={`${plan.remainingBudgetMinutes}m`} accent />
              <SummaryMetric label="PLANNED" value={`${plan.plannedStudyMinutes}m`} />
              <SummaryMetric label="BLOCK" value={`${plan.targetFocusMinutes}m`} />
            </View>
          </Reveal>

          {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

          {(nextExam || mistakeSummary.due > 0) ? (
            <View style={styles.contextGroup}>
              {nextExam ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/exams/[examId]',
                      params: { examId: nextExam.id },
                    })
                  }
                  style={({ pressed }) => [styles.contextRow, pressed && styles.pressed]}>
                  <View style={styles.contextCopy}>
                    <Text style={styles.contextLabel}>NEXT EXAM</Text>
                    <Text style={styles.contextTitle}>{nextExam.name}</Text>
                  </View>
                  <Text style={styles.contextMeta}>{examStatus(nextExam.date, now).label} →</Text>
                </Pressable>
              ) : null}

              {mistakeSummary.due > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(app)/mistakes/retest')}
                  style={({ pressed }) => [styles.contextRow, pressed && styles.pressed]}>
                  <View style={styles.contextCopy}>
                    <Text style={[styles.contextLabel, styles.contextLabelDanger]}>RETEST</Text>
                    <Text style={styles.contextTitle}>
                      {mistakeSummary.due} {mistakeSummary.due === 1 ? 'correction is' : 'corrections are'} due
                    </Text>
                  </View>
                  <Text style={[styles.contextMeta, styles.contextMetaDanger]}>Review →</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <StudyInboxCard />

          {lastDeferred ? (
            <View style={styles.deferUndo}>
              <View style={styles.deferUndoCopy}>
                <Text style={styles.deferUndoTitle}>Moved out of today</Text>
                <Text style={styles.deferUndoText} numberOfLines={1}>
                  {lastDeferred.name}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo deferring ${lastDeferred.name}`}
                onPress={undoDefer}
                style={({ pressed }) => [styles.deferUndoButton, pressed && styles.pressed]}>
                <Text style={styles.deferUndoButtonText}>Undo</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>TUNE TODAY</Text>
          <View style={styles.controlCard}>
            <View style={styles.controlHeader}>
              <View>
                <Text style={styles.controlEyebrow}>AVAILABLE STUDY TIME</Text>
                <Text style={styles.controlValue}>{workspace.settings.dailyMinutes} min</Text>
              </View>
              <View style={styles.energyBadge}>
                <View
                  style={[
                    styles.energyDot,
                    workspace.settings.energy === 'low' && styles.energyDotLow,
                  ]}
                />
                <Text style={styles.energyBadgeText}>
                  {workspace.settings.energy === 'low' ? 'Low energy' : 'Normal energy'}
                </Text>
              </View>
            </View>

            <View
              accessible
              accessibilityLabel={`${plan.alreadyUsedMinutes} of ${plan.budgetMinutes} minutes used today. ${plan.remainingBudgetMinutes} minutes remaining.`}
              style={styles.capacityTrack}>
              <View style={styles.capacityProgressCopy}>
                <Text style={styles.capacityProgressTitle}>
                  {budgetFinished ? 'Capacity used' : `${plan.remainingBudgetMinutes} min left today`}
                </Text>
                <Text style={styles.capacityProgressMeta}>{usedPercent}% used</Text>
              </View>
              <AnimatedProgress
                value={usedRatio}
                accessibilityLabel={`${usedPercent}% of today’s study capacity used`}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.budgetRow}>
              {BUDGETS.map((minutes) => (
                <Choice
                  key={minutes}
                  label={minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`}
                  active={workspace.settings.dailyMinutes === minutes}
                  onPress={() => setBudget(minutes)}
                />
              ))}
            </ScrollView>

            <View style={styles.energyRow}>
              <Text style={styles.energyLabel}>Energy right now</Text>
              <View style={styles.energyChoices}>
                <Choice
                  label="Low"
                  active={workspace.settings.energy === 'low'}
                  onPress={() => setEnergy('low')}
                  compact
                />
                <Choice
                  label="Normal"
                  active={workspace.settings.energy === 'normal'}
                  onPress={() => setEnergy('normal')}
                  compact
                />
              </View>
            </View>
          </View>

          {plan.blocks.length > 0 ? (
            <>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.sectionLabel}>TODAY’S ORDER</Text>
                  <Text style={styles.planSubtitle}>
                    {plan.blocks.length} {plan.blocks.length === 1 ? 'block' : 'blocks'} ·{' '}
                    {plan.plannedTotalMinutes} min including breaks
                  </Text>
                </View>
                {plan.deferredTopicCount > 0 ? (
                  <Text style={styles.deferred}>{plan.deferredTopicCount} deferred</Text>
                ) : null}
              </View>

              {plan.blocks.map((block, index) => (
                <View key={block.id}>
                  {index > 0 ? (
                    <View style={styles.breakRow}>
                      <View style={styles.breakLine} />
                      <Text style={styles.breakText}>
                        {plan.breakMinutes} min break
                      </Text>
                      <View style={styles.breakLine} />
                    </View>
                  ) : null}
                  <PlanBlockCard block={block} index={index} onPress={() => startBlock(block, plan.breakMinutes)} />
                </View>
              ))}

              <View style={styles.logicNote}>
                <Text style={styles.logicTitle}>Why this order?</Text>
                <Text style={styles.logicText}>
                  Due recall and nearby exams get extra weight. High-priority and in-progress topics
                  rise too. Repeating the same subject back-to-back is penalised where another useful
                  option exists.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>

        <AppNav />
      </View>
    </SafeAreaView>
  );
}

function Choice({
  label,
  active,
  onPress,
  compact,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.choiceCompact,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SummaryMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.summaryMetric, accent && styles.summaryMetricAccent]}>
      <View style={[styles.summaryRail, accent && styles.summaryRailAccent]} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, accent && styles.summaryValueAccent]}>{value}</Text>
    </View>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 17) return 'Good afternoon.';
  return 'Good evening.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  scroll: { flex: 1 },
  modeToggle: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: spacing.lg,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  modeButtonText: { color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  modeButtonTextActive: { color: colors.accent },
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 42 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.muted, fontSize: 12 },
  controlCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  controlGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 150,
    top: -92,
    right: -48,
    backgroundColor: colors.accent,
    opacity: 0,
  },
  controlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  controlEyebrow: { color: colors.subtle, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.2 },
  controlValue: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
  capacityTrack: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  capacityProgressCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  capacityProgressTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  capacityProgressMeta: { color: colors.subtle, fontSize: 9, fontWeight: '700' },
  capacityTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
  },
  energyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  energyDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.success },
  energyDotLow: { backgroundColor: colors.accent },
  energyBadgeText: { color: colors.muted, fontSize: 9.5, fontWeight: '600' },
  budgetRow: { gap: 7, paddingTop: spacing.md, paddingBottom: 4 },
  choice: {
    minWidth: 48,
    minHeight: layout.minTouch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choiceCompact: { minHeight: layout.minTouch, minWidth: 68 },
  choiceActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  choiceText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  choiceTextActive: { color: colors.accent },
  energyRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  energyLabel: { color: colors.muted, fontSize: 11 },
  energyChoices: { flexDirection: 'row', gap: 7 },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.72)',
    overflow: 'hidden',
  },
  summaryMetric: {
    flex: 1,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  summaryMetricAccent: {
    backgroundColor: colors.accentFaint,
  },
  summaryRail: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  summaryRailAccent: { backgroundColor: colors.accent },
  summaryLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  summaryValueAccent: { color: colors.accentBright },
  saveError: { color: colors.danger, fontSize: 10.5, marginTop: 8 },
  examCard: {
    marginTop: 10,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panelWarm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  examLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  examTitle: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 },
  examWhen: { color: colors.accent, fontSize: 10.5, fontWeight: '700' },
  mistakeDueCard: {
    marginTop: 10,
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.2)',
    backgroundColor: 'rgba(255,161,145,0.045)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mistakeDueLabel: { color: colors.danger, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  mistakeDueTitle: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 },
  mistakeDueArrow: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  activeReviewCard: {
    marginTop: 10,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.22)',
    backgroundColor: 'rgba(180,216,174,0.055)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activeReviewLabel: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  activeReviewTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  activeReviewArrow: { color: colors.success, fontSize: 10.5, fontWeight: '700' },
  activeFocusCard: {
    marginTop: 10,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.26)',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activeFocusLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  activeFocusTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  activeFocusArrow: { color: colors.accent, fontSize: 10.5, fontWeight: '700' },
  resumeHero: {
    minHeight: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  resumeHeroCopy: { flex: 1 },
  resumeHeroTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '700', marginTop: 6 },
  resumeHeroMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5, maxWidth: 260 },
  resumeHeroArrow: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  contextGroup: {
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  contextRow: {
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  contextCopy: { flex: 1 },
  contextLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  contextLabelDanger: { color: colors.danger },
  contextTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  contextMeta: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  contextMetaDanger: { color: colors.danger },
  sectionLabel: {
    color: colors.subtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: 10,
  },
  firstSectionLabel: {
    marginTop: 14,
  },
  deferUndo: {
    minHeight: 58,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.20)',
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deferUndoCopy: { flex: 1 },
  deferUndoTitle: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  deferUndoText: { color: colors.subtle, fontSize: 9, marginTop: 3 },
  deferUndoButton: {
    minHeight: layout.minTouch,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  deferUndoButtonText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  nextCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.32)',
    backgroundColor: 'rgba(255,128,91,0.10)',
    padding: spacing.lg,
    shadowColor: colors.accent,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  nextGhost: {
    position: 'absolute',
    right: 12,
    bottom: 2,
    color: 'rgba(255,255,255,0.028)',
    fontSize: 74,
    fontWeight: '900',
    letterSpacing: -5,
  },
  nextGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 180,
    right: -88,
    top: -105,
    backgroundColor: colors.accent,
    opacity: 0.08,
  },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  nextTopCopy: { flex: 1 },
  nextSubject: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  nextMode: { color: colors.accent, fontSize: 8.5, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  nextTime: { alignItems: 'flex-end' },
  nextMinutes: { color: colors.accent, fontSize: 27, lineHeight: 28, fontWeight: '700' },
  nextMinLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  nextTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700', marginTop: 18, letterSpacing: -0.45 },
  nextReason: { color: colors.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  nextActions: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,128,91,0.17)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deferButton: {
    minHeight: layout.minTouch,
    minWidth: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  deferButtonText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  nextAction: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextActionText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  nextArrow: { color: colors.accent, fontSize: 18 },
  doneCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.2)',
    backgroundColor: 'rgba(180,216,174,0.055)',
    padding: spacing.lg,
  },
  doneMark: { color: colors.success, fontSize: 22 },
  doneTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 9 },
  doneText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  emptyButton: {
    alignSelf: 'flex-start',
    minHeight: layout.minTouch,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  emptyButtonText: { color: '#25140e', fontSize: 11, fontWeight: '800' },
  planHeader: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  planSubtitle: { color: colors.muted, fontSize: 10.5, marginTop: -5, marginBottom: 11 },
  deferred: { color: colors.subtle, fontSize: 9.5, marginBottom: 11 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  breakLine: { height: 1, backgroundColor: colors.line, flex: 1 },
  breakText: { color: colors.subtle, fontSize: 8.5, fontWeight: '600' },
  logicNote: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  logicTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  logicText: { color: colors.subtle, fontSize: 10, lineHeight: 16, marginTop: 5 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
});
