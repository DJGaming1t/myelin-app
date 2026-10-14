import type { Commitment } from '@/src/data/schema';
import { localDateKey } from './commitment-dates';
import { commitmentOccurrencesForDay } from './day-engine';

export type DaySkipFailure = 'owner' | 'changed' | 'missing' | 'expired' | 'unchanged' | 'consumed' | 'limit';
export function occurrenceDatesForDay(item: Commitment, now: number): string[] {
  if (!item.recurrenceDays.length) return [];
  // Use the same calendar/overnight rules as the timeline, including an
  // occurrence that started yesterday. Exceptions belong to its start date.
  return commitmentOccurrencesForDay([{ ...item, skippedDates: [] }], now).map(entry => entry.occurrenceDateKey);
}
export function restorableOccurrenceDates(item: Commitment, now: number): string[] {
  const visible = occurrenceDatesForDay(item, now);
  return (item.skippedDates ?? []).filter(date => visible.includes(date));
}
export function occurrenceSkipConflict(current: Commitment | undefined, expected: Commitment, date: string, restore: boolean, viewedDay: string, now: number): DaySkipFailure | null {
  if (localDateKey(now) !== viewedDay) return 'expired';
  if (!current) return 'missing';
  if (!current.recurrenceDays.length ||
      current.startMinutes !== expected.startMinutes || current.endMinutes !== expected.endMinutes ||
      current.startAt !== expected.startAt || current.endAt !== expected.endAt ||
      current.recurrenceDays.length !== expected.recurrenceDays.length ||
      current.recurrenceDays.some(day => !expected.recurrenceDays.includes(day))) return 'changed';
  if (!occurrenceDatesForDay(current, now).includes(date)) return 'expired';
  const wasSkipped = (expected.skippedDates ?? []).includes(date);
  const isSkipped = (current.skippedDates ?? []).includes(date);
  if (wasSkipped !== restore) return 'unchanged';
  if (isSkipped !== wasSkipped) return 'changed';
  if (!restore && (current.skippedDates ?? []).length >= 366) return 'limit';
  return null;
}
export function daySkipFailureMessage(reason: DaySkipFailure, target: 'task' | 'occurrence') {
  if (reason === 'limit') return 'Remove an older skipped date in Edit fixed block before skipping another. Your current plan was kept.';
  if (reason === 'expired') return 'These controls are from an earlier day. Your current plan was kept. Use the current Day Map controls.';
  if (reason === 'missing' || reason === 'owner') return `This ${target} is no longer available. Your current plan was kept.`;
  if (reason === 'unchanged' || reason === 'consumed') return 'Your current plan is already up to date.';
  return `This ${target} changed after these controls appeared. Your current plan was kept. Use its current Day Map controls.`;
}
