import {
  StudyTaskPlanState,
  WorkspaceState,
  cloneWorkspace,
} from '@/src/data/schema';
import {
  ExamPlanStrain,
  JointExamPreparationPlan,
  buildJointExamPreparationPlan,
} from '@/src/features/exams/exam-plan-engine';
import {
  addLocalDays,
  commitmentOccurrencesForDay,
  freeStudyWindows,
  localDayKey,
  scheduledTasksForDay,
  startOfLocalDay,
} from '@/src/features/planning/day-engine';
import { postponeTask } from '@/src/features/planning/task-engine';

export type MissedRecoveredWindowSummary = {
  placements: ReclaimedStudyPlacement[];
  missedMinutes: number;
  reflowedMinutes: number;
  newlyUnallocatedMinutes: number;
  addedOverloadMinutes: number;
  strainBeforeMiss: ExamPlanStrain;
  strainAfterMiss: ExamPlanStrain;
  becameImpossible: boolean;
  deadlineTightened: boolean;
};

export type ReclaimedWindowProtection = {
  reason: 'active-focus' | 'schedule-change';
  protectedUntil: number | null;
  protectedMinutes: number;
  displacedMinutes: number;
};

export type AppliedReclaimedWindow = {
  commitmentId: string;
  commitmentTitle: string;
  occurrenceDateKey: string;
  start: number;
  end: number;
  placements: ReclaimedStudyPlacement[];
  missed: MissedRecoveredWindowSummary | null;
  protection: ReclaimedWindowProtection | null;
};

export type ReclaimedWindowBuildOptions = {
  unavailableUntil?: number;
  activeFocusTopicId?: string | null;
  activeFocusStartedAt?: number | null;
  protectionLeadMinutes?: number;
  horizonDays?: number;
};

export type ReclaimedStudyPlacement = {
  topicId: string;
  topicName: string;
  subject: string;
  kind: 'preparation' | 'revision';
  minutes: number;
  start: number;
  end: number;
};

export type AutopilotRecoveryEffect = {
  beforeOverloadMinutes: number;
  afterOverloadMinutes: number;
  overloadReducedMinutes: number;
  beforeUnallocatedMinutes: number;
  afterUnallocatedMinutes: number;
  unallocatedReducedMinutes: number;
  beforeStrain: ExamPlanStrain;
  afterStrain: ExamPlanStrain;
  beforeSafeCapacityMinutes: number;
  afterSafeCapacityMinutes: number;
  capacityGainedMinutes: number;
  feasibleAfter: boolean;
};

export type AutopilotRecoveryOption =
  | {
      id: string;
      kind: 'defer-task';
      title: string;
      detail: string;
      taskId: string;
      taskTitle: string;
      until: number;
      effect: AutopilotRecoveryEffect;
    }
  | {
      id: string;
      kind: 'reduce-exam-scope';
      title: string;
      detail: string;
      examId: string;
      examName: string;
      topicId: string;
      topicName: string;
      effect: AutopilotRecoveryEffect;
    }
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
      kind: 'defer-task';
      taskId: string;
      previous: {
        planState: StudyTaskPlanState;
        scheduledStart: number;
        scheduledEnd: number;
        postponedUntil: number;
        postponements: number | null;
        lastPostponedAt: number | null;
        updatedAt: number;
      };
    }
  | {
      kind: 'reduce-exam-scope';
      examId: string;
      topicId: string;
      previousIndex: number;
    }
  | {
      kind: 'reclaim-commitment';
      commitmentId: string;
      occurrenceDateKey: string;
      previousSkippedDates: string[];
      previousUpdatedAt: number;
    }
  | {
      kind: 'split-topic';
      topicId: string;
      previousPreferredBlockMinutes: number | null;
    };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unallocated(plan: JointExamPreparationPlan) {
  return (
    plan.unallocatedPreparationMinutes +
    plan.unallocatedRevisionMinutes
  );
}

function feasible(plan: JointExamPreparationPlan) {
  return plan.feasibility.feasible && unallocated(plan) === 0;
}

function safeCapacity(plan: JointExamPreparationPlan) {
  return plan.days.reduce(
    (sum, day) => sum + day.usableCapacityMinutes,
    0,
  );
}

function effect(
  before: JointExamPreparationPlan,
  after: JointExamPreparationPlan,
): AutopilotRecoveryEffect {
  const beforeOverloadMinutes = before.feasibility.totalOverloadMinutes;
  const afterOverloadMinutes = after.feasibility.totalOverloadMinutes;
  const beforeUnallocatedMinutes = unallocated(before);
  const afterUnallocatedMinutes = unallocated(after);
  const beforeSafeCapacityMinutes = safeCapacity(before);
  const afterSafeCapacityMinutes = safeCapacity(after);

  return {
    beforeOverloadMinutes,
    afterOverloadMinutes,
    overloadReducedMinutes: Math.max(
      0,
      beforeOverloadMinutes - afterOverloadMinutes,
    ),
    beforeUnallocatedMinutes,
    afterUnallocatedMinutes,
    unallocatedReducedMinutes: Math.max(
      0,
      beforeUnallocatedMinutes - afterUnallocatedMinutes,
    ),
    beforeStrain: before.strain,
    afterStrain: after.strain,
    beforeSafeCapacityMinutes,
    afterSafeCapacityMinutes,
    capacityGainedMinutes: Math.max(
      0,
      afterSafeCapacityMinutes - beforeSafeCapacityMinutes,
    ),
    feasibleAfter: feasible(after),
  };
}

function usefulEffect(value: AutopilotRecoveryEffect) {
  return (
    value.feasibleAfter ||
    value.overloadReducedMinutes > 0 ||
    value.unallocatedReducedMinutes > 0 ||
    value.capacityGainedMinutes > 0 ||
    value.afterStrain !== value.beforeStrain
  );
}

