import { strict as assert } from 'node:assert';
import { focusOrbitDots, focusStageLayout } from '../src/features/focus/focus-dial-layout';

// The centered artwork leaves room for the surrounding page padding and
// scales down for accessibility text without forcing horizontal overflow.
for (const width of [280, 320, 350, 360, 393, 430, 768]) {
  const layout = focusStageLayout(width, 1);
  assert.ok(layout.artworkSize > 0 && layout.artworkSize <= 232);
  assert.ok(layout.artworkSize <= width - 48, 'artwork needs side clearance');
  assert.ok(layout.artworkSize + 32 <= width - 48, 'orbit needs side clearance');
  const dots = focusOrbitDots(layout.artworkSize);
  assert.equal(dots.length, 42);
  assert.ok(dots.slice(0, 21).every(dot => dot.top >= 0 && dot.top < 28), 'top arc must clear the graphics surface');
  assert.ok(dots.slice(21).every(dot => dot.top >= layout.artworkSize + 28 && dot.top <= layout.artworkSize + 56), 'bottom arc must clear the graphics surface');
}
assert.ok(focusStageLayout(393, 1.5).artworkSize < focusStageLayout(393, 1).artworkSize);
assert.ok(focusStageLayout(Number.NaN, Number.NaN).artworkSize > 0);
console.log('Focus composition: narrow, regular, tablet and enlarged-text layouts passed');
