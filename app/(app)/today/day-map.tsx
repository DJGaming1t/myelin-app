
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
          eyebrow="TODAY"
          title="Day Map"
          subtitle="A calm view of what is fixed, what is planned, and where study can realistically fit."
          actionLabel="+ Add"
          onAction={() => router.push('/(app)/today/task/new')}
          onBack={() => router.replace('/(app)/today')}
        />

        <View style={styles.toggle}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(app)/today')}
            style={styles.toggleButton}>
            <Text style={styles.toggleText}>Flow</Text>
          </Pressable>
          <View style={[styles.toggleButton, styles.toggleActive]}>
            <Text style={[styles.toggleText, styles.toggleTextActive]}>Day Map</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.capacity}>
            <Metric label="FREE WINDOWS" value={String(map.free.length)} />
            <Metric label="USABLE" value={Math.round(map.availableMinutes / 60 * 10) / 10 + 'h'} />
            <Metric label="PLANNED" value={String(map.plannedStudyMinutes) + 'm'} />
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

          <View style={styles.freeStrip}>
            <Text style={styles.sectionLabel}>FREE WINDOWS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.freeRow}>
              {map.free.length ? map.free.slice(0, 6).map((window) => (
                <View key={String(window.start)} style={styles.freePill}>
                  <Text style={styles.freeTime}>{timeLabel(window.start)}</Text>
                  <Text style={styles.freeMinutes}>{window.minutes}m</Text>
                </View>
              )) : <Text style={styles.emptyText}>No open gap remains in the mapped day.</Text>}
            </ScrollView>
          </View>

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
        </ScrollView>
      </View>
    </SafeAreaView>
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
  capacity: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  metric: { flex: 1, minHeight: 68, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 11, justifyContent: 'space-between' },
  metricLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  overload: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentFaint, padding: spacing.md },
  overloadLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  overloadTitle: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  overloadActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  freeStrip: { marginTop: spacing.xl },
  sectionLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  freeRow: { gap: 7, paddingTop: 8 },
  freePill: { minHeight: 48, minWidth: 94, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 11, justifyContent: 'center' },
  freeTime: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  freeMinutes: { color: colors.subtle, fontSize: 8.5, marginTop: 2 },
  proposal: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.panel, padding: spacing.md },
  proposalText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 8 },
  proposalRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.line },
  proposalTime: { width: 62, color: colors.accent, fontSize: 9.5, fontWeight: '800' },
  proposalTitle: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: '700' },
  proposalDuration: { color: colors.subtle, fontSize: 9 },
  proposalActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: 6 },
  nowLabel: { color: colors.accent, fontSize: 9, fontWeight: '700' },
  timelineRow: { minHeight: 84, flexDirection: 'row', alignItems: 'stretch' },
  timeCol: { width: 62, paddingTop: 11 },
  timeMain: { color: colors.text, fontSize: 10, fontWeight: '700' },
  timeEnd: { color: colors.subtle, fontSize: 8.5, marginTop: 4 },
  rail: { width: 20, alignItems: 'center' },
  railLine: { flex: 1, width: 1, backgroundColor: colors.lineStrong },
  railDotFixed: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.muted, marginTop: 15 },
  railDotStudy: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent, marginTop: 15 },
  block: { flex: 1, marginBottom: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentFaint, padding: 11 },
  fixedBlock: { borderColor: colors.line, backgroundColor: colors.panel },
  missedBlock: { borderStyle: 'dashed' },
  blockCopy: { minHeight: 48 },
  blockKicker: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  blockTitle: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 },
  blockMeta: { color: colors.muted, fontSize: 9, marginTop: 4 },
  passed: { opacity: 0.42 },
  missedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  mini: { minHeight: layout.minTouch, minWidth: 68, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  miniText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  emptyCard: { marginTop: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  flexible: { marginTop: spacing.xl },
  flexibleIntro: { color: colors.muted, fontSize: 9.5, lineHeight: 15, marginTop: 5, marginBottom: 8 },
  flexibleTask: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexibleCopy: { flex: 1, minHeight: layout.minTouch, justifyContent: 'center' },
  flexibleTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  flexibleMeta: { color: colors.subtle, fontSize: 8.8, marginTop: 3 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  action: { flex: 1, minHeight: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  actionAccent: { borderColor: colors.accentLine, backgroundColor: colors.accentSoft },
  actionText: { color: colors.muted, fontSize: 9.5, fontWeight: '800' },
  actionTextAccent: { color: colors.accent },
  rebuild: { minHeight: 68, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rebuildTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  rebuildText: { color: colors.subtle, fontSize: 9, marginTop: 3 },
  rebuildArrow: { color: colors.accent, fontSize: 18 },
  pressed: { opacity: 0.66 },
});
