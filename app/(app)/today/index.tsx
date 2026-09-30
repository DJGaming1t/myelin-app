import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  examStatus,
  nearestUpcomingExam,
} from '@/src/features/exams/exam-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { PlanBlockCard } from '@/src/features/today/PlanBlockCard';
import { buildTodayPlan, PlanBlock } from '@/src/features/today/planner';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const BUDGETS = [30, 60, 90, 120, 180];

export default function TodayScreen() {
  const { status, workspace, updateWorkspace, saveError } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const { session: activeReview } = useReview();
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

  function startBlock(block: PlanBlock, selectedBreakMinutes: number) {
    if (activeReview) {
      router.push('/(app)/review');
      return;
    }

    if (activeFocus) {
      router.push('/(app)/focus');
      return;
    }

    if (block.mode === 'review' && block.dueQuestionCount > 0) {
      router.push({
        pathname: '/(app)/review',
        params: { topicId: block.topicId },
      });
      return;
    }

    router.push({
      pathname: '/(app)/focus',
      params: {
        topicId: block.topicId,
        minutes: String(block.minutes),
        breakMinutes: String(selectedBreakMinutes),
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <ScreenHeader
          eyebrow="TODAY"
          title={greeting()}
          subtitle="A realistic plan from what is due, important, already in progress, and closest to an exam."
          actionLabel="Topics"
          onAction={() => router.push('/(app)/topics')}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.controlCard}>
            <View style={styles.controlHeader}>
              <View>
                <Text style={styles.controlEyebrow}>AVAILABLE TIME</Text>
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
              style={styles.capacityProgress}>
              <View style={styles.capacityProgressCopy}>
                <Text style={styles.capacityProgressTitle}>
                  {budgetFinished ? 'Daily capacity used' : `${plan.remainingBudgetMinutes} min left today`}
                </Text>
                <Text style={styles.capacityProgressMeta}>{usedPercent}% used</Text>
              </View>
              <View style={styles.capacityTrack}>
                <View style={[styles.capacityFill, { width: `${usedPercent}%` }]} />
              </View>
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

          <View style={styles.summaryRow}>
            <SummaryMetric label="USED" value={`${plan.alreadyUsedMinutes}m`} />
            <SummaryMetric label="STUDY" value={`${plan.plannedStudyMinutes}m`} />
            <SummaryMetric label="BREAKS" value={`${plan.plannedBreakMinutes}m`} />
            <SummaryMetric label="BLOCK" value={`${plan.targetFocusMinutes}m`} />
          </View>

          {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

          {nextExam ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(app)/exams/[examId]',
                  params: { examId: nextExam.id },
                })
              }
              style={({ pressed }) => [styles.examCard, pressed && styles.pressed]}>
              <View>
                <Text style={styles.examLabel}>NEXT EXAM</Text>
                <Text style={styles.examTitle}>{nextExam.name}</Text>
              </View>
              <Text style={styles.examWhen}>{examStatus(nextExam.date, now).label} →</Text>
            </Pressable>
          ) : null}

          {mistakeSummary.due > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/mistakes/retest')}
              style={({ pressed }) => [styles.mistakeDueCard, pressed && styles.pressed]}>
              <View>
                <Text style={styles.mistakeDueLabel}>CORRECTION RETEST</Text>
                <Text style={styles.mistakeDueTitle}>
                  {mistakeSummary.due} {mistakeSummary.due === 1 ? 'mistake is' : 'mistakes are'} due
                </Text>
              </View>
              <Text style={styles.mistakeDueArrow}>Retest →</Text>
            </Pressable>
          ) : null}

          {activeReview ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/review')}
              style={({ pressed }) => [styles.activeReviewCard, pressed && styles.pressed]}>
              <View>
                <Text style={styles.activeReviewLabel}>REVIEW IN PROGRESS</Text>
                <Text style={styles.activeReviewTitle}>
                  {activeReview.mixed ? 'Mixed recall queue' : 'Topic recall queue'}
                </Text>
              </View>
              <Text style={styles.activeReviewArrow}>Resume →</Text>
            </Pressable>
          ) : null}

          {activeFocus ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/focus')}
              style={({ pressed }) => [styles.activeFocusCard, pressed && styles.pressed]}>
              <View>
                <Text style={styles.activeFocusLabel}>
                  {activeFocus.phase === 'break' ? 'BREAK IN PROGRESS' : 'FOCUS IN PROGRESS'}
                </Text>
                <Text style={styles.activeFocusTitle}>{activeFocus.topicName}</Text>
              </View>
              <Text style={styles.activeFocusArrow}>Resume →</Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionLabel}>NEXT MOVE</Text>

          {budgetFinished ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneMark}>✓</Text>
              <Text style={styles.doneTitle}>Your time budget is already used.</Text>
              <Text style={styles.doneText}>
                MYELIN is not adding more work just to fill the screen. Increase today’s available
                time only if you genuinely have more time.
              </Text>
            </View>
          ) : next ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => startBlock(next, plan.breakMinutes)}
              style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}>
              <View style={styles.nextTop}>
                <View>
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

              <View style={styles.nextAction}>
                <Text style={styles.nextActionText}>
                  {activeReview
                    ? 'Resume review'
                    : activeFocus
                      ? 'Resume focus'
                      : next.mode === 'review' && next.dueQuestionCount > 0
                        ? 'Start recall'
                        : 'Start focus'}
                </Text>
                <Text style={styles.nextArrow}>→</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nothing to plan yet.</Text>
              <Text style={styles.emptyText}>
                Add a real topic first. MYELIN needs something concrete before it can choose what
                deserves your time.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/topics/new')}
                style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                <Text style={styles.emptyButtonText}>Add a topic</Text>
              </Pressable>
            </View>
          )}

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

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 42 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.muted, fontSize: 12 },
  controlCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  controlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  controlEyebrow: { color: colors.subtle, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.2 },
  controlValue: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
  capacityProgress: {
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
  capacityFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
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
  summaryRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  summaryMetric: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 9,
    justifyContent: 'space-between',
  },
  summaryLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  saveError: { color: colors.danger, fontSize: 10.5, marginTop: 8 },
  examCard: {
    marginTop: 10,
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.18)',
    backgroundColor: colors.panel,
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
  sectionLabel: {
    color: colors.subtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: 10,
  },
  nextCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.32)',
    backgroundColor: colors.accentSoft,
    padding: spacing.lg,
  },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  nextSubject: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  nextMode: { color: colors.accent, fontSize: 8.5, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  nextTime: { alignItems: 'flex-end' },
  nextMinutes: { color: colors.accent, fontSize: 27, lineHeight: 28, fontWeight: '700' },
  nextMinLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  nextTitle: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: '700', marginTop: spacing.lg },
  nextReason: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  nextAction: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,128,91,0.17)',
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
    minHeight: 41,
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
