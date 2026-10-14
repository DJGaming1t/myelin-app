import { useCallback, useRef } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import type { WorkspaceState } from '@/src/data/schema';
import { scheduleTask, unscheduleTask } from './task-engine';
import { PlanningFailure, ScheduleChoice, TaskPlanningSnapshot, resolveScheduleChoice, taskPlanningConflict, taskPlanningSnapshot } from './task-planning';

type PlanningResult = { ok: true; before: WorkspaceState; after: WorkspaceState } | { ok: false; reason: PlanningFailure };
export function useTaskPlanning() {
  const { ownerKey, updateWorkspace } = useWorkspace();
  const consumed = useRef(new WeakSet<TaskPlanningSnapshot>());
  const apply = useCallback((source: TaskPlanningSnapshot, choice: ScheduleChoice | 'today'): PlanningResult => {
    if (!ownerKey) return { ok: false, reason: 'owner' };
    if (consumed.current.has(source)) return { ok: false, reason: 'consumed' };
    const expected = taskPlanningSnapshot(source);
    let reason: PlanningFailure = 'owner';
    let before: WorkspaceState | null = null;
    let slot: { start: number; end: number } | null = null;
    const now = Date.now();
    const after = updateWorkspace(draft => {
      const task = draft.tasks.find(item => item.id === expected.id)!;
      if (choice === 'today') unscheduleTask(task, 'today', now);
      else if (slot) scheduleTask(task, slot.start, slot.end, now);
    }, { ownerKey, canApply: current => {
      const task = current.tasks.find(item => item.id === expected.id);
      const conflict = taskPlanningConflict(task, expected);
      if (conflict) { reason = conflict; return false; }
      if (choice === 'today') {
        if (task!.planState === 'today' && !task!.scheduledStart && !task!.scheduledEnd && !task!.postponedUntil) { reason = 'unchanged'; return false; }
      } else {
        const resolved = resolveScheduleChoice(current, task!, choice, now);
        if (typeof resolved === 'string') { reason = resolved; return false; }
        slot = resolved;
      }
      before = current; return true;
    } });
    if (!after || !before) return { ok: false, reason };
    consumed.current.add(source);
    return { ok: true, before, after };
  }, [ownerKey, updateWorkspace]);
  const moveToday = useCallback((expected: TaskPlanningSnapshot) => apply(expected, 'today'), [apply]);
  const schedule = useCallback((expected: TaskPlanningSnapshot, choice: ScheduleChoice) => apply(expected, choice), [apply]);
  return { moveToday, schedule };
}