function affectedByExamBefore(
  workspace: WorkspaceState,
  topicId: string | null,
  cutoff: number,
) {
  if (!topicId) return false;
  const topic = workspace.topics.find((item) => item.id === topicId);
  if (!topic) return false;

  return workspace.exams.some((exam) => {
    if (exam.date > cutoff) return false;
    return exam.scope === 'topics'
      ? exam.topicIds.includes(topic.id)
      : exam.subjects.includes(topic.subject);
  });
}

function taskRecoveryOptions(
  workspace: WorkspaceState,
  before: JointExamPreparationPlan,
  now: number,
  brokenDeadline: number,
) {
  const until = addLocalDays(startOfLocalDay(brokenDeadline), 1);

  return workspace.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        task.priority < 3 &&
        (task.dueAt === 0 || task.dueAt > brokenDeadline) &&
        !task.examId &&
        !affectedByExamBefore(
          workspace,
          task.topicId,
          brokenDeadline,
        ),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.estimatedMinutes - a.estimatedMinutes ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 4)
    .flatMap((task) => {
      const preview = cloneWorkspace(workspace);
      const target = preview.tasks.find((item) => item.id === task.id);
      if (!target) return [];
      postponeTask(target, until, now);

      const after = buildJointExamPreparationPlan(preview, now, {
        maxDays: 120,
      });
      const impact = effect(before, after);
      if (!usefulEffect(impact)) return [];

      return [{
        id: `defer-task:${task.id}`,
        kind: 'defer-task' as const,
        title: `Move ${task.title} past this deadline`,
        detail:
          'This task is lower priority and has no earlier hard deadline. MYELIN will postpone it instead of deleting it.',
        taskId: task.id,
        taskTitle: task.title,
        until,
        effect: impact,
      }];
    });
}

