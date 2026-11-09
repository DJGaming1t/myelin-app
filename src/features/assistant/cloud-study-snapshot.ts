import { WorkspaceState } from '@/src/data/schema';

export function attachCloudStudySnapshot(
  userMessage: string,
  workspace: WorkspaceState,
  now = Date.now(),
): string {
  const openTasks = workspace.tasks.filter((t) => t.status === 'open').length;
  const overdueTasks = workspace.tasks.filter(
    (t) => t.status === 'open' && t.dueAt > 0 && t.dueAt < now,
  ).length;
  return `${userMessage}\n\n[Aggregate context: ${workspace.topics.length} topics, ${openTasks} open tasks, ${overdueTasks} overdue, ${workspace.exams.length} exams]`;
}
