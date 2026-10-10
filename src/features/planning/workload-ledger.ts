import { StudyTask, WorkspaceState } from '@/src/data/schema';
import { examAppliesToTopic, examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import {
  CapacityDemandPriority,
  CapacityFeasibilityAnalysis,
  CapacityFeasibilityDay,
  CapacityFeasibilityDemand,
  analyzeCapacityFeasibility,
} from '@/src/features/planning/capacity-feasibility';
import {
  addLocalDays,
  freeStudyWindows,
  startOfLocalDay,
} from '@/src/features/planning/day-engine';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';

export type WorkloadLedgerSource =
  | 'task'
  | 'exam-preparation'
  | 'exam-revision';

export type WorkloadLedgerExamDemand = {
  id: string;
  label: string;
  kind: 'exam-preparation' | 'exam-revision';
  requiredMinutes: number;
  priority: CapacityDemandPriority;
  availableFrom: number;
  deadlineAt: number;
  capacityUntil: number;
  movable?: boolean;
  topicId?: string;
  examId?: string;
  examIds?: string[];
};

export type WorkloadLedgerDemand = CapacityFeasibilityDemand & {
  source: WorkloadLedgerSource;
  taskId?: string;
  topicId?: string;
  examId?: string;
  examIds?: string[];
  segment?: 'scheduled' | 'remaining';
};

export type WorkloadCoverage = {
  taskId: string;
  examDemandId: string;
  minutes: number;
  reason: 'task-covers-preparation' | 'revision-task-covers-revision';
};

export type UnifiedWorkloadLedger = {
  generatedAt: number;
  horizonDays: number;
  demands: WorkloadLedgerDemand[];
  capacityDays: CapacityFeasibilityDay[];
  coverage: WorkloadCoverage[];
  feasibility: CapacityFeasibilityAnalysis;
  taskRemainingMinutes: number;
  scheduledTaskMinutes: number;
  unscheduledTaskMinutes: number;
  examPreparationMinutes: number;
  examRevisionMinutes: number;
  deduplicatedMinutes: number;
};

export type UnifiedWorkloadLedgerOptions = {
  sustainableDailyMinutes: number;
  bufferRatio: number;
  horizonDays: number;
  examDemands?: WorkloadLedgerExamDemand[];
};

type TaskWork = {
  task: StudyTask;
  remainingMinutes: number;
  scheduledMinutes: number;
  unscheduledMinutes: number;
  hardDeadlineAt: number | null;
  hardCapacityUntil: number | null;
  scheduledDay: number | null;
  scheduledCapacityUntil: number | null;
  associatedExamIds: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dayEnd(day: number) {
  return addLocalDays(startOfLocalDay(day), 1);
}

function actualStudyMinutesForDay(workspace: WorkspaceState, day: number) {
  const start = startOfLocalDay(day);
  const end = dayEnd(day);
  const topicSessions = workspace.history
    .filter((session) => session.at >= start && session.at < end)
    .reduce((sum, session) => sum + Math.max(0, session.minutes), 0);
  const standaloneTaskSessions = (workspace.focusOutcomes ?? [])
    .filter(
      (outcome) =>
        outcome.taskOnly &&
        outcome.status === 'finished' &&
        outcome.endedAt >= start &&
        outcome.endedAt < end,
    )
    .reduce((sum, outcome) => sum + Math.max(0, outcome.minutes), 0);

  return Math.round(topicSessions + standaloneTaskSessions);
}

// One shared-topic task may support several exams. Its recorded direct exam
// link is not permission to ignore an EARLIER exam covering the same topic.
// Exam dates are local calendar days, not a noon-time appointment.
function taskAssociatedExams(
  workspace: WorkspaceState,
  task: StudyTask,
  now: number,
) {
  const topic = task.topicId
    ? workspace.topics.find((item) => item.id === task.topicId)
    : null;
  return workspace.exams
    .filter((exam) =>
      examCalendarDaysUntil(exam.date, now) >= 0 &&
      (exam.id === task.examId || (topic != null && examAppliesToTopic(exam, topic))),
    )
    .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
}

function taskHardDeadline(
  workspace: WorkspaceState,
  task: StudyTask,
  now: number,
) {
  const today = startOfLocalDay(now);
  const exams = taskAssociatedExams(workspace, task, now);
  const deadlines: Array<{ at: number; cutoff: number }> = [];

  if (task.dueAt > 0) {
    deadlines.push({
      at: task.dueAt,
      cutoff:
        task.dueAt < now
          ? addLocalDays(today, 1)
          : addLocalDays(startOfLocalDay(task.dueAt), 1),
    });
  }

  const earliestExam = exams[0] ?? null;
  if (earliestExam) {
    deadlines.push({
      at: earliestExam.date,
      cutoff: startOfLocalDay(earliestExam.date),
    });
  }

  deadlines.sort((a, b) => a.cutoff - b.cutoff || a.at - b.at);
  return {
    exams,
    deadline: deadlines[0] ?? null,
  };
}

function scheduledMinutesBefore(
  task: StudyTask,
  now: number,
  capacityUntil: number | null,
) {
  if (
    task.planState !== 'scheduled' ||
    task.scheduledEnd <= now ||
    task.scheduledEnd <= task.scheduledStart
  ) {
    return {
      minutes: 0,
      day: null as number | null,
      cutoff: null as number | null,
    };
  }

  const scheduledStart = Math.max(now, task.scheduledStart);
  const scheduledEnd =
    capacityUntil == null
      ? task.scheduledEnd
      : Math.min(task.scheduledEnd, capacityUntil);
  if (scheduledEnd <= scheduledStart) {
    return {
      minutes: 0,
      day: null as number | null,
      cutoff: null as number | null,
    };
  }

  const minutes = Math.max(
    0,
    Math.round((scheduledEnd - scheduledStart) / 60_000),
  );
  const day = startOfLocalDay(scheduledStart);
  return {
    minutes,
    day,
    cutoff: addLocalDays(day, 1),
  };
}

function taskWork(
  workspace: WorkspaceState,
  task: StudyTask,
  now: number,
): TaskWork | null {
  if (task.status !== 'open') return null;
  // A saved estimate that has already been met is ZERO outstanding work,
  // even if this legacy/open task has not been marked complete. Do not turn
  // that zero into the full estimate again. An absent estimate is different:
  // retain the existing provisional 25-minute capacity assumption for it.
  const remainingMinutes = task.estimatedMinutes > 0
    ? taskRemainingMinutes(task)
    : 25;
  if (remainingMinutes <= 0) return null;

  const { exams, deadline } = taskHardDeadline(workspace, task, now);
  const scheduled = scheduledMinutesBefore(
    task,
    now,
    deadline?.cutoff ?? null,
  );
  const scheduledMinutes = Math.min(remainingMinutes, scheduled.minutes);
  const unscheduledMinutes = Math.max(
    0,
    remainingMinutes - scheduledMinutes,
  );

  return {
    task,
    remainingMinutes,
    scheduledMinutes,
    unscheduledMinutes,
    hardDeadlineAt: deadline?.at ?? null,
    hardCapacityUntil: deadline?.cutoff ?? null,
    scheduledDay: scheduled.day,
    scheduledCapacityUntil: scheduled.cutoff,
    associatedExamIds: exams.map((exam) => exam.id),
  };
}

function taskCoverageOrder(
  task: TaskWork,
  examDemands: Array<WorkloadLedgerExamDemand & { remainingMinutes: number }>,
) {
  const candidates: Array<{
    demand: WorkloadLedgerExamDemand & { remainingMinutes: number };
    reason: WorkloadCoverage['reason'];
  }> = [];

  if (task.task.type === 'revision' && task.task.examId) {
    const revision = examDemands.find(
      (demand) =>
        demand.kind === 'exam-revision' &&
        demand.examId === task.task.examId &&
        demand.remainingMinutes > 0 &&
        (task.hardCapacityUntil == null ||
          task.hardCapacityUntil <= demand.capacityUntil),
    );
    if (revision) {
      candidates.push({
        demand: revision,
        reason: 'revision-task-covers-revision',
      });
    }
  }

  if (task.task.type !== 'personal' && task.task.topicId) {
    const preparation = examDemands
      .filter(
        (demand) =>
          demand.kind === 'exam-preparation' &&
          demand.topicId === task.task.topicId &&
          demand.remainingMinutes > 0 &&
          (task.hardCapacityUntil == null ||
            task.hardCapacityUntil <= demand.capacityUntil) &&
          (!task.task.examId ||
            demand.examIds?.includes(task.task.examId) ||
            demand.examId === task.task.examId),
      )
      .sort(
        (a, b) =>
          a.capacityUntil - b.capacityUntil ||
          b.priority - a.priority ||
          a.label.localeCompare(b.label),
      )[0];

    if (preparation) {
      candidates.push({
        demand: preparation,
        reason: 'task-covers-preparation',
      });
    }
  }

  return candidates;
}

function taskLedgerDemands(
  task: TaskWork,
  now: number,
  horizonEnd: number,
): WorkloadLedgerDemand[] {
  const result: WorkloadLedgerDemand[] = [];
  const today = startOfLocalDay(now);

  if (
    task.scheduledMinutes > 0 &&
    task.scheduledDay != null &&
    task.scheduledCapacityUntil != null &&
    task.scheduledDay < horizonEnd
  ) {
    result.push({
      id: `task:${task.task.id}:scheduled`,
      label: task.task.title,
      kind: 'task',
      source: 'task',
      taskId: task.task.id,
      topicId: task.task.topicId ?? undefined,
      examId: task.task.examId ?? undefined,
      requiredMinutes: task.scheduledMinutes,
      priority: task.task.priority,
      availableFrom: task.scheduledDay,
      deadlineAt: task.task.scheduledEnd,
      capacityUntil: task.scheduledCapacityUntil,
      movable: task.task.priority < 3,
      segment: 'scheduled',
    });
  }

  if (
    task.unscheduledMinutes > 0 &&
    task.hardDeadlineAt != null &&
    task.hardCapacityUntil != null &&
    task.hardCapacityUntil <= horizonEnd
  ) {
    result.push({
      id: `task:${task.task.id}:remaining`,
      label: task.task.title,
      kind: 'task',
      source: 'task',
      taskId: task.task.id,
      topicId: task.task.topicId ?? undefined,
      examId: task.task.examId ?? undefined,
      requiredMinutes: task.unscheduledMinutes,
      priority: task.task.priority,
      availableFrom:
        task.task.postponedUntil > now
          ? Math.min(
              startOfLocalDay(task.task.postponedUntil),
              task.hardCapacityUntil,
            )
          : today,
      deadlineAt: task.hardDeadlineAt,
      capacityUntil: task.hardCapacityUntil,
      movable: task.task.priority < 3,
      segment: 'remaining',
    });
  }

  return result;
}

function capacityDays(
  workspace: WorkspaceState,
  now: number,
  sustainableDailyMinutes: number,
  bufferRatio: number,
  horizonDays: number,
): CapacityFeasibilityDay[] {
  const today = startOfLocalDay(now);
  const days: CapacityFeasibilityDay[] = [];
  const sustainable = Math.max(0, Math.round(sustainableDailyMinutes));
  const buffer = clamp(bufferRatio, 0, 0.4);

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = addLocalDays(today, offset);
    const from = offset === 0 ? now : day;
    const freeClockMinutes = freeStudyWindows(workspace, day, {
      includeScheduledTasks: false,
      from,
      minMinutes: 5,
    }).reduce((sum, window) => sum + window.minutes, 0);
    const alreadyUsed = actualStudyMinutesForDay(workspace, day);
    const sustainableRemaining = Math.max(0, sustainable - alreadyUsed);
    const gross = Math.max(
      0,
      Math.min(freeClockMinutes, sustainableRemaining),
    );
    days.push({
      day,
      usableMinutes: Math.max(0, Math.floor(gross * (1 - buffer))),
    });
  }

  return days;
}

export function buildUnifiedWorkloadLedger(
  workspace: WorkspaceState,
  now: number,
  options: UnifiedWorkloadLedgerOptions,
): UnifiedWorkloadLedger {
  const horizonDays = clamp(Math.round(options.horizonDays), 1, 120);
  const today = startOfLocalDay(now);
  const horizonEnd = addLocalDays(today, horizonDays);
  const examDemands = (options.examDemands ?? []).map((demand) => ({
    ...demand,
    remainingMinutes: Math.max(0, Math.round(demand.requiredMinutes)),
  }));
  const taskWorkItems = workspace.tasks
    .map((task) => taskWork(workspace, task, now))
    .filter((item): item is TaskWork => Boolean(item));

  const coverage: WorkloadCoverage[] = [];
  for (const task of taskWorkItems) {
    let availableCoverage = task.remainingMinutes;
    for (const candidate of taskCoverageOrder(task, examDemands)) {
      if (availableCoverage <= 0) break;
      const minutes = Math.min(
        availableCoverage,
        candidate.demand.remainingMinutes,
      );
      if (minutes <= 0) continue;
      candidate.demand.remainingMinutes -= minutes;
      availableCoverage -= minutes;
      coverage.push({
        taskId: task.task.id,
        examDemandId: candidate.demand.id,
        minutes,
        reason: candidate.reason,
      });
    }
  }

  const taskDemands = taskWorkItems.flatMap((task) =>
    taskLedgerDemands(task, now, horizonEnd),
  );
  const residualExamDemands: WorkloadLedgerDemand[] = examDemands
    .filter(
      (demand) =>
        demand.remainingMinutes > 0 &&
        demand.capacityUntil <= horizonEnd,
    )
    .map((demand) => ({
      id: demand.id,
      label: demand.label,
      kind: demand.kind,
      source: demand.kind,
      requiredMinutes: demand.remainingMinutes,
      priority: demand.priority,
      availableFrom: demand.availableFrom,
      deadlineAt: demand.deadlineAt,
      capacityUntil: demand.capacityUntil,
      movable: demand.movable,
      topicId: demand.topicId,
      examId: demand.examId,
      examIds: demand.examIds,
    }));

  const demands = [...taskDemands, ...residualExamDemands];
  const days = capacityDays(
    workspace,
    now,
    options.sustainableDailyMinutes,
    options.bufferRatio,
    horizonDays,
  );
  const feasibility = analyzeCapacityFeasibility(demands, days);

  return {
    generatedAt: now,
    horizonDays,
    demands,
    capacityDays: days,
    coverage,
    feasibility,
    taskRemainingMinutes: taskWorkItems.reduce(
      (sum, task) => sum + task.remainingMinutes,
      0,
    ),
    scheduledTaskMinutes: taskWorkItems.reduce(
      (sum, task) => sum + task.scheduledMinutes,
      0,
    ),
    unscheduledTaskMinutes: taskWorkItems.reduce(
      (sum, task) => sum + task.unscheduledMinutes,
      0,
    ),
    examPreparationMinutes: examDemands
      .filter((demand) => demand.kind === 'exam-preparation')
      .reduce((sum, demand) => sum + demand.requiredMinutes, 0),
    examRevisionMinutes: examDemands
      .filter((demand) => demand.kind === 'exam-revision')
      .reduce((sum, demand) => sum + demand.requiredMinutes, 0),
    deduplicatedMinutes: coverage.reduce(
      (sum, item) => sum + item.minutes,
      0,
    ),
  };
}