function scopeRecoveryOptions(
  workspace: WorkspaceState,
  before: JointExamPreparationPlan,
  now: number,
  brokenDeadline: number,
) {
  const firstBreak = before.feasibility.firstOverloadedDeadline;
  const reliefIds = new Set(
    firstBreak?.reliefCandidates
      .filter(
        (candidate) =>
          candidate.kind === 'exam-preparation' &&
          candidate.movable,
      )
      .map((candidate) => candidate.demandId) ?? [],
  );

  const demands = before.workloadLedger.demands
    .filter(
      (demand) =>
        demand.source === 'exam-preparation' &&
        demand.topicId &&
        demand.priority < 3 &&
        (reliefIds.size === 0 || reliefIds.has(demand.id)),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.requiredMinutes - a.requiredMinutes ||
        a.label.localeCompare(b.label),
    );

  const options: AutopilotRecoveryOption[] = [];
  const seen = new Set<string>();

  for (const demand of demands) {
    const topicId = demand.topicId!;
    const topic = workspace.topics.find((item) => item.id === topicId);
    if (!topic) continue;

    const candidateExams = workspace.exams
      .filter(
        (exam) =>
          exam.date <= brokenDeadline &&
          exam.scope === 'topics' &&
          exam.topicIds.length > 1 &&
          exam.topicIds.includes(topicId) &&
          (demand.examIds?.includes(exam.id) ||
            demand.examId === exam.id),
      )
      .sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));

    for (const exam of candidateExams) {
      const key = `${exam.id}:${topicId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const preview = cloneWorkspace(workspace);
      const targetExam = preview.exams.find((item) => item.id === exam.id);
      if (!targetExam || targetExam.scope !== 'topics') continue;
      targetExam.topicIds = targetExam.topicIds.filter(
        (id) => id !== topicId,
      );
      if (!targetExam.topicIds.length) continue;

      const after = buildJointExamPreparationPlan(preview, now, {
        maxDays: 120,
      });
      const impact = effect(before, after);
      if (!usefulEffect(impact)) continue;

      options.push({
        id: `reduce-scope:${exam.id}:${topicId}`,
        kind: 'reduce-exam-scope',
        title: `Remove ${topic.name} from ${exam.name}`,
        detail:
          'This changes exam scope, not the Topic itself. Use it only if this material is genuinely not required for that exam.',
        examId: exam.id,
        examName: exam.name,
        topicId,
        topicName: topic.name,
        effect: impact,
      });

      if (options.length >= 4) return options;
    }
  }

  return options;
}

function reclaimedAvailableSegments(
  workspace: WorkspaceState,
  occurrenceStart: number,
  occurrenceEnd: number,
  earliestStart = occurrenceStart,
) {
  const from = Math.max(occurrenceStart, earliestStart);
  if (occurrenceEnd - from < 5 * 60_000) {
    return [] as Array<{ start: number; end: number }>;
  }

  const segments: Array<{ start: number; end: number }> = [];
  let day = startOfLocalDay(from);
  const finalDay = startOfLocalDay(
    Math.max(from, occurrenceEnd - 1),
  );

  while (day <= finalDay) {
    const windows = freeStudyWindows(workspace, day, {
      includeScheduledTasks: true,
      from: day === startOfLocalDay(from) ? from : day,
      minMinutes: 5,
    });

    for (const window of windows) {
      const start = Math.max(from, occurrenceStart, window.start);
      const end = Math.min(occurrenceEnd, window.end);
      if (end - start >= 5 * 60_000) {
        segments.push({ start, end });
      }
    }

    day = addLocalDays(day, 1);
  }

  return segments.sort((a, b) => a.start - b.start);
}

function placementMinutes(
  placements: ReclaimedStudyPlacement[],
) {
  return placements.reduce(
    (sum, placement) => sum + placement.minutes,
    0,
  );
}

function workspaceBeforeLaterScheduleChanges(
  workspace: WorkspaceState,
  recoveryAppliedAt: number,
) {
  const baseline = cloneWorkspace(workspace);
  baseline.commitments = baseline.commitments.filter(
    (commitment) =>
      commitment.updatedAt <= recoveryAppliedAt,
  );
  baseline.tasks = baseline.tasks.filter(
    (task) =>
      task.planState !== 'scheduled' ||
      task.updatedAt <= recoveryAppliedAt,
  );
  return baseline;
}

function reclaimedDayPlacements(
  before: JointExamPreparationPlan,
  after: JointExamPreparationPlan,
  occurrenceStart: number,
  occurrenceEnd: number,
  capacityGainedMinutes: number,
  earliestStart = occurrenceStart,
  availableSegments: Array<{ start: number; end: number }> = [
    {
      start: Math.max(occurrenceStart, earliestStart),
      end: occurrenceEnd,
    },
  ],
) {
  const day = startOfLocalDay(occurrenceStart);
  const beforeDay = before.days.find((item) => item.day === day);
  const afterDay = after.days.find((item) => item.day === day);
  if (!afterDay || capacityGainedMinutes < 5) {
    return [] as ReclaimedStudyPlacement[];
  }

  const keyFor = (
    block: JointExamPreparationPlan['days'][number]['blocks'][number],
  ) => block.kind + ':' + block.topicId;

  const beforeTotals = new Map<string, number>();
  for (const block of beforeDay?.blocks ?? []) {
    const key = keyFor(block);
    beforeTotals.set(
      key,
      (beforeTotals.get(key) ?? 0) + block.minutes,
    );
  }

  const afterTotals = new Map<string, number>();
  for (const block of afterDay.blocks) {
    const key = keyFor(block);
    afterTotals.set(
      key,
      (afterTotals.get(key) ?? 0) + block.minutes,
    );
  }

  const positiveDelta = new Map<string, number>();
  for (const [key, total] of afterTotals) {
    const gained = Math.max(
      0,
      total - (beforeTotals.get(key) ?? 0),
    );
    if (gained >= 5) positiveDelta.set(key, gained);
  }

  const normalizedSegments = availableSegments
    .map((segment) => ({
      start: Math.max(
        occurrenceStart,
        earliestStart,
        segment.start,
      ),
      end: Math.min(occurrenceEnd, segment.end),
    }))
    .filter(
      (segment) => segment.end - segment.start >= 5 * 60_000,
    )
    .sort((a, b) => a.start - b.start);

  let remaining = Math.min(
    capacityGainedMinutes,
    normalizedSegments.reduce(
      (sum, segment) =>
        sum +
        Math.floor((segment.end - segment.start) / 60_000),
      0,
    ),
  );
  const placements: ReclaimedStudyPlacement[] = [];
  let segmentIndex = 0;
  let cursor = normalizedSegments[0]?.start ?? occurrenceEnd;

  for (const block of afterDay.blocks) {
    if (remaining < 5) break;
    const key = keyFor(block);
    let delta = positiveDelta.get(key) ?? 0;
    if (delta < 5) continue;

    let blockRemaining = Math.min(
      block.minutes,
      delta,
      remaining,
    );

    while (
      blockRemaining >= 5 &&
      remaining >= 5 &&
      segmentIndex < normalizedSegments.length
    ) {
      const segment = normalizedSegments[segmentIndex]!;
      cursor = Math.max(cursor, segment.start);

      if (cursor >= segment.end) {
        segmentIndex += 1;
        cursor =
          normalizedSegments[segmentIndex]?.start ??
          occurrenceEnd;
        continue;
      }

      const segmentMinutes = Math.floor(
        (segment.end - cursor) / 60_000,
      );
      if (segmentMinutes < 5) {
        segmentIndex += 1;
        cursor =
          normalizedSegments[segmentIndex]?.start ??
          occurrenceEnd;
        continue;
      }

      const minutes = Math.min(
        blockRemaining,
        remaining,
        segmentMinutes,
      );
      if (minutes < 5) break;

      const end = cursor + minutes * 60_000;
      placements.push({
        topicId: block.topicId,
        topicName: block.topicName,
        subject: block.subject,
        kind: block.kind,
        minutes,
        start: cursor,
        end,
      });

      cursor = end;
      blockRemaining -= minutes;
      remaining -= minutes;
      delta -= minutes;

      if (cursor >= segment.end) {
        segmentIndex += 1;
        cursor =
          normalizedSegments[segmentIndex]?.start ??
          occurrenceEnd;
      }
    }

    positiveDelta.set(key, Math.max(0, delta));
  }

  return placements;
}

function studyCoverageForPlacement(
  workspace: WorkspaceState,
  placement: ReclaimedStudyPlacement,
) {
  let covered = 0;

  for (const entry of workspace.history) {
    if (
      entry.kind !== 'study' ||
      entry.topicId !== placement.topicId
    ) {
      continue;
    }

    if (
      entry.startedAt != null &&
      entry.endedAt != null
    ) {
      const overlapStart = Math.max(
        placement.start,
        entry.startedAt,
      );
      const overlapEnd = Math.min(
        placement.end,
        entry.endedAt,
      );
      if (overlapEnd > overlapStart) {
        covered += Math.floor(
          (overlapEnd - overlapStart) / 60_000,
        );
      }
      continue;
    }

    if (
      entry.at >= placement.start &&
      entry.at <= placement.end
    ) {
      covered += entry.minutes;
    }
  }

  return Math.min(
    placement.minutes,
    Math.max(0, covered),
  );
}

function historicalReclaimedPlacements(
  workspace: WorkspaceState,
  commitmentId: string,
  occurrenceDateKey: string,
  occurrenceStart: number,
  occurrenceEnd: number,
  checkpoint = occurrenceStart,
) {
  const historical = cloneWorkspace(workspace);
  historical.history = historical.history.filter(
    (entry) =>
      (entry.endedAt ?? entry.at) <= checkpoint,
  );
  historical.breaks = historical.breaks.filter(
    (entry) => entry.at <= checkpoint,
  );
  if (historical.focusOutcomes) {
    historical.focusOutcomes = historical.focusOutcomes.filter(
      (entry) =>
        (entry.endedAt ?? entry.startedAt ?? 0) <=
        checkpoint,
    );
  }

  const restored = cloneWorkspace(historical);
  const commitment = restored.commitments.find(
    (item) => item.id === commitmentId,
  );
  if (!commitment) {
    return [] as ReclaimedStudyPlacement[];
  }
  commitment.skippedDates = (
    commitment.skippedDates ?? []
  ).filter((key) => key !== occurrenceDateKey);

  const before = buildJointExamPreparationPlan(
    restored,
    checkpoint,
    { maxDays: 120 },
  );
  const after = buildJointExamPreparationPlan(
    historical,
    checkpoint,
    { maxDays: 120 },
  );
  const impact = effect(before, after);
  if (impact.capacityGainedMinutes < 5) {
    return [] as ReclaimedStudyPlacement[];
  }

  return reclaimedDayPlacements(
    before,
    after,
    occurrenceStart,
    occurrenceEnd,
    impact.capacityGainedMinutes,
    checkpoint,
    reclaimedAvailableSegments(
      historical,
      occurrenceStart,
      occurrenceEnd,
      checkpoint,
    ),
  );
}

function missedRecoveredSummary(
  workspace: WorkspaceState,
  currentPlan: JointExamPreparationPlan,
  commitmentId: string,
  occurrenceDateKey: string,
  occurrenceStart: number,
  occurrenceEnd: number,
  now: number,
) {
  if (now <= occurrenceStart) {
    return null;
  }

  const checkpoints = [
    occurrenceStart,
    ...workspace.history
      .filter(
        (entry) =>
          entry.kind === 'study' &&
          (entry.endedAt ?? entry.at) > occurrenceStart &&
          (entry.endedAt ?? entry.at) <=
            Math.min(now, occurrenceEnd),
      )
      .map((entry) => entry.endedAt ?? entry.at),
  ]
    .filter(
      (value, index, values) =>
        values.indexOf(value) === index,
    )
    .sort((a, b) => a - b);

  let expected: ReclaimedStudyPlacement[] = [];
  for (const checkpoint of checkpoints) {
    expected = expected.filter(
      (placement) => placement.start < checkpoint,
    );
    const snapshot = historicalReclaimedPlacements(
      workspace,
      commitmentId,
      occurrenceDateKey,
      occurrenceStart,
      occurrenceEnd,
      checkpoint,
    );
    expected.push(
      ...snapshot.filter(
        (placement) => placement.start >= checkpoint,
      ),
    );
  }

  const missedPlacements: ReclaimedStudyPlacement[] = [];
  let missedMinutes = 0;

  for (const placement of expected) {
    if (placement.end > now) continue;
    const covered = studyCoverageForPlacement(
      workspace,
      placement,
    );
    const missing = Math.max(
      0,
      placement.minutes - covered,
    );
    if (missing < 5) continue;

    missedMinutes += missing;
    missedPlacements.push({
      ...placement,
      minutes: missing,
    });
  }

  if (missedMinutes < 5) return null;

  const counterfactual = cloneWorkspace(workspace);
  missedPlacements.forEach((placement, index) => {
    counterfactual.history.push({
      id:
        'counterfactual-recovered:' +
        commitmentId +
        ':' +
        occurrenceDateKey +
        ':' +
        index,
      topicId: placement.topicId,
      at: Math.min(now, placement.end),
      kind: 'study',
      minutes: placement.minutes,
      grade: 0,
      effort: 3,
      prompt: '',
      response: '',
      confidence: 'unsure',
      plannedMinutes: placement.minutes,
      startedAt: placement.start,
      endedAt: placement.end,
      launchMode: 'full',
      tinyStep: '',
    });
  });

  const onTimePlan = buildJointExamPreparationPlan(
    counterfactual,
    now,
    { maxDays: 120 },
  );
  const currentUnallocated = unallocated(currentPlan);
  const onTimeUnallocated = unallocated(onTimePlan);
  const newlyUnallocatedMinutes = Math.max(
    0,
    currentUnallocated - onTimeUnallocated,
  );
  const addedOverloadMinutes = Math.max(
    0,
    currentPlan.feasibility.totalOverloadMinutes -
      onTimePlan.feasibility.totalOverloadMinutes,
  );
  const reflowedMinutes = Math.max(
    0,
    missedMinutes - newlyUnallocatedMinutes,
  );
  const strainRank: Record<ExamPlanStrain, number> = {
    comfortable: 0,
    balanced: 1,
    tight: 2,
    overloaded: 3,
  };
  const becameImpossible =
    feasible(onTimePlan) && !feasible(currentPlan);
  const deadlineTightened =
    becameImpossible ||
    newlyUnallocatedMinutes > 0 ||
    addedOverloadMinutes > 0 ||
    strainRank[currentPlan.strain] >
      strainRank[onTimePlan.strain];

  return {
    placements: missedPlacements,
    missedMinutes,
    reflowedMinutes,
    newlyUnallocatedMinutes,
    addedOverloadMinutes,
    strainBeforeMiss: onTimePlan.strain,
    strainAfterMiss: currentPlan.strain,
    becameImpossible,
    deadlineTightened,
  } satisfies MissedRecoveredWindowSummary;
}

export function buildAppliedReclaimedWindows(
  workspace: WorkspaceState,
  now = Date.now(),
  options: ReclaimedWindowBuildOptions = {},
) {
  const today = startOfLocalDay(now);
  const horizonDays = Math.max(
    0,
    Math.min(7, Math.round(options.horizonDays ?? 0)),
  );
  const after = buildJointExamPreparationPlan(workspace, now, {
    maxDays: 120,
  });
  const windows: AppliedReclaimedWindow[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = addLocalDays(today, offset);
    const dayKey = localDayKey(day);
    const previousDay = addLocalDays(day, -1);
    const previousKey = localDayKey(previousDay);

    for (const commitment of workspace.commitments) {
    if (
      !commitment.recurrenceDays.length ||
      (commitment.kind !== 'tuition' &&
        commitment.kind !== 'coaching')
    ) {
      continue;
    }

    const skippedKeys = (commitment.skippedDates ?? []).filter(
      (key) =>
        key === dayKey ||
        (commitment.endMinutes <= commitment.startMinutes &&
          key === previousKey),
    );

    for (const occurrenceDateKey of skippedKeys) {
      const restoredCommitment = {
        ...commitment,
        skippedDates: (commitment.skippedDates ?? []).filter(
          (key) => key !== occurrenceDateKey,
        ),
      };
      const occurrence = commitmentOccurrencesForDay(
        [restoredCommitment],
        day,
      ).find(
        (item) =>
          item.recurring &&
          item.occurrenceDateKey === occurrenceDateKey,
      );
      if (!occurrence) continue;

      const restoredWorkspace = cloneWorkspace(workspace);
      const target = restoredWorkspace.commitments.find(
        (item) => item.id === commitment.id,
      );
      if (!target) continue;
      target.skippedDates = (target.skippedDates ?? []).filter(
        (key) => key !== occurrenceDateKey,
      );

      const before = buildJointExamPreparationPlan(
        restoredWorkspace,
        now,
        { maxDays: 120 },
      );
      const impact = effect(before, after);
      const missed = missedRecoveredSummary(
        workspace,
        after,
        commitment.id,
        occurrenceDateKey,
        occurrence.start,
        occurrence.end,
        now,
      );

      const earliestStart = Math.max(
        now,
        occurrence.start,
      );
      const currentSegments = reclaimedAvailableSegments(
        workspace,
        occurrence.start,
        occurrence.end,
        earliestStart,
      );
      const normalPlacements =
        impact.capacityGainedMinutes >= 5 &&
        occurrence.end > earliestStart
          ? reclaimedDayPlacements(
              before,
              after,
              occurrence.start,
              occurrence.end,
              impact.capacityGainedMinutes,
              earliestStart,
              currentSegments,
            )
          : [];

      const leadMs =
        Math.max(
          0,
          options.protectionLeadMinutes ?? 10,
        ) * 60_000;
      const nextNormal = normalPlacements[0] ?? null;
      const unavailableUntil = Math.max(
        now,
        options.unavailableUntil ?? now,
      );
      const activeFocusLooksLikeThisReservation =
        Boolean(
          nextNormal &&
            options.activeFocusTopicId &&
            options.activeFocusTopicId === nextNormal.topicId &&
            options.activeFocusStartedAt != null &&
            options.activeFocusStartedAt >=
              nextNormal.start - 5 * 60_000 &&
            options.activeFocusStartedAt < nextNormal.end,
        );
      const protectForActiveFocus =
        Boolean(
          nextNormal &&
            unavailableUntil > nextNormal.start &&
            nextNormal.start <= now + leadMs &&
            !activeFocusLooksLikeThisReservation,
        );

      let placements = normalPlacements;
      let protection: ReclaimedWindowProtection | null = null;

      if (protectForActiveFocus) {
        const protectedSegments = reclaimedAvailableSegments(
          workspace,
          occurrence.start,
          occurrence.end,
          unavailableUntil,
        );
        placements = reclaimedDayPlacements(
          before,
          after,
          occurrence.start,
          occurrence.end,
          impact.capacityGainedMinutes,
          unavailableUntil,
          protectedSegments,
        );
        protection = {
          reason: 'active-focus',
          protectedUntil: unavailableUntil,
          protectedMinutes: placementMinutes(placements),
          displacedMinutes: Math.max(
            0,
            placementMinutes(normalPlacements) -
              placementMinutes(placements),
          ),
        };
      } else if (
        commitment.updatedAt > 0 &&
        occurrence.end > earliestStart
      ) {
        const baselineWorkspace =
          workspaceBeforeLaterScheduleChanges(
            workspace,
            commitment.updatedAt,
          );
        const baselinePlacements =
          impact.capacityGainedMinutes >= 5
            ? reclaimedDayPlacements(
                before,
                after,
                occurrence.start,
                occurrence.end,
                impact.capacityGainedMinutes,
                earliestStart,
                reclaimedAvailableSegments(
                  baselineWorkspace,
                  occurrence.start,
                  occurrence.end,
                  earliestStart,
                ),
              )
            : [];
        const baselineMinutes =
          placementMinutes(baselinePlacements);
        const currentMinutes = placementMinutes(
          normalPlacements,
        );
        const baselineShape = baselinePlacements
          .map(
            (placement) =>
              placement.start + ':' + placement.end,
          )
          .join('|');
        const currentShape = normalPlacements
          .map(
            (placement) =>
              placement.start + ':' + placement.end,
          )
          .join('|');

        const laterFixedConflict =
          workspace.commitments.some(
            (item) =>
              item.id !== commitment.id &&
              item.updatedAt > commitment.updatedAt &&
              commitmentOccurrencesForDay(
                [item],
                startOfLocalDay(occurrence.start),
              ).some(
                (itemOccurrence) =>
                  itemOccurrence.end > occurrence.start &&
                  itemOccurrence.start < occurrence.end,
              ),
          ) ||
          scheduledTasksForDay(
            workspace.tasks,
            startOfLocalDay(occurrence.start),
          ).some(
            (task) =>
              task.updatedAt > commitment.updatedAt &&
              task.scheduledEnd > occurrence.start &&
              task.scheduledStart < occurrence.end,
          );

        if (
          laterFixedConflict &&
          baselineShape !== currentShape
        ) {
          protection = {
            reason: 'schedule-change',
            protectedUntil: null,
            protectedMinutes: currentMinutes,
            displacedMinutes: Math.max(
              0,
              baselineMinutes - currentMinutes,
            ),
          };
        }
      }

      if (!placements.length && !missed && !protection) continue;

      const windowKey =
        commitment.id + ':' + occurrenceDateKey;
      if (seen.has(windowKey)) continue;
      seen.add(windowKey);

      windows.push({
        commitmentId: commitment.id,
        commitmentTitle: commitment.title,
        occurrenceDateKey,
        start: occurrence.start,
        end: occurrence.end,
        placements,
        missed,
        protection,
      });
    }
    }
  }

  return windows
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.commitmentTitle.localeCompare(b.commitmentTitle),
    )
    .slice(0, horizonDays > 0 ? 12 : 4);
}

function reclaimableCommitmentOptions(
  workspace: WorkspaceState,
  before: JointExamPreparationPlan,
  now: number,
  brokenDeadline: number,
) {
  const options: Array<
    Extract<
      AutopilotRecoveryOption,
      { kind: 'reclaim-commitment' }
    >
  > = [];
  const today = startOfLocalDay(now);
  const finalDay = startOfLocalDay(brokenDeadline);
  const maxDays = Math.min(
    30,
    Math.max(
      0,
      Math.round((finalDay - today) / 86_400_000),
    ),
  );
  const seen = new Set<string>();

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const day = addLocalDays(today, offset);
    const occurrences = commitmentOccurrencesForDay(
      workspace.commitments,
      day,
    ).filter(
      (occurrence) =>
        occurrence.recurring &&
        occurrence.start >= now &&
        occurrence.end > now &&
        (occurrence.kind === 'tuition' ||
          occurrence.kind === 'coaching'),
    );

    for (const occurrence of occurrences) {
      const key =
        occurrence.commitmentId +
        ':' +
        occurrence.occurrenceDateKey;
      if (seen.has(key)) continue;
      seen.add(key);

      const preview = cloneWorkspace(workspace);
      const commitment = preview.commitments.find(
        (item) => item.id === occurrence.commitmentId,
      );
      if (!commitment) continue;

      commitment.skippedDates = [
        ...new Set([
          ...(commitment.skippedDates ?? []),
          occurrence.occurrenceDateKey,
        ]),
      ];
      commitment.updatedAt = now;

      const after = buildJointExamPreparationPlan(preview, now, {
        maxDays: 120,
      });
      const impact = effect(before, after);
      if (
        impact.capacityGainedMinutes <= 0 ||
        !usefulEffect(impact)
      ) {
        continue;
      }

      const reclaimedClockMinutes = Math.max(
        0,
        Math.round(
          (occurrence.end - occurrence.start) / 60_000,
        ),
      );
      const placements = reclaimedDayPlacements(
        before,
        after,
        occurrence.start,
        occurrence.end,
        impact.capacityGainedMinutes,
        occurrence.start,
        reclaimedAvailableSegments(
          preview,
          occurrence.start,
          occurrence.end,
          occurrence.start,
        ),
      );
      if (!placements.length) continue;

      options.push({
        id:
          'reclaim-commitment:' +
          occurrence.commitmentId +
          ':' +
          occurrence.occurrenceDateKey,
        kind: 'reclaim-commitment',
        title: 'If cancelled, reclaim ' + occurrence.title,
        detail:
          'This marks only this recurring occurrence as skipped. MYELIN previews the safe capacity actually gained, which may be less than the full clock time.',
        commitmentId: occurrence.commitmentId,
        commitmentTitle: occurrence.title,
        occurrenceDateKey: occurrence.occurrenceDateKey,
        occurrenceStart: occurrence.start,
        occurrenceEnd: occurrence.end,
        reclaimedClockMinutes,
        placements,
        effect: impact,
      });

      if (options.length >= 6) return options;
    }
  }

  return options.sort(
    (a, b) =>
      b.effect.capacityGainedMinutes -
        a.effect.capacityGainedMinutes ||
      b.effect.overloadReducedMinutes -
        a.effect.overloadReducedMinutes ||
      a.occurrenceStart - b.occurrenceStart,
  );
}

function splitTopicRecoveryOptions(
  workspace: WorkspaceState,
  before: JointExamPreparationPlan,
  now: number,
  brokenDeadline: number,
) {
  const configuredFocus = clamp(
    Math.round(workspace.settings.focusMinutes || 45),
    10,
    90,
  );
  const targetBlockMinutes = clamp(
    Math.round(configuredFocus * 0.55),
    10,
    Math.min(25, configuredFocus),
  );

  const options: AutopilotRecoveryOption[] = [];
  const seen = new Set<string>();

  const demands = before.workloadLedger.demands
    .filter(
      (demand) =>
        demand.source === 'exam-preparation' &&
        demand.topicId &&
        demand.deadlineAt <= brokenDeadline &&
        demand.requiredMinutes >= Math.max(40, targetBlockMinutes * 2),
    )
    .sort(
      (a, b) =>
        b.requiredMinutes - a.requiredMinutes ||
        b.priority - a.priority ||
        a.label.localeCompare(b.label),
    );

  for (const demand of demands) {
    const topic = workspace.topics.find(
      (item) => item.id === demand.topicId,
    );
    if (!topic || seen.has(topic.id)) continue;
    seen.add(topic.id);

    const currentCap =
      topic.preferredBlockMinutes ?? configuredFocus;
    if (currentCap <= targetBlockMinutes) continue;

    const preview = cloneWorkspace(workspace);
    const target = preview.topics.find(
      (item) => item.id === topic.id,
    );
    if (!target) continue;
    target.preferredBlockMinutes = targetBlockMinutes;

    const after = buildJointExamPreparationPlan(preview, now, {
      maxDays: 120,
    });

    options.push({
      id: `split-topic:${topic.id}:${targetBlockMinutes}`,
      kind: 'split-topic',
      title: `Split ${topic.name} into ~${targetBlockMinutes}m blocks`,
      detail:
        'This keeps the same exam scope and total workload. It only caps future blocks so heavy work is spread into smaller sessions and can interleave with other topics.',
      topicId: topic.id,
      topicName: topic.name,
      targetBlockMinutes,
      effect: effect(before, after),
    });

    if (options.length >= 3) break;
  }

  return options;
}

function reliefSort(
  a: AutopilotRecoveryOption,
  b: AutopilotRecoveryOption,
) {
  return (
    Number(b.effect.feasibleAfter) -
      Number(a.effect.feasibleAfter) ||
    b.effect.overloadReducedMinutes -
      a.effect.overloadReducedMinutes ||
    b.effect.unallocatedReducedMinutes -
      a.effect.unallocatedReducedMinutes ||
    b.effect.capacityGainedMinutes -
      a.effect.capacityGainedMinutes ||
    a.title.localeCompare(b.title)
  );
}

export function buildAutopilotRecoveryOptions(
  workspace: WorkspaceState,
  now = Date.now(),
  limit = 3,
) {
  const before = buildJointExamPreparationPlan(workspace, now, {
    maxDays: 120,
  });
  const firstBreak = before.feasibility.firstOverloadedDeadline;
  const brokenDeadline =
    firstBreak?.deadlineAt ??
    before.exams
      .filter((exam) => exam.examDate >= now)
      .sort((a, b) => a.examDate - b.examDate)[0]?.examDate ??
    0;

  if (
    !brokenDeadline ||
    (feasible(before) && unallocated(before) === 0)
  ) {
    return [] as AutopilotRecoveryOption[];
  }

  const safeLimit = Math.max(1, Math.min(4, limit));
  const relief = [
    ...reclaimableCommitmentOptions(
      workspace,
      before,
      now,
      brokenDeadline,
    ),
    ...taskRecoveryOptions(
      workspace,
      before,
      now,
      brokenDeadline,
    ),
    ...scopeRecoveryOptions(
      workspace,
      before,
      now,
      brokenDeadline,
    ),
  ].sort(reliefSort);
  const split = splitTopicRecoveryOptions(
    workspace,
    before,
    now,
    brokenDeadline,
  )[0];

  if (!split) return relief.slice(0, safeLimit);
  if (safeLimit === 1) return relief.length ? [relief[0]!] : [split];

  return [
    ...relief.slice(0, safeLimit - 1),
    split,
  ];
}

export type RecoveredReminderHandoff = {
  commitmentId: string;
  occurrenceDateKey: string;
  topicId: string | null;
  scheduledStart: number | null;
  scheduledEnd: number | null;
};

export type RecoveredReminderUpdateReason =
  | 'reflowed'
  | 'missed'
  | 'passed'
  | 'window-finished'
  | 'next-window';

export type RecoveredReminderResolution = {
  status: 'exact' | 'updated';
  reason: RecoveredReminderUpdateReason | null;
  window: AppliedReclaimedWindow | null;
  placement: ReclaimedStudyPlacement | null;
};

const RECOVERED_REMINDER_EXACT_TOLERANCE_MS =
  5 * 60_000;

function recoveredPlacementDistance(
  placement: ReclaimedStudyPlacement,
  handoff: RecoveredReminderHandoff,
) {
  const target =
    handoff.scheduledStart ?? placement.start;
  return Math.abs(placement.start - target);
}

function recoveredPlacementStillExact(
  placement: ReclaimedStudyPlacement,
  handoff: RecoveredReminderHandoff,
  now: number,
) {
  if (placement.end <= now) return false;
  if (
    handoff.topicId &&
    placement.topicId !== handoff.topicId
  ) {
    return false;
  }

  const startMatches =
    handoff.scheduledStart == null ||
    Math.abs(
      placement.start - handoff.scheduledStart,
    ) <= RECOVERED_REMINDER_EXACT_TOLERANCE_MS;
  const endMatches =
    handoff.scheduledEnd == null ||
    Math.abs(
      placement.end - handoff.scheduledEnd,
    ) <= RECOVERED_REMINDER_EXACT_TOLERANCE_MS;

  return startMatches && endMatches;
}

function recoveredOriginalWasMissed(
  window: AppliedReclaimedWindow,
  handoff: RecoveredReminderHandoff,
) {
  return Boolean(
    window.missed?.placements.some((placement) => {
      if (
        handoff.topicId &&
        placement.topicId !== handoff.topicId
      ) {
        return false;
      }
      if (handoff.scheduledStart == null) return true;
      return (
        Math.abs(
          placement.start - handoff.scheduledStart,
        ) <= RECOVERED_REMINDER_EXACT_TOLERANCE_MS
      );
    }),
  );
}

export function resolveRecoveredReminderHandoff(
  windows: AppliedReclaimedWindow[],
  handoff: RecoveredReminderHandoff,
  now = Date.now(),
): RecoveredReminderResolution {
  const exactWindow =
    windows.find(
      (window) =>
        window.commitmentId ===
          handoff.commitmentId &&
        window.occurrenceDateKey ===
          handoff.occurrenceDateKey,
    ) ?? null;

  if (exactWindow) {
    const exactPlacement =
      exactWindow.placements.find((placement) =>
        recoveredPlacementStillExact(
          placement,
          handoff,
          now,
        ),
      ) ?? null;

    if (exactPlacement) {
      return {
        status: 'exact',
        reason: null,
        window: exactWindow,
        placement: exactPlacement,
      };
    }

    const liveSameWindow =
      exactWindow.placements
        .filter((placement) => placement.end > now)
        .sort((a, b) => {
          const sameTopicA =
            handoff.topicId &&
            a.topicId === handoff.topicId
              ? 0
              : 1;
          const sameTopicB =
            handoff.topicId &&
            b.topicId === handoff.topicId
              ? 0
              : 1;
          return (
            sameTopicA - sameTopicB ||
            recoveredPlacementDistance(a, handoff) -
              recoveredPlacementDistance(b, handoff) ||
            a.start - b.start
          );
        })[0] ?? null;

    if (liveSameWindow) {
      return {
        status: 'updated',
        reason: recoveredOriginalWasMissed(
          exactWindow,
          handoff,
        )
          ? 'missed'
          : handoff.scheduledEnd != null &&
              handoff.scheduledEnd <= now
            ? 'passed'
            : 'reflowed',
        window: exactWindow,
        placement: liveSameWindow,
      };
    }
  }

  const nextRecovered = windows
    .flatMap((window) =>
      window.placements
        .filter((placement) => placement.end > now)
        .map((placement) => ({
          window,
          placement,
        })),
    )
    .sort(
      (a, b) =>
        a.placement.start - b.placement.start ||
        a.placement.topicName.localeCompare(
          b.placement.topicName,
        ),
    )[0];

  if (nextRecovered) {
    return {
      status: 'updated',
      reason: 'next-window',
      window: nextRecovered.window,
      placement: nextRecovered.placement,
    };
  }

  return {
    status: 'updated',
    reason: exactWindow
      ? recoveredOriginalWasMissed(
          exactWindow,
          handoff,
        )
        ? 'missed'
        : 'passed'
      : 'window-finished',
    window: null,
    placement: null,
  };
}

export function applyAutopilotRecoveryOption(
  workspace: WorkspaceState,
  option: AutopilotRecoveryOption,
  now = Date.now(),
): AutopilotRecoveryUndo | null {
  if (option.kind === 'defer-task') {
    const task = workspace.tasks.find(
      (item) => item.id === option.taskId,
    );
    if (!task || task.status !== 'open' || task.priority >= 3) return null;

    const undo: AutopilotRecoveryUndo = {
      kind: 'defer-task',
      taskId: task.id,
      previous: {
        planState: task.planState,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        postponedUntil: task.postponedUntil,
        postponements: task.postponements ?? null,
        lastPostponedAt: task.lastPostponedAt ?? null,
        updatedAt: task.updatedAt,
      },
    };
    postponeTask(task, option.until, now);
    return undo;
  }

  if (option.kind === 'reclaim-commitment') {
    const commitment = workspace.commitments.find(
      (item) => item.id === option.commitmentId,
    );
    if (
      !commitment ||
      !commitment.recurrenceDays.length ||
      (commitment.kind !== 'tuition' &&
        commitment.kind !== 'coaching')
    ) {
      return null;
    }

    const previousSkippedDates = [
      ...(commitment.skippedDates ?? []),
    ];
    if (
      previousSkippedDates.includes(
        option.occurrenceDateKey,
      )
    ) {
      return null;
    }

    const previousUpdatedAt = commitment.updatedAt;
    commitment.skippedDates = [
      ...new Set([
        ...previousSkippedDates,
        option.occurrenceDateKey,
      ]),
    ];
    commitment.updatedAt = now;

    return {
      kind: 'reclaim-commitment',
      commitmentId: commitment.id,
      occurrenceDateKey: option.occurrenceDateKey,
      previousSkippedDates,
      previousUpdatedAt,
    };
  }

  if (option.kind === 'reduce-exam-scope') {
    const exam = workspace.exams.find(
      (item) => item.id === option.examId,
    );
    if (
      !exam ||
      exam.scope !== 'topics' ||
      exam.topicIds.length <= 1 ||
      !exam.topicIds.includes(option.topicId)
    ) {
      return null;
    }

    const previousIndex = exam.topicIds.indexOf(option.topicId);
    exam.topicIds = exam.topicIds.filter(
      (topicId) => topicId !== option.topicId,
    );
    return {
      kind: 'reduce-exam-scope',
      examId: exam.id,
      topicId: option.topicId,
      previousIndex,
    };
  }

  const topic = workspace.topics.find(
    (item) => item.id === option.topicId,
  );
  if (!topic) return null;
  const previousPreferredBlockMinutes =
    topic.preferredBlockMinutes ?? null;
  topic.preferredBlockMinutes = option.targetBlockMinutes;
  return {
    kind: 'split-topic',
    topicId: topic.id,
    previousPreferredBlockMinutes,
  };
}

export function undoAutopilotRecovery(
  workspace: WorkspaceState,
  undo: AutopilotRecoveryUndo,
) {
  if (undo.kind === 'defer-task') {
    const task = workspace.tasks.find(
      (item) => item.id === undo.taskId,
    );
    if (!task) return false;

    task.planState = undo.previous.planState;
    task.scheduledStart = undo.previous.scheduledStart;
    task.scheduledEnd = undo.previous.scheduledEnd;
    task.postponedUntil = undo.previous.postponedUntil;
    task.updatedAt = undo.previous.updatedAt;
    if (undo.previous.postponements == null) {
      delete task.postponements;
    } else {
      task.postponements = undo.previous.postponements;
    }
    if (undo.previous.lastPostponedAt == null) {
      delete task.lastPostponedAt;
    } else {
      task.lastPostponedAt = undo.previous.lastPostponedAt;
    }
    return true;
  }

  if (undo.kind === 'reclaim-commitment') {
    const commitment = workspace.commitments.find(
      (item) => item.id === undo.commitmentId,
    );
    if (!commitment) return false;

    commitment.skippedDates = [
      ...undo.previousSkippedDates,
    ];
    commitment.updatedAt = undo.previousUpdatedAt;
    return true;
  }

  if (undo.kind === 'reduce-exam-scope') {
    const exam = workspace.exams.find(
      (item) => item.id === undo.examId,
    );
    if (
      !exam ||
      exam.scope !== 'topics' ||
      exam.topicIds.includes(undo.topicId)
    ) {
      return false;
    }

    const index = clamp(
      undo.previousIndex,
      0,
      exam.topicIds.length,
    );
    exam.topicIds.splice(index, 0, undo.topicId);
    return true;
  }

  const topic = workspace.topics.find(
    (item) => item.id === undo.topicId,
  );
  if (!topic) return false;
  if (undo.previousPreferredBlockMinutes == null) {
    delete topic.preferredBlockMinutes;
  } else {
    topic.preferredBlockMinutes =
      undo.previousPreferredBlockMinutes;
  }
  return true;
}
