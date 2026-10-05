export type CapacityDemandPriority = 1 | 2 | 3;
export type CapacityDemandKind =
  | 'task'
  | 'exam-preparation'
  | 'exam-revision'
  | 'other';

export type CapacityFeasibilityDemand = {
  id: string;
  label: string;
  kind: CapacityDemandKind;
  requiredMinutes: number;
  priority: CapacityDemandPriority;
  availableFrom: number;
  deadlineAt: number;
  capacityUntil: number;
  movable?: boolean;
};

export type CapacityFeasibilityDay = {
  day: number;
  usableMinutes: number;
};

export type CapacityReliefCandidate = {
  demandId: string;
  label: string;
  kind: CapacityDemandKind;
  priority: CapacityDemandPriority;
  requiredMinutes: number;
  suggestedMinutes: number;
  movable: boolean;
};

export type CapacityFeasibilityCheckpoint = {
  deadlineAt: number;
  capacityUntil: number;
  intervalStart: number;
  requiredMinutes: number;
  capacityMinutes: number;
  overloadMinutes: number;
  availableDayCount: number;
  extraMinutesPerAvailableDay: number | null;
  demandIds: string[];
  reliefCandidates: CapacityReliefCandidate[];
};

export type CapacityFeasibilityAnalysis = {
  feasible: boolean;
  totalRequiredMinutes: number;
  totalCapacityMinutes: number;
  totalOverloadMinutes: number;
  firstOverloadedDeadline: CapacityFeasibilityCheckpoint | null;
  checkpoints: CapacityFeasibilityCheckpoint[];
};

