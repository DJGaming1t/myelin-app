import type { StudyTask, Topic, WorkspaceState } from '@/src/data/schema';
import { postponeTask } from '@/src/features/planning/task-engine';

type TaskFields = Pick<StudyTask, 'planState' | 'postponedUntil' | 'scheduledStart' | 'scheduledEnd'> & { postponements: number; lastPostponedAt: number };
type TopicFields = Pick<Topic, 'snoozeUntil'> & { postponements: number };
export type DeferralReceipt = { ownerKey: string; id: string; name: string } & (
  | { source: 'task'; before: TaskFields; after: TaskFields }
  | { source: 'topic'; before: TopicFields; after: TopicFields }
);
export type UndoAvailability = 'available' | 'changed-or-missing' | 'expired';
const taskFields = (task: StudyTask): TaskFields => ({
  planState: task.planState, postponedUntil: task.postponedUntil,
  scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd,
  postponements: task.postponements ?? 0, lastPostponedAt: task.lastPostponedAt ?? 0,
});
const topicFields = (topic: Topic): TopicFields => ({ snoozeUntil: topic.snoozeUntil, postponements: topic.postponements ?? 0 });
const equalFields = <T extends object>(left: T, right: T) => (Object.keys(left) as (keyof T)[]).every(key => left[key] === right[key]);

export function canDefer(workspace: WorkspaceState, source: 'task' | 'topic', id: string, now: number) {
  return source === 'task' ? workspace.tasks.some(task => task.id === id && task.status === 'open' && task.postponedUntil <= now) : workspace.topics.some(topic => topic.id === id && topic.snoozeUntil <= now);
}

/** Called only in the guarded workspace transaction; snapshot the actual record being changed. */
export function applyDeferral(workspace: WorkspaceState, ownerKey: string, source: 'task' | 'topic', id: string, until: number, now: number): DeferralReceipt | null {
  if (source === 'task') {
    const task = workspace.tasks.find(task => task.id === id);
    if (!task || task.status !== 'open') return null;
    const before = taskFields(task);
    postponeTask(task, until, now);
    return { ownerKey, source, id, name: task.title, before, after: taskFields(task) };
  }
  const topic = workspace.topics.find(topic => topic.id === id);
  if (!topic) return null;
  const before = topicFields(topic);
  topic.snoozeUntil = until;
  topic.postponements = Math.min(100000, (topic.postponements ?? 0) + 1);
  return { ownerKey, source, id, name: topic.name, before, after: topicFields(topic) };
}

export function undoAvailability(workspace: WorkspaceState, receipt: DeferralReceipt, now: number): UndoAvailability {
  const until = receipt.source === 'task' ? receipt.after.postponedUntil : receipt.after.snoozeUntil;
  if (now >= until) return 'expired';
  if (receipt.source === 'task') {
    const task = workspace.tasks.find(task => task.id === receipt.id);
    return task?.status === 'open' && equalFields(taskFields(task), receipt.after) ? 'available' : 'changed-or-missing';
  }
  const topic = workspace.topics.find(topic => topic.id === receipt.id);
  return topic && equalFields(topicFields(topic), receipt.after) ? 'available' : 'changed-or-missing';
}

export function restoreDeferral(workspace: WorkspaceState, receipt: DeferralReceipt, now: number) {
  if (undoAvailability(workspace, receipt, now) !== 'available') return false;
  if (receipt.source === 'task') {
    const task = workspace.tasks.find(task => task.id === receipt.id)!;
    Object.assign(task, receipt.before); task.updatedAt = now;
  } else Object.assign(workspace.topics.find(topic => topic.id === receipt.id)!, receipt.before);
  return true;
}
