import { useCallback, useState } from 'react';

import { StudyTask } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { completeTask } from '@/src/features/planning/task-engine';

type TaskCompletionSnapshot = Pick<
  StudyTask,
  | 'id'
  | 'title'
  | 'planState'
  | 'scheduledStart'
  | 'scheduledEnd'
  | 'postponedUntil'
  | 'completedAt'
>;

export function useTaskCompletion() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [lastCompleted, setLastCompleted] = useState<TaskCompletionSnapshot | null>(null);

  const complete = useCallback(
    (taskId: string) => {
      const source = workspace?.tasks.find((item) => item.id === taskId);
      if (!source || source.status !== 'open') return false;

      const snapshot: TaskCompletionSnapshot = {
        id: source.id,
        title: source.title,
        planState: source.planState,
        scheduledStart: source.scheduledStart,
        scheduledEnd: source.scheduledEnd,
        postponedUntil: source.postponedUntil,
        completedAt: source.completedAt,
      };

      const updated = updateWorkspace((draft) => {
        const task = draft.tasks.find((item) => item.id === taskId);
        if (task?.status === 'open') completeTask(task);
      });

      if (updated !== false) {
        setLastCompleted(snapshot);
        return true;
      }
      return false;
    },
    [updateWorkspace, workspace],
  );

  const undo = useCallback(() => {
    if (!lastCompleted) return;

    const snapshot = lastCompleted;
    updateWorkspace((draft) => {
      const task = draft.tasks.find((item) => item.id === snapshot.id);
      if (!task) return;
      task.status = 'open';
      task.completedAt = snapshot.completedAt;
      task.planState = snapshot.planState;
      task.scheduledStart = snapshot.scheduledStart;
      task.scheduledEnd = snapshot.scheduledEnd;
      task.postponedUntil = snapshot.postponedUntil;
      task.updatedAt = Date.now();
    });
    setLastCompleted(null);
  }, [lastCompleted, updateWorkspace]);

  return {
    lastCompleted,
    complete,
    undo,
    dismiss: () => setLastCompleted(null),
  };
}
