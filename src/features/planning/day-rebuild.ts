import type { WorkspaceState } from '@/src/data/schema';
import { localDayKey, rebuildRemainingDay } from './day-engine';
import { scheduleTask } from './task-engine';

export type DayRebuildPreview = ReturnType<typeof rebuildRemainingDay> & {
  ownerKey: string; revision: number; createdAt: number; planningFrom: number;
  titles: Record<string, string>;
};
export type RebuildIssue = 'changed' | 'expired' | 'empty';
export function createDayRebuildPreview(workspace: WorkspaceState, ownerKey: string, now: number): DayRebuildPreview {
  // Preview actual future minutes, so reading the preview does not make a
  // start-now slot stale immediately. The existing planner stays authoritative.
  const planningFrom = Math.floor(now / 60000) * 60000 + 60000;
  const plan = rebuildRemainingDay(workspace, planningFrom);
  return { ...plan, ownerKey, revision: workspace.revision, createdAt: now, planningFrom,
    titles: Object.fromEntries(plan.moves.map(move => [move.taskId, workspace.tasks.find(task => task.id === move.taskId)?.title ?? 'Study task'])) };
}
export function dayRebuildIssue(workspace: WorkspaceState, preview: DayRebuildPreview, now: number): RebuildIssue | null {
  if (workspace.revision !== preview.revision) return 'changed';
  if (now < preview.createdAt || localDayKey(now) !== localDayKey(preview.createdAt)) return 'expired';
  if (!preview.moves.length) return 'empty';
  if (preview.moves.some(move => !Number.isFinite(move.start) || !Number.isFinite(move.end) || move.end <= move.start || move.start <= now)) return 'expired';
  if (preview.moves.some(move => !workspace.tasks.some(task => task.id === move.taskId && task.status === 'open'))) return 'changed';
  return null;
}
export function applyDayRebuild(workspace: WorkspaceState, preview: DayRebuildPreview, now: number) {
  for (const move of preview.moves) scheduleTask(workspace.tasks.find(task => task.id === move.taskId)!, move.start, move.end, now);
}
export function rebuildIssueMessage(issue: RebuildIssue) {
  if (issue === 'changed') return 'Your workspace changed after this preview. Your current plan was kept. Refresh the preview before applying.';
  if (issue === 'expired') return 'This preview’s timing is out of date. Your current plan was kept. Refresh the preview before applying.';
  return 'No available moves were found. Your current plan stays as it is.';
}
