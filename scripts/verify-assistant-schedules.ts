/// <reference types="node" />
import assert from 'node:assert/strict';
import { createEmptyWorkspace, cloneWorkspace } from '../src/data/schema';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { answerAssistantClarification, beginAssistantClarification } from '../src/features/assistant/assistant-clarification';
import { applyPreparedAssistantActionBatch, prepareAssistantActionBatch } from '../src/features/assistant/assistant-action-session';
import { parseAssistantActionBatch, assistantActionToolCatalog } from '../src/features/assistant/ai-action-engine';
import { assistantActionBatchJsonSchema } from '../src/features/assistant/assistant-model-contract';
import { parseMyelinMiniDecision } from '../src/features/assistant/myelin-mini';
import { checkAssistantActionGrounding } from '../src/features/assistant/assistant-request-grounding';
import { tryParseRecurringSchedule, parseScheduleTimeReply, parseWeeklyDaysReply } from '../src/features/assistant/recurring-schedule-language';
import { commitmentOccurrencesForDay, freeStudyWindows } from '../src/features/planning/day-engine';
import { createStudyTask } from '../src/features/planning/task-engine';

async function main() {
  const now = new Date(2026, 9, 9, 12).getTime();
  const state = createEmptyWorkspace(now);
  let calls = 0;
  const offline = { id: 'unreleased', async generate(): Promise<never> { calls++; throw new Error('No model needed'); } };
  const route = (userRequest: string, requestId: string, workspace = state, clarificationAnswers = {}) => routeWithHybridAssistant({
    workspace, userRequest, requestId, offline, allowCloudFallback: false, now, clarificationAnswers });
  const valid = [
    { request: 'I have school on everyday except sat and sun , from 5:30am to 2pm', days: [1, 2, 3, 4, 5], start: 330, end: 840, kind: 'school' },
    { request: 'School weekdays from 05:30 to 14:00', days: [1, 2, 3, 4, 5], start: 330, end: 840, kind: 'school' },
    { request: 'Could you add school Monday-Friday from 7 AM to 2 PM?', days: [1, 2, 3, 4, 5], start: 420, end: 840, kind: 'school' },
    { request: 'I have tuition every Mon, Wed and Fri from 4pm to 6pm', days: [1, 3, 5], start: 960, end: 1080, kind: 'tuition' },
    { request: 'Coaching weekends from 9am to 12pm', days: [0, 6], start: 540, end: 720, kind: 'coaching' },
    { request: 'Tuition every day except Sunday from 12 PM to 1 PM', days: [1, 2, 3, 4, 5, 6], start: 720, end: 780, kind: 'tuition' },
    { request: 'School daily from 08:00 to 14:30', days: [0, 1, 2, 3, 4, 5, 6], start: 480, end: 870, kind: 'school' },
    { request: 'Tuition every Mondays and Wednesdays from 5pm to 6pm', days: [1, 3], start: 1020, end: 1080, kind: 'tuition' },
  ];
  const original = JSON.stringify(state);
  for (const [index, item] of valid.entries()) {
    const result = await route(item.request, 'schedule-' + index);
    assert.equal(result.route, 'actions', item.request); if (result.route !== 'actions') throw new Error(item.request);
    const action = result.prepared.batch.actions[0]!;
    assert.equal(action.type, 'create_commitment'); if (action.type !== 'create_commitment') throw new Error('type');
    assert.equal(action.kind, item.kind); assert.deepEqual(action.recurrenceDays, item.days);
    assert.equal(action.startMinutes, item.start); assert.equal(action.endMinutes, item.end);
    assert.equal(JSON.stringify(state), original, 'No mutation before confirmation');
    assert.equal(result.prepared.preview.requiresConfirmation, true);
    assert.throws(() => applyPreparedAssistantActionBatch(state, result.prepared, 'wrong', now));
    const stale = cloneWorkspace(state); stale.revision++;
    assert.throws(() => applyPreparedAssistantActionBatch(stale, result.prepared, result.prepared.confirmationKey, now));
    const applied = applyPreparedAssistantActionBatch(state, result.prepared, result.prepared.confirmationKey, now);
    assert.equal(applied.nextWorkspace.commitments.length, 1); assert.equal(applied.nextWorkspace.revision, state.revision + 1);
    const repeated = applyPreparedAssistantActionBatch(applied.nextWorkspace, result.prepared, result.prepared.confirmationKey, now);
    assert.equal(repeated.nextWorkspace.commitments.length, 1);
    const duplicate = await route(item.request, 'new-request-same-schedule', applied.nextWorkspace);
    assert.equal(duplicate.route, 'clarify', 'A fresh request must not duplicate the weekly entry');
    const entry = applied.nextWorkspace.commitments[0]!;
    for (const day of [new Date(2026, 9, 12), new Date(2026, 9, 17), new Date(2026, 10, 2)]) {
      const occurrences = commitmentOccurrencesForDay([entry], day.getTime());
      assert.equal(occurrences.length, item.days.includes(day.getDay()) ? 1 : 0);
      if (occurrences.length) {
        const start = new Date(occurrences[0]!.start); const end = new Date(occurrences[0]!.end);
        assert.equal(start.getHours() * 60 + start.getMinutes(), item.start);
        assert.equal(end.getHours() * 60 + end.getMinutes(), item.end);
      }
    }
  }
  for (const [request, field] of [
    ['School weekdays from 5:30 to 2pm', 'timeRange'], ['School weekdays from 8 to 2', 'timeRange'],
    ['School weekdays from 25am to 2pm', 'timeRange'], ['School weekdays from 8:75am to 2pm', 'timeRange'],
    ['School weekdays from 10pm to 2am', 'timeRange'], ['School weekdays from 2pm to 2pm', 'timeRange'],
    ['School weekdays', 'timeRange'], ['I have school', 'recurrenceDays'],
    ['School on Monday from 8am to 2pm', 'recurrenceDays'],
    ['School daily except sat and sun and fri and thu and wed and tue and mon from 8am to 2pm', 'recurrenceDays'],
    ['School weekdays from 8am to 2pm and add bio homework', 'request'],
    ['School and tuition weekdays from 8am to 2pm', 'request'],
    ['School every 2 weeks on Monday from 8am to 2pm', 'request'],
    ['School weekdays not from 8am to 2pm', 'request'],
  ]) {
    const result = await route(request!, 'ambiguous-' + field);
    assert.equal(result.route, 'clarify', request); if (result.route !== 'clarify') throw new Error('question');
    assert.ok(result.missingFields.includes(field!), request);
  }
  for (const request of ["I don't have school weekdays from 8am to 2pm", 'Can I add school weekdays from 8am to 2pm?', 'I used to have school weekdays from 8am to 2pm']) {
    assert.notEqual(tryParseRecurringSchedule(request)?.route, 'actions');
  }
  assert.deepEqual(parseWeeklyDaysReply('Mon, Wed, Fri'), [1, 3, 5]);
  assert.equal(parseWeeklyDaysReply('weekdays and add a task'), null);
  assert.equal(parseScheduleTimeReply('8am to 2pm and delete everything'), null);
  assert.deepEqual(parseScheduleTimeReply('12 AM to 6 AM'), { startMinutes: 0, endMinutes: 360 });
  const userRequest = 'I have school'; const scope = { ownerKey: 'student', revision: state.revision, now, currentDate: '2026-10-09' };
  const first = beginAssistantClarification(userRequest, await route(userRequest, 'two-replies'), scope)!;
  const days = answerAssistantClarification(first, 'every day except Sat and Sun', state, scope);
  assert.equal(days.kind, 'resolved'); if (days.kind !== 'resolved') throw new Error('days');
  const second = beginAssistantClarification(userRequest, await route(userRequest, 'two-replies', state, days.answers), scope, days.answers, first)!;
  assert.equal(second.field, 'timeRange');
  assert.equal(answerAssistantClarification(second, '8 to 2', state, scope).kind, 'retry');
  const times = answerAssistantClarification(second, '5:30am to 2pm', state, scope);
  assert.equal(times.kind, 'resolved'); if (times.kind !== 'resolved') throw new Error('times');
  const final = await route(userRequest, 'two-replies', state, times.answers);
  assert.equal(final.route, 'actions'); if (final.route !== 'actions') throw new Error('proposal');
  assert.deepEqual(times.answers, { recurrenceDays: [1, 2, 3, 4, 5], startMinutes: 330, endMinutes: 840 });
  const after = applyPreparedAssistantActionBatch(state, final.prepared, final.prepared.confirmationKey, now).nextWorkspace;
  const monday = new Date(2026, 9, 12).getTime(); const saturday = new Date(2026, 9, 17).getTime();
  assert.ok(freeStudyWindows(after, monday).every(window => new Date(window.start).getHours() >= 14));
  assert.deepEqual(freeStudyWindows(after, saturday), freeStudyWindows(state, saturday));
  for (const change of [{ ownerKey: 'other' }, { revision: state.revision + 1 }, { currentDate: '2026-10-10' }, { now: now + 600_001 }]) {
    assert.equal(answerAssistantClarification(second, '8am to 2pm', state, { ...scope, ...change }).kind, 'expired');
  }
  assert.equal(calls, 0, 'Valid schedules, missing details and known compound statements do not need a model');
  const action = final.prepared.batch.actions[0]!;
  for (const patch of [{ startMinutes: -1 }, { endMinutes: 1500 }, { recurrenceDays: [1, 1] }, { recurrenceDays: [7] }, { recurrenceDays: [] }, { kind: 'sleep' }, { unsafe: true }]) {
    assert.throws(() => parseAssistantActionBatch({ version: 1, requestId: 'invalid', actions: [{ ...action, ...patch }] }));
  }
  assert.doesNotMatch(JSON.stringify(assistantActionToolCatalog()), /create_commitment/);
  assert.doesNotMatch(JSON.stringify(assistantActionBatchJsonSchema()), /create_commitment/);
  const invented = { version: 1, requestId: 'model-must-not-set-routine', route: 'actions', confidence: 1,
    batch: { version: 1 as const, requestId: 'model-must-not-set-routine', actions: [action] } };
  assert.throws(() => parseMyelinMiniDecision(invented, invented.requestId), /local-only/,
    'Frozen model evaluation retains the existing protocol allowlist');
  assert.ok(checkAssistantActionGrounding({ workspace: state, userRequest: 'Add Elasticity as a Physics topic', currentDate: scope.currentDate }, invented.batch));
  const modelProposed = await routeWithHybridAssistant({ workspace: state, userRequest: 'Add Elasticity as a Physics topic', requestId: 'model-must-not-set-routine',
    offline: { id: 'simulated-untrusted', async generate() { return { version: 1, requestId: 'model-must-not-set-routine', route: 'actions', confidence: 1,
      batch: { version: 1, requestId: 'model-must-not-set-routine', actions: [action] } }; } }, allowCloudFallback: false, now });
  assert.equal(modelProposed.route, 'escalate', 'Model-originated fixed schedules cannot bypass the local schedule parser');
  const withTask = cloneWorkspace(state);
  const start = new Date(2026, 9, 9, 9).getTime();
  const task = createStudyTask({ title: 'Existing study', subject: 'Biology', type: 'homework', estimatedMinutes: 60, now });
  task.planState = 'scheduled'; task.scheduledStart = start; task.scheduledEnd = start + 60 * 60_000; withTask.tasks.push(task);
  const overlapping = await route(valid[0]!.request, 'overlap', withTask);
  assert.equal(overlapping.route, 'actions'); if (overlapping.route !== 'actions') throw new Error('overlap');
  assert.match(JSON.stringify(overlapping.prepared.preview.results[0]?.data), /Existing study/);
  const committed = applyPreparedAssistantActionBatch(withTask, overlapping.prepared, overlapping.prepared.confirmationKey, now);
  assert.deepEqual(committed.nextWorkspace.tasks, withTask.tasks, 'Adding fixed time never silently moves scheduled tasks');
  assert.throws(() => prepareAssistantActionBatch(after, { version: 1, requestId: 'duplicate-direct', actions: [action] }, now));
  console.log(`PASS: ${valid.length} exact weekly schedules, 14 clarification scenarios, typed day/time replies, weekday/DST planner blocking, overlap visibility, confirmation, duplicates, stale scope and model isolation (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
