import { WorkspaceState } from '@/src/data/schema';
import { buildDayMap } from '@/src/features/planning/day-engine';

export type AutopilotStrain = 'comfortable' | 'balanced' | 'tight' | 'overloaded';

export type AutopilotReflowMove = {
  kind: 'study' | 'revision';
  topicId: string;
  topicName: string;
  minutes: number;
  fromDay: number;
  toDay: number;
};

export type AutopilotReflowSummary = {
  becameImpossible: boolean;
  becameFeasible: boolean;
  movedLaterMinutes: number;
  capacityDeltaMinutes: number;
  resolvedUnallocatedMinutes: number;
  newlyUnallocatedMinutes: number;
  firstBrokenDeadline: number | null;
  beforeStrain: AutopilotStrain;
  afterStrain: AutopilotStrain;
  moves: AutopilotReflowMove[];
};

function classifyStrain(overloadMinutes: number, plannedMinutes: number, availableMinutes: number): AutopilotStrain {
  if (overloadMinutes > 0) return 'overloaded';
  if (availableMinutes <= 0) return plannedMinutes > 0 ? 'overloaded' : 'comfortable';
  const ratio = plannedMinutes / Math.max(1, availableMinutes);
  if (ratio >= 0.85) return 'tight';
  if (ratio >= 0.5) return 'balanced';
  return 'comfortable';
}

export function buildAutopilotReflowSummary(
  before: WorkspaceState,
  after: WorkspaceState,
  now = Date.now(),
): AutopilotReflowSummary | null {
  const beforeMap = buildDayMap(before, now);
  const afterMap = buildDayMap(after, now);

  const capacityDeltaMinutes = afterMap.availableMinutes - beforeMap.availableMinutes;
  const overloadDelta = afterMap.overloadMinutes - beforeMap.overloadMinutes;
  const newlyUnallocatedMinutes = Math.max(0, overloadDelta);
  const resolvedUnallocatedMinutes = Math.max(0, -overloadDelta);
  const beforeStrain = classifyStrain(
    beforeMap.overloadMinutes,
    beforeMap.plannedStudyMinutes,
    beforeMap.availableMinutes,
  );
  const afterStrain = classifyStrain(
    afterMap.overloadMinutes,
    afterMap.plannedStudyMinutes,
    afterMap.availableMinutes,
  );

  const becameImpossible = beforeMap.overloadMinutes === 0 && afterMap.overloadMinutes > 0;
  const becameFeasible = beforeMap.overloadMinutes > 0 && afterMap.overloadMinutes === 0;

  if (
    capacityDeltaMinutes === 0 &&
    newlyUnallocatedMinutes === 0 &&
    resolvedUnallocatedMinutes === 0 &&
    beforeStrain === afterStrain
  ) {
    return null;
  }

  return {
    becameImpossible,
    becameFeasible,
    movedLaterMinutes: newlyUnallocatedMinutes,
    capacityDeltaMinutes,
    resolvedUnallocatedMinutes,
    newlyUnallocatedMinutes,
    firstBrokenDeadline: afterMap.overloadMinutes > 0 ? after.exams[0]?.date ?? null : null,
    beforeStrain,
    afterStrain,
    moves: [],
  };
}

export function serializeAutopilotReflow(
  summary: AutopilotReflowSummary | null,
): string | null {
  if (!summary) return null;
  try {
    return JSON.stringify(summary);
  } catch {
    return null;
  }
}

export function parseAutopilotReflow(
  raw: string | string[] | undefined,
): AutopilotReflowSummary | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AutopilotReflowSummary;
  } catch {
    return null;
  }
}
