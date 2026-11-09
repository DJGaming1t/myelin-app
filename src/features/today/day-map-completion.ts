import { StudyTask } from '@/src/data/schema';

/** Only the planning fields changed by manual completion are restored on undo. */
export type DayMapCompletionReceipt = {
  ownerKey: string;
  id: string;
  title: string;
  planState: StudyTask['planState'];
  scheduledStart: number;
  scheduledEnd: number;
  postponedUntil: number;
  completedAt: number;
  completedTimestamp: number;
  completedUpdatedAt: number;
};

export function completionReceipt(ownerKey: string, before: StudyTask, after: StudyTask): DayMapCompletionReceipt {
  return {
    ownerKey, id: before.id, title: before.title, planState: before.planState,
    scheduledStart: before.scheduledStart, scheduledEnd: before.scheduledEnd,
    postponedUntil: before.postponedUntil, completedAt: before.completedAt,
    completedTimestamp: after.completedAt, completedUpdatedAt: after.updatedAt,
  };
}

export function canUndoDayMapCompletion(task: StudyTask | undefined, receipt: DayMapCompletionReceipt, ownerKey: string | null): boolean {
  return ownerKey === receipt.ownerKey && !!task && task.id === receipt.id && task.status === 'completed' &&
    task.completedAt === receipt.completedTimestamp && task.updatedAt === receipt.completedUpdatedAt;
}

export function restoreDayMapCompletion(task: StudyTask, receipt: DayMapCompletionReceipt, now: number) {
  task.status = 'open';
  task.planState = receipt.planState;
  task.scheduledStart = receipt.scheduledStart;
  task.scheduledEnd = receipt.scheduledEnd;
  task.postponedUntil = receipt.postponedUntil;
  task.completedAt = receipt.completedAt;
  task.updatedAt = now;
}
