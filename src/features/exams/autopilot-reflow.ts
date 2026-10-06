import { WorkspaceState } from '@/src/data/schema';
import {
  ExamPlanStrain,
  JointExamPreparationPlan,
  buildJointExamPreparationPlan,
} from '@/src/features/exams/exam-plan-engine';

export type AutopilotReflowMove = {
  topicId: string;
  topicName: string;
  subject: string;
  kind: 'preparation' | 'revision';
  minutes: number;
  fromDay: number;
  toDay: number;
};

export type AutopilotReflowSummary = {
  capacityDeltaMinutes: number;
  movedLaterMinutes: number;
  pulledEarlierMinutes: number;
  newlyUnallocatedMinutes: number;
  resolvedUnallocatedMinutes: number;
  beforeUnallocatedMinutes: number;
  afterUnallocatedMinutes: number;
  beforeStrain: ExamPlanStrain;
  afterStrain: ExamPlanStrain;
  becameImpossible: boolean;
  becameFeasible: boolean;
  firstBrokenDeadline: number | null;
  moves: AutopilotReflowMove[];
};

type Allocation = {
  topicId: string;
  topicName: string;
  subject: string;
  kind: 'preparation' | 'revision';
  day: number;
  minutes: number;
};

function allocations(plan: JointExamPreparationPlan) {
  return plan.days.flatMap((day) =>
    day.blocks.map((block) => ({
      topicId: block.topicId,
      topicName: block.topicName,
      subject: block.subject,
      kind: block.kind,
      day: day.day,
      minutes: block.minutes,
    })),
  );
}

function allocationKey(item: Pick<Allocation, 'topicId' | 'kind'>) {
  return `${item.kind}:${item.topicId}`;
}

function dayMap(items: Allocation[]) {
  const byKey = new Map<
    string,
    {
      topicId: string;
      topicName: string;
      subject: string;
      kind: 'preparation' | 'revision';
      days: Map<number, number>;
    }
  >();

  for (const item of items) {
    const key = allocationKey(item);
    const current = byKey.get(key) ?? {
      topicId: item.topicId,
      topicName: item.topicName,
      subject: item.subject,
      kind: item.kind,
      days: new Map<number, number>(),
    };
    current.days.set(
      item.day,
      (current.days.get(item.day) ?? 0) + item.minutes,
    );
    byKey.set(key, current);
  }

  return byKey;
}

function matchMoves(
  before: JointExamPreparationPlan,
  after: JointExamPreparationPlan,
) {
  const beforeByKey = dayMap(allocations(before));
  const afterByKey = dayMap(allocations(after));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const later: AutopilotReflowMove[] = [];
  const earlier: AutopilotReflowMove[] = [];

  for (const key of keys) {
    const beforeItem = beforeByKey.get(key);
    const afterItem = afterByKey.get(key);
    const identity = afterItem ?? beforeItem;
    if (!identity) continue;

    const days = new Set([
      ...(beforeItem?.days.keys() ?? []),
      ...(afterItem?.days.keys() ?? []),
    ]);
    const reductions: Array<{ day: number; minutes: number }> = [];
    const increases: Array<{ day: number; minutes: number }> = [];

    for (const day of days) {
      const delta =
        (afterItem?.days.get(day) ?? 0) -
        (beforeItem?.days.get(day) ?? 0);
      if (delta < 0) reductions.push({ day, minutes: -delta });
      if (delta > 0) increases.push({ day, minutes: delta });
    }

    reductions.sort((a, b) => a.day - b.day);
    increases.sort((a, b) => a.day - b.day);

    for (const reduction of reductions) {
      let left = reduction.minutes;

      for (const increase of increases) {
        if (left <= 0) break;
        if (increase.minutes <= 0 || increase.day <= reduction.day) continue;
        const minutes = Math.min(left, increase.minutes);
        later.push({
          topicId: identity.topicId,
          topicName: identity.topicName,
          subject: identity.subject,
          kind: identity.kind,
          minutes,
          fromDay: reduction.day,
          toDay: increase.day,
        });
        left -= minutes;
        increase.minutes -= minutes;
      }

      if (left <= 0) continue;
      for (let index = increases.length - 1; index >= 0; index -= 1) {
        const increase = increases[index]!;
        if (left <= 0) break;
        if (increase.minutes <= 0 || increase.day >= reduction.day) continue;
        const minutes = Math.min(left, increase.minutes);
        earlier.push({
          topicId: identity.topicId,
          topicName: identity.topicName,
          subject: identity.subject,
          kind: identity.kind,
          minutes,
          fromDay: reduction.day,
          toDay: increase.day,
        });
        left -= minutes;
        increase.minutes -= minutes;
      }
    }
  }

  const order = (a: AutopilotReflowMove, b: AutopilotReflowMove) =>
    b.minutes - a.minutes ||
    a.fromDay - b.fromDay ||
    a.topicName.localeCompare(b.topicName);

  return {
    later: later.sort(order),
    earlier: earlier.sort(order),
  };
}

