/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scenario } from './verify-task-planning';
import { createEmptyWorkspace, StudySession } from '../src/data/schema';
import { createTopic, createQuestion } from '../src/features/topics/topic-operations';
import { neuralEvidence } from '../src/features/adaptive/insight-engine';
const now = new Date(2026, 9, 17, 12).getTime();
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
function fixture(n = 1) {
  const w = createEmptyWorkspace(now);
  w.topics = Array.from({ length: n }, (_, i) => {
    const t = createTopic({ name: 'Topic ' + i, subject: 'Biology', status: 'review', priority: 2, estimate: 25, notes: '' }, now + i, 't' + i);
    t.cards = [createQuestion({ prompt: 'Question', answer: 'Answer', hint: '' }, now, 'c' + i)]; return t;
  }); return w;
}
function review(extra: Partial<StudySession> = {}): StudySession {
  return { id: 'h', topicId: 't0', cardId: 'c0', at: at(16), kind: 'review', minutes: 0, grade: 3, effort: 3, prompt: '', response: '', confidence: 'sure', ...extra };
}
const w = fixture();
w.history = [review({ grade: 1 }), review({ id: 'retry', at: at(16) + 60000 }), review({ id: 'repeat', at: at(16) + 120000 })];
assert.equal(neuralEvidence(w, now).total, 1, 'Again → Good and repeated Good retain one connection');
w.history.push(review({ id: 'later-again', at: at(16) + 180000, grade: 1 }));
assert.equal(neuralEvidence(w, now).total, 1, 'Later failure does not revoke an earned connection');
w.history.push(review({ id: 'next-day', at: at(17, 0) }));
assert.equal(neuralEvidence(w, now).total, 2, 'Local midnight earns a separate connection');
w.history.push(review({ id: 'hint', at: at(15), hintUsed: true }));
assert.equal(neuralEvidence(w, now).total, 2);
w.history.push(review({ id: 'later-unhinted', at: at(15) + 60000 }));
assert.equal(neuralEvidence(w, now).total, 3, 'Hinted attempt does not invalidate later unhinted success');
for (const extra of [{ cardId: 'deleted' }, { topicId: 'deleted' }, { at: now + 1 }, { at: NaN }, { at: Infinity }, { at: 9e15 }, { at: -1 }]) {
  const invalid = fixture(); invalid.history = [review(extra)]; assert.equal(neuralEvidence(invalid, now).total, 0, JSON.stringify(extra));
}
const duplicates = fixture(2); duplicates.topics[1].cards[0].id = 'c0';
duplicates.history = [review(), review({ id: 'other-owner', topicId: 't1' })];
assert.deepEqual(neuralEvidence(duplicates, now).nodes.map(n => n.wins), [1, 1], 'Topic/card pair disambiguates reused card IDs without stealing legitimate wins');
duplicates.history.push(review({ topicId: 'unknown' }));
assert.equal(neuralEvidence(duplicates, now).total, 2);
duplicates.topics[0].cards.push({ ...duplicates.topics[0].cards[0] });
assert.deepEqual(neuralEvidence(duplicates, now).nodes.map(n => n.wins), [0, 1], 'Unresolvable duplicate inside a topic is excluded');
const wrongOwner = fixture(2); wrongOwner.history = [review({ topicId: 't1' })];
assert.equal(neuralEvidence(wrongOwner, now).total, 0);
const deleted = fixture(); deleted.history = [review()]; deleted.topics[0].cards = [];
assert.equal(neuralEvidence(deleted, now).total, 0, 'Removed question evidence cannot be verified; displayed totals can fall');
const valid = fixture(2); valid.topics.forEach(t => { t.createdAt = now; }); valid.topics.reverse();
valid.history = Array.from({ length: 1000 }, (_, i) => review({ id: 'earned-' + i, at: new Date(2020, 0, 1 + i, 12).getTime() }));
const before = JSON.stringify(valid), evidence = neuralEvidence(valid, now);
assert.equal(evidence.total, 1000); assert.deepEqual(evidence.earned, [1, 10, 25, 50, 100, 250, 500, 1000]); assert.equal(evidence.next, null);
assert.deepEqual(evidence.nodes.map(n => n.topic.id), ['t0', 't1']);
valid.topics[1].cards[0].dueAt = 0;
assert.equal(neuralEvidence(valid, now).total, 1000, 'Due-date changes never erase earned history');
valid.topics[1].cards[0].dueAt = JSON.parse(before).topics[1].cards[0].dueAt;
assert.equal(JSON.stringify(valid), before, 'Read-only evidence derivation');
// DST transition days must use calendar boundaries, not fixed 24-hour buckets.
const dst = fixture(); dst.history = [review({ at: new Date(2026, 2, 8, 0, 5).getTime() }), review({ at: new Date(2026, 2, 8, 23, 55).getTime() }), review({ at: new Date(2026, 2, 9, 0, 5).getTime() })];
assert.equal(neuralEvidence(dst, now).total, 2);
console.log('✓ Neural Map retains retry wins/milestones, deduplicates local days, validates identity/time and safely attributes cross-topic duplicate IDs');
function setup(n = 10) {
  const s = scenario(); s.mutate(w => { w.topics = fixture(n).topics; });
  const props = () => ({ workspace: s.workspace(), ownerKey: s.owner, now: s.now(), anchorRef: { current: null } });
  const host = s.mount('src/features/adaptive/NeuralMap.tsx', 'OwnerNeuralMap', props);
  return { ...s, host, action: (label: string) => s.actions(label, host)[0] };
}
const opened = setup(); const snapshot = JSON.stringify(opened.workspace());
const open = opened.action('Open Topic 0'); open(); open();
assert.equal(opened.routes.length, 1); assert.equal(opened.routes[0].params.topicId, 't0'); assert.equal(JSON.stringify(opened.workspace()), snapshot);
for (const mode of ['owner', 'loading', 'deleted', 'unmounted', 'cycle']) {
  const s = setup(), old = s.action('Open Topic 0');
  if (mode === 'owner') s.switchOwner('user:new', fixture(10));
  if (mode === 'loading') s.setStatus('loading');
  if (mode === 'deleted') s.mutate(w => { w.topics.shift(); });
  if (mode === 'unmounted') s.unmount(s.host);
  if (mode === 'cycle') { s.unmount(s.host); s.switchOwner(); s.switchOwner(s.owner, fixture(10)); }
  old(); assert.equal(s.routes.length, 0, mode);
}
const selection = setup(); selection.action('Topic 1, 0 earned recalls')(); selection.host.render();
assert.ok(selection.action('Open Topic 1'));
selection.action('Next map topics')(); selection.host.render(); assert.ok(selection.action('Open Topic 9'));
const anchor = selection.nodes(selection.host.output).find((n: any) => n.props?.testID === 'guide-progress-map');
assert.ok(anchor?.props.ref); assert.equal(anchor.props.collapsable, false); assert.equal(anchor.props.accessibilityRole, 'button');
assert.ok(selection.nodes(selection.host.output).some((n: any) => n.type === 'Reveal'));
// Exercise the real owner wrapper; emulate React's keyed remount explicitly in this VM.
const wrapper = selection.mount('src/features/adaptive/NeuralMap.tsx', 'NeuralMap', () => ({ workspace: selection.workspace() }));
assert.equal(wrapper.output.key, selection.owner);
selection.unmount(selection.host); selection.switchOwner('user:next', fixture(10)); wrapper.render();
assert.equal(wrapper.output.key, 'user:next'); const fresh = selection.mountChild(wrapper);
assert.ok(selection.actions('Open Topic 0', fresh)[0], 'New owner starts at page zero with default selection');
const oldWorkspace = selection.workspace();
const staleProps = selection.mount('src/features/adaptive/NeuralMap.tsx', 'NeuralMap', () => ({ workspace: oldWorkspace }));
selection.switchOwner('user:third', fixture(10)); staleProps.render(); assert.equal(staleProps.output, null, 'Ready new owner cannot render another owner snapshot');
selection.setStatus('loading'); wrapper.render(); assert.equal(wrapper.output, null);
const empty = setup(0), add = empty.action('Add your first topic');
assert.ok(empty.nodes(empty.host.output).find((n: any) => n.props?.testID === 'guide-progress-map')?.props.ref);
empty.switchOwner(); add(); assert.equal(empty.routes.length, 0);
const emptyReady = setup(0); emptyReady.action('Add your first topic')(); assert.equal(emptyReady.routes[0], '/(app)/topics/new');
const progress = fs.readFileSync('app/(app)/progress/index.tsx', 'utf8');
assert.match(progress, /<NeuralMap workspace=\{workspace\} now=\{now\} anchorRef=\{guide.anchors\['progress.map'\]\}/);
console.log('✓ Actual Neural Map actions reject stale owners/readiness/topics/unmounts, reset keyed state and retain anchors, accessibility and Reveal');
