import { StudyTask, WorkspaceState } from '@/src/data/schema';
import { postponeTask } from '@/src/features/planning/task-engine';

export type DeferralReceipt = {
  ownerKey: string;
  source: 'task' | 'topic';
  id: string;
  name: string;
  previousPostponedUntil: number;
  previousPostponements?: number;
  previousLastPostponedAt?: number;
  previousPlanState?: StudyTask['planState'];
  previousScheduledStart?: number;
  previousScheduledEnd?: number;
  deferredUntil: number;
  deferredAt: number;
  expectedUpdatedAt: number;
};

export function canDefer(
  workspace: WorkspaceState,
  source: 'task' | 'topic',
  id: string,
  _now = Date.now(),
): boolean {
  if (source === 'task') {
    const task = workspace.tasks.find((item) => item.id === id);
    return Boolean(task && task.status === 'open');
  }
  const topic = workspace.topics.find((item) => item.id === id);
  return Boolean(topic);
}

export function applyDeferral(
  draft: WorkspaceState,
  ownerKey: string,
  source: 'task' | 'topic',
  id: string,
  deferredUntil: number,
  now = Date.now(),
): DeferralReceipt | null {
  if (source === 'task') {
    const task = draft.tasks.find((item) => item.id === id);
    if (!task || task.status !== 'open') return null;
    const receipt: DeferralReceipt = {
      ownerKey,
      source: 'task',
      id: task.id,
      name: task.title,
      previousPostponedUntil: task.postponedUntil,
      previousPostponements: task.postponements ?? 0,
      previousLastPostponedAt: task.lastPostponedAt ?? 0,
      previousPlanState: task.planState,
      previousScheduledStart: task.scheduledStart,
      previousScheduledEnd: task.scheduledEnd,
      deferredUntil: Math.max(deferredUntil, now),
      deferredAt: now,
      expectedUpdatedAt: now,
    };
    postponeTask(task, deferredUntil, now);
    return receipt;
  }

  const topic = draft.topics.find((item) => item.id === id);
  if (!topic) return null;
  const previousPostponedUntil = topic.snoozeUntil;
  const targetUntil = Math.max(deferredUntil, now);
  topic.snoozeUntil = targetUntil;
  return {
    ownerKey,
    source: 'topic',
    id: topic.id,
    name: topic.name,
    previousPostponedUntil,
    deferredUntil: targetUntil,
    deferredAt: now,
    expectedUpdatedAt: now,
  };
}

export function undoAvailability(
  workspace: WorkspaceState,
  receipt: DeferralReceipt,
  now = Date.now(),
): 'available' | 'expired' | 'changed' {
  if (now >= receipt.deferredUntil) {
    return 'expired';
  }
  if (receipt.source === 'task') {
    const task = workspace.tasks.find((item) => item.id === receipt.id);
    if (!task || task.status !== 'open') return 'changed';
    if (
      task.planState !== 'postponed' ||
      task.postponedUntil !== receipt.deferredUntil ||
      task.updatedAt !== receipt.expectedUpdatedAt
    ) {
      return 'changed';
    }
    return 'available';
  }

  const topic = workspace.topics.find((item) => item.id === receipt.id);
  if (!topic) return 'changed';
  if (topic.snoozeUntil !== receipt.deferredUntil) {
    return 'changed';
  }
  return 'available';
}

export function restoreDeferral(
  draft: WorkspaceState,
  receipt: DeferralReceipt,
  now = Date.now(),
): boolean {
  if (undoAvailability(draft, receipt, now) !== 'available') {
    return false;
  }
  if (receipt.source === 'task') {
    const task = draft.tasks.find((item) => item.id === receipt.id);
    if (!task) return false;
    task.planState = receipt.previousPlanState ?? 'today';
    task.postponedUntil = receipt.previousPostponedUntil;
    task.postponements = receipt.previousPostponements ?? 0;
    task.lastPostponedAt = receipt.previousLastPostponedAt ?? 0;
    task.scheduledStart = receipt.previousScheduledStart ?? 0;
    task.scheduledEnd = receipt.previousScheduledEnd ?? 0;
    task.updatedAt = now;
    return true;
  }

  const topic = draft.topics.find((item) => item.id === receipt.id);
  if (!topic) return false;
  topic.snoozeUntil = receipt.previousPostponedUntil;
  return true;
}
