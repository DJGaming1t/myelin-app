
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  addLocalDays,
  buildDayMap,
  rebuildRemainingDay,
  startOfLocalDay,
  suggestTaskSlots,
} from '@/src/features/planning/day-engine';
import {
  completeTask,
  postponeTask,
  scheduleTask,
  taskRemainingMinutes,
} from '@/src/features/planning/task-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function durationLabel(start: number, end: number) {
  return String(Math.max(0, Math.round((end - start) / 60000))) + 'm';
}

export default function DayMapScreen() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [now, setNow] = useState(Date.now());
  const [proposal, setProposal] = useState<ReturnType<typeof rebuildRemainingDay> | null>(null);
  const [showPlanning, setShowPlanning] = useState(false);

  const map = useMemo(
    () => (workspace ? buildDayMap(workspace, now) : null),
    [workspace, now],
  );

  if (!workspace || !map) return null;

  const flexible = workspace.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        task.planState === 'today' &&
        task.postponedUntil <= now,
    )
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

  function startTask(taskId: string) {
    const task = workspace!.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!task.topicId) {
      router.push({
        pathname: '/(app)/today/task/[taskId]',
        params: { taskId },
      });
      return;
    }

    const planned =
      taskRemainingMinutes(task) ||
      task.estimatedMinutes ||
      Math.max(5, Math.round((task.scheduledEnd - task.scheduledStart) / 60000)) ||
      workspace!.settings.focusMinutes;

    router.push({
      pathname: '/(app)/focus',
      params: {
        topicId: task.topicId,
        taskId: task.id,
        minutes: String(Math.max(5, Math.min(240, planned))),
        breakMinutes: String(workspace!.settings.breakMinutes),
      },
    });
  }

  function moveTask(taskId: string) {
    const task = workspace!.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const slot = suggestTaskSlots(workspace!, task, Date.now(), 1)[0];
    if (!slot) return;
    updateWorkspace((draft) => {
      const target = draft.tasks.find((item) => item.id === taskId);
      if (target) scheduleTask(target, slot.start, slot.end);
    });
    setNow(Date.now());
  }

  function markDone(taskId: string) {
    updateWorkspace((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (task) completeTask(task);
    });
    setNow(Date.now());
  }

  function skipToday(taskId: string) {
    const tomorrow = addLocalDays(startOfLocalDay(Date.now()), 1);
    updateWorkspace((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (task) postponeTask(task, tomorrow);
    });
    setNow(Date.now());
  }

  function buildProposal() {
    setProposal(rebuildRemainingDay(workspace!, Date.now()));
  }

  function applyProposal() {
    if (!proposal) return;
    updateWorkspace((draft) => {
      for (const move of proposal.moves) {
        const task = draft.tasks.find((item) => item.id === move.taskId);
        if (task) scheduleTask(task, move.start, move.end);
      }
    });
    setProposal(null);
    setNow(Date.now());
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <View style={styles.page}>
        <ScreenHeader
          variant="compact"
          title="Day Map"
          actionLabel="Add"
          onAction={() => router.push('/(app)/quick-add')}
          onBack={() => router.replace('/(app)/today')}
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.daySummary}>
            <Text style={styles.daySummaryText}>
              {map.plannedStudyMinutes}m planned
              {' · '}
              {Math.round(map.availableMinutes / 60 * 10) / 10}h open
            </Text>
            <Text style={[styles.daySummaryMeta, map.overloadMinutes > 0 && styles.daySummaryWarning]}>
              {map.overloadMinutes > 0 ? `${map.overloadMinutes}m over capacity` : `${map.free.length} free ${map.free.length === 1 ? 'window' : 'windows'}`}
            </Text>
          </View>

          {map.overloadMinutes > 0 ? (
            <View style={styles.overload}>
              <Text style={styles.overloadLabel}>TODAY IS OVERLOADED</Text>
              <Text style={styles.overloadTitle}>
                About {map.overloadMinutes} more study minutes are planned than fit the current free windows.
              </Text>
              <View style={styles.overloadActions}>
                <Action label="Rebalance" onPress={buildProposal} accent />
                <Action label="Keep it" onPress={() => setProposal(null)} />
              </View>
            </View>
          ) : null}

          {proposal ? (
            <View style={styles.proposal}>
              <Text style={styles.sectionLabel}>REBUILD EVENING · PREVIEW</Text>
              <Text style={styles.proposalText}>
                {proposal.moves.length} {proposal.moves.length === 1 ? 'activity' : 'activities'} moved
                {proposal.unscheduledCount ? ' · ' + proposal.unscheduledCount + ' still flexible' : ''}.
              </Text>
              {proposal.moves.map((move) => {
                const task = workspace.tasks.find((item) => item.id === move.taskId);
                if (!task) return null;
                return (
                  <View key={move.taskId} style={styles.proposalRow}>
                    <Text style={styles.proposalTime}>{timeLabel(move.start)}</Text>
                    <Text style={styles.proposalTitle} numberOfLines={1}>{task.title}</Text>
                    <Text style={styles.proposalDuration}>{durationLabel(move.start, move.end)}</Text>
                  </View>
                );
              })}
              <View style={styles.proposalActions}>
                <Action label="Apply plan" onPress={applyProposal} accent />
                <Action label="Cancel" onPress={() => setProposal(null)} />
              </View>
            </View>
          ) : null}

          <View style={styles.timelineHeader}>
            <Text style={styles.sectionLabel}>TIMELINE</Text>
            <Text style={styles.nowLabel}>Now · {timeLabel(now)}</Text>
          </View>

          {map.entries.length ? (
            map.entries.map((entry) => {
              const passed = entry.end < now;
              if (entry.kind === 'commitment') {
                const sourceId = entry.id.replace('commitment:', '');
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={'Edit fixed block ' + entry.title}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/today/commitment/[commitmentId]',
                        params: { commitmentId: sourceId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.timelineRow,
                      passed && styles.passed,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeMain}>{timeLabel(entry.start)}</Text>
                      <Text style={styles.timeEnd}>{timeLabel(entry.end)}</Text>
                    </View>
                    <View style={styles.rail}>
                      <View style={styles.railDotFixed} />
                      <View style={styles.railLine} />
                    </View>
                    <View style={[styles.block, styles.fixedBlock]}>
                      <Text style={styles.blockKicker}>{entry.label.toUpperCase()}</Text>
                      <Text style={styles.blockTitle}>{entry.title}</Text>
                      <Text style={styles.blockMeta}>{durationLabel(entry.start, entry.end)} · fixed</Text>
                    </View>
                  </Pressable>
                );
              }

              const task = workspace.tasks.find((item) => item.id === entry.taskId);
              if (!task) return null;
              return (
                <View key={entry.id} style={[styles.timelineRow, passed && !entry.missed && styles.passed]}>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeMain}>{timeLabel(entry.start)}</Text>
                    <Text style={styles.timeEnd}>{timeLabel(entry.end)}</Text>
                  </View>
                  <View style={styles.rail}>
                    <View style={styles.railDotStudy} />
                    <View style={styles.railLine} />
                  </View>
                  <View style={[styles.block, entry.missed && styles.missedBlock]}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/today/task/[taskId]',
                          params: { taskId: task.id },
                        })
                      }
                      style={({ pressed }) => [styles.blockCopy, pressed && styles.pressed]}>
                      <Text style={styles.blockKicker}>{(task.subject || task.type).toUpperCase()}</Text>
                      <Text style={styles.blockTitle}>{task.title}</Text>
                      <Text style={styles.blockMeta}>
                        {durationLabel(entry.start, entry.end)}
                        {task.actualMinutes > 0 ? ' · ' + task.actualMinutes + 'm done' : ''}
                      </Text>
                    </Pressable>

                    <View style={styles.blockActions}>
                      <Mini
                        label={task.topicId ? 'Start Focus' : 'Open task'}
                        onPress={() => startTask(task.id)}
                      />
                      <Mini
                        label="Edit"
                        onPress={() =>
                          router.push({
                            pathname: '/(app)/today/task/[taskId]',
                            params: { taskId: task.id },
                          })
                        }
                      />
                    </View>

                    {entry.missed ? (
                      <View style={styles.missedActions}>
                        <Mini label="Move" onPress={() => moveTask(task.id)} />
                        <Mini label="Done" onPress={() => markDone(task.id)} />
                        <Mini
                          label="Did some"
                          onPress={() =>
                            router.push({
                              pathname: '/(app)/today/task/[taskId]',
                              params: { taskId: task.id },
                            })
                          }
                        />
                        <Mini label="Skip" onPress={() => skipToday(task.id)} />
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>The timeline is open.</Text>
              <Text style={styles.emptyText}>
                Add fixed commitments or schedule a study task when exact timing helps.
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPlanning }}
            onPress={() => setShowPlanning((current) => !current)}
            style={({ pressed }) => [styles.planningToggle, pressed && styles.pressed]}>
            <View>
              <Text style={styles.planningToggleTitle}>Planning options</Text>
              <Text style={styles.planningToggleMeta}>
                Free windows · flexible tasks · rebuild evening
              </Text>
            </View>
            <Text style={styles.planningToggleMark}>{showPlanning ? '−' : '+'}</Text>
          </Pressable>

          {showPlanning ? (
            <>
          <View style={styles.freeStrip}>
            <View style={styles.fitHeader}>
              <Text style={styles.sectionLabel}>WHERE STUDY CAN FIT</Text>
              <Text style={styles.fitHint}>Open windows around the fixed timeline</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.freeRow}>
              {map.free.length ? (
                map.free.slice(0, 6).map((window) => (
                  <View key={String(window.start)} style={styles.freePill}>
                    <Text style={styles.freeTime}>{timeLabel(window.start)}</Text>
                    <Text style={styles.freeMinutes}>
                      {timeLabel(window.end)} · {window.minutes}m free
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No open gap remains in the mapped day.</Text>
              )}
            </ScrollView>
          </View>

          {flexible.length ? (
            <View style={styles.flexible}>
              <Text style={styles.sectionLabel}>FLEXIBLE TODAY</Text>
              <Text style={styles.flexibleIntro}>
                These are part of today without being forced onto a clock.
              </Text>
              {flexible.map((task) => (
                <View key={task.id} style={styles.flexibleTask}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/today/task/[taskId]',
                        params: { taskId: task.id },
                      })
                    }
                    style={styles.flexibleCopy}>
                    <Text style={styles.flexibleTitle}>{task.title}</Text>
                    <Text style={styles.flexibleMeta}>
                      {taskRemainingMinutes(task) || task.estimatedMinutes || 25}m · {task.subject || task.type}
                    </Text>
                  </Pressable>
                  <Action label="Plan next gap" onPress={() => moveTask(task.id)} accent />
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.addRow}>
            <Action label="+ Study task" onPress={() => router.push('/(app)/today/task/new')} accent />
            <Action label="+ Fixed time" onPress={() => router.push('/(app)/today/commitment/new')} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={buildProposal}
            style={({ pressed }) => [styles.rebuild, pressed && styles.pressed]}>
            <View>
              <Text style={styles.rebuildTitle}>Rebuild my evening</Text>
              <Text style={styles.rebuildText}>Preview a calmer arrangement of unfinished Today work.</Text>
            </View>
            <Text style={styles.rebuildArrow}>→</Text>
          </Pressable>
            </>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Action({
  label,
  onPress,
  accent,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        accent && styles.actionAccent,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.actionText, accent && styles.actionTextAccent]}>{label}</Text>
    </Pressable>
  );
}

function Mini({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
      <Text style={styles.miniText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  toggle: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: 7,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  toggleText: { color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  toggleTextActive: { color: colors.accent },
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 64,
  },
  daySummary: {
    minHeight: 48,
    marginTop: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  daySummaryText: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  daySummaryMeta: { color: colors.muted, fontSize: 10.5, lineHeight: 15 },
  daySummaryWarning: { color: colors.accent, fontWeight: '700' },
  overload: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentFaint, padding: spacing.md },
  overloadLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  overloadTitle: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  overloadActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  planningToggle: { minHeight: 66, marginTop: spacing.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planningToggleTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  planningToggleMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  planningToggleMark: { color: colors.accent, fontSize: 22, lineHeight: 24 },
  freeStrip: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  fitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fitHint: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  sectionLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.55 },
  freeRow: { gap: 8, paddingTop: 10 },
  freePill: {
    minHeight: 52,
    minWidth: 142,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.72)',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  freeTime: { color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  freeMinutes: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  proposal: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.panel, padding: spacing.md },
  proposalText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 8 },
  proposalRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.line },
  proposalTime: { width: 62, color: colors.accent, fontSize: 9.5, fontWeight: '800' },
  proposalTitle: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: '700' },
  proposalDuration: { color: colors.subtle, fontSize: 9 },
  proposalActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: 10,
  },
  nowLabel: { color: colors.accent, fontSize: 9, fontWeight: '700' },
  timelineRow: { minHeight: 88, flexDirection: 'row', alignItems: 'stretch' },
  timeCol: { width: 68, paddingTop: 10 },
  timeMain: { color: colors.textDim, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  timeEnd: { color: colors.subtle, fontSize: 9, lineHeight: 13, marginTop: 3 },
  rail: { width: 22, alignItems: 'center' },
  railLine: { flex: 1, width: 1, backgroundColor: colors.lineStrong },
  railDotFixed: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.muted, marginTop: 14 },
  railDotStudy: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.accent, marginTop: 14 },
  block: {
    flex: 1,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fixedBlock: {
    borderLeftColor: colors.lineStrong,
    backgroundColor: 'rgba(16,16,19,0.56)',
  },
  missedBlock: { borderStyle: 'dashed' },
  blockCopy: { minHeight: 48 },
  blockKicker: { color: colors.subtle, fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.45 },
  blockTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  blockMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  passed: { opacity: 0.42 },
  blockActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  missedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  mini: { minHeight: layout.minTouch, minWidth: 68, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  miniText: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '700' },
  emptyCard: { marginTop: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  flexible: { marginTop: spacing.xl },
  flexibleIntro: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 5, marginBottom: 8 },
  flexibleTask: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexibleCopy: { flex: 1, minHeight: layout.minTouch, justifyContent: 'center' },
  flexibleTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  flexibleMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  action: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  actionAccent: { borderColor: colors.accentLine, backgroundColor: colors.accentSoft },
  actionText: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '700' },
  actionTextAccent: { color: colors.accent },
  rebuild: { minHeight: 68, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rebuildTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  rebuildText: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  rebuildArrow: { color: colors.accent, fontSize: 18 },
  pressed: { opacity: 0.66 },
});
