import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow } from '@/src/components/app/ActionRow';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppButton } from '@/src/components/app/AppButton';
import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { examStatus, nearestUpcomingExam } from '@/src/features/exams/exam-engine';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { StudyInboxCard } from '@/src/features/planning/StudyInboxCard';
import { postponeTask } from '@/src/features/planning/task-engine';
import { mistakeCounts } from '@/src/features/mistakes/mistake-engine';
import { useReview } from '@/src/features/review/ReviewProvider';
import { buildTodayPlan, nextLocalDayStart, PlanBlock } from '@/src/features/today/planner';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';

const BUDGETS = [30, 60, 90, 120, 180];

export default function TodayScreen() {
  const { status, workspace, updateWorkspace, saveError } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const { session: activeReview } = useReview();
  const reduceMotion = useReducedMotion();
  const heroProgress = useRef(new Animated.Value(1)).current;
  const deferredNextId = useRef<string | null>(null);
  const [deferAnimating, setDeferAnimating] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
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
  const nextId = plan?.nextBlock?.id ?? null;

  useEffect(() => {
    if (!deferAnimating || deferredNextId.current === nextId) return;

    deferredNextId.current = nextId;
    if (reduceMotion) {
      heroProgress.setValue(1);
      setDeferAnimating(false);
      return;
    }

    heroProgress.setValue(0);
    Animated.spring(heroProgress, {
      toValue: 1,
      useNativeDriver: true,
      ...motion.revealSpring,
    }).start(() => setDeferAnimating(false));
  }, [deferAnimating, heroProgress, nextId, reduceMotion]);

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
  const heroTranslateY = heroProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const heroScale = heroProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.975, 1],
  });

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

  function deferWithTransition(block: PlanBlock) {
    if (deferAnimating) return;

    setShowWhy(false);
    deferredNextId.current = block.id;

    if (reduceMotion) {
      deferForToday(block);
      return;
    }

    setDeferAnimating(true);
    Animated.timing(heroProgress, {
      toValue: 0,
      duration: motion.stateMs,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        heroProgress.setValue(1);
        setDeferAnimating(false);
        return;
      }
      deferForToday(block);
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

  function undoWithTransition() {
    if (!lastDeferred || deferAnimating) return;

    setShowWhy(false);
    deferredNextId.current = nextId;

    if (reduceMotion) {
      undoDefer();
      return;
    }

    setDeferAnimating(true);
    Animated.timing(heroProgress, {
      toValue: 0,
      duration: motion.stateMs,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        heroProgress.setValue(1);
        setDeferAnimating(false);
        return;
      }
      undoDefer();
    });
  }

  function startBlock(block: PlanBlock) {
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
          title={greeting()}
          actionLabel="Settings"
          onAction={() => router.push('/(app)/settings')}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.nextLabel}>
            {activeReview || activeFocus ? 'CONTINUE' : 'NEXT'}
          </Text>

          <Animated.View
            pointerEvents={deferAnimating ? 'none' : 'auto'}
            style={{
              opacity: heroProgress,
              transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
            }}>
            {activeReview ? (
              <View style={styles.hero}>
                <Text style={styles.heroMeta}>REVIEW IN PROGRESS</Text>
                <Text style={styles.heroTitle}>
                  {activeReview.mixed ? 'Mixed recall queue' : 'Topic recall queue'}
                </Text>
                <Text style={styles.heroReason}>Your place is saved.</Text>
                <AppButton label="Resume review" onPress={() => router.push('/(app)/review')} />
              </View>
            ) : activeFocus ? (
              <View style={styles.hero}>
                <Text style={styles.heroMeta}>
                  {activeFocus.phase === 'break' ? 'BREAK IN PROGRESS' : 'FOCUS IN PROGRESS'}
                </Text>
                <Text style={styles.heroTitle}>{activeFocus.topicName}</Text>
                <Text style={styles.heroReason}>The timer stays intact while you are away.</Text>
                <AppButton label="Resume focus" onPress={() => router.push('/(app)/focus')} />
              </View>
            ) : budgetFinished ? (
              <View style={styles.heroQuiet}>
                <Text style={styles.heroTitle}>You have used today’s study capacity.</Text>
                <Text style={styles.heroReason}>
                  MYELIN will stay quiet unless your available time changes.
                </Text>
                <AppButton
                  label="Adjust today"
                  variant="secondary"
                  onPress={() => setShowAdjust(true)}
                />
              </View>
            ) : next ? (
              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text style={styles.heroMeta}>{next.subject}</Text>
                  <Text style={styles.heroTime}>{next.minutes} min</Text>
                </View>

                <Text style={styles.heroTitle}>{next.topicName}</Text>
                <Text style={styles.heroReason}>
                  {next.reasons[0] ?? (next.mode === 'review' ? 'Ready for recall' : 'Worth continuing')}
                </Text>

                <AnimatedDisclosure visible={showWhy} style={styles.whyBox}>
                  {next.reasons.map((reason) => (
                    <Text key={reason} style={styles.whyText}>• {sentenceCase(reason)}</Text>
                  ))}
                </AnimatedDisclosure>

                <View style={styles.heroActions}>
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
                  <Pressable
                    accessibilityRole="button"
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
            ) : (
              <View style={styles.heroQuiet}>
                <Text style={styles.heroTitle}>Nothing urgent right now.</Text>
                <Text style={styles.heroReason}>
                  You can add something new or come back when the next study item is ready.
                </Text>
                <AppButton label="Add something" onPress={() => router.push('/(app)/quick-add')} />
              </View>
            )}
          </Animated.View>

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

          {saveError ? <Text style={styles.saveError}>Save issue: {saveError}</Text> : null}

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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Plan</Text>
            <View style={styles.flatList}>
              <ActionRow
                icon="today"
                title="Day Map"
                detail="See when study fits around the rest of your day."
                onPress={() => router.push('/(app)/today/day-map')}
              />
              <ActionRow
                icon="settings"
                title="Adjust today"
                detail={`${currentPlan.remainingBudgetMinutes} min available · ${workspace.settings.energy === 'low' ? 'low' : 'normal'} energy`}
                meta={showAdjust ? 'Hide' : 'Adjust'}
                onPress={() => setShowAdjust((current) => !current)}
              />
              {currentPlan.inboxTaskCount > 0 ? (
                <ActionRow
                  icon="library"
                  title={`${currentPlan.inboxTaskCount} unscheduled ${currentPlan.inboxTaskCount === 1 ? 'task' : 'tasks'}`}
                  detail="Captured, but not committed to today yet."
                  meta={showInbox ? 'Hide' : 'Open'}
                  onPress={() => setShowInbox((current) => !current)}
                />
              ) : null}
            </View>
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
          </AnimatedDisclosure>

          <AnimatedDisclosure
            visible={showInbox && currentPlan.inboxTaskCount > 0}
            style={styles.inboxWrap}>
            <StudyInboxCard />
          </AnimatedDisclosure>

          <View style={styles.bottomSpace} />
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

function greeting() {
  const hour = new Date().getHours();
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

  nextLabel: {
    color: colors.accent,
    ...type.label,
    marginBottom: space.xs,
  },
  hero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
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
    marginBottom: space.lg,
  },
  whyBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.sm,
    marginBottom: space.md,
    gap: space.xs,
  },
  whyText: { color: colors.textDim, ...type.meta },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  primaryAction: { minWidth: 150 },
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
    minHeight: 40,
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
