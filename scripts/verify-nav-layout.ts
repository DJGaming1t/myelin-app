import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appNavClearance, dockIndicatorBox } from '../src/components/app/navLayout';

// The full compact dock and a gap must fit for gesture and three-button navigation.
assert.equal(appNavClearance(0), 98);
assert.equal(appNavClearance(10), 98);
assert.equal(appNavClearance(24), 112);
assert.equal(appNavClearance(48), 136);
assert.ok(appNavClearance(24) - 24 >= 80);

assert.deepEqual(
  dockIndicatorBox({ x: 12, y: 4, width: 60, height: 58 }),
  { x: 15, y: 9, width: 54, height: 48 },
  'The selection highlight must fit inside its measured tab',
);
assert.deepEqual(
  dockIndicatorBox({ x: 0, y: 0, width: 4, height: 8 }),
  { x: 3, y: 5, width: 0, height: 0 },
  'Very narrow tabs must not yield negative indicator sizes',
);

const navigation = readFileSync('src/components/app/AppNav.tsx', 'utf8');
assert.ok(navigation.includes('useReducedMotion()'), 'Dock obeys reduced motion');
assert.ok(navigation.includes('withSpring(targetGeometry.x'), 'The active highlight glides horizontally');
assert.ok(navigation.includes('dockIndicatorBox(previous)'), 'The highlight starts at the previous tab');
assert.ok(navigation.includes('accessibilityState={{ selected: active }}'), 'Tab selection stays accessible');
assert.ok(navigation.includes('scaleTo={0.94}'), 'Dock tabs have tactile press feedback');

const stack = readFileSync('app/(app)/_layout.tsx', 'utf8');
assert.ok(stack.includes("'fade_from_bottom'"), 'Peer pages use a gentle lift-fade');
assert.ok(stack.includes("'slide_from_right'"), 'Detail pages use a directional transition');
assert.ok(stack.includes("reduceMotion\n          ? 'none'"), 'Reduced motion disables stack transitions');

console.log('Floating dock clearance, highlight motion and page transition checks: passed');
