import { useCallback, useRef } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { Commitment, StudyTask, WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { localDateKey } from './commitment-dates';
import { nextLocalDayStart } from '@/src/features/today/planner';
import { postponeTask } from './task-engine';

export type DaySkipResult =
  | { ok: true; before: WorkspaceState; after: WorkspaceState }
  | { ok: false; reason: 'consumed' | 'owner' | 'expired' | 'conflict' };

export function useDaySkip() {
  const { workspace, ownerKey, updateWorkspace } = useWorkspace();
  const busyRef = useRef(false);

  const occurrence = useCallback(
    (
      item: Commitment,
      date: string,
      restore = false,
      viewedDay?: string,
    ): DaySkipResult => {
      if (busyRef.current) return { ok: false, reason: 'consumed' };
      if (!workspace || !ownerKey) return { ok: false, reason: 'owner' };
      const now = Date.now();
      if (viewedDay && viewedDay !== localDateKey(now)) {
        return { ok: false, reason: 'expired' };
      }
      const before = cloneWorkspace(workspace);
      busyRef.current = true;
      try {
        const after = updateWorkspace(
          (draft) => {
            const target = draft.commitments.find((c) => c.id === item.id);
            if (!target) return;
            const current = target.skippedDates ?? [];
            target.skippedDates = restore
              ? current.filter((d) => d !== date)
              : current.includes(date)
                ? current
                : [...current, date].sort();
          },
          {
            ownerKey,
            canApply: (current) => {
              const target = current.commitments.find((c) => c.id === item.id);
              return Boolean(target);
            },
          },
        );
        if (!after) return { ok: false, reason: 'conflict' };
        return { ok: true, before, after };
      } finally {
        busyRef.current = false;
      }
    },
    [ownerKey, updateWorkspace, workspace],
  );

  const skipTask = useCallback(
    (task: StudyTask, viewedDay?: string): DaySkipResult => {
      if (busyRef.current) return { ok: false, reason: 'consumed' };
      if (!workspace || !ownerKey) return { ok: false, reason: 'owner' };
      const now = Date.now();
      if (viewedDay && viewedDay !== localDateKey(now)) {
        return { ok: false, reason: 'expired' };
      }
      const before = cloneWorkspace(workspace);
      busyRef.current = true;
      try {
        const until = nextLocalDayStart(now);
        const after = updateWorkspace(
          (draft) => {
            const target = draft.tasks.find((t) => t.id === task.id);
            if (target && target.status === 'open') {
              postponeTask(target, until, now);
            }
          },
          {
            ownerKey,
            canApply: (current) => {
              const target = current.tasks.find((t) => t.id === task.id);
              return Boolean(
                target &&
                  target.status === 'open' &&
                  target.updatedAt === task.updatedAt,
              );
            },
          },
        );
        if (!after) return { ok: false, reason: 'conflict' };
        return { ok: true, before, after };
      } finally {
        busyRef.current = false;
      }
    },
    [ownerKey, updateWorkspace, workspace],
  );

  return {
    occurrence,
    skipTask,
  };
}
