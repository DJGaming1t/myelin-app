import type { StudyTask, WorkspaceState } from '@/src/data/schema';
import { suggestTaskSlots } from './day-engine';

type PlanningFields = 'status' | 'planState' | 'scheduledStart' | 'scheduledEnd' | 'postponedUntil' | 'dueAt' | 'estimatedMinutes' | 'actualMinutes' | 'lastFocusSessionId' | 'postponements' | 'lastPostponedAt';
export type TaskPlanningSnapshot = Pick<StudyTask, PlanningFields | 'id'>;
export type ScheduleChoice = { kind: 'custom' | 'suggested'; start: number; end: number; offeredAt?: number };
export type PlanningFailure = 'owner' | 'changed' | 'missing' | 'slot' | 'past' | 'invalid' | 'unchanged' | 'consumed';
export function taskPlanningSnapshot(task: TaskPlanningSnapshot): TaskPlanningSnapshot {
  return { id: task.id, status: task.status, planState: task.planState, scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd, postponedUntil: task.postponedUntil, dueAt: task.dueAt,
    estimatedMinutes: task.estimatedMinutes, actualMinutes: task.actualMinutes, lastFocusSessionId: task.lastFocusSessionId,
    postponements: task.postponements, lastPostponedAt: task.lastPostponedAt };
}
export function taskPlanningConflict(task: StudyTask | undefined, expected: TaskPlanningSnapshot): PlanningFailure | null {
  if (!task) return 'missing';
  if (task.status !== 'open') return 'changed';
  return (Object.keys(expected) as (keyof TaskPlanningSnapshot)[]).some(key => task[key] !== expected[key]) ? 'changed' : null;
}
export function resolveScheduleChoice(workspace: WorkspaceState, task: StudyTask, choice: ScheduleChoice, now: number): { start: number; end: number } | PlanningFailure {
  if (!Number.isFinite(choice.start) || !Number.isFinite(choice.end) || choice.end <= choice.start) return 'invalid';
  let selected = { start: choice.start, end: choice.end };
  if (choice.kind === 'suggested') {
    // Revalidate availability/capacity through the existing planner. A rolling
    // "start now" suggestion can advance within the current free window only.
    const current = suggestTaskSlots(workspace, task, now, 4).find(slot =>
      (slot.start === choice.start && slot.end === choice.end) ||
      (choice.start === choice.offeredAt && now >= choice.start && now < choice.end && slot.start === now && slot.end - slot.start === choice.end - choice.start));
    if (!current) return 'slot';
    selected = { start: current.start, end: current.end };
  } else if (choice.start <= now) return 'past';
  if (task.planState === 'scheduled' && task.scheduledStart === selected.start && task.scheduledEnd === selected.end && !task.postponedUntil) return 'unchanged';
  return selected;
}
export function planningFailureMessage(reason: PlanningFailure, context: 'sheet' | 'move' = 'sheet') {
  if (reason === 'past') return 'Choose a time that is still ahead.';
  if (reason === 'invalid') return 'Choose a valid study slot.';
  if (reason === 'slot') return context === 'sheet' ? 'That suggestion is no longer available. Refresh scheduling options and choose again.' : 'That gap is no longer available. Your current plan was kept.';
  if (reason === 'consumed') return 'Your current plan is already up to date.';
  if (reason === 'unchanged') return 'This task is already in that plan.';
  if (reason === 'owner' || reason === 'missing') return 'This task is no longer available. Your current plan was kept.';
  return 'This task changed after you opened these controls. Your current plan was kept.' + (context === 'sheet' ? ' Refresh scheduling options to continue.' : '');
}
