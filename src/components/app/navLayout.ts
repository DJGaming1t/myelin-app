// Capsule height, top padding and breathing room above the floating dock.
export function appNavClearance(bottomInset: number): number {
  return 88 + Math.max(bottomInset, 10);
}
