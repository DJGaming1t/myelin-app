import { useCallback, useRef } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import type { Commitment, StudyTask, WorkspaceState } from '@/src/data/schema';
import { localDateKey } from './commitment-dates';
import { addLocalDays, buildDayMap, startOfLocalDay } from './day-engine';
import { postponeTask } from './task-engine';
import { taskPlanningConflict, taskPlanningSnapshot } from './task-planning';
import { DaySkipFailure, occurrenceSkipConflict } from './day-skip';

type SkipResult = { ok: true; before: WorkspaceState; after: WorkspaceState } | { ok: false; reason: DaySkipFailure };
export function useDaySkip() {
  const { ownerKey, status, updateWorkspace } = useWorkspace();
  const live = useRef({ ownerKey, status }); live.current = { ownerKey, status };
  const consumedTasks = useRef(new WeakSet<StudyTask>());
  const consumedOccurrences = useRef(new WeakMap<Commitment, Set<string>>());
  const skipTask = useCallback((source: StudyTask, viewedDay: string): SkipResult => {
    if (!ownerKey || live.current.ownerKey !== ownerKey || live.current.status !== 'ready') return { ok: false, reason: 'owner' };
    if (consumedTasks.current.has(source)) return { ok: false, reason: 'consumed' };
    const expected = taskPlanningSnapshot(source), now = Date.now();
    let before: WorkspaceState | null = null, reason: DaySkipFailure = 'owner';
    const after = updateWorkspace(draft => {
      postponeTask(draft.tasks.find(item => item.id === expected.id)!, addLocalDays(startOfLocalDay(now), 1), now);
    }, { ownerKey, canApply: current => {
      if (localDateKey(now) !== viewedDay) { reason = 'expired'; return false; }
      const conflict = taskPlanningConflict(current.tasks.find(item => item.id === expected.id), expected);
      if (conflict) { reason = conflict === 'missing' ? 'missing' : 'changed'; return false; }
      // Skip is offered for missed blocks only, not a newer/future schedule.
      if (!buildDayMap(current, now).entries.some(entry => entry.kind === 'task' && entry.taskId === expected.id && entry.missed)) { reason = 'changed'; return false; }
      before = current; return true;
    } });
    if (!after || !before) return { ok: false, reason };
    consumedTasks.current.add(source);
    return { ok: true, before, after };
  }, [ownerKey, updateWorkspace]);
  const occurrence = useCallback((source: Commitment, date: string, restore: boolean, viewedDay: string): SkipResult => {
    if (!ownerKey || live.current.ownerKey !== ownerKey || live.current.status !== 'ready') return { ok: false, reason: 'owner' };
    const key = `${viewedDay}:${date}:${restore}`;
    if (consumedOccurrences.current.get(source)?.has(key)) return { ok: false, reason: 'consumed' };
    const now = Date.now(); let before: WorkspaceState | null = null, reason: DaySkipFailure = 'owner';
    const after = updateWorkspace(draft => {
      const item = draft.commitments.find(item => item.id === source.id)!;
      item.skippedDates = restore ? (item.skippedDates ?? []).filter(value => value !== date) : [...(item.skippedDates ?? []), date];
      item.updatedAt = now;
    }, { ownerKey, canApply: current => {
      const conflict = occurrenceSkipConflict(current.commitments.find(item => item.id === source.id), source, date, restore, viewedDay, now);
      if (conflict) { reason = conflict; return false; }
      before = current; return true;
    } });
    if (!after || !before) return { ok: false, reason };
    const keys = consumedOccurrences.current.get(source) ?? new Set<string>(); keys.add(key); consumedOccurrences.current.set(source, keys);
    return { ok: true, before, after };
  }, [ownerKey, updateWorkspace]);
  return { skipTask, occurrence };
}