function finiteMinutes(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizedDemands(demands: CapacityFeasibilityDemand[]) {
  return demands
    .map((demand) => {
      const capacityUntil = Math.round(demand.capacityUntil);
      return {
        ...demand,
        requiredMinutes: finiteMinutes(demand.requiredMinutes),
        availableFrom: Math.min(
          Math.round(demand.availableFrom),
          capacityUntil,
        ),
        deadlineAt: Math.round(demand.deadlineAt),
        capacityUntil,
        movable: demand.movable ?? demand.priority < 3,
      };
    })
    .filter(
      (demand) =>
        demand.id &&
        demand.label &&
        demand.requiredMinutes > 0 &&
        Number.isFinite(demand.availableFrom) &&
        Number.isFinite(demand.deadlineAt) &&
        Number.isFinite(demand.capacityUntil),
    );
}

function normalizedDays(days: CapacityFeasibilityDay[]) {
  const byDay = new Map<number, number>();
  for (const day of days) {
    if (!Number.isFinite(day.day)) continue;
    const key = Math.round(day.day);
    byDay.set(key, (byDay.get(key) ?? 0) + finiteMinutes(day.usableMinutes));
  }
  return [...byDay.entries()]
    .map(([day, usableMinutes]) => ({ day, usableMinutes }))
    .sort((a, b) => a.day - b.day);
}

function reliefCandidates(
  demands: CapacityFeasibilityDemand[],
  overloadMinutes: number,
) {
  if (overloadMinutes <= 0) return [];

  const ordered = [...demands].sort(
    (a, b) =>
      Number(Boolean(b.movable)) - Number(Boolean(a.movable)) ||
      a.priority - b.priority ||
      b.capacityUntil - a.capacityUntil ||
      b.requiredMinutes - a.requiredMinutes ||
      a.label.localeCompare(b.label),
  );

  let remaining = overloadMinutes;
  const result: CapacityReliefCandidate[] = [];
  for (const demand of ordered) {
    if (remaining <= 0) break;
    const suggestedMinutes = Math.min(demand.requiredMinutes, remaining);
    result.push({
      demandId: demand.id,
      label: demand.label,
      kind: demand.kind,
      priority: demand.priority,
      requiredMinutes: demand.requiredMinutes,
      suggestedMinutes,
      movable: Boolean(demand.movable),
    });
    remaining -= suggestedMinutes;
  }
  return result;
}

function checkpointForDeadline(
  demands: CapacityFeasibilityDemand[],
  days: CapacityFeasibilityDay[],
  capacityUntil: number,
): CapacityFeasibilityCheckpoint {
  const endingDemands = demands.filter(
    (demand) => demand.capacityUntil <= capacityUntil,
  );
  const matchingDeadline = endingDemands
    .filter((demand) => demand.capacityUntil === capacityUntil)
    .sort((a, b) => a.deadlineAt - b.deadlineAt)[0];

  const intervalStarts = [
    ...new Set(
      endingDemands
        .map((demand) => demand.availableFrom)
        .filter((value) => value <= capacityUntil),
    ),
  ].sort((a, b) => a - b);

  let worst:
    | {
        intervalStart: number;
        requiredMinutes: number;
        capacityMinutes: number;
        overloadMinutes: number;
        demands: CapacityFeasibilityDemand[];
        availableDayCount: number;
      }
    | null = null;

  for (const intervalStart of intervalStarts) {
    const intervalDemands = endingDemands.filter(
      (demand) =>
        demand.availableFrom >= intervalStart &&
        demand.capacityUntil <= capacityUntil,
    );
    const requiredMinutes = intervalDemands.reduce(
      (sum, demand) => sum + demand.requiredMinutes,
      0,
    );
    const intervalDays = days.filter(
      (day) => day.day >= intervalStart && day.day < capacityUntil,
    );
    const capacityMinutes = intervalDays.reduce(
      (sum, day) => sum + day.usableMinutes,
      0,
    );
    const overloadMinutes = Math.max(0, requiredMinutes - capacityMinutes);
    const availableDayCount = intervalDays.filter(
      (day) => day.usableMinutes > 0,
    ).length;

    if (
      !worst ||
      overloadMinutes > worst.overloadMinutes ||
      (overloadMinutes === worst.overloadMinutes &&
        requiredMinutes - capacityMinutes >
          worst.requiredMinutes - worst.capacityMinutes) ||
      (overloadMinutes === worst.overloadMinutes &&
        intervalStart > worst.intervalStart)
    ) {
      worst = {
        intervalStart,
        requiredMinutes,
        capacityMinutes,
        overloadMinutes,
        demands: intervalDemands,
        availableDayCount,
      };
    }
  }

  const fallbackStart =
    days.find((day) => day.day < capacityUntil)?.day ??
    endingDemands[0]?.availableFrom ??
    capacityUntil;
  const resolved =
    worst ?? {
      intervalStart: fallbackStart,
      requiredMinutes: 0,
      capacityMinutes: 0,
      overloadMinutes: 0,
      demands: [] as CapacityFeasibilityDemand[],
      availableDayCount: 0,
    };

  return {
    deadlineAt: matchingDeadline?.deadlineAt ?? capacityUntil,
    capacityUntil,
    intervalStart: resolved.intervalStart,
    requiredMinutes: resolved.requiredMinutes,
    capacityMinutes: resolved.capacityMinutes,
    overloadMinutes: resolved.overloadMinutes,
    availableDayCount: resolved.availableDayCount,
    extraMinutesPerAvailableDay:
      resolved.overloadMinutes > 0 && resolved.availableDayCount > 0
        ? Math.ceil(resolved.overloadMinutes / resolved.availableDayCount)
        : null,
    demandIds: resolved.demands.map((demand) => demand.id),
    reliefCandidates: reliefCandidates(
      resolved.demands,
      resolved.overloadMinutes,
    ),
  };
}

export function analyzeCapacityFeasibility(
  rawDemands: CapacityFeasibilityDemand[],
  rawDays: CapacityFeasibilityDay[],
): CapacityFeasibilityAnalysis {
  const demands = normalizedDemands(rawDemands);
  const days = normalizedDays(rawDays);
  const deadlines = [
    ...new Set(demands.map((demand) => demand.capacityUntil)),
  ].sort((a, b) => a - b);

  const checkpoints = deadlines.map((deadline) =>
    checkpointForDeadline(demands, days, deadline),
  );
  const firstOverloadedDeadline =
    checkpoints.find((checkpoint) => checkpoint.overloadMinutes > 0) ?? null;
  const finalCutoff = deadlines[deadlines.length - 1] ?? null;
  const totalRequiredMinutes = demands.reduce(
    (sum, demand) => sum + demand.requiredMinutes,
    0,
  );
  const totalCapacityMinutes =
    finalCutoff == null
      ? 0
      : days
          .filter((day) => day.day < finalCutoff)
          .reduce((sum, day) => sum + day.usableMinutes, 0);
  const totalOverloadMinutes = checkpoints.reduce(
    (max, checkpoint) => Math.max(max, checkpoint.overloadMinutes),
    0,
  );

  return {
    feasible: firstOverloadedDeadline == null,
    totalRequiredMinutes,
    totalCapacityMinutes,
    totalOverloadMinutes,
    firstOverloadedDeadline,
    checkpoints,
  };
}
