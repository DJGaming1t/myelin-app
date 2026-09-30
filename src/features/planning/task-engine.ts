import {
  Priority,
  StudyTask,
  StudyTaskPlanState,
  StudyTaskType,
  WorkspaceState,
} from '@/src/data/schema';

function id(prefix: string, now: number) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export type CreateTaskInput = {
  title: string;
  subject?: string;
  topicId?: string | null;
  examId?: string | null;
  type?: StudyTaskType;
  planState?: StudyTaskPlanState;
  dueAt?: number;
  estimatedMinutes?: number;
  priority?: Priority;
  notes?: string;
  now?: number;
};

export function createStudyTask(input: CreateTaskInput): StudyTask {
  const now = input.now ?? Date.now();
  return {
    id: id('task', now),
    title: input.title.trim().slice(0, 500),
    subject: (input.subject ?? '').trim().slice(0, 120),
    topicId: input.topicId ?? null,
    examId: input.examId ?? null,
    type: input.type ?? 'homework',
    status: 'open',
    planState: input.planState ?? 'inbox',
    dueAt: Math.max(0, input.dueAt ?? 0),
    estimatedMinutes: Math.max(0, Math.min(720, Math.round(input.estimatedMinutes ?? 0))),
    actualMinutes: 0,
    priority: input.priority ?? 2,
    notes: (input.notes ?? '').trim().slice(0, 12000),
    scheduledStart: 0,
    scheduledEnd: 0,
    postponedUntil: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: 0,
  };
}

export function taskRemainingMinutes(task: StudyTask) {
  if (task.estimatedMinutes <= 0) return 0;
  return Math.max(0, task.estimatedMinutes - task.actualMinutes);
}

export function scheduleTask(task: StudyTask, start: number, end: number, now = Date.now()) {
  if (end <= start) return;
  task.planState = 'scheduled';
  task.scheduledStart = start;
  task.scheduledEnd = end;
  task.postponedUntil = 0;
  task.updatedAt = now;
}

export function unscheduleTask(task: StudyTask, state: 'inbox' | 'today' = 'today', now = Date.now()) {
  task.planState = state;
  task.scheduledStart = 0;
  task.scheduledEnd = 0;
  task.postponedUntil = 0;
  task.updatedAt = now;
}

export function postponeTask(task: StudyTask, until: number, now = Date.now()) {
  task.planState = 'postponed';
  task.postponedUntil = Math.max(until, now);
  task.scheduledStart = 0;
  task.scheduledEnd = 0;
  task.updatedAt = now;
}

export function completeTask(task: StudyTask, now = Date.now()) {
  task.status = 'completed';
  task.completedAt = now;
  task.scheduledStart = 0;
  task.scheduledEnd = 0;
  task.updatedAt = now;
}

export function reopenTask(task: StudyTask, now = Date.now()) {
  task.status = 'open';
  task.completedAt = 0;
  task.planState = 'inbox';
  task.scheduledStart = 0;
  task.scheduledEnd = 0;
  task.postponedUntil = 0;

  // A task auto-completes when recorded time reaches its estimate. If the
  // student reopens it, preserve the work already done but give the reopened
  // task a small remaining estimate instead of producing a zero-work task.
  if (task.estimatedMinutes > 0 && task.actualMinutes >= task.estimatedMinutes) {
    task.estimatedMinutes = Math.min(720, task.actualMinutes + 25);
  }

  task.updatedAt = now;
}

export function recordTaskMinutes(task: StudyTask, minutes: number, now = Date.now()) {
  task.actualMinutes = Math.max(0, Math.round(task.actualMinutes + Math.max(0, minutes)));
  if (task.estimatedMinutes > 0 && task.actualMinutes >= task.estimatedMinutes) {
    completeTask(task, now);
  } else {
    task.updatedAt = now;
  }
}

export function taskById(workspace: WorkspaceState, taskId: string) {
  return workspace.tasks.find((task) => task.id === taskId) ?? null;
}
