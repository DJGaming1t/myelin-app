/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.match(prompt, /tiny intent and tool-routing model/i);
  assert.match(prompt, /never calculate the timetable/i);
  assert.match(prompt, /kind=clarify/i);
  assert.match(prompt, /kind=escalate/i);
  assert.match(prompt, /Never invent dates/i);
}

{
  const schema = myelinMiniDecisionJsonSchema();
  assert.equal(schema.oneOf.length, 3);
  assert.equal(
    schema.oneOf[0]!.properties.kind.const,
    'actions',
  );
  assert.equal(
    schema.oneOf[1]!.properties.kind.const,
    'clarify',
  );
  assert.equal(
    schema.oneOf[2]!.properties.kind.const,
    'escalate',
  );
}

{
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      kind: 'actions',
      confidence: 0.94,
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
    REQUEST_ID,
  );
  assert.equal(parsed.kind, 'actions');
}

{
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      kind: 'actions',
      confidence:
        MYELIN_MINI_MIN_ACTION_CONFIDENCE - 0.01,
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
    REQUEST_ID,
  );
  assert.equal(parsed.kind, 'escalate');
  if (parsed.kind === 'escalate') {
    assert.equal(parsed.reason, 'low-confidence');
  }
}

{
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      kind: 'clarify',
      confidence: 0.98,
      reason: 'missing-date',
      question: 'What date is your science exam?',
      missingFields: ['date'],
    },
    REQUEST_ID,
  );
  assert.equal(parsed.kind, 'clarify');
  if (parsed.kind === 'clarify') {
    assert.deepEqual(parsed.missingFields, ['date']);
  }
}

{
  assert.throws(
    () =>
      parseMyelinMiniDecision(
        {
          version: 1,
          requestId: 'wrong-id',
          kind: 'escalate',
          confidence: 0.5,
          reason: 'complex-reasoning',
          summary: 'Needs a stronger model.',
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
          kind: 'actions',
          confidence: 0.95,
          actions: [
            {
              type: 'delete_everything',
            },
          ],
        },
        REQUEST_ID,
      ),
    /unsupported assistant action type/i,
  );
}

{
  const raw = readFileSync(
    'training/myelin-mini/seed-v1.jsonl',
    'utf8',
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.ok(raw.length >= 25);
  const kinds = new Set<string>();
  const splits = new Set<string>();

  for (const example of raw) {
    const target = example.output;
    const parsed = parseMyelinMiniDecision(
      target,
      target.requestId,
    );
    kinds.add(parsed.kind);
    splits.add(example.split);
  }

  assert.deepEqual(
    [...kinds].sort(),
    ['actions', 'clarify', 'escalate'],
  );
  assert.ok(splits.has('train'));
  assert.ok(splits.has('validation'));
}

async function main() {
  const workspace =
    createEmptyWorkspace('mini-test-owner');
  const seen: Parameters<
    MyelinMiniModelAdapter['generate']
  >[0][] = [];

  const model: MyelinMiniModelAdapter = {
    id: 'fake-myelin-mini',
    async generate(request) {
      seen.push(request);
      return {
        version: 1,
        requestId: REQUEST_ID,
        kind: 'actions',
        confidence: 0.97,
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
      };
    },
  };

  const result = await routeWithMyelinMini({
    workspace,
    userRequest:
      'Add Electricity in Physics and give it about 50 minutes.',
    requestId: REQUEST_ID,
    model,
    now: 1_800_000_000_000,
  });

  assert.equal(result.route, 'actions');
  if (result.route === 'actions') {
    assert.equal(
      result.modelId,
      'fake-myelin-mini',
    );
    assert.equal(
      result.prepared.preview.requiresConfirmation,
      true,
    );
    assert.equal(
      result.prepared.batch.actions.length,
      1,
    );
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
  assert.equal(
    contextPrompt.requestId,
    'context-test',
  );
  assert.equal(contextPrompt.context.version, 1);
  assert.ok(
    contextPrompt.context.topics.length <= 36,
  );
  assert.ok(
    contextPrompt.context.tasks.length <= 24,
  );

  const clarifyModel: MyelinMiniModelAdapter = {
    id: 'fake-clarifier',
    async generate() {
      return {
        version: 1,
        requestId: 'clarify-1',
        kind: 'clarify',
        confidence: 0.98,
        reason: 'missing-target',
        question:
          'Which topic do you want to move to review?',
        missingFields: ['topic'],
      };
    },
  };

  const clarification = await routeWithMyelinMini({
    workspace,
    userRequest: 'Move it to review.',
    requestId: 'clarify-1',
    model: clarifyModel,
  });
  assert.equal(clarification.route, 'clarify');

  const escalateModel: MyelinMiniModelAdapter = {
    id: 'fake-escalator',
    async generate() {
      return {
        version: 1,
        requestId: 'escalate-1',
        kind: 'escalate',
        confidence: 0.93,
        reason: 'concept-explanation',
        summary:
          'This needs subject teaching rather than a MYELIN data action.',
      };
    },
  };

  const escalation = await routeWithMyelinMini({
    workspace,
    userRequest:
      'Explain electromagnetic induction to me.',
    requestId: 'escalate-1',
    model: escalateModel,
  });
  assert.equal(escalation.route, 'escalate');
  if (escalation.route === 'escalate') {
    assert.equal(
      escalation.reason,
      'concept-explanation',
    );
  }

  console.log(
    'MYELIN Mini routing verification passed.',
  );
}

void main();
