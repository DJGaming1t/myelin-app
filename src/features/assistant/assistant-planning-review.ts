import { WorkspaceState } from '@/src/data/schema';
import { buildTodayPlan } from '@/src/features/today/planner';

export function tryAssistantNextTaskReply(
  text: string,
  workspace: WorkspaceState,
  now = Date.now(),
): string | null {
  const lower = text.trim().toLowerCase();
  if (!lower.includes('what should i start') && !lower.includes('next task') && !lower.includes('what next')) {
    return null;
  }
  const plan = buildTodayPlan(workspace, now);
  if (!plan.nextBlock) {
    return 'You have no urgent study block queued right now. Add a task or topic from Quick Add to get started.';
  }
  return `Start with ${plan.nextBlock.topicName} (${plan.nextBlock.minutes} min · ${plan.nextBlock.mode}). ${plan.nextBlock.reasons[0] ?? ''}`.trim();
}

export function tryAssistantPlanningReply(
  text: string,
  workspace: WorkspaceState,
  now = Date.now(),
): string | null {
  const lower = text.trim().toLowerCase();
  if (!lower.includes('review my plan') && !lower.includes('check my plan')) {
    return null;
  }
  const plan = buildTodayPlan(workspace, now);
  const openTasks = workspace.tasks.filter((t) => t.status === 'open').length;
  return `Today has ${plan.plannedStudyMinutes}m planned across ${plan.blocks.length} ${plan.blocks.length === 1 ? 'block' : 'blocks'} (${plan.remainingBudgetMinutes}m remaining in your daily budget) and ${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}.`;
}

export function tryAssistantTaskDeadlineReply(
  text: string,
  workspace: WorkspaceState,
  now = Date.now(),
): string | null {
  const lower = text.trim().toLowerCase();
  if (!lower.includes('deadline') && !lower.includes('overdue')) {
    return null;
  }
  const overdue = workspace.tasks.filter((t) => t.status === 'open' && t.dueAt > 0 && t.dueAt < now);
  if (overdue.length === 0) {
    return 'You have no overdue tasks right now.';
  }
  return `You have ${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}, starting with “${overdue[0].title}”.`;
}
