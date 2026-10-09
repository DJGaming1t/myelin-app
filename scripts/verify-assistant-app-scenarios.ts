/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEmptyWorkspace, cloneWorkspace } from '../src/data/schema';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { beginAssistantClarification, answerAssistantClarification } from '../src/features/assistant/assistant-clarification';
import { applyPreparedAssistantActionBatch, prepareAssistantActionBatch } from '../src/features/assistant/assistant-action-session';
import type { MyelinMiniRouteResult } from '../src/features/assistant/myelin-mini';
import { tryBuildMyelinMiniFastDecision } from '../src/features/assistant/myelin-mini-fast-router';

// Development regressions, not frozen model evaluation or physical Android QA.
const now = new Date(2026, 9, 9, 0, 15).getTime();
function workspace() {
  const state = createEmptyWorkspace(now);
  state.topics.push({ id: 'trig', name: 'Trigonometry', subject: 'Mathematics', createdAt: now,
    status: 'learning', priority: 2, estimate: 45, notes: '', dueAt: 0, intervalDays: 1,
    lastGrade: 0, lastReviewed: 0, snoozeUntil: 0, cards: [] });
  return state;
}
type Scenario = { id: string; request: string; route: 'actions' | 'clarify'; minutes?: number; priority?: number; date?: string; title?: string; field?: string };
const scenarios: Scenario[] = [
  { id: 'voice-shorthand', request: 'I have to complite bio practical nb by tomorrow', route: 'actions', minutes: 0, priority: 2, date: '2026-10-10', title: 'Complete Biology practical notebook' },
  { id: 'polite-notebook', request: 'Could you please add a task to finish bio practical nb by tomorrow?', route: 'actions', date: '2026-10-10', title: 'Complete Biology practical notebook' },
  { id: 'polite-submit', request: 'Can you schedule a task to submit chem project tomorrow for 1.5 hours?', route: 'actions', minutes: 90, title: 'Submit Chemistry project' },
  { id: 'polite-practice', request: 'Would you add 25 min trig questions tomorrow?', route: 'actions', minutes: 25, priority: 2, date: '2026-10-10' },
  { id: 'low-priority-phrase', request: 'Add 30 min trig questions tomorrow, not important', route: 'actions', minutes: 30, priority: 1 },
  { id: 'low-notebook', request: 'Finish bio practical nb tomorrow not important', route: 'actions', priority: 1, title: 'Complete Biology practical notebook' },
  { id: 'half-hour-practice', request: 'Add trig practice tomorrow for half an hour', route: 'actions', minutes: 30 },
  { id: 'one-hour-practice', request: 'Add trig practice in two days for one hour', route: 'actions', minutes: 60, date: '2026-10-11' },
  { id: 'compound-hour-minute', request: 'Add trig practice tomorrow for 1 hour 30 minutes', route: 'actions', minutes: 90 },
  { id: 'compound-notebook-time', request: 'Finish bio practical notebook tomorrow for 1 hour 20 minutes', route: 'actions', minutes: 80, title: 'Complete Biology practical notebook' },
  { id: 'hinglish-tomorrow', request: 'kal trig ke 30 min questions add kar do', route: 'actions', minutes: 30, date: '2026-10-10' },
  { id: 'hinglish-today', request: 'aaj trig ke 30 min questions add kar do', route: 'actions', date: '2026-10-09' },
  { id: 'priority-conflict', request: 'Add 30 min trig questions urgent low priority', route: 'clarify', field: 'priority' },
  { id: 'duration-two-numeric', request: 'Add trig questions for 30 min 1 hour tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-number-word', request: 'Add trig questions for 30 min half an hour tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-two-word', request: 'Add trig questions for half an hour one hour', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-range', request: 'Add trig questions for 30-45 m tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-word-range', request: 'Add trig questions for 30 to 45 min tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-negative', request: 'Add trig questions for -30 m tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-no-rounding', request: 'Add trig questions for 0.101 hours tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-too-long', request: 'Add trig practice 800 minutes tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'duration-missing', request: 'Add trig practice tomorrow', route: 'clarify', field: 'estimatedMinutes' },
  { id: 'date-conflict', request: 'Add trig practice 30 minutes today tomorrow', route: 'clarify', field: 'dueDate' },
  { id: 'date-invalid', request: 'Add trig practice 30 minutes by 2026-02-30', route: 'clarify', field: 'dueDate' },
  { id: 'date-time-unsupported', request: 'Add trig practice 30 minutes tomorrow at 8pm', route: 'clarify', field: 'dueDate' },
  { id: 'date-range-unsupported', request: 'Add trig practice 30 minutes next week', route: 'clarify', field: 'dueDate' },
  { id: 'polite-exam-needs-date', request: 'Could you record an exam on Trigonometry?', route: 'clarify', field: 'dueDate' },
  { id: 'polite-vague-target', request: 'Could you mark it for review?', route: 'clarify', field: 'topic' },
  { id: 'negated-action', request: "Don't add 30 min trig practice tomorrow", route: 'clarify', field: 'request' },
];

