import { Commitment } from '@/src/data/schema';
import { localDateKey } from './commitment-dates';

export function restorableOccurrenceDates(
  commitment: Commitment,
  now = Date.now(),
): string[] {
  const todayKey = localDateKey(now);
  return (commitment.skippedDates ?? [])
    .filter((dateKey) => dateKey >= todayKey)
    .sort();
}

export function daySkipFailureMessage(
  reason: string,
  target: 'occurrence' | 'task',
): string {
  if (reason === 'expired') {
    return 'The day changed while Day Map was open. Showing your refreshed schedule.';
  }
  if (reason === 'conflict') {
    return target === 'occurrence'
      ? 'This commitment changed in the background. Your latest schedule was kept.'
      : 'This task changed in the background. Your latest schedule was kept.';
  }
  return target === 'occurrence'
    ? 'Could not update this occurrence. Your schedule was kept.'
    : 'Could not skip this task for today. Your schedule was kept.';
}
