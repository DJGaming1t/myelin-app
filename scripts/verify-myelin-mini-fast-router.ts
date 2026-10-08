/// <reference types="node" />
import assert from 'node:assert/strict';
import { applyPreparedAssistantActionBatch } from '../src/features/assistant/assistant-action-session';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  MYELIN_MINI_FAST_MODEL_ID,
  tryBuildMyelinMiniFastDecision,
} from '../src/features/assistant/myelin-mini-fast-router';
import {
  MyelinMiniModelAdapter,
  routeWithMyelinMini,
} from '../src/features/assistant/myelin-mini';

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);

function workspaceWithTrig() {
  const workspace = createEmptyWorkspace(NOW);
  workspace.topics.push({
    id: 'topic-trig',
    name: 'Trigonometry',
    subject: 'Mathematics',
    createdAt: NOW,
    status: 'learning',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 1,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  });
  return workspace;
}

async function main() {
  const workspace = workspaceWithTrig();
  let modelCalls = 0;

  const fallback: MyelinMiniModelAdapter = {
    id: 'should-not-run',
    async generate() {
      modelCalls += 1;
      throw new Error('Fallback model should not run for a clear fast command.');
    },
  };

  const routed = await routeWithMyelinMini({
    workspace,
    userRequest: 'kal trig ke 30 min questions add kar do high priority',
    requestId: 'fast-hinglish-1',
    model: fallback,
    now: NOW,
  });

  assert.equal(modelCalls, 0);
  assert.equal(routed.route, 'actions');

  if (routed.route === 'actions') {
    assert.equal(routed.modelId, MYELIN_MINI_FAST_MODEL_ID);
    const action = routed.prepared.batch.actions[0];
    assert.equal(action?.type, 'create_task');

    if (action?.type === 'create_task') {
      assert.equal(action.subject, 'Mathematics');
      assert.deepEqual(action.topic, { topicId: 'topic-trig' });
      assert.equal(action.taskType, 'practice');
      assert.equal(action.dueDate, '2026-10-08');
      assert.equal(action.estimatedMinutes, 30);
      assert.equal(action.priority, 3);
      assert.equal(action.title, 'Practice Trigonometry questions');
    }
  }

  const missingTarget = tryBuildMyelinMiniFastDecision({
    workspace: createEmptyWorkspace(NOW),
    userRequest: 'kal 30 min questions add kar do',
    requestId: 'fast-missing-target',
    currentDate: '2026-10-07',
  });

  assert.equal(missingTarget?.route, 'clarify');
  if (missingTarget?.route === 'clarify') {
    assert.equal(missingTarget.reason, 'missing-target');
  }

  const tutoring = tryBuildMyelinMiniFastDecision({
    workspace,
    userRequest: 'teach me trigonometry from scratch',
    requestId: 'fast-tutoring',
    currentDate: '2026-10-07',
  });

  assert.equal(tutoring?.route, 'escalate');
  if (tutoring?.route === 'escalate') {
    assert.equal(tutoring.reason, 'tutoring');
  }

  const englishVariant = tryBuildMyelinMiniFastDecision({
    workspace,
    userRequest: 'Tomorrow add 25 min trig numericals high priority',
    requestId: 'fast-english',
    currentDate: '2026-10-07',
  });

  assert.equal(englishVariant?.route, 'actions');
  if (englishVariant?.route === 'actions') {
    const action = englishVariant.batch.actions[0] as any;
    assert.equal(action.type, 'create_task');
    assert.equal(action.dueDate, '2026-10-08');
    assert.equal(action.estimatedMinutes, 25);
    assert.equal(action.priority, 3);
    assert.equal(action.taskType, 'practice');
    assert.deepEqual(action.topic, { topicId: 'topic-trig' });
  }

  // Preserve the topic-linked legacy homework path.
  const legacyHomework = tryBuildMyelinMiniFastDecision({ workspace, userRequest: 'Add 30 min trig hw tomorrow', requestId: 'legacy-hw', currentDate: '2026-10-07' });
  assert.equal(legacyHomework?.route, 'actions');
  if (legacyHomework?.route === 'actions') assert.deepEqual((legacyHomework.batch.actions[0] as any).topic, { topicId: 'topic-trig' });

  const schoolworkCases = [
    ['I have to complite bio practical nb by tomorrow', 'Complete Biology practical notebook', 'Biology', 'homework', '2026-10-08', 0],
    ['Need to finish chem homework by tmr, 45 mins', 'Complete Chemistry homework', 'Chemistry', 'homework', '2026-10-08', 45],
    ['Need to finish chem homework by tmr for 45 mins', 'Complete Chemistry homework', 'Chemistry', 'homework', '2026-10-08', 45],
    ['Submit phy project in two days 1.5 hours', 'Submit Physics project', 'Physics', 'assignment', '2026-10-09', 90],
    ['I must finish maths worksheet tonight half an hour', 'Complete Mathematics worksheet', 'Mathematics', 'homework', '2026-10-07', 30],
    ['Add eng assignment by 2026-10-10 1 hour', 'Complete English assignment', 'English', 'assignment', '2026-10-10', 60],
    ['I have bio homework due tommorow', 'Complete Biology homework', 'Biology', 'homework', '2026-10-08', 0],
    ['Complete social science project day after tomorrow', 'Complete Social Science project', 'Social Science', 'assignment', '2026-10-09', 0],
    ['Complete computer science lab report tomorrow', 'Complete Computer Science lab report', 'Computer Science', 'homework', '2026-10-08', 0],
    ['Finish bio practical notebook', 'Complete Biology practical notebook', 'Biology', 'homework', undefined, 0],
  ] as const;
  for (const [userRequest, title, subject, taskType, dueDate, estimatedMinutes] of schoolworkCases) {
    const result = tryBuildMyelinMiniFastDecision({ workspace: createEmptyWorkspace(NOW), userRequest, requestId: 'everyday', currentDate: '2026-10-07' });
    if (!title) { assert.equal(result?.route, 'clarify', userRequest); continue; }
    assert.equal(result?.route, 'actions', userRequest);
    if (result?.route === 'actions') {
      assert.equal(result.batch.actions.length, 1);
      const action = result.batch.actions[0] as any;
      assert.equal(action.title, title, userRequest);
      assert.equal(action.subject, subject);
      assert.equal(action.taskType, taskType);
      assert.equal(action.dueDate, dueDate);
      assert.equal(action.estimatedMinutes, estimatedMinutes);
      assert.equal(action.topic, undefined, 'Never invent a chapter for notebook work.');
      assert.equal(action.priority, 2, 'A deadline alone must not invent priority.');
      assert.match(action.notes, /Original request:/);
    }
  }
  for (const userRequest of [
    'Complete practical nb tomorrow',
    'Complete bio and chem practical notebooks tomorrow',
    'Complete bio practical notebook by Friday',
    'Complete bio practical notebook tomorrow at 8pm',
    'Complete bio practical notebook by 2026-02-30',
    'Complete bio practical notebook today tomorrow',
    'Complete bio practical notebook in 40 days',
    'Complete bio practical notebook 30-45 mins tomorrow',
    'Complete bio practical notebook 30 mins 1 hour tomorrow',
    'Complete bio practical notebook -30 minutes tomorrow',
    'Complete bio practical notebook 900 minutes tomorrow',
  ]) {
    assert.equal(tryBuildMyelinMiniFastDecision({ workspace, userRequest, requestId: 'ask-first', currentDate: '2026-10-07' })?.route, 'clarify', userRequest);
  }
  for (const userRequest of [
    "I don't have to complete bio practical nb tomorrow",
    'I already completed bio practical notebook yesterday',
    'If I have to complete bio practical notebook tomorrow',
    'How do I finish bio practical notebook tomorrow',
    'I might need to complete bio practical notebook tomorrow',
    'Complete bio practical notebook and create a Maths topic',
  ]) {
    assert.notEqual(tryBuildMyelinMiniFastDecision({ workspace, userRequest, requestId: 'no-guess', currentDate: '2026-10-07' })?.route, 'actions', userRequest);
  }
  for (const [currentDate, expected] of [['2026-12-31', '2027-01-01'], ['2028-02-28', '2028-02-29']] as const) {
    const result = tryBuildMyelinMiniFastDecision({ workspace, currentDate, userRequest: 'Finish bio practical nb tomorrow', requestId: 'rollover' });
    assert.equal(result?.route, 'actions');
    if (result?.route === 'actions') assert.equal((result.batch.actions[0] as any).dueDate, expected);
  }

  const empty = createEmptyWorkspace(NOW);
  const everyday = await routeWithMyelinMini({ workspace: empty, userRequest: 'I have to complite bio practical nb by tomorrow', requestId: 'preview-notebook', model: fallback, now: NOW });
  assert.equal(everyday.route, 'actions');
  assert.equal(empty.tasks.length, 0, 'Preparing never writes a task.');
  if (everyday.route === 'actions') {
    assert.equal(everyday.prepared.preview.requiresConfirmation, true);
    assert.equal(everyday.prepared.preview.results[0]?.type, 'create_task');
    assert.throws(() => applyPreparedAssistantActionBatch(empty, everyday.prepared, 'wrong-key', NOW));
    const applied = applyPreparedAssistantActionBatch(empty, everyday.prepared, everyday.prepared.confirmationKey, NOW);
    assert.equal(applied.nextWorkspace.tasks.length, 1);
    const task = applied.nextWorkspace.tasks[0]!;
    assert.equal(task.title, 'Complete Biology practical notebook');
    assert.equal(task.topicId, null);
    assert.equal(task.estimatedMinutes, 0);
    assert.ok(task.dueAt > NOW);
    const repeated = applyPreparedAssistantActionBatch(applied.nextWorkspace, everyday.prepared, everyday.prepared.confirmationKey, NOW);
    assert.equal(repeated.nextWorkspace.tasks.length, 1, 'Repeated apply cannot duplicate the task.');
  }
  assert.equal(modelCalls, 0, 'Everyday schoolwork must work without installed model weights.');

  console.log('MYELIN Mini fast command router verification passed.');
}

void main();
