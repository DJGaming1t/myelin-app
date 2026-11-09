import { strict as assert } from 'node:assert';
import { detailTransition } from '../src/features/navigation/transition';

const normal = detailTransition(false);
assert.equal(normal.animation, 'slide_from_right');
assert.equal(normal.animationTypeForReplace, 'pop');
assert.equal(normal.contentStyle.backgroundColor, '#151514');
const reduced = detailTransition(true);
assert.equal(reduced.animation, 'none');
assert.equal(reduced.animationDuration, 0);
console.log('Navigation transition checks passed');
