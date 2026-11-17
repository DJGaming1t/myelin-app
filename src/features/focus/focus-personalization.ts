import type { FocusOutcome } from '@/src/data/schema';

/** A cautious, explainable suggestion based only on recorded completed work. */
export function suggestFocusInterval(outcomes: readonly FocusOutcome[], now: number) {
  const since = now - 30 * 24 * 60 * 60 * 1000;
  const samples = outcomes.filter(item => item.status === 'finished' && item.endedAt >= since && item.endedAt <= now && item.minutes >= 5)
    .sort((a, b) => b.endedAt - a.endedAt).slice(0, 20).map(item => item.minutes).sort((a, b) => a - b);
  if (samples.length < 3) return null;
  const middle = Math.floor(samples.length / 2);
  const median = samples.length % 2 ? samples[middle]! : (samples[middle - 1]! + samples[middle]!) / 2;
  return { minutes: Math.max(5, Math.min(120, Math.round(median / 5) * 5)), samples: samples.length };
}

export type FocusAllocation = { subject: string; topicId?: string; topicName?: string; minutes: number };
export function validateFocusAllocations(allocations: readonly FocusAllocation[], actualMinutes: number): string | null {
  if (allocations.length > 20) return 'Use at most 20 entries.';
  if (allocations.some(item => !item.subject.trim() || item.subject.trim().length > 120 || !Number.isInteger(item.minutes) || item.minutes < 1)) return 'Enter a subject and a whole number of minutes for each entry.';
  if (allocations.reduce((sum, item) => sum + item.minutes, 0) > actualMinutes) return 'Allocated minutes cannot exceed the focus time you recorded.';
  return null;
}
