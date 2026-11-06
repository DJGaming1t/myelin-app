import { StudyTask } from '@/src/data/schema';

export type TaskPlanningSnapshot = {
  id: string;
  status: StudyTask['status'];
  planState: StudyTask['planState'];
  scheduledStart: number;
  scheduledEnd: number;
  postponedUntil: number;
  updatedAt: number;
};

export type ScheduleChoice =
  | { kind: 'suggested'; start: number; end: number; offeredAt: number }
  | { kind: 'custom'; start: number; end: number };

export function taskPlanningSnapshot(task: StudyTask): TaskPlanningSnapshot {
  return {
    id: task.id,
    status: task.status,
    planState: task.planState,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    postponedUntil: task.postponedUntil,
    updatedAt: task.updatedAt,
  };
}

export function taskPlanningConflict(
  current: StudyTask | undefined | null,
  expected: TaskPlanningSnapshot,
): boolean {
  if (!current || current.id !== expected.id) return true;
  return (
    current.status !== expected.status ||
    current.planState !== expected.planState ||
    current.scheduledStart !== expected.scheduledStart ||
    current.scheduledEnd !== expected.scheduledEnd ||
    current.postponedUntil !== expected.postponedUntil ||
    current.updatedAt !== expected.updatedAt
  );
}

export function planningFailureMessage(
  reason: string,
  action: 'move' | 'schedule' = 'schedule',
): string {
  if (reason === 'conflict') {
    return 'This task changed while you were choosing a time. Review the updated task and try again.';
  }
  if (reason === 'past' || reason === 'expired') {
    return 'That time slot has already passed. Pick a future slot and try again.';
  }
  if (reason === 'invalid') {
    return 'Choose a valid future start and end time.';
  }
  return action === 'move'
    ? 'Could not move this task into Today. Your existing plan was kept.'
    : 'Could not schedule this task. Your existing plan was kept.';
}