async function main() {
  const checks: { id: string; passed: true }[] = [];
  let calls = 0;
  const offline = { id: 'unreleased-test-only', async generate() { calls++; throw new Error('No model is installed.'); } };
  const cloud = { id: 'must-not-guess', async generate() { calls++; throw new Error('Clear rules/clarifications must not call cloud.'); } };
  for (const scenario of scenarios) {
    const state = workspace(); const original = JSON.stringify(state);
    const result = await routeWithHybridAssistant({ workspace: state, requestId: scenario.id,
      userRequest: scenario.request, now, offline, cloud, allowCloudFallback: true });
    assert.equal(result.route, scenario.route, scenario.id);
    assert.equal(JSON.stringify(state), original, 'Preparing must leave the workspace unchanged: ' + scenario.id);
    if (result.route === 'clarify') assert.ok(result.missingFields.includes(scenario.field!), scenario.id);
    if (result.route === 'actions') {
      const action = result.prepared.batch.actions[0]!; assert.equal(action.type, 'create_task', scenario.id);
      if (action.type !== 'create_task') throw new Error(scenario.id);
      if (scenario.minutes != null) assert.equal(action.estimatedMinutes, scenario.minutes, scenario.id);
      if (scenario.priority != null) assert.equal(action.priority, scenario.priority, scenario.id);
      if (scenario.date != null) assert.equal(action.dueDate, scenario.date, scenario.id);
      if (scenario.title != null) assert.equal(action.title, scenario.title, scenario.id);
      assert.equal(result.prepared.preview.requiresConfirmation, true);
      assert.throws(() => applyPreparedAssistantActionBatch(state, result.prepared, 'wrong-confirmation', now));
      const stale = cloneWorkspace(state); stale.revision++;
      assert.throws(() => applyPreparedAssistantActionBatch(stale, result.prepared, result.prepared.confirmationKey, now));
      const applied = applyPreparedAssistantActionBatch(state, result.prepared, result.prepared.confirmationKey, now);
      assert.equal(applied.nextWorkspace.tasks.length, 1); assert.equal(applied.nextWorkspace.revision, state.revision + 1);
      const repeated = applyPreparedAssistantActionBatch(applied.nextWorkspace, result.prepared, result.prepared.confirmationKey, now);
      assert.equal(repeated.nextWorkspace.tasks.length, 1); assert.equal(repeated.nextWorkspace.revision, applied.nextWorkspace.revision);
      const changedBatch = { ...result.prepared.batch, actions: [{ ...action, priority: action.priority === 3 ? 1 : 3 }] };
      assert.throws(() => prepareAssistantActionBatch(applied.nextWorkspace, changedBatch, now), 'A reused request ID cannot apply different content.');
    }
    checks.push({ id: scenario.id, passed: true });
  }
  assert.equal(calls, 0, 'Clear task details, missing details and known negated commands never load a model or call cloud.');
  for (const request of ['Can I add 30 min trig practice tomorrow?', 'I could do 30 min trig practice tomorrow',
    'Add 30 min trig practice, not tomorrow', 'I already finished 30 min trig practice today']) {
    assert.notEqual(tryBuildMyelinMiniFastDecision({ workspace: workspace(), userRequest: request, requestId: 'statement', currentDate: '2026-10-09' })?.route, 'actions', request);
  }
  checks.push({ id: 'questions-hypotheticals-and-negated-dates-are-not-fast-actions', passed: true });

  // Same retained request survives a duration correction, then a date correction.
  const state = workspace(); const original = 'Add trig practice 30-45 minutes by Friday';
  const scope = { ownerKey: 'student', revision: state.revision, currentDate: '2026-10-09', now };
  let result: MyelinMiniRouteResult = await routeWithHybridAssistant({ workspace: state, userRequest: original, requestId: 'typed-followup', now, offline, allowCloudFallback: false });
  const dateQuestion = beginAssistantClarification(original, result, scope)!;
  assert.equal(dateQuestion.field, 'dueDate');
  const day = answerAssistantClarification(dateQuestion, '2026-10-12', state, scope);
  assert.equal(day.kind, 'resolved'); if (day.kind !== 'resolved') throw new Error('day');
  result = await routeWithHybridAssistant({ workspace: state, userRequest: original, requestId: 'typed-followup', now, offline, allowCloudFallback: false, clarificationAnswers: day.answers });
  const minuteQuestion = beginAssistantClarification(original, result, scope, day.answers, dateQuestion)!;
  assert.equal(minuteQuestion.field, 'estimatedMinutes');
  const time = answerAssistantClarification(minuteQuestion, '45 minutes', state, scope);
  assert.equal(time.kind, 'resolved'); if (time.kind !== 'resolved') throw new Error('minutes');
  result = await routeWithHybridAssistant({ workspace: state, userRequest: original, requestId: 'typed-followup', now, offline, allowCloudFallback: false, clarificationAnswers: time.answers });
  assert.equal(result.route, 'actions');
  if (result.route === 'actions') {
    const action = result.prepared.batch.actions[0]!;
    assert.equal(action.type, 'create_task'); if (action.type !== 'create_task') throw new Error('task');
    assert.equal(action.dueDate, '2026-10-12'); assert.equal(action.estimatedMinutes, 45);
  }
  for (const patch of [{ ownerKey: 'other' }, { revision: state.revision + 1 }, { currentDate: '2026-10-10' }, { now: now + 600_001 }]) {
    assert.equal(answerAssistantClarification(minuteQuestion, '45 minutes', state, { ...scope, ...patch }).kind, 'expired');
  }
  checks.push({ id: 'retained-date-duration-correction-and-scope-expiry', passed: true });
  assert.equal(calls, 0);
  const report = { version: 1, suite: 'assistant app-flow development regression', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sourceCommit: process.env.GITHUB_SHA ?? null, passed: checks.length, failed: 0, checks,
    modelQualityMeasured: false, cloudLiveTested: false, physicalDeviceTested: false };
  if (process.env.MYELIN_ASSISTANT_SCENARIO_REPORT) fs.writeFileSync(process.env.MYELIN_ASSISTANT_SCENARIO_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: ${checks.length} app-flow regressions (${report.timezone}); exact task details, retained replies, confirmation, stale preview, duplicate apply and account/day expiry. No model-quality or phone-QA claim.`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
