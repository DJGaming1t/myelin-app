import { Priority, StudyTask, StudyTaskType } from '@/src/data/schema';

export type RecordedTime = { actualMinutes: number; lastFocusSessionId?: string };

export type TaskEdit = {
  title?: string;
  subject?: string;
  topicId?: string | null;
  examId?: string | null;
  type?: StudyTaskType;
  planState?: 'inbox' | 'today';
  dueAt?: number;
  estimatedMinutes?: number;
  actualMinutes?: number;
  priority?: Priority;
  notes?: string;
};

export function taskEditConflict(
  current: StudyTask | undefined,
  patch: TaskEdit,
  deadlineBaseline: number,
  recordedBaseline: RecordedTime | null,
): 'deadline' | 'time' | 'missing' | null {
  if (!current) return 'missing';
  if (patch.dueAt !== undefined && current.dueAt !== deadlineBaseline) {
    return 'deadline';
  }
  if (
    patch.actualMinutes !== undefined &&
    recordedBaseline !== null &&
    (current.actualMinutes !== recordedBaseline.actualMinutes ||
      current.lastFocusSessionId !== recordedBaseline.lastFocusSessionId)
  ) {
    return 'time';
  }
  return null;
}

export function applyTaskEdit(task: StudyTask, patch: TaskEdit, now = Date.now()): void {
  if (patch.title !== undefined) task.title = patch.title.trim().slice(0, 500);
  if (patch.subject !== undefined) task.subject = patch.subject.trim().slice(0, 120);
  if (patch.topicId !== undefined) task.topicId = patch.topicId;
  if (patch.examId !== undefined) task.examId = patch.examId;
  if (patch.type !== undefined) task.type = patch.type;
  if (patch.dueAt !== undefined) task.dueAt = Math.max(0, patch.dueAt);
  if (patch.estimatedMinutes !== undefined) {
    task.estimatedMinutes = Math.max(0, Math.min(720, Math.round(patch.estimatedMinutes)));
  }
  if (patch.actualMinutes !== undefined) {
    task.actualMinutes = Math.max(0, Math.round(patch.actualMinutes));
  }
  if (patch.priority !== undefined) task.priority = patch.priority;
  if (patch.notes !== undefined) task.notes = patch.notes.trim().slice(0, 12000);
  if (patch.planState !== undefined && task.planState !== 'scheduled') {
    task.planState = patch.planState;
    if (patch.planState === 'today') {
      task.postponedUntil = 0;
    }
  }
  task.updatedAt = now;
}
