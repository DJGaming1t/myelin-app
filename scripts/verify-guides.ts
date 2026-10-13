/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { FEATURE_GUIDES, CORE_GUIDE_STEPS, todayGuideSteps, focusGuideSteps, tutorialDestination, FeatureGuide, TodayGuideState, FocusGuideState } from '../src/features/guides/guide-registry';
import { spotlightRect, guideCardMaxHeight, guideCardTop } from '../src/features/guides/guide-geometry';

const guides: readonly FeatureGuide[] = FEATURE_GUIDES;
assert.equal(new Set(guides.map(g => g.id)).size, guides.length, 'Feature IDs must be unique.');
const routeExists = (route: string) => existsSync(`app${route}.tsx`) || existsSync(`app${route}/index.tsx`);
for (const guide of guides) {
  assert.ok(routeExists(guide.route), `${guide.id} must point to an existing screen.`);
  assert.ok(guide.description.length > 0 && guide.searchTerms.length > 0);
  for (const action of guide.supportedActions) {
    if (action.type === 'navigate') assert.ok(routeExists(action.route));
    else {
      assert.ok(['today', 'focus'].includes(action.tutorialId), 'Do not advertise unfinished screen tours.');
      assert.ok(routeExists(tutorialDestination(action.tutorialId).pathname));
    }
  }
}
assert.equal(CORE_GUIDE_STEPS.length, 3, 'Keep the core loop short.');
const today = guides.find(g => g.id === 'today')!;
for (const state of ['ready', 'empty', 'rest', 'focus', 'review'] as TodayGuideState[]) {
  const steps = todayGuideSteps(state);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map(step => step.anchor), today.anchors);
  assert.equal(new Set(steps.map(step => step.anchor)).size, steps.length);
}
assert.match(todayGuideSteps('empty')[0].explanation, /Add something/);
assert.match(todayGuideSteps('rest')[0].explanation, /sleep/);
assert.match(todayGuideSteps('focus')[0].explanation, /existing timer/);
assert.match(todayGuideSteps('review')[0].explanation, /Resume/);
console.log('✓ Guide IDs, live routes, supported tutorials and state-specific Today explanations');

const focus = guides.find(g => g.id === 'focus')!;
for (const state of ['empty', 'review', 'setup', 'active', 'checkpoint', 'finish', 'break', 'break-done'] as FocusGuideState[]) {
  const steps = focusGuideSteps(state);
  assert.ok(steps.length >= 1 && steps.length <= 3);
  assert.ok(steps.every(step => focus.anchors.includes(step.anchor)));
  assert.equal(new Set(steps.map(step => step.anchor)).size, steps.length);
}
assert.equal(tutorialDestination('focus').pathname, '/(app)/focus');
assert.match(focusGuideSteps('active')[0].explanation, /keeps running during this tour/);
assert.match(focusGuideSteps('checkpoint')[0].explanation, /same session/);
assert.match(focusGuideSteps('finish')[1].explanation, /saves no study evidence/);
console.log('✓ Focus tutorials cover setup, empty, Review guard, active, checkpoint, finish and break states');

const host = { x: 10, y: 24, width: 320, height: 568 };
assert.deepEqual(spotlightRect({ x: 30, y: 124, width: 100, height: 48 }, host), { x: 15, y: 95, width: 110, height: 58 });
assert.deepEqual(spotlightRect({ x: 10, y: 24, width: 320, height: 568 }, host), { x: 4, y: 4, width: 312, height: 560 });
assert.equal(spotlightRect({ x: 30, y: 900, width: 100, height: 48 }, host), null);
assert.equal(spotlightRect({ x: 30, y: 124, width: 0, height: 48 }, host), null);
assert.equal(spotlightRect({ x: NaN, y: 124, width: 100, height: 48 }, host), null);
for (const height of [480, 568, 740, 900]) {
  for (const y of [24, 100, Math.floor(height / 2), height - 100]) {
    const target = { x: 24, y, width: 250, height: 48 };
    const cardHeight = Math.min(290, guideCardMaxHeight(target, height, 24, 20));
    const top = guideCardTop(target, height, cardHeight, 24, 20);
    assert.ok(top >= 36 && top + cardHeight <= height - 32, 'Cards stay inside safe bounds.');
    assert.ok(top >= y + 48 + 16 || top + cardHeight <= y - 16, 'Keep the control visible, even when the copy needs to scroll.');
  }
}
console.log('✓ Spotlight coordinate origins, clipping, invalid measurements and compact card placement');
