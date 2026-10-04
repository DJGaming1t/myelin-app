import { MemoryState, RecallQuestion } from '@/src/data/schema';

// FSRS-6 default parameters and equations, independently implemented from:
// https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
// Per-card adaptation; parameters are not fitted to this user's history.
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
export const DAY_MS = 86_400_000;
const factor = Math.pow(0.9, -1 / W[20]) - 1;
const bound = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
type Card = Pick<RecallQuestion, 'intervalDays' | 'reps'> & Partial<RecallQuestion>;
function initialDifficulty(grade: number) { return bound(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10); }
export function memoryFor(card: Card): MemoryState {
  return card.memory ?? { version: 1, stability: bound(card.intervalDays || W[Math.max(1, card.lastGrade || 1) - 1], 0.01, 3650), difficulty: initialDifficulty(card.lastGrade || 2), lapses: 0 };
}
export function retrievability(card: Card, now = Date.now()): number | null {
  if (!card.reps || !card.lastReviewed) return null;
  const elapsed = Math.max(0, (now - card.lastReviewed) / DAY_MS);
  return bound(Math.pow(1 + factor * elapsed / memoryFor(card).stability, -W[20]), 0, 1);
}
export function nextMemory(card: Card, grade: 1 | 2 | 3, now: number): MemoryState {
  const old = memoryFor(card);
  if (!card.reps || !card.lastReviewed) return { version: 1, stability: W[grade - 1], difficulty: initialDifficulty(grade), lapses: grade === 1 ? 1 : 0 };
  const elapsed = Math.max(0, (now - card.lastReviewed) / DAY_MS);
  const r = retrievability(card, now) ?? 1;
  const s = old.stability;
  let stability: number;
  if (elapsed < 1) {
    const growth = Math.exp(W[17] * (grade - 3 + W[18])) * Math.pow(s, -W[19]);
    stability = s * (grade >= 2 ? Math.max(1, growth) : growth);
  } else if (grade === 1) {
    stability = Math.min(s, W[11] * Math.pow(old.difficulty, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
  } else {
    stability = s * (1 + Math.exp(W[8]) * (11 - old.difficulty) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (grade === 2 ? W[15] : 1));
  }
  const damped = old.difficulty - W[6] * (grade - 3) * (10 - old.difficulty) / 9;
  return { version: 1, stability: bound(stability, 0.01, 3650), difficulty: bound(W[7] * initialDifficulty(4) + (1 - W[7]) * damped, 1, 10), lapses: Math.min(1_000_000, old.lapses + (grade === 1 ? 1 : 0)) };
}
export function forgettingPressure(cards: RecallQuestion[], now: number) {
  const risks = cards.map(card => retrievability(card, now)).filter((r): r is number => r !== null).map(r => 1 - r);
  return risks.length ? Math.max(...risks) : 0;
}
