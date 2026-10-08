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
import {
  evaluateMyelinMiniPredictions,
  myelinMiniPassesReleaseGate,
} from '../src/features/assistant/myelin-mini-evaluation';
import { tryBuildMyelinMiniFastDecision } from '../src/features/assistant/myelin-mini-fast-router';

const REQUEST_ID = 'mini-test-1';

{
  const prompt = myelinMiniSystemPrompt();
  assert.match(prompt, /narrow intent and tool-routing model/i);
  assert.match(prompt, /NOT to calculate the timetable/i);
  assert.match(prompt, /actions, clarify, or escalate/i);
  assert.match(prompt, /Never invent dates/i);
}

{
  const schema = myelinMiniDecisionJsonSchema();
  assert.equal(schema.oneOf.length, 3);
  assert.equal(schema.oneOf[0]!.properties.route.const, 'actions');
  assert.equal(schema.oneOf[1]!.properties.route.const, 'clarify');
  assert.equal(schema.oneOf[2]!.properties.route.const, 'escalate');
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
  const parsed = parseMyelinMiniDecision(
    {
      version: 1,
      requestId: REQUEST_ID,
      route: 'clarify',
      confidence: 0.98,
      reason: 'missing-date',
      question: 'What date is your science exam?',
      missingFields: ['date'],
    },
    REQUEST_ID,
  );
  assert.equal(parsed.route, 'clarify');
  if (parsed.route === 'clarify') {
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
            actions: [{ type: 'delete_everything' }],
          },
        },
        REQUEST_ID,
      ),
    /unsupported assistant action/i,
  );
}

type SeedExample = {
  id: string;
  split: 'train' | 'validation';
  input: {
    currentDate: string;
    userRequest: string;
  };
  output: unknown;
};

