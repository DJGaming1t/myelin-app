import assert from 'node:assert/strict';
import { currentTimeInsertionIndex as index } from '../src/features/planning/timeline-position';
const entries = [{end:100}, {end:200}, {end:300}];
assert.equal(index([], 150), 0);
assert.equal(index(entries, 50), 0);
assert.equal(index(entries, 100), 1);
assert.equal(index(entries, 250), 2);
assert.equal(index(entries, 300), 3);
console.log('✓ timeline current-time marker is positioned before, between, during and after entries');
