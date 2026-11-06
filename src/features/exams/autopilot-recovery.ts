import { WorkspaceState } from '@/src/data/schema';
import { localDateKey } from '@/src/features/planning/commitment-dates';
import { buildDayMap } from '@/src/features/planning/day-engine';
import { AutopilotStrain } from './autopilot-reflow';

export type ReclaimedStudyPlacement = {
  kind: 'preparation' | 'revision';
  topicId: string;
  topicName: string;
  subject: string;
  start: number;
  end: number;
  minutes: number;
};

export type AppliedReclaimedWindow = {
  commitmentId: string;
  commitmentTitle: string;
  occurrenceDateKey: string;
  start: number;
  end: number;
  placements: ReclaimedStudyPlacement[];
  missed: {
    missedMinutes: number;
    remainingMinutes: number;
    reflowedMinutes: number;
    newlyUnallocatedMinutes: number;
    becameImpossible: boolean;
    deadlineTightened: boolean;
    strainBeforeMiss: AutopilotStrain;
    strainAfterMiss: AutopilotStrain;
    addedOverloadMinutes: number;
    placements: ReclaimedStudyPlacement[];
  } | null;
  protection: {
    reason: 'active-focus' | 'lead-buffer' | 'schedule-change';
    until?: number;
    protectedUntil: number | null;
    displacedMinutes: number;
  } | null;
};

export type AutopilotRecoveryEffect = {
  beforeOverloadMinutes: number;
  afterOverloadMinutes: number;
  beforeUnallocatedMinutes: number;
  afterUnallocatedMinutes: number;
  overloadReducedMinutes: number;
  unallocatedReducedMinutes: number;
  capacityGainedMinutes: number;
  feasibleAfter: boolean;
};

export type AutopilotRecoveryOption =
  | {
      id: string;
      kind: 'reclaim-commitment';
      title: string;
      detail: string;
      commitmentId: string;
      commitmentTitle: string;
      occurrenceDateKey: string;
      occurrenceStart: number;
      occurrenceEnd: number;
      reclaimedClockMinutes: number;
      placements: ReclaimedStudyPlacement[];
      effect: AutopilotRecoveryEffect;
    }
  | {
      id: string;
      kind: 'split-topic';
      title: string;
      detail: string;
      topicId: string;
      topicName: string;
      targetBlockMinutes: number;
      effect: AutopilotRecoveryEffect;
    };

export type AutopilotRecoveryUndo =
  | {
      kind: 'reclaim-commitment';
      commitmentId: string;
      occurrenceDateKey: string;
    }
  | {
      kind: 'split-topic';
      topicId: string;
      previousEstimate: number;
    };

export function buildAutopilotRecoveryOptions(
  workspace: WorkspaceState,
  now = Date.now(),
  limit = 3,
): AutopilotRecoveryOption[] {
  const map = buildDayMap(workspace, now);
  if (map.overloadMinutes <= 0) return [];

  const todayKey = localDateKey(now);
  const options: AutopilotRecoveryOption[] = [];
  const topTopic = workspace.topics[0] ?? null;

  for (const entry of map.entries) {
    if (entry.kind !== 'commitment' || !entry.commitmentId || entry.end <= now) continue;
    const commitment = workspace.commitments.find((c) => c.id === entry.commitmentId);
    if (!commitment || commitment.kind === 'sleep') continue;
    const durationMin = Math.max(15, Math.round((entry.end - Math.max(entry.start, now)) / 60_000));
    const gained = Math.min(durationMin, map.overloadMinutes);
    const afterOverload = Math.max(0, map.overloadMinutes - gained);
    const placements: ReclaimedStudyPlacement[] = topTopic
      ? [
          {
            kind: 'preparation',
            topicId: topTopic.id,
            topicName: topTopic.name,
            subject: topTopic.subject,
            start: Math.max(entry.start, now),
            end: Math.max(entry.start, now) + gained * 60_000,
            minutes: gained,
          },
        ]
      : [];

    options.push({
      id: `reclaim:${commitment.id}:${todayKey}`,
      kind: 'reclaim-commitment',
      title: `Skip ${commitment.title} today (${durationMin}m)`,
      detail: `Reclaims ${durationMin}m from ${commitment.title} on ${todayKey} without changing future repeats.`,
      commitmentId: commitment.id,
      commitmentTitle: commitment.title,
      occurrenceDateKey: todayKey,
      occurrenceStart: entry.start,
      occurrenceEnd: entry.end,
      reclaimedClockMinutes: durationMin,
      placements,
      effect: {
        beforeOverloadMinutes: map.overloadMinutes,
        afterOverloadMinutes: afterOverload,
        beforeUnallocatedMinutes: map.overloadMinutes,
        afterUnallocatedMinutes: afterOverload,
        overloadReducedMinutes: gained,
        unallocatedReducedMinutes: gained,
        capacityGainedMinutes: gained,
        feasibleAfter: afterOverload === 0,
      },
    });
    if (options.length >= limit) break;
  }

  return options.slice(0, limit);
}

export function applyAutopilotRecoveryOption(
  draft: WorkspaceState,
  option: AutopilotRecoveryOption,
  _now = Date.now(),
): AutopilotRecoveryUndo | null {
  if (option.kind === 'reclaim-commitment') {
    const commitment = draft.commitments.find((c) => c.id === option.commitmentId);
    if (!commitment) return null;
    const skipped = commitment.skippedDates ?? [];
    if (!skipped.includes(option.occurrenceDateKey)) {
      commitment.skippedDates = [...skipped, option.occurrenceDateKey].sort();
    }
    return {
      kind: 'reclaim-commitment',
      commitmentId: commitment.id,
      occurrenceDateKey: option.occurrenceDateKey,
    };
  }

  const topic = draft.topics.find((t) => t.id === option.topicId);
  if (!topic) return null;
  const previousEstimate = topic.estimate;
  topic.estimate = Math.max(5, Math.min(240, option.targetBlockMinutes));
  return {
    kind: 'split-topic',
    topicId: topic.id,
    previousEstimate,
  };
}

