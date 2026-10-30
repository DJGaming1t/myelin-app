import { WorkspaceState } from '@/src/data/schema';
import { ParkedDistraction } from './types';
import { createStudyTask } from '@/src/features/planning/task-engine';
export function saveParkedThoughts(workspace: WorkspaceState, sessionId: string, thoughts: ParkedDistraction[], subject: string, topicId: string | null) {
  for (const thought of thoughts) {
    const id = `parked_${sessionId}_${thought.id}`;
    if (workspace.tasks.some(task => task.id === id)) continue;
    const task = createStudyTask({ title: thought.text, subject, topicId, planState: 'inbox', estimatedMinutes: 15 });
    task.id = id;
    workspace.tasks.push(task);
  }
}
