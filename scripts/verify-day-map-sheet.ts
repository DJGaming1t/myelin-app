import assert from 'node:assert/strict';
import { dayMapSheetLayout } from '../src/features/today/day-map-sheet-layout';

for (const height of [568, 640, 740, 800, 920, 1024]) {
  for (const top of [0, 24, 48]) {
    for (const bottom of [0, 24, 48]) {
      for (const fontScale of [1, 1.3, 1.6, 2]) {
        const g = dayMapSheetLayout(height, top, bottom, fontScale);
        const usable = height - top;
        assert(g.expandDistance > 0, 'snap points must remain ordered');
        assert(Math.abs(g.collapsedSheetTop - g.expandDistance - g.expandedSheetTop) < .001);
        assert(usable - g.collapsedSheetTop - g.dockClearance >= 180,
          `collapsed preview must fit above dock: ${height}/${top}/${bottom}/${fontScale}`);
        assert(usable - g.expandedSheetTop - g.dockClearance - 68 >= 180,
          'expanded scrolling viewport must remain usable');
        assert(g.heroStageHeight >= 48, 'persistent visual must retain a drawable viewport');
      }
    }
  }
}
const normal = dayMapSheetLayout(800, 24, 24);
const largeText = dayMapSheetLayout(800, 24, 24, 1.6);
assert(largeText.collapsedSheetTop < normal.collapsedSheetTop, 'larger text must reserve more preview space');
console.log('✓ 216 viewport, safe-area and font-scale combinations keep preview and scrolling clear of the dock');
