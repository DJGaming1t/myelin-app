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
import { addLocalDays, startOfLocalDay } from '@/src/features/planning/day-engine';
import { postponeTask } from '@/src/features/planning/task-engine';

export type AutopilotRecoveryEffect = {
  beforeOverloadMinutes: number;
  afterOverloadMinutes: number;
  overloadReducedMinutes: number;
  beforeUnallocatedMinutes: number;
  afterUnallocatedMinutes: number;
  unallocatedReducedMinutes: number;
  beforeStrain: ExamPlanStrain;
  afterStrain: ExamPlanStrain;
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

function effect(
  before: JointExamPreparationPlan,
  after: JointExamPreparationPlan,
): AutopilotRecoveryEffect {
  const beforeOverloadMinutes = before.feasibility.totalOverloadMinutes;
  const afterOverloadMinutes = after.feasibility.totalOverloadMinutes;
  const beforeUnallocatedMinutes = unallocated(before);
  const afterUnallocatedMinutes = unallocated(after);

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
    feasibleAfter: feasible(after),
  };
}

function usefulEffect(value: AutopilotRecoveryEffect) {
  return (
    value.feasibleAfter ||
    value.overloadReducedMinutes > 0 ||
    value.unallocatedReducedMinutes > 0 ||
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
