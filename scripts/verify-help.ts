/// <reference types="node" />
import assert from 'node:assert/strict';
import { FEATURE_GUIDES } from '../src/features/guides/guide-registry';
import { HELP_EXAMPLES, searchGuides } from '../src/features/guides/help-search';

const cases: [string, string][] = [
  ['How do I move this to tomorrow?', 'tasks'],
  ['What does unsure mean?', 'confidence'],
  ['Where are my mistakes?', 'mistakes'],
  ['How do I start focus?', 'focus'],
  ['move task to tomorow', 'tasks'],
  ['foucs', 'focus'],
  ['mistkaes', 'mistakes'],
  ['CONFIDENCE!!!', 'confidence'],
  ['fócus', 'focus'],
  ['foc', 'focus'],
  ['not now', 'tasks'],
  ['quiet hours', 'reminders'],
  ['neural map', 'progress'],
  ['where can my study fit', 'day-map'],
  ['delete account', 'settings'],
];
for (const [query, expected] of cases) {
  assert.equal(searchGuides(query)[0]?.id, expected, `Top result for ${query}`);
  assert.ok(searchGuides(query).length <= 5);
}
for (const query of ['', '   ', '???', 'how do I', 'zzzzzzzz spaceship banana', 'x'.repeat(10000)]) {
  assert.deepEqual(searchGuides(query), [], `No invented answer for ${query.slice(0, 30)}`);
}
const before = JSON.stringify(FEATURE_GUIDES);
assert.deepEqual(searchGuides('focus'), searchGuides('focus'), 'Stable ranking.');
assert.equal(JSON.stringify(FEATURE_GUIDES), before, 'Retrieval leaves the registry unchanged.');
for (const guide of FEATURE_GUIDES) assert.ok(guide.helpSteps.length >= 2);
assert.equal(HELP_EXAMPLES.length, 4);
for (const example of HELP_EXAMPLES) assert.equal(searchGuides(example.exampleQuery)[0].id, example.id);
assert.match(FEATURE_GUIDES.find(g => g.id === 'tasks')!.helpSteps.join(' '), /deadline, not the study schedule/);
console.log('✓ Required questions, typo/transposition/prefix matching, normalization, deterministic ranking and bounded no-match behavior');
console.log('✓ Registry-backed examples and explanations distinguish scheduling from deadlines');
