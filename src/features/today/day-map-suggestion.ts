/** A shown suggestion must be refreshed if the plan changes or a now-slot goes stale. */
export function isDayMapSuggestionCurrent(input: {
  offeredRevision: number;
  currentRevision: number;
  offeredAt: number;
  start: number;
  end: number;
  now: number;
}): boolean {
  return input.offeredRevision === input.currentRevision && input.end > input.now &&
    !(input.now - input.offeredAt > 60_000 && input.start < input.now);
}
