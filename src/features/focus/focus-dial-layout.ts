// Pure dial sizing for the Focus and Break screens.
// 24dp extra width reserves space for the 10dp outer ring on each side.
export const FOCUS_DIAL_MIN_SIZE = 128;
export const FOCUS_DIAL_MAX_SIZE = 228;
const DIAL_EDGE_RESERVE = 24;
const PROGRESS_MARKS = 40;
const BASE_DURATION_PRESETS = [10, 25, 45] as const;

export type FocusDialTickState = 'complete' | 'lead' | 'lit' | 'unlit';

export function focusDialSize(windowWidth: number, horizontalPadding: number): number {
  if (!Number.isFinite(windowWidth) || !Number.isFinite(horizontalPadding)) {
    return FOCUS_DIAL_MIN_SIZE;
  }
  const available = Math.floor(windowWidth - 2 * horizontalPadding - DIAL_EDGE_RESERVE);
  return Math.max(FOCUS_DIAL_MIN_SIZE, Math.min(FOCUS_DIAL_MAX_SIZE, available));
}

export function focusDialMarkPosition(size: number, index: number) {
  const angle = index * Math.PI * 2 / PROGRESS_MARKS;
  const radius = size / 2 - 11;
  return {
    left: size / 2 - 1.5 + Math.sin(angle) * radius,
    top: size / 2 - 4.5 - Math.cos(angle) * radius,
  };
}

export function focusDialTickState(
  index: number,
  progress: number,
  complete = false,
): FocusDialTickState {
  if (complete || progress >= 1) return 'complete';
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const litCount = Math.floor(clamped * PROGRESS_MARKS);
  if (index < litCount) return 'lit';
  if (clamped > 0 && index === litCount) return 'lead';
  return 'unlit';
}

export function focusDurationPresets(suggestedMinutes: number): number[] {
  const clamped = Number.isFinite(suggestedMinutes)
    ? Math.max(5, Math.min(240, Math.round(suggestedMinutes)))
    : 45;
  return Array.from(new Set([...BASE_DURATION_PRESETS, clamped])).sort((a, b) => a - b);
}
