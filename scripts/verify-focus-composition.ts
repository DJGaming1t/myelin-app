import { strict as assert } from 'node:assert';
import { focusStageLayout } from '../src/features/focus/focus-dial-layout';

// The artwork and timer can share a row on ordinary phones, while narrow
// displays and accessibility text sizes get a full-width readout.
for (const width of [350, 360, 393, 430, 768]) {
  const layout = focusStageLayout(width, 1);
  assert.equal(layout.stacked, false);
  assert.ok(layout.artworkSize >= 128 && layout.artworkSize <= 164);
  assert.ok(width - 48 - 14 - layout.artworkSize >= 120, 'readout needs usable space');
}
assert.equal(focusStageLayout(320, 1).stacked, true);
assert.equal(focusStageLayout(393, 1.5).stacked, true);
assert.equal(focusStageLayout(Number.NaN, Number.NaN).stacked, true);
assert.ok(focusStageLayout(320, 1).artworkSize <= 320 - 48);
console.log('Focus composition: narrow, regular, tablet and enlarged-text layouts passed');
