// Pure dial sizing and visual state helpers for the Focus and Break screens.
// 24dp extra width reserves space for the 10dp outer ring on each side.
export const FOCUS_DIAL_MIN_SIZE = 128;
export const FOCUS_DIAL_MAX_SIZE = 228;
export const FOCUS_PROGRESS_MARKS = 40;
const DIAL_EDGE_RESERVE = 24;
const PROGRESS_MARKS = FOCUS_PROGRESS_MARKS;
const BASE_PRESETS = [10, 25, 45] as const;

// Give the stopwatch its own centered stage and reserve space around it on
// narrow phones. Larger accessibility text gets a little more vertical room.
export function focusStageLayout(windowWidth: number, fontScale: number) {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 320;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const available = Math.max(0, width - 112);
  const artworkSize = Math.min(scale > 1.2 ? 205 : 232, available);
  return { artworkSize };
}

// Two short arcs stay outside the GL surface so they remain visible even
// when Android places the graphics surface in a separate compositing layer.
export function focusOrbitDots(artworkSize: number) {
  const frameWidth = artworkSize + 32;
  const frameHeight = artworkSize + 56;
  const radius = frameWidth * 1.05;
  return [false, true].flatMap(bottom => Array.from({ length: 21 }, (_, index) => {
    const x = ((index - 10) / 10) * frameWidth * 0.36;
    const curve = radius - Math.sqrt(radius * radius - x * x);
    const fade = 1 - Math.abs(index - 10) / 10;
    return {
      left: frameWidth / 2 + x - 1,
      top: bottom ? frameHeight - curve - 4 : curve + 2,
      opacity: 0.18 + fade * 0.28,
    };
  }));
}


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


export function focusDialMarkState(
  index: number,
  progress: number,
  options: { complete?: boolean; paused?: boolean } = {},
) {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const complete = Boolean(options.complete);
  const paused = Boolean(options.paused);
  const lit = complete || index / PROGRESS_MARKS < clamped;
  const activeIndex =
    !complete && clamped > 0
      ? Math.min(PROGRESS_MARKS - 1, Math.ceil(clamped * PROGRESS_MARKS) - 1)
      : -1;
  const isCurrent = index === activeIndex;
  const isCardinal = index % 10 === 0;


  const opacity = complete
    ? 0.96
    : isCurrent
      ? 1
      : lit
        ? paused
          ? 0.56
          : 0.9
        : isCardinal
          ? 0.54
          : 0.28;


  return {
    lit,
    isCurrent,
    isCardinal,
    opacity,
  };
}


export function focusDurationPresets(suggestedMinutes: number): number[] {
  const clamped = Number.isFinite(suggestedMinutes)
    ? Math.max(5, Math.min(240, Math.round(suggestedMinutes)))
    : 25;
  return Array.from(new Set([...BASE_PRESETS, clamped])).sort((a, b) => a - b);
}


export function focusPaceLabel(minutes: number): string {
  if (minutes <= 15) return 'Quick start';
  if (minutes <= 30) return 'Steady block';
  return 'Deep block';
}
