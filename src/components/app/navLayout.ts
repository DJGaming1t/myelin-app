// Capsule height, top padding and breathing room above the floating dock.
export function appNavClearance(bottomInset: number): number {
  return 88 + Math.max(bottomInset, 10);
}

// Keep the floating selection highlight inside its measured tab. Geometry is
// shared by the entrance animation and its unit tests to avoid clipping on
// small Android displays or after orientation changes.
export type DockTabSlot = { x: number; y: number; width: number; height: number };

export function dockIndicatorBox(slot: DockTabSlot): DockTabSlot {
  return {
    x: slot.x + 3,
    y: slot.y + 5,
    width: Math.max(0, slot.width - 6),
    height: Math.max(0, slot.height - 10),
  };
}