function unallocated(plan: JointExamPreparationPlan) {
  return (
    plan.unallocatedPreparationMinutes +
    plan.unallocatedRevisionMinutes
  );
}

export function buildAutopilotReflowSummary(
  beforeWorkspace: WorkspaceState,
  afterWorkspace: WorkspaceState,
  now = Date.now(),
): AutopilotReflowSummary | null {
  const before = buildJointExamPreparationPlan(beforeWorkspace, now, {
    maxDays: 120,
  });
  const after = buildJointExamPreparationPlan(afterWorkspace, now, {
    maxDays: 120,
  });

  if (!before.exams.length && !after.exams.length) return null;

  const beforeUnallocatedMinutes = unallocated(before);
  const afterUnallocatedMinutes = unallocated(after);
  const moveSets = matchMoves(before, after);
  const movedLaterMinutes = moveSets.later.reduce(
    (sum, move) => sum + move.minutes,
    0,
  );
  const pulledEarlierMinutes = moveSets.earlier.reduce(
    (sum, move) => sum + move.minutes,
    0,
  );
  const beforeFeasible =
    before.feasibility.feasible && beforeUnallocatedMinutes === 0;
  const afterFeasible =
    after.feasibility.feasible && afterUnallocatedMinutes === 0;

  return {
    capacityDeltaMinutes:
      after.totalUsableCapacityMinutes - before.totalUsableCapacityMinutes,
    movedLaterMinutes,
    pulledEarlierMinutes,
    newlyUnallocatedMinutes: Math.max(
      0,
      afterUnallocatedMinutes - beforeUnallocatedMinutes,
    ),
    resolvedUnallocatedMinutes: Math.max(
      0,
      beforeUnallocatedMinutes - afterUnallocatedMinutes,
    ),
    beforeUnallocatedMinutes,
    afterUnallocatedMinutes,
    beforeStrain: before.strain,
    afterStrain: after.strain,
    becameImpossible: beforeFeasible && !afterFeasible,
    becameFeasible: !beforeFeasible && afterFeasible,
    firstBrokenDeadline:
      after.feasibility.firstOverloadedDeadline?.deadlineAt ?? null,
    moves: moveSets.later.slice(0, 4),
  };
}

export function hasMeaningfulAutopilotReflow(
  summary: AutopilotReflowSummary | null,
) {
  if (!summary) return false;
  return (
    summary.capacityDeltaMinutes !== 0 ||
    summary.movedLaterMinutes > 0 ||
    summary.pulledEarlierMinutes > 0 ||
    summary.newlyUnallocatedMinutes > 0 ||
    summary.resolvedUnallocatedMinutes > 0 ||
    summary.beforeStrain !== summary.afterStrain ||
    summary.becameImpossible ||
    summary.becameFeasible
  );
}

export function serializeAutopilotReflow(
  summary: AutopilotReflowSummary | null,
) {
  return summary && hasMeaningfulAutopilotReflow(summary)
    ? JSON.stringify(summary)
    : '';
}

export function parseAutopilotReflow(
  value: string | string[] | undefined,
): AutopilotReflowSummary | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AutopilotReflowSummary;
    return parsed &&
      typeof parsed.capacityDeltaMinutes === 'number' &&
      Array.isArray(parsed.moves)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
