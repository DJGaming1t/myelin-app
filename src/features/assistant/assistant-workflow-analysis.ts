import { WorkspaceState } from '@/src/data/schema';
import { buildTodayPlan } from '@/src/features/today/planner';

export function isAssistantWorkflowAnalysisRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.includes('analyse my current workflow') ||
    lower.includes('analyze my current workflow') ||
    lower.includes('workflow analysis')
  );
}

export function tryAssistantWorkflowAnalysisReply(
  text: string,
  workspace: WorkspaceState,
  now = Date.now(),
): string | null {
  if (!isAssistantWorkflowAnalysisRequest(text)) return null;
  const plan = buildTodayPlan(workspace, now);
  const openTasks = workspace.tasks.filter((t) => t.status === 'open').length;
  const completedTasks = workspace.tasks.filter((t) => t.status === 'completed').length;
  const openMistakes = workspace.mistakes.filter((m) => !m.resolvedAt).length;
  return `Workflow summary: ${openTasks} open tasks (${completedTasks} completed), ${workspace.topics.length} topics, ${workspace.exams.length} upcoming exams, and ${openMistakes} unresolved mistakes. Today’s plan has ${plan.plannedStudyMinutes}m scheduled against a ${plan.budgetMinutes}m daily budget.`;
}
