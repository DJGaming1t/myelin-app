import assert from 'node:assert/strict';
import { appNavClearance } from '../src/components/app/navLayout';

// The full compact dock and a gap must fit for gesture and three-button navigation.
assert.equal(appNavClearance(0), 98);
assert.equal(appNavClearance(10), 98);
assert.equal(appNavClearance(24), 112);
assert.equal(appNavClearance(48), 136);
assert.ok(appNavClearance(24) - 24 >= 80);
console.log('Floating dock clearance: passed');
