/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as schema from '../src/data/schema';
import { createStudyTask, completeTask, scheduleTask } from '../src/features/planning/task-engine';
import { createTopic, createQuestion } from '../src/features/topics/topic-operations';
import { applyDeferral, canDefer, restoreDeferral, undoAvailability } from '../src/features/today/deferral';
import { nextLocalDayStart } from '../src/features/today/planner';

const now = new Date(2026, 9, 14, 12).getTime(), until = nextLocalDayStart(now), owner = 'local:device';
function fixture() {
  const w = schema.createEmptyWorkspace(now);
  const task = createStudyTask({ title: 'Biology notebook', subject: 'Biology', planState: 'scheduled', dueAt: now + 86_400_000, now });
  task.id = 'task1'; task.scheduledStart = now + 3_600_000; task.scheduledEnd = now + 5_400_000;
  task.postponements = 2; task.lastPostponedAt = now - 86_400_000;
  w.tasks = [task];
  const topic = createTopic({ name: 'Cells', subject: 'Biology', status: 'review', priority: 2, estimate: 25, notes: '' }, now, 't1');
  topic.cards = [createQuestion({ prompt: 'Mitosis?', answer: 'Division', hint: '' }, now, 'c1')]; topic.postponements = 2;
  w.topics = [topic]; return w;
}
const normal = fixture(), before = structuredClone(normal.tasks[0]);
const receipt = applyDeferral(normal, owner, 'task', 'task1', until, now)!;
assert.equal(normal.tasks[0].dueAt, before.dueAt); assert.equal(normal.tasks[0].scheduledStart, 0);
assert.equal(normal.tasks[0].postponements, 3); assert.equal(canDefer(normal, 'task', 'task1', now), false);
normal.tasks[0].notes = 'New notes'; normal.tasks[0].dueAt += 86_400_000;
assert.equal(restoreDeferral(normal, receipt, now + 1000), true);
assert.equal(normal.tasks[0].scheduledStart, before.scheduledStart); assert.equal(normal.tasks[0].scheduledEnd, before.scheduledEnd);
assert.equal(normal.tasks[0].postponements, 2); assert.equal(normal.tasks[0].lastPostponedAt, before.lastPostponedAt);
assert.equal(normal.tasks[0].notes, 'New notes'); assert.equal(normal.tasks[0].dueAt, before.dueAt + 86_400_000);
console.log('✓ Normal Undo restores only deferral fields; deadline/notes edits remain and duplicate deferral is ineligible');
for (const mode of ['schedule', 'complete', 'redefer', 'delete', 'expire']) {
  const w = fixture(), r = applyDeferral(w, owner, 'task', 'task1', until, now)!;
  if (mode === 'schedule') scheduleTask(w.tasks[0], now + 7_200_000, now + 9_000_000, now + 1000);
  if (mode === 'complete') completeTask(w.tasks[0], now + 1000);
  if (mode === 'redefer') w.tasks[0].postponements! += 1;
  if (mode === 'delete') w.tasks = [];
  const snapshot = structuredClone(w), at = mode === 'expire' ? until : now + 1000;
  assert.notEqual(undoAvailability(w, r, at), 'available'); assert.equal(restoreDeferral(w, r, at), false);
  assert.deepEqual(w, snapshot, 'Conflict must preserve the latest entire workspace');
}
const topics = fixture(), topicBefore = structuredClone(topics.topics[0]);
const topicReceipt = applyDeferral(topics, owner, 'topic', 't1', until, now)!;
assert.equal(canDefer(topics, 'topic', 't1', now), false);
assert.deepEqual(topics.topics[0].cards, topicBefore.cards);
assert.equal(restoreDeferral(topics, topicReceipt, now + 1000), true);
assert.deepEqual(topics.topics[0], topicBefore);
for (const mode of ['new-study', 'resnooze', 'delete', 'expire']) {
  const w = fixture(), r = applyDeferral(w, owner, 'topic', 't1', until, now)!;
  if (mode === 'new-study') w.topics[0].postponements = 0;
  if (mode === 'resnooze') w.topics[0].snoozeUntil += 86_400_000;
  if (mode === 'delete') w.topics = [];
  const saved = structuredClone(w); assert.equal(restoreDeferral(w, r, mode === 'expire' ? until : now + 1000), false); assert.deepEqual(w, saved);
}
console.log('✓ Rescheduling, completion, deletion, new deferrals/study and local-day expiry cannot be overwritten');

