import assert from 'node:assert/strict';
import { dayMapSnapTarget as snap, shouldCollapseFromScroll as handoff } from '../src/features/today/day-map-snap';
assert.equal(snap(0, -10, 0, 300), false);
assert.equal(snap(0, -60, 0, 300), true);
assert.equal(snap(0, -10, -600, 300), true);
assert.equal(snap(-300, 10, 0, 300), true);
assert.equal(snap(-300, 60, 0, 300), false);
assert.equal(snap(-300, 10, 600, 300), false);
console.log('✓ short pulls, deliberate drags and flings snap in the expected direction');

assert(handoff(0, 4, 100));
assert(!handoff(12, 4, 100));
assert(!handoff(0, 80, 100));
assert(!handoff(0, 0, 20));
console.log('✓ scroll handoff only closes after a deliberate downward pull starting at the top');