function verifySeedDataset() {
  const lines = readFileSync('training/myelin-mini/seed-v1.jsonl', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(lines.length >= 30, 'MYELIN Mini seed set should contain at least 30 examples.');

  const ids = new Set<string>();
  const requestIds = new Set<string>();
  const actionTypes = new Set<string>();
  const kindCounts = new Map<string, number>();
  const splitCounts = new Map<string, number>();
  const validationKinds = new Set<string>();

  for (const [index, line] of lines.entries()) {
    let example: SeedExample;
    try {
      example = JSON.parse(line) as SeedExample;
    } catch (error) {
      throw new Error(`Invalid MYELIN Mini JSONL on line ${index + 1}: ${String(error)}`);
    }

    assert.match(example.id, /^[a-z0-9][a-z0-9-]{2,80}$/);
    assert.equal(ids.has(example.id), false, `Duplicate training id: ${example.id}`);
    ids.add(example.id);

    assert.ok(example.split === 'train' || example.split === 'validation');
    splitCounts.set(example.split, (splitCounts.get(example.split) ?? 0) + 1);

    assert.match(example.input.currentDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(example.input.userRequest.trim().length >= 3);

    const rawOutput = example.output as { requestId?: unknown };
    assert.equal(typeof rawOutput?.requestId, 'string');
    const parsed = parseMyelinMiniDecision(
      example.output,
      String(rawOutput.requestId),
    );

    assert.equal(requestIds.has(parsed.requestId), false, `Duplicate requestId: ${parsed.requestId}`);
    requestIds.add(parsed.requestId);

    kindCounts.set(parsed.route, (kindCounts.get(parsed.route) ?? 0) + 1);
    if (example.split === 'validation') validationKinds.add(parsed.route);

    if (parsed.route === 'actions') {
      for (const action of parsed.batch.actions) actionTypes.add(action.type);
    } else if (parsed.route === 'clarify') {
      assert.ok(parsed.question.endsWith('?'));
      assert.ok(parsed.missingFields.length >= 1);
    } else {
      assert.ok(parsed.note.length >= 20);
    }
  }

  assert.deepEqual(
    [...actionTypes].sort(),
    [
      'create_exam',
      'create_task',
      'create_topic',
      'generate_exam_plan',
      'update_topic',
    ],
    'Seed data must cover every current MYELIN assistant action.',
  );
  assert.ok((splitCounts.get('train') ?? 0) >= 20);
  assert.ok((splitCounts.get('validation') ?? 0) >= 5);
  assert.ok((kindCounts.get('actions') ?? 0) >= 15);
  assert.ok((kindCounts.get('clarify') ?? 0) >= 4);
  assert.ok((kindCounts.get('escalate') ?? 0) >= 4);
  assert.deepEqual(
    [...validationKinds].sort(),
    ['actions', 'clarify', 'escalate'],
    'Validation data must cover all three MYELIN Mini routes.',
  );

  return lines.length;
}

type EvalExample = {
  id: string;
  input: {
    currentDate: string;
    userRequest: string;
    context?: unknown;
  };
  output: unknown;
};

function verifyEvaluationHarness() {
  const examples = readFileSync(
    'training/myelin-mini/eval-v1.jsonl',
    'utf8',
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalExample);

  assert.ok(
    examples.length >= 20,
    'Held-out MYELIN Mini eval set should contain at least 20 examples.',
  );

  const goldPredictions = examples.map((example, index) => ({
    id: example.id,
    output: example.output,
    latencyMs: 10 + index,
  }));
  const perfect = evaluateMyelinMiniPredictions(
    examples,
    goldPredictions,
  );

  assert.equal(perfect.parseValidity, 1);
  assert.equal(perfect.routeAccuracy, 1);
  assert.equal(perfect.actionExactAccuracy, 1);
  assert.equal(perfect.clarifyReasonAccuracy, 1);
  assert.equal(perfect.escalateReasonAccuracy, 1);
  assert.equal(perfect.unsafeActionCount, 0);
  assert.equal(
    myelinMiniPassesReleaseGate(perfect),
    true,
  );
  assert.equal(perfect.latencyMs.count, examples.length);
  assert.ok((perfect.latencyMs.p95 ?? 0) >= 10);

  // Legacy runners attached valid-looking fallbacks to failed inference.
  // Even a fallback identical to the gold answer must never earn credit.
  for (const field of ['parseError', 'requestError'] as const) {
    const failed = evaluateMyelinMiniPredictions(
      examples,
      goldPredictions.map((prediction) => ({
        ...prediction,
        [field]: 'Simulated inference failure',
      })),
    );
    assert.equal(failed.predicted, examples.length);
    assert.equal(failed.parseValidity, 0);
    assert.equal(failed.routeAccuracy, 0);
    assert.equal(failed.failures.length, examples.length);
    assert.ok(failed.failures.every((failure) => failure.type === 'invalid-output'));
    assert.equal(myelinMiniPassesReleaseGate(failed), false);
  }
  const successfulMetadata = evaluateMyelinMiniPredictions(
    examples,
    goldPredictions.map((prediction) => ({ ...prediction, parseError: null, requestError: null })),
  );
  assert.equal(myelinMiniPassesReleaseGate(successfulMetadata), true);

  const unsafeIndex = examples.findIndex((example) => {
    const output = example.output as { route?: unknown };
    return output.route === 'clarify';
  });
  assert.ok(unsafeIndex >= 0);

  const unsafeExample = examples[unsafeIndex]!;
  const unsafeExpected = unsafeExample.output as {
    requestId: string;
  };
  const unsafePredictions = [...goldPredictions];
  unsafePredictions[unsafeIndex] = {
    id: unsafeExample.id,
    latencyMs: 20,
    output: {
      version: 1,
      requestId: unsafeExpected.requestId,
      route: 'actions',
      confidence: 0.99,
      batch: {
        version: 1,
        requestId: unsafeExpected.requestId,
        actions: [
          {
            type: 'create_task',
            title: 'Guessed task',
            subject: '',
            taskType: 'personal',
            estimatedMinutes: 10,
            priority: 2,
            notes: '',
          },
        ],
      },
    },
  };

  const unsafe = evaluateMyelinMiniPredictions(
    examples,
    unsafePredictions,
  );
  assert.equal(unsafe.unsafeActionCount, 1);
  assert.equal(
    myelinMiniPassesReleaseGate(unsafe),
    false,
  );

  return examples.length;
}

async function main() {
  const workspace = createEmptyWorkspace(1_800_000_000_000);
  const fastInput = { workspace, requestId: 'shortcut-check', currentDate: '2027-04-30' };
  assert.equal(
    tryBuildMyelinMiniFastDecision({ ...fastInput, userRequest: 'Create a Physics practice exam for tomorrow.' }),
    null,
    'An exam name containing practice must not become a task.',
  );
  assert.equal(
    tryBuildMyelinMiniFastDecision({ ...fastInput, userRequest: 'Create the Elasticity topic and add a 20 minute practice task for it.' }),
    null,
    'A chained command must retain both operations for the full router.',
  );
  assert.equal(
    tryBuildMyelinMiniFastDecision({ ...fastInput, userRequest: 'Practice Algebra for 20 minutes.' })?.route,
    'clarify',
    'The simple task shortcut remains available.',
  );
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
    assert.equal(result.prepared.batch.actions[0]!.type, 'create_topic');
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

  const clarifyModel: MyelinMiniModelAdapter = {
    id: 'fake-clarifier',
    async generate() {
      return {
        version: 1,
        requestId: 'clarify-1',
        route: 'clarify',
        confidence: 0.98,
        reason: 'missing-date',
        question: 'What date is your science exam?',
        missingFields: ['date'],
      };
    },
  };

  const clarification = await routeWithMyelinMini({
    workspace,
    userRequest: 'Add my science exam.',
    requestId: 'clarify-1',
    model: clarifyModel,
  });
  assert.equal(clarification.route, 'clarify');
  if (clarification.route === 'clarify') {
    assert.equal(clarification.reason, 'missing-date');
  }

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

  const seedCount = verifySeedDataset();
  const evalCount = verifyEvaluationHarness();

  console.log('✓ MYELIN Mini runtime routes actions, clarification, and escalation');
  console.log('✓ low-confidence actions fail over to the stronger-model route');
  console.log(`✓ MYELIN Mini seed dataset validates: ${seedCount} examples`);
  console.log(`✓ held-out evaluation harness validates: ${evalCount} examples`);
  console.log('✓ release gate rejects unsafe action routing');
  console.log('✓ seed outputs use the exact production action protocol');
}

void main();

