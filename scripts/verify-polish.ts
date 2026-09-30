import fs from 'node:fs';
import path from 'node:path';

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tokens = read('src/theme/tokens.ts');
const motion = read('src/features/accessibility/useReducedMotion.ts');
const root = read('app/_layout.tsx');
const app = read('app/(app)/_layout.tsx');
const nav = read('src/components/app/AppNav.tsx');
const header = read('src/components/app/ScreenHeader.tsx');
const states = read('src/components/app/ScreenState.tsx');
const focus = read('app/(app)/focus/index.tsx');
const workspaceProvider = read('src/data/WorkspaceProvider.tsx');
const reveal = read('src/components/motion/Reveal.tsx');
const planCard = read('src/features/today/PlanBlockCard.tsx');

assert(tokens.includes('contentMax: 820'), 'Responsive content cap is missing.');
assert(tokens.includes('minTouch: 44'), '44-point touch target token is missing.');
assert(motion.includes('AccessibilityInfo.isReduceMotionEnabled'), 'System reduced-motion preference is not read.');
assert(motion.includes('workspace?.settings.reduceMotion || systemReduceMotion'), 'User and system motion preferences are not combined.');
assert(root.includes("animation: reduceMotion ? 'none' : 'fade'"), 'Root navigation ignores reduced motion.');
assert(app.includes("animation: reduceMotion ? 'none' : 'fade'"), 'Protected navigation ignores reduced motion.');
assert(app.includes('kind="error"'), 'Workspace loading failures do not have an explicit error state.');
assert(app.includes('actionLabel="Try again"'), 'Workspace error state is missing a retry action.');
assert(app.includes('retryWorkspace()'), 'Workspace retry action is not wired to the provider.');
assert(workspaceProvider.includes('retryWorkspace: () => Promise<void>'), 'Workspace retry API is missing.');
assert(workspaceProvider.includes('workspaceStorage.load(currentOwner)'), 'Workspace retry does not reload durable storage.');
assert(states.includes('accessibilityLiveRegion'), 'Shared loading/error states do not announce changes.');
assert(nav.includes('accessibilityLabel={item.label}'), 'Bottom navigation labels are missing.');
assert(nav.includes('minHeight: layout.minTouch'), 'Bottom navigation touch targets are too small.');
assert(nav.includes('maxWidth: layout.contentMax'), 'Bottom navigation is not tablet/web bounded.');
assert(header.includes('accessibilityRole="header"'), 'Screen titles are not exposed as headers.');
assert(header.includes('minHeight: layout.minTouch'), 'Header controls are too small.');
assert(header.includes('maxWidth: layout.contentMax'), 'Screen header is not tablet/web bounded.');
assert(focus.includes('setInterval(() => setNow(Date.now()), 1000)'), 'Focus timer redraw frequency was not reduced.');
assert(reveal.includes('Animated.timing'), 'Shared entrance motion is missing.');
assert(reveal.includes('if (reduceMotion)'), 'Shared entrance motion ignores reduced-motion.');
assert(nav.includes('activeRail'), 'Bottom navigation is missing a strong active-state indicator.');
assert(nav.includes('glyphWrapActive'), 'Bottom navigation is missing the active glyph treatment.');
assert(header.includes('<Reveal'), 'Screen headers are missing entrance motion.');
assert(states.includes('<Reveal'), 'Shared states are missing entrance motion.');
assert(planCard.includes('Math.min(index * 55, 220)'), 'Today plan cards are missing staggered reveal motion.');

console.log('Product polish verification passed.');
