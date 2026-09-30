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

assert(tokens.includes('contentMax: 820'), 'Responsive content cap is missing.');
assert(tokens.includes('minTouch: 44'), '44-point touch target token is missing.');
assert(motion.includes('AccessibilityInfo.isReduceMotionEnabled'), 'System reduced-motion preference is not read.');
assert(motion.includes('workspace?.settings.reduceMotion || systemReduceMotion'), 'User and system motion preferences are not combined.');
assert(root.includes("animation: reduceMotion ? 'none' : 'fade'"), 'Root navigation ignores reduced motion.');
assert(app.includes("animation: reduceMotion ? 'none' : 'fade'"), 'Protected navigation ignores reduced motion.');
assert(app.includes('kind="error"'), 'Workspace loading failures do not have an explicit error state.');
assert(states.includes('accessibilityLiveRegion'), 'Shared loading/error states do not announce changes.');
assert(nav.includes('accessibilityLabel={item.label}'), 'Bottom navigation labels are missing.');
assert(nav.includes('minHeight: layout.minTouch'), 'Bottom navigation touch targets are too small.');
assert(nav.includes('maxWidth: layout.contentMax'), 'Bottom navigation is not tablet/web bounded.');
assert(header.includes('accessibilityRole="header"'), 'Screen titles are not exposed as headers.');
assert(header.includes('minHeight: layout.minTouch'), 'Header controls are too small.');
assert(header.includes('maxWidth: layout.contentMax'), 'Screen header is not tablet/web bounded.');
assert(focus.includes('setInterval(() => setNow(Date.now()), 1000)'), 'Focus timer redraw frequency was not reduced.');

console.log('Product polish verification passed.');
