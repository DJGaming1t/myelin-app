import { strict as assert } from 'node:assert';
import { focusStageLayout } from '../src/features/focus/focus-dial-layout';

// The centered artwork leaves room for the surrounding page padding and
// scales down for accessibility text without forcing horizontal overflow.
for (const width of [280, 320, 350, 360, 393, 430, 768]) {
  const layout = focusStageLayout(width, 1);
  assert.ok(layout.artworkSize > 0 && layout.artworkSize <= 232);
  assert.ok(layout.artworkSize <= width - 48, 'artwork needs side clearance');
}
assert.ok(focusStageLayout(393, 1.5).artworkSize < focusStageLayout(393, 1).artworkSize);
assert.ok(focusStageLayout(Number.NaN, Number.NaN).artworkSize > 0);
console.log('Focus composition: narrow, regular, tablet and enlarged-text layouts passed');
