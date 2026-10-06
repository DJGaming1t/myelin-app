import {
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
    };

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

  const candidates = [
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
  ];

  return candidates
    .sort(
      (a, b) =>
        Number(b.effect.feasibleAfter) -
          Number(a.effect.feasibleAfter) ||
        b.effect.overloadReducedMinutes -
          a.effect.overloadReducedMinutes ||
        b.effect.unallocatedReducedMinutes -
          a.effect.unallocatedReducedMinutes ||
        a.title.localeCompare(b.title),
    )
    .slice(0, Math.max(1, Math.min(4, limit)));
}

export function applyAutopilotRecoveryOption(
  workspace: WorkspaceState,
  option: AutopilotRecoveryOption,
  now = Date.now(),
) {
  if (option.kind === 'defer-task') {
    const task = workspace.tasks.find(
      (item) => item.id === option.taskId,
    );
    if (!task || task.status !== 'open' || task.priority >= 3) return false;
    postponeTask(task, option.until, now);
    return true;
  }

  const exam = workspace.exams.find(
    (item) => item.id === option.examId,
  );
  if (
    !exam ||
    exam.scope !== 'topics' ||
    exam.topicIds.length <= 1 ||
    !exam.topicIds.includes(option.topicId)
  ) {
    return false;
  }

  exam.topicIds = exam.topicIds.filter(
    (topicId) => topicId !== option.topicId,
  );
  return true;
}
