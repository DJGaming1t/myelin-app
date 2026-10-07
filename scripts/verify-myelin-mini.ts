/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  MYELIN_MINI_MIN_ACTION_CONFIDENCE,
  MyelinMiniModelAdapter,
  buildMyelinMiniUserPrompt,
  myelinMiniDecisionJsonSchema,
  myelinMiniSystemPrompt,
  parseMyelinMiniDecision,
  routeWithMyelinMini,
} from '../src/features/assistant/myelin-mini';

const REQUEST_ID = 'mini-test-1';

{
  const prompt = myelinMiniSystemPrompt();
  assert.match(prompt, /narrow intent and tool-routing model/i);
  assert.match(prompt, /NOT to calculate the timetable/i);
  assert.match(prompt, /route to escalate/i);
  assert.match(prompt, /Never invent dates/i);
}

{
  const schema = myelinMiniDecisionJsonSchema();
  assert.equal(schema.oneOf.length, 2);
  assert.equal(
    schema.oneOf[0]!.properties.route.const,
    'actions',
  );
  assert.equal(
    schema.oneOf[1]!.properties.route.const,
    'escalate',
  );
}

{
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      route: 'actions',
      confidence: 0.94,
      batch: {
        version: 1,
        requestId: REQUEST_ID,
        actions: [
          {
            type: 'create_topic',
            name: 'Quadratic equations',
            subject: 'Maths',
            status: 'learning',
            priority: 2,
            estimatedMinutes: 45,
            notes: '',
          },
        ],
      },
    },
    REQUEST_ID,
  );
  assert.equal(parsed.route, 'actions');
}

{
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      route: 'actions',
      confidence: MYELIN_MINI_MIN_ACTION_CONFIDENCE - 0.01,
      batch: {
        version: 1,
        requestId: REQUEST_ID,
        actions: [
          {
            type: 'create_task',
            title: 'Revise acids and bases',
            subject: 'Chemistry',
            taskType: 'revision',
            estimatedMinutes: 30,
            priority: 2,
            notes: '',
          },
        ],
      },
    },
    REQUEST_ID,
  );
  assert.equal(parsed.route, 'escalate');
  if (parsed.route === 'escalate') {
    assert.equal(parsed.reason, 'low-confidence');
  }
}

{
  assert.throws(
    () =>
      parseMyelinMiniDecision(
        {
          version: 1,
          requestId: 'wrong-id',
          route: 'escalate',
          confidence: 0.5,
          reason: 'ambiguous',
          note: 'Missing the exam date.',
        },
        REQUEST_ID,
      ),
    /request ID does not match/i,
  );
}

{
  assert.throws(
    () =>
      parseMyelinMiniDecision(
        {
          version: 1,
          requestId: REQUEST_ID,
          route: 'actions',
          confidence: 0.95,
          batch: {
            version: 1,
            requestId: REQUEST_ID,
            actions: [
              {
                type: 'delete_everything',
              },
            ],
          },
        },
        REQUEST_ID,
      ),
    /unsupported assistant action type/i,
  );
}

async function main() {
  const workspace = createEmptyWorkspace('mini-test-owner');
  const seen: Parameters<MyelinMiniModelAdapter['generate']>[0][] = [];

  const model: MyelinMiniModelAdapter = {
    id: 'fake-myelin-mini',
    async generate(request) {
      seen.push(request);
      return {
        version: 1,
        requestId: REQUEST_ID,
        route: 'actions',
        confidence: 0.97,
        batch: {
          version: 1,
          requestId: REQUEST_ID,
          actions: [
            {
              type: 'create_topic',
              name: 'Electricity',
              subject: 'Physics',
              status: 'new',
              priority: 2,
              estimatedMinutes: 50,
              notes: '',
            },
          ],
        },
      };
    },
  };

  const result = await routeWithMyelinMini({
    workspace,
    userRequest: 'Add Electricity in Physics and give it about 50 minutes.',
    requestId: REQUEST_ID,
    model,
    now: 1_800_000_000_000,
  });

  assert.equal(result.route, 'actions');
  if (result.route === 'actions') {
    assert.equal(result.modelId, 'fake-myelin-mini');
    assert.equal(result.prepared.preview.requiresConfirmation, true);
    assert.equal(result.prepared.batch.actions.length, 1);
    assert.equal(
      result.prepared.batch.actions[0]!.type,
      'create_topic',
    );
  }

  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.maxOutputTokens, 1200);
  assert.match(seen[0]!.system, /MYELIN Mini/);
  assert.match(seen[0]!.user, /Add Electricity/);

  const contextPrompt = JSON.parse(
    buildMyelinMiniUserPrompt(
      workspace,
      'What should I do?',
      'context-test',
      { now: 1_800_000_000_000 },
    ),
  );
  assert.equal(contextPrompt.requestId, 'context-test');
  assert.equal(contextPrompt.context.version, 1);
  assert.ok(contextPrompt.context.topics.length <= 36);
  assert.ok(contextPrompt.context.tasks.length <= 24);

  const escalateModel: MyelinMiniModelAdapter = {
    id: 'fake-escalator',
    async generate() {
      return {
        version: 1,
        requestId: 'escalate-1',
        route: 'escalate',
        confidence: 0.93,
        reason: 'tutoring',
        note: 'This requires teaching rather than a study-management action.',
      };
    },
  };

  const escalation = await routeWithMyelinMini({
    workspace,
    userRequest: 'Explain electromagnetic induction to me.',
    requestId: 'escalate-1',
    model: escalateModel,
  });
  assert.equal(escalation.route, 'escalate');
  if (escalation.route === 'escalate') {
    assert.equal(escalation.reason, 'tutoring');
  }

  console.log('MYELIN Mini routing verification passed.');
}

void main();
