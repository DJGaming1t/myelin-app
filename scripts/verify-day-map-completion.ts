import assert from 'node:assert/strict';
import { isDayMapSuggestionCurrent } from '../src/features/today/day-map-suggestion';
import { completeTask, createStudyTask, postponeTask, scheduleTask } from '../src/features/planning/task-engine';
import { canUndoDayMapCompletion, completionReceipt, restoreDayMapCompletion } from '../src/features/today/day-map-completion';

const created = 1_800_000_000_000;
for (const scenario of ['today', 'scheduled', 'postponed'] as const) {
  const task = createStudyTask({ title: 'Biology', planState: 'today', estimatedMinutes: 35, now: created });
  task.actualMinutes = 10;
  if (scenario === 'scheduled') scheduleTask(task, created + 60_000, created + 2_160_000, created + 1);
  if (scenario === 'postponed') postponeTask(task, created + 86_400_000, created + 1);
  const before = structuredClone(task);
  completeTask(task, created + 2);
  const receipt = completionReceipt('owner-a', before, task);
  assert(canUndoDayMapCompletion(task, receipt, 'owner-a'));
  assert(!canUndoDayMapCompletion(task, receipt, 'owner-b'), 'undo must never cross workspaces');
  assert(!canUndoDayMapCompletion(undefined, receipt, 'owner-a'));
  assert(!canUndoDayMapCompletion({ ...task, id: 'different' }, receipt, 'owner-a'));
  assert(!canUndoDayMapCompletion({ ...task, status: 'open' }, receipt, 'owner-a'));
  assert(!canUndoDayMapCompletion({ ...task, updatedAt: task.updatedAt + 1 }, receipt, 'owner-a'));
  assert(!canUndoDayMapCompletion({ ...task, completedAt: task.completedAt + 1 }, receipt, 'owner-a'));
  restoreDayMapCompletion(task, receipt, created + 3);
  assert.equal(task.status, 'open');
  assert.equal(task.planState, before.planState);
  assert.equal(task.scheduledStart, before.scheduledStart);
  assert.equal(task.scheduledEnd, before.scheduledEnd);
  assert.equal(task.postponedUntil, before.postponedUntil);
  assert.equal(task.completedAt, before.completedAt);
  assert.equal(task.actualMinutes, 10, 'undo must preserve recorded focus');
  assert.equal(task.updatedAt, created + 3);
  assert(!canUndoDayMapCompletion(task, receipt, 'owner-a'), 'undo must not apply twice');
}
console.log('✓ undo restores real scheduling for today, scheduled and postponed tasks; protects focus and rejects stale or repeated undo');

const offer = { offeredRevision: 4, currentRevision: 4, offeredAt: created, start: created, end: created + 1_800_000, now: created + 10_000 };
assert(isDayMapSuggestionCurrent(offer), 'a freshly offered current slot is selectable');
assert(!isDayMapSuggestionCurrent({ ...offer, currentRevision: 5 }), 'a changed plan invalidates the offer');
assert(!isDayMapSuggestionCurrent({ ...offer, now: created + 120_000 }), 'an old current slot requires a new offer');
assert(!isDayMapSuggestionCurrent({ ...offer, now: offer.end }), 'a finished slot cannot be scheduled');
assert(isDayMapSuggestionCurrent({ ...offer, start: created + 300_000, now: created + 120_000 }), 'an unchanged future suggestion remains available');
console.log('✓ schedule suggestions reject stale plans and expired slots without changing task data');