export function undoAutopilotRecovery(
  draft: WorkspaceState,
  undo: AutopilotRecoveryUndo,
): boolean {
  if (undo.kind === 'reclaim-commitment') {
    const commitment = draft.commitments.find((c) => c.id === undo.commitmentId);
    if (!commitment) return false;
    commitment.skippedDates = (commitment.skippedDates ?? []).filter(
      (d) => d !== undo.occurrenceDateKey,
    );
    return true;
  }
  const topic = draft.topics.find((t) => t.id === undo.topicId);
  if (!topic) return false;
  topic.estimate = undo.previousEstimate;
  return true;
}

export function buildAppliedReclaimedWindows(
  workspace: WorkspaceState,
  now = Date.now(),
  options?: {
    horizonDays?: number;
    unavailableUntil?: number;
    activeFocusTopicId?: string | null;
    activeFocusStartedAt?: number | null;
    protectionLeadMinutes?: number;
  },
): AppliedReclaimedWindow[] {
  const todayKey = localDateKey(now);
  const topTopic = workspace.topics[0] ?? null;
  const windows: AppliedReclaimedWindow[] = [];

  for (const commitment of workspace.commitments) {
    if (!(commitment.skippedDates ?? []).includes(todayKey)) continue;
    const d = new Date(now);
    const startMin =
      commitment.startMinutes ??
      new Date(commitment.startAt).getHours() * 60 + new Date(commitment.startAt).getMinutes();
    const endMin =
      commitment.endMinutes ??
      new Date(commitment.endAt).getHours() * 60 + new Date(commitment.endAt).getMinutes();
    const start = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      Math.floor(startMin / 60),
      startMin % 60,
      0,
      0,
    ).getTime();
    const end = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      Math.floor(endMin / 60),
      endMin % 60,
      0,
      0,
    ).getTime();
    if (end <= start) continue;

    const effectiveStart = Math.max(start, options?.unavailableUntil ?? now);
    const remainingMinutes = Math.max(0, Math.round((end - effectiveStart) / 60_000));
    const missedMinutes = Math.max(0, Math.round((effectiveStart - start) / 60_000));
    const placements: ReclaimedStudyPlacement[] =
      topTopic && remainingMinutes >= 10
        ? [
            {
              kind: 'preparation',
              topicId: topTopic.id,
              topicName: topTopic.name,
              subject: topTopic.subject,
              start: effectiveStart,
              end,
              minutes: remainingMinutes,
            },
          ]
        : [];

    const missedPlacements: ReclaimedStudyPlacement[] =
      topTopic && missedMinutes > 0
        ? [
            {
              kind: 'preparation',
              topicId: topTopic.id,
              topicName: topTopic.name,
              subject: topTopic.subject,
              start,
              end: effectiveStart,
              minutes: missedMinutes,
            },
          ]
        : [];

    windows.push({
      commitmentId: commitment.id,
      commitmentTitle: commitment.title,
      occurrenceDateKey: todayKey,
      start,
      end,
      placements,
      missed:
        missedMinutes > 0
          ? {
              missedMinutes,
              remainingMinutes,
              reflowedMinutes: missedMinutes,
              newlyUnallocatedMinutes: 0,
              becameImpossible: false,
              deadlineTightened: false,
              strainBeforeMiss: 'balanced',
              strainAfterMiss: 'balanced',
              addedOverloadMinutes: 0,
              placements: missedPlacements,
            }
          : null,
      protection:
        options?.unavailableUntil && options.unavailableUntil > now
          ? {
              reason: 'active-focus',
              until: options.unavailableUntil,
              protectedUntil: options.unavailableUntil,
              displacedMinutes: Math.max(
                0,
                Math.round((Math.min(end, options.unavailableUntil) - start) / 60_000),
              ),
            }
          : null,
    });
  }

  return windows;
}

export function resolveRecoveredReminderHandoff(
  windows: readonly AppliedReclaimedWindow[],
  handoff: {
    commitmentId: string;
    occurrenceDateKey: string;
    topicId: string | null;
    scheduledStart: number | null;
    scheduledEnd: number | null;
  },
  now = Date.now(),
): {
  status: 'exact' | 'updated';
  reason: 'exact' | 'missed' | 'reflowed' | 'next-window' | 'finished';
  window: AppliedReclaimedWindow | null;
  placement: ReclaimedStudyPlacement | null;
} {
  const win =
    windows.find(
      (item) =>
        item.commitmentId === handoff.commitmentId &&
        item.occurrenceDateKey === handoff.occurrenceDateKey,
    ) ?? null;
  if (!win) {
    return { status: 'updated', reason: 'finished', window: null, placement: null };
  }
  const activePlacement =
    win.placements.find((p) => p.end > now && (!handoff.topicId || p.topicId === handoff.topicId)) ??
    win.placements.find((p) => p.end > now) ??
    null;
  if (
    activePlacement &&
    handoff.scheduledStart === activePlacement.start &&
    handoff.scheduledEnd === activePlacement.end
  ) {
    return { status: 'exact', reason: 'exact', window: win, placement: activePlacement };
  }
  if (win.missed) {
    return { status: 'updated', reason: 'missed', window: win, placement: activePlacement };
  }
  if (!activePlacement) {
    return { status: 'updated', reason: 'next-window', window: win, placement: null };
  }
  return { status: 'updated', reason: 'reflowed', window: win, placement: activePlacement };
}
