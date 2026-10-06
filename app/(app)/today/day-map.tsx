import { localDateKey } from '@/src/features/planning/commitment-dates';
import { useScreenClock } from '@/src/features/planning/useScreenClock';
import { TaskQuickActions, TaskDueLabel } from '@/src/features/planning/TaskQuickActions';

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { MotionItem } from '@/src/components/motion/MotionItem';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { timerRemainingMs } from '@/src/features/focus/focus-engine';
import {
  addLocalDays,
  buildDayMap,
  rebuildRemainingDay,
  startOfLocalDay,
  suggestTaskSlots,
} from '@/src/features/planning/day-engine';
import {
  postponeTask,
  scheduleTask,
  taskRemainingMinutes,
} from '@/src/features/planning/task-engine';
import { AutopilotReflowNotice } from '@/src/features/exams/AutopilotReflowNotice';
import {
  AppliedReclaimedWindow,
  AutopilotRecoveryOption,
  AutopilotRecoveryUndo,
  ReclaimedStudyPlacement,
  applyAutopilotRecoveryOption,
  buildAppliedReclaimedWindows,
  buildAutopilotRecoveryOptions,
  undoAutopilotRecovery,
} from '@/src/features/exams/autopilot-recovery';
import {
  AutopilotReflowSummary,
  buildAutopilotReflowSummary,
  parseAutopilotReflow,
} from '@/src/features/exams/autopilot-reflow';
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
  const params = useLocalSearchParams<{ reflow?: string | string[] }>();
  const { workspace, updateWorkspace } = useWorkspace();
  const { session: focusSession } = useFocus();
  const clock = useScreenClock();
  const [refresh, setNow] = useState(Date.now());
  const now = Math.max(clock, refresh);
  const [proposal, setProposal] = useState<ReturnType<typeof rebuildRemainingDay> | null>(null);
  const [showPlanning, setShowPlanning] = useState(false);
  const [reflow, setReflow] = useState<AutopilotReflowSummary | null>(() =>
    parseAutopilotReflow(params.reflow),
  );
  const [selectedRecoveryId, setSelectedRecoveryId] = useState<string | null>(null);
  const [lastRecovery, setLastRecovery] = useState<{
    undo: AutopilotRecoveryUndo;
    appliedRevision: number;
    label: string;
    reclaimedWindow: AppliedReclaimedWindow | null;
  } | null>(null);

  useEffect(() => {
    const incoming = parseAutopilotReflow(params.reflow);
    if (incoming) setReflow(incoming);
  }, [params.reflow]);

  const map = useMemo(
    () => (workspace ? buildDayMap(workspace, now) : null),
    [workspace, now],
  );

  const recoveryOptions = useMemo(
    () =>
      workspace &&
      reflow &&
      (reflow.becameImpossible || reflow.newlyUnallocatedMinutes > 0)
        ? buildAutopilotRecoveryOptions(workspace, now, 3)
        : [],
    [now, reflow, workspace],
  );

  const reclaimedWindows = useMemo(() => {
    if (!workspace) return [];
    const activeFocusRemaining =
      focusSession?.phase === 'focus'
        ? timerRemainingMs(focusSession, now)
        : 0;
    return buildAppliedReclaimedWindows(workspace, now, {
      ...(activeFocusRemaining > 0
        ? {
            unavailableUntil:
              now + activeFocusRemaining,
            activeFocusTopicId:
              focusSession?.topicId ?? null,
            activeFocusStartedAt:
              focusSession?.startedAt ?? null,
          }
        : {}),
      protectionLeadMinutes: 10,
    });
  }, [
    focusSession?.phase,
    focusSession?.startedAt,
    focusSession?.topicId,
    focusSession?.runningSince,
    focusSession?.elapsedMs,
    focusSession?.plannedFocusMinutes,
    now,
    workspace,
  ]);

  const visibleReclaimedWindows = useMemo(() => {
    const windows = [...reclaimedWindows];
    const immediate =
      lastRecovery &&
      workspace &&
      lastRecovery.appliedRevision === workspace.revision
        ? lastRecovery.reclaimedWindow
        : null;
    if (
      immediate &&
      !windows.some(
        (window) =>
          window.commitmentId === immediate.commitmentId &&
          window.occurrenceDateKey === immediate.occurrenceDateKey,
      )
    ) {
      windows.push(immediate);
    }
    return windows.sort((a, b) => a.start - b.start);
  }, [lastRecovery, reclaimedWindows, workspace]);

  if (!workspace || !map) return null;

  function updateWithReflow(change: Parameters<typeof updateWorkspace>[0]) {
    const before = workspace!;
    const next = updateWorkspace(change);
    if (next) {
      setReflow(
        buildAutopilotReflowSummary(before, next, Date.now()),
      );
    }
    return next;
  }

  const flexible = workspace.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        task.planState === 'today' &&
        task.postponedUntil <= now,
    )
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

  function skipOccurrence(id: string, date: string, restore = false) {
    updateWithReflow(draft => {
      const item = draft.commitments.find(item => item.id === id);
      if (!item || !item.recurrenceDays.length) return;
      item.skippedDates = restore ? (item.skippedDates ?? []).filter(value => value !== date) : [...new Set([...(item.skippedDates ?? []), date])];
      item.updatedAt = Date.now();
    });
  }

  function moveTask(taskId: string) {
    const task = workspace!.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const slot = suggestTaskSlots(workspace!, task, Date.now(), 1)[0];
    if (!slot) return;
    updateWithReflow((draft) => {
      const target = draft.tasks.find((item) => item.id === taskId);
      if (target) scheduleTask(target, slot.start, slot.end);
    });
    setNow(Date.now());
  }

  function skipToday(taskId: string) {
    const tomorrow = addLocalDays(startOfLocalDay(Date.now()), 1);
    updateWithReflow((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (task) postponeTask(task, tomorrow);
    });
    setNow(Date.now());
  }

  function startReclaimedPlacement(
    placement: ReclaimedStudyPlacement,
  ) {
    router.push({
      pathname: '/(app)/focus',
      params: {
        topicId: placement.topicId,
        minutes: String(placement.minutes),
        breakMinutes: String(
          workspace!.settings.breakMinutes,
        ),
      },
    });
  }

  function previewRecovery(option: AutopilotRecoveryOption) {
    setSelectedRecoveryId((current) =>
      current === option.id ? null : option.id,
    );
  }

  function applyRecovery(option: AutopilotRecoveryOption) {
    let undo: AutopilotRecoveryUndo | null = null;
    const next = updateWithReflow((draft) => {
      undo = applyAutopilotRecoveryOption(
        draft,
        option,
        Date.now(),
      );
    });
    if (next && undo) {
      setLastRecovery({
        undo,
        appliedRevision: next.revision,
        label: option.title,
        reclaimedWindow:
          option.kind === 'reclaim-commitment'
            ? {
                commitmentId: option.commitmentId,
                commitmentTitle: option.commitmentTitle,
                occurrenceDateKey: option.occurrenceDateKey,
                start: option.occurrenceStart,
                end: option.occurrenceEnd,
                placements: option.placements,
                missed: null,
                protection: null,
              }
            : null,
      });
      setSelectedRecoveryId(null);
      setNow(Date.now());
    }
  }

  function undoRecovery() {
    const recovery = lastRecovery;
    if (
      !recovery ||
      workspace!.revision !== recovery.appliedRevision
    ) {
      setLastRecovery(null);
      return;
    }

    let restored = false;
    const next = updateWithReflow((draft) => {
      restored = undoAutopilotRecovery(
        draft,
        recovery.undo,
      );
    });
    if (next && restored) {
      setLastRecovery(null);
      setSelectedRecoveryId(null);
      setNow(Date.now());
    }
  }

  function buildProposal() {
    setProposal(rebuildRemainingDay(workspace!, Date.now()));
  }

  function applyProposal() {
    if (!proposal) return;
    updateWithReflow((draft) => {
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

          <AutopilotReflowNotice
            summary={reflow}
            recoveryOptions={recoveryOptions}
            selectedRecoveryId={selectedRecoveryId}
            onPreviewRecovery={previewRecovery}
            onApplyRecovery={applyRecovery}
            undoLabel={
              lastRecovery &&
              lastRecovery.appliedRevision === workspace.revision
                ? lastRecovery.label
                : null
            }
            onUndoRecovery={
              lastRecovery &&
              lastRecovery.appliedRevision === workspace.revision
                ? undoRecovery
                : undefined
            }
          />

          {visibleReclaimedWindows.length ? (
            <View style={styles.reclaimedSection}>
              <Text style={styles.sectionLabel}>RECOVERED AUTOPILOT WINDOW</Text>
              <Text style={styles.reclaimedIntro}>
                These blocks are reserved by Autopilot from skipped tuition/coaching time.
                They are not task records.
              </Text>
              {visibleReclaimedWindows.map((window) => (
                <View
                  key={`${window.commitmentId}:${window.occurrenceDateKey}`}
                  style={styles.reclaimedWindow}>
                  <View style={styles.reclaimedWindowHeader}>
                    <View style={styles.reclaimedHeaderCopy}>
                      <Text style={styles.reclaimedWindowTitle}>
                        {window.commitmentTitle} cancelled
                      </Text>
                      <Text style={styles.reclaimedWindowMeta}>
                        {localDateKey(window.start) !== localDateKey(now)
                          ? new Date(window.start).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            }) + ' · '
                          : ''}
                        {timeLabel(window.start)}–{timeLabel(window.end)} · Autopilot reserved
                      </Text>
                    </View>
                    <Text style={styles.reclaimedBadge}>RECOVERED</Text>
                  </View>

                  {window.protection ? (
                    <View style={styles.reclaimedProtection}>
                      <Text style={styles.reclaimedProtectionKicker}>
                        PRE-MISS PROTECTION
                      </Text>
                      <Text style={styles.reclaimedProtectionTitle}>
                        {window.protection.reason === 'active-focus'
                          ? 'Another Focus session overlaps this recovered block'
                          : 'A later schedule change shrank this recovered window'}
                      </Text>
                      <Text style={styles.reclaimedProtectionText}>
                        {window.protection.reason === 'active-focus' &&
                        window.protection.protectedUntil
                          ? `MYELIN moved the reservation to start after ${timeLabel(window.protection.protectedUntil)} before it could become a miss.`
                          : 'MYELIN repacked the reservation around the new fixed time before it could become a miss.'}
                        {window.protection.displacedMinutes > 0
                          ? ` ${window.protection.displacedMinutes}m no longer fits inside this recovered window and stays in the wider Autopilot plan.`
                          : ''}
                      </Text>
                    </View>
                  ) : null}

                  {window.missed ? (
                    <View style={styles.reclaimedMissed}>
                      <Text style={styles.reclaimedMissedKicker}>
                        MISSED RECOVERED SLOT
                      </Text>
                      <Text style={styles.reclaimedMissedTitle}>
                        {window.missed.missedMinutes}m passed without a completed Focus
                      </Text>
                      <Text style={styles.reclaimedMissedText}>
                        {window.missed.reflowedMinutes > 0
                          ? `${window.missed.reflowedMinutes}m has been reflowed into the remaining exam plan.`
                          : 'No missed minutes could be safely reflowed.'}
                        {window.missed.newlyUnallocatedMinutes > 0
                          ? ` ${window.missed.newlyUnallocatedMinutes}m no longer fits before the deadline.`
                          : ''}
                      </Text>
                      {window.missed.becameImpossible ? (
                        <Text style={styles.reclaimedMissedDanger}>
                          This miss makes the current deadline no longer fit at safe capacity.
                        </Text>
                      ) : window.missed.deadlineTightened ? (
                        <Text style={styles.reclaimedMissedWarning}>
                          Plan strain: {window.missed.strainBeforeMiss} →{' '}
                          {window.missed.strainAfterMiss}
                          {window.missed.addedOverloadMinutes > 0
                            ? ` · +${window.missed.addedOverloadMinutes}m overload`
                            : ''}
                        </Text>
                      ) : (
                        <Text style={styles.reclaimedMissedSafe}>
                          The deadline still fits; MYELIN absorbed this miss into later capacity.
                        </Text>
                      )}
                      <View style={styles.reclaimedMissedList}>
                        {window.missed.placements.slice(0, 2).map((placement, index) => (
                          <Text
                            key={`missed:${placement.topicId}:${placement.start}:${index}`}
                            style={styles.reclaimedMissedItem}>
                            {timeLabel(placement.start)}–{timeLabel(placement.end)} ·{' '}
                            {placement.topicName} · {placement.minutes}m missed
                          </Text>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {window.placements.map((placement, index) => (
                    <View
                      key={`${placement.kind}:${placement.topicId}:${placement.start}:${index}`}
                      style={styles.reclaimedRow}>
                      <View style={styles.reclaimedTimeCol}>
                        <Text style={styles.reclaimedTime}>
                          {timeLabel(placement.start)}
                        </Text>
                        <Text style={styles.reclaimedEnd}>
                          {timeLabel(placement.end)}
                        </Text>
                      </View>
                      <View style={styles.reclaimedRail}>
                        <View style={styles.reclaimedDot} />
                        <View style={styles.railLine} />
                      </View>
                      <View style={styles.reclaimedBlock}>
                        <Text style={styles.blockKicker}>
                          {placement.subject.toUpperCase()}
                        </Text>
                        <Text style={styles.blockTitle}>{placement.topicName}</Text>
                        <Text style={styles.blockMeta}>
                          {placement.minutes}m ·{' '}
                          {placement.kind === 'revision' ? 'revision' : 'preparation'} ·
                          no task created
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Start ${placement.minutes} minute focus for ${placement.topicName}`}
                          onPress={() => startReclaimedPlacement(placement)}
                          style={({ pressed }) => [
                            styles.reclaimedStart,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.reclaimedStartText}>Start focus</Text>
                          <Text style={styles.reclaimedStartArrow}>→</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          <AnimatedDisclosure visible={map.overloadMinutes > 0}>
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
          </AnimatedDisclosure>

          <AnimatedDisclosure visible={Boolean(proposal)}>
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
          </AnimatedDisclosure>

          <View style={styles.timelineHeader}>
            <Text style={styles.sectionLabel}>TIMELINE</Text>
            <Text style={styles.nowLabel}>Now · {timeLabel(now)}</Text>
          </View>

          {map.entries.length ? (
            map.entries.map((entry) => {
              const passed = entry.end < now;
              if (entry.kind === 'commitment') {
                const sourceId = entry.commitmentId;
                return (
                  <MotionItem key={entry.id}>
                  <View style={[styles.timelineRow, passed && styles.passed]}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeMain}>{timeLabel(entry.start)}</Text>
                      <Text style={styles.timeEnd}>{timeLabel(entry.end)}</Text>
                    </View>
                    <View style={styles.rail}><View style={styles.railDotFixed} /><View style={styles.railLine} /></View>
                    <View style={[styles.block, styles.fixedBlock]}>
                      <Pressable accessibilityRole="button" accessibilityLabel={'Edit fixed block ' + entry.title}
                        onPress={() => router.push({ pathname: '/(app)/today/commitment/[commitmentId]', params: { commitmentId: sourceId } })} style={styles.blockCopy}>
                        <Text style={styles.blockKicker}>{entry.label.toUpperCase()}</Text>
                        <Text style={styles.blockTitle}>{entry.title}</Text>
                        <Text style={styles.blockMeta}>{durationLabel(entry.start, entry.end)} · fixed</Text>
                      </Pressable>
                      {workspace.commitments.find(item => item.id === sourceId)?.recurrenceDays.length ? <Mini label="Skip this occurrence" onPress={() => skipOccurrence(sourceId, entry.occurrenceDateKey)} /> : null}
                    </View>
                  </View>
                  </MotionItem>
                );
              }

              const task = workspace.tasks.find((item) => item.id === entry.taskId);
              if (!task) return null;
              return (
                <MotionItem key={entry.id}>
                <View style={[styles.timelineRow, passed && !entry.missed && styles.passed]}>
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

                    <TaskDueLabel task={task} now={now} />
                    <TaskQuickActions task={task} />

                    {entry.missed ? (
                      <View style={styles.missedActions}>
                        <Mini label="Move" onPress={() => moveTask(task.id)} />
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
                </MotionItem>
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

          {workspace.commitments.flatMap(item => (item.skippedDates ?? [])
            .filter(date => date === localDateKey(now) || (item.endMinutes < item.startMinutes && date === localDateKey(addLocalDays(now, -1))))
            .map(date => <View key={`${item.id}:${date}`} style={{ paddingVertical: 12 }}>
              <Text style={styles.blockMeta}>{item.title} · skipped {date}</Text>
              <Mini label="Restore occurrence" onPress={() => skipOccurrence(item.id, date, true)} />
            </View>))}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPlanning }}
            onPress={() => setShowPlanning((current) => !current)}
            style={({ pressed }) => [styles.planningToggle, pressed && styles.pressed]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.planningToggleTitle}>Planning options</Text>
              <Text style={styles.planningToggleMeta}>
                Free windows · flexible tasks · rebuild evening
              </Text>
            </View>
            <Text style={styles.planningToggleMark}>{showPlanning ? '−' : '+'}</Text>
          </Pressable>

          <AnimatedDisclosure visible={showPlanning}>
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
              {flexible.map((task, index) => (
                <MotionItem key={task.id} delay={Math.min(index * 30, 90)} style={styles.flexibleTask}>
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
                  <TaskDueLabel task={task} now={now} />
                  <TaskQuickActions task={task} />
                  <Action label="Plan next gap" onPress={() => moveTask(task.id)} accent />
                </MotionItem>
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
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rebuildTitle}>Rebuild my evening</Text>
              <Text style={styles.rebuildText}>Preview a calmer arrangement of unfinished Today work.</Text>
            </View>
            <Text style={styles.rebuildArrow}>→</Text>
          </Pressable>
          </AnimatedDisclosure>
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
  reclaimedSection: {
    marginTop: spacing.md,
  },
  reclaimedIntro: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  reclaimedWindow: {
    marginTop: 9,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  reclaimedWindowHeader: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentFaint,
  },
  reclaimedHeaderCopy: { flex: 1, minWidth: 0 },
  reclaimedWindowTitle: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  reclaimedWindowMeta: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },
  reclaimedBadge: {
    color: colors.accent,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  reclaimedProtection: {
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panelRaised,
    padding: 10,
  },
  reclaimedProtectionKicker: {
    color: colors.accent,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  reclaimedProtectionTitle: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  reclaimedProtectionText: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 3,
  },
  reclaimedMissed: {
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    padding: 10,
  },
  reclaimedMissedKicker: {
    color: colors.accent,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  reclaimedMissedTitle: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  reclaimedMissedText: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 3,
  },
  reclaimedMissedDanger: {
    color: colors.accent,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 6,
  },
  reclaimedMissedWarning: {
    color: colors.textDim,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  reclaimedMissedSafe: {
    color: colors.textDim,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 6,
  },
  reclaimedMissedList: {
    marginTop: 6,
    gap: 3,
  },
  reclaimedMissedItem: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
  },
  reclaimedRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 10,
  },
  reclaimedTimeCol: {
    width: 62,
    paddingTop: 12,
  },
  reclaimedTime: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  reclaimedEnd: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 2,
  },
  reclaimedRail: {
    width: 18,
    alignItems: 'center',
  },
  reclaimedDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
    marginTop: 16,
  },
  reclaimedBlock: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 10,
    paddingLeft: 8,
  },
  reclaimedStart: {
    minHeight: 40,
    marginTop: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reclaimedStartText: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
  },
  reclaimedStartArrow: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 18,
  },
  overload: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentFaint, padding: spacing.md },
  overloadLabel: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  overloadTitle: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  overloadActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  planningToggle: { minHeight: 66, marginTop: spacing.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planningToggleTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  planningToggleMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  planningToggleMark: { color: colors.accent, fontSize: 22, lineHeight: 24 },
  freeStrip: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  fitHeader: { gap: 5 },
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
  flexibleTask: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12, gap: 8 },
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
