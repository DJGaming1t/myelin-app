/** Insert the current-time marker before the first item that has not ended. */
export function currentTimeInsertionIndex(entries: readonly { end: number }[], now: number): number {
  const index = entries.findIndex(entry => entry.end > now);
  return index < 0 ? entries.length : index;
}
