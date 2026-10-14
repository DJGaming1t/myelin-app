import type { StudyTask, WorkspaceState } from '@/src/data/schema';
import { completeTask } from './task-engine';

type CompletionFields = Pick<StudyTask, 'status' | 'completedAt' | 'planState' | 'scheduledStart' | 'scheduledEnd' | 'postponedUntil'>;
export type TaskCompletionReceipt = {
  ownerKey: string; id: string; title: string;
  before: CompletionFields; after: CompletionFields;
  actualMinutes: number; lastFocusSessionId: string | undefined;
};
const fields = (task: StudyTask): CompletionFields => ({
  status: task.status, completedAt: task.completedAt, planState: task.planState,
  scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd, postponedUntil: task.postponedUntil,
});
export const canCompleteTask = (workspace: WorkspaceState, id: string) => workspace.tasks.some(task => task.id === id && task.status === 'open');
export function applyTaskCompletion(workspace: WorkspaceState, ownerKey: string, id: string, now: number): TaskCompletionReceipt | null {
  const task = workspace.tasks.find(task => task.id === id);
  if (!task || task.status !== 'open') return null;
  const before = fields(task); completeTask(task, now);
  return { ownerKey, id, title: task.title, before, after: fields(task), actualMinutes: task.actualMinutes, lastFocusSessionId: task.lastFocusSessionId };
}
export function canUndoTaskCompletion(workspace: WorkspaceState, receipt: TaskCompletionReceipt) {
  const task = workspace.tasks.find(task => task.id === receipt.id);
  if (!task || task.actualMinutes !== receipt.actualMinutes || task.lastFocusSessionId !== receipt.lastFocusSessionId) return false;
  const current = fields(task);
  return (Object.keys(current) as (keyof CompletionFields)[]).every(key => current[key] === receipt.after[key]);
}
export function restoreTaskCompletion(workspace: WorkspaceState, receipt: TaskCompletionReceipt, now: number) {
  if (!canUndoTaskCompletion(workspace, receipt)) return false;
  const task = workspace.tasks.find(task => task.id === receipt.id)!;
  Object.assign(task, receipt.before); task.updatedAt = now;
  return true;
}
