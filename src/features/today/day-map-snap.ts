/** Resolve a drag after release; usable inside a Reanimated worklet. */
export function dayMapSnapTarget(start: number, translation: number, velocity: number, distance: number): boolean {
  'worklet';
  if (velocity < -480) return true;
  if (velocity > 480) return false;
  const threshold = Math.min(56, distance * .18);
  return start < -distance / 2 ? translation < threshold : translation < -threshold;
}
