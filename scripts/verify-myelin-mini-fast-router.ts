/// <reference types="node" />
import assert from 'node:assert/strict';

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

  console.log('MYELIN Mini fast command router verification passed.');
}

void main();
