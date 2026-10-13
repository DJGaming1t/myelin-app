export type GuideRect = { x: number; y: number; width: number; height: number };

/** Convert a measured target into overlay coordinates, keeping the ring on screen. */
export function spotlightRect(target: GuideRect, host: GuideRect, inset = 5): GuideRect | null {
  if (![...Object.values(target), ...Object.values(host)].every(Number.isFinite) || target.width <= 0 || target.height <= 0 || host.width <= 0 || host.height <= 0) return null;
  const x = Math.max(4, target.x - host.x - inset);
  const y = Math.max(4, target.y - host.y - inset);
  const right = Math.min(host.width - 4, target.x - host.x + target.width + inset);
  const bottom = Math.min(host.height - 4, target.y - host.y + target.height + inset);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Leave the actual control visible; long copy scrolls inside the remaining space. */
export function guideCardMaxHeight(target: GuideRect | null, screenHeight: number, topInset = 0, bottomInset = 0) {
  const fullHeight = Math.max(0, screenHeight - topInset - bottomInset - 24);
  if (!target) return fullHeight;
  const above = target.y - 16 - topInset - 12;
  const below = screenHeight - bottomInset - 12 - target.y - target.height - 16;
  return Math.max(0, Math.min(fullHeight, Math.max(above, below)));
}

export function guideCardTop(target: GuideRect | null, screenHeight: number, cardHeight: number, topInset = 0, bottomInset = 0) {
  const min = topInset + 12;
  const max = Math.max(min, screenHeight - bottomInset - cardHeight - 12);
  if (!target) return max;
  const below = target.y + target.height + 16;
  if (below <= max) return Math.max(min, below);
  const above = target.y - cardHeight - 16;
  if (above >= min) return Math.min(max, above);
  return max;
}
