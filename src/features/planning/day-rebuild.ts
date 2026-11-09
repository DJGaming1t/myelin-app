import { StudyTask, WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { suggestTaskSlots } from './day-engine';
import { scheduleTask, taskRemainingMinutes } from './task-engine';

export type DayRebuildMove = {
  taskId: string;
  start: number;
  end: number;
};

export type DayRebuildPreview = {
  ownerKey: string;
  createdAt: number;
  sourceRevision: number;
  moves: DayRebuildMove[];
  titles: Record<string, string>;
  unscheduledCount: number;
};

export function rebuildIssueMessage(issue: string): string {
  if (issue === 'stale') {
    return 'Your workspace changed since this preview was generated. Refresh the preview before applying.';
  }
  if (issue === 'empty') {
    return 'No open free windows were found for rebuilding today.';
  }
  return 'Could not apply this rebuilt plan. Refresh the preview and try again.';
}

export function buildDayRebuildPreview(
  workspace: WorkspaceState,
  ownerKey: string,
  now = Date.now(),
): DayRebuildPreview {
  const sim = cloneWorkspace(workspace);
  const candidates: StudyTask[] = sim.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        (task.planState === 'today' ||
          (task.planState === 'scheduled' && task.scheduledEnd > now)),
    )
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

  const moves: DayRebuildMove[] = [];
  const titles: Record<string, string> = {};
  let unscheduledCount = 0;

  for (const task of candidates) {
    titles[task.id] = task.title;
    const slot = suggestTaskSlots(sim, task, now, 1)[0];
    if (!slot) {
      unscheduledCount += 1;
      continue;
    }
    const minutes = Math.max(15, Math.min(90, taskRemainingMinutes(task) || task.estimatedMinutes || 35));
    const end = Math.min(slot.end, slot.start + minutes * 60_000);
    scheduleTask(task, slot.start, end, now);
    moves.push({
      taskId: task.id,
      start: slot.start,
      end,
    });
  }

  return {
    ownerKey,
    createdAt: now,
    sourceRevision: workspace.revision,
    moves,
    titles,
    unscheduledCount,
  };
}
