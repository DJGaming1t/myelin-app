import type { StudyTask } from '@/src/data/schema';

export type TaskEdit = Partial<Pick<StudyTask, 'title' | 'subject' | 'topicId' | 'examId' | 'type' | 'dueAt' | 'estimatedMinutes' | 'actualMinutes' | 'priority' | 'notes' | 'planState'>>;
export type RecordedTime = Pick<StudyTask, 'actualMinutes' | 'lastFocusSessionId'>;
export function taskEditConflict(task: StudyTask | undefined, patch: TaskEdit, deadline: number, recorded: RecordedTime | null): 'missing' | 'deadline' | 'time' | null {
  if (!task) return 'missing';
  if (patch.dueAt !== undefined && task.dueAt !== deadline) return 'deadline';
  if (patch.actualMinutes !== undefined && recorded && (task.actualMinutes !== recorded.actualMinutes || task.lastFocusSessionId !== recorded.lastFocusSessionId)) return 'time';
  return null;
}
export function applyTaskEdit(task: StudyTask, patch: TaskEdit, now: number) {
  // Scheduling remains owned by Day Map; a notes-only save never moves a task.
  const { planState, ...fields } = patch;
  Object.assign(task, fields);
  if (planState && task.planState !== 'scheduled') task.planState = planState;
  task.updatedAt = now;
}