// Execute the real provider's update function, with live refs and its actual save queue.
async function verifyProviderGuard() {
  const refs: { current: any }[] = [], writes: { owner: string; workspace: schema.WorkspaceState }[] = [];
  const mod: { exports: any } = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/data/WorkspaceProvider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Promise,
    require(name: string) {
      if (name === 'react') return { createContext: () => ({ Provider: 'provider' }), useRef: (value: any) => { const ref = { current: value }; refs.push(ref); return ref; }, useState: (value: any) => [value, () => {}], useEffect: () => {}, useCallback: (value: any) => value, useMemo: (value: any) => value() };
      if (name === 'react/jsx-runtime') return { jsx: (_: unknown, props: any) => ({ props }) };
      if (name.endsWith('/AuthProvider')) return { useAuth: () => ({ ready: true, user: null, localMode: true }) };
      if (name === './schema') return schema;
      if (name === './owner') return { workspaceOwnerKey: () => owner };
      if (name === './storage') return { workspaceStorage: { save: async (key: string, w: schema.WorkspaceState) => { writes.push({ owner: key, workspace: w }); } } };
      if (name === './validation') return {};
      throw Error('Unexpected provider dependency: ' + name);
    },
  });
  const context = mod.exports.WorkspaceProvider({ children: null }).props.value;
  refs[0].current = fixture(); refs[1].current = owner;
  const initial = refs[0].current;
  let changes = 0;
  assert.equal(context.updateWorkspace(() => { changes++; }, { ownerKey: 'user:other', canApply: () => true }), null);
  assert.equal(context.updateWorkspace(() => { changes++; }, { ownerKey: owner, canApply: () => false }), null);
  assert.equal(refs[0].current, initial); assert.equal(changes, 0); await context.waitForSaves(); assert.equal(writes.length, 0);
  let liveReceipt: ReturnType<typeof applyDeferral> = null;
  const updated = context.updateWorkspace((draft: schema.WorkspaceState) => { liveReceipt = applyDeferral(draft, owner, 'task', 'task1', until, now); }, { ownerKey: owner, canApply: (current: schema.WorkspaceState) => canDefer(current, 'task', 'task1', now) });
  assert.equal(updated.revision, initial.revision + 1); await context.waitForSaves(); assert.equal(writes.length, 1);
  assert.equal(context.updateWorkspace(() => { changes++; }, { ownerKey: owner, canApply: (current: schema.WorkspaceState) => canDefer(current, 'task', 'task1', now) }), null);
  const newer = schema.cloneWorkspace(updated); scheduleTask(newer.tasks[0], now + 7_200_000, now + 9_000_000, now + 1000); refs[0].current = newer;
  assert.equal(context.updateWorkspace(() => { changes++; }, { ownerKey: owner, canApply: (current: schema.WorkspaceState) => undoAvailability(current, liveReceipt!, now + 1000) === 'available' }), null);
  assert.equal(refs[0].current, newer); await context.waitForSaves(); assert.equal(writes.length, 1); assert.equal(changes, 0);
  refs[1].current = 'user:new';
  assert.equal(context.updateWorkspace(() => { changes++; }, { ownerKey: owner, canApply: () => true }), null); assert.equal(changes, 0);
  const compatible = context.updateWorkspace((draft: schema.WorkspaceState) => { draft.settings.dailyMinutes = 90; });
  assert.equal(compatible.settings.dailyMinutes, 90); await context.waitForSaves(); assert.equal(writes.length, 2); assert.equal(writes[1].owner, 'user:new');
  console.log('✓ Actual provider rejects stale-owner/live-record conflicts before mutations, revisions or saves; existing unguarded callers still work');
}
void verifyProviderGuard().catch(error => { console.error(error); process.exitCode = 1; });
