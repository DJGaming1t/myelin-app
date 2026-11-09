import { useCallback, useRef } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { StudyTask, WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { scheduleTask, unscheduleTask } from './task-engine';
import {
  ScheduleChoice,
  TaskPlanningSnapshot,
  taskPlanningConflict,
  taskPlanningSnapshot,
} from './task-planning';

export type TaskPlanningResult =
  | { ok: true; before: WorkspaceState; after: WorkspaceState }
  | { ok: false; reason: 'consumed' | 'owner' | 'conflict' | 'past' | 'invalid' | 'missing' };

export function useTaskPlanning() {
  const { workspace, ownerKey, updateWorkspace } = useWorkspace();
  const busyRef = useRef(false);

  const moveToday = useCallback(
    (taskInput: StudyTask | TaskPlanningSnapshot): TaskPlanningResult => {
      if (busyRef.current) return { ok: false, reason: 'consumed' };
      if (!workspace || !ownerKey) return { ok: false, reason: 'owner' };
      const snapshot = 'title' in taskInput ? taskPlanningSnapshot(taskInput) : taskInput;
      const before = cloneWorkspace(workspace);
      let failReason = null as 'conflict' | 'missing' | null;
      busyRef.current = true;
      try {
        const now = Date.now();
        const after = updateWorkspace(
          (draft) => {
            const target = draft.tasks.find((item) => item.id === snapshot.id);
            if (target) unscheduleTask(target, 'today', now);
          },
          {
            ownerKey,
            canApply: (current) => {
              const target = current.tasks.find((item) => item.id === snapshot.id);
              if (!target) {
                failReason = 'missing';
                return false;
              }
              if (taskPlanningConflict(target, snapshot)) {
                failReason = 'conflict';
                return false;
              }
              return true;
            },
          },
        );
        if (!after) {
          return { ok: false, reason: failReason ?? 'conflict' };
        }
        return { ok: true, before, after };
      } finally {
        busyRef.current = false;
      }
    },
    [ownerKey, updateWorkspace, workspace],
  );

  const schedule = useCallback(
    (
      taskInput: StudyTask | TaskPlanningSnapshot,
      choice: ScheduleChoice,
    ): TaskPlanningResult => {
      if (busyRef.current) return { ok: false, reason: 'consumed' };
      if (!workspace || !ownerKey) return { ok: false, reason: 'owner' };
      const now = Date.now();
      if (!Number.isFinite(choice.start) || !Number.isFinite(choice.end) || choice.end <= choice.start) {
        return { ok: false, reason: 'invalid' };
      }
      if (choice.end <= now) {
        return { ok: false, reason: 'past' };
      }
      const snapshot = 'title' in taskInput ? taskPlanningSnapshot(taskInput) : taskInput;
      const before = cloneWorkspace(workspace);
      let failReason = null as 'conflict' | 'missing' | null;
      busyRef.current = true;
      try {
        const after = updateWorkspace(
          (draft) => {
            const target = draft.tasks.find((item) => item.id === snapshot.id);
            if (target) scheduleTask(target, choice.start, choice.end, now);
          },
          {
            ownerKey,
            canApply: (current) => {
              const target = current.tasks.find((item) => item.id === snapshot.id);
              if (!target) {
                failReason = 'missing';
                return false;
              }
              if (taskPlanningConflict(target, snapshot)) {
                failReason = 'conflict';
                return false;
              }
              return true;
            },
          },
        );
        if (!after) {
          return { ok: false, reason: failReason ?? 'conflict' };
        }
        return { ok: true, before, after };
      } finally {
        busyRef.current = false;
      }
    },
    [ownerKey, updateWorkspace, workspace],
  );

  return {
    moveToday,
    schedule,
  };
}
