/// <reference types="node" />
import assert from 'node:assert/strict';

import { cloneWorkspace, createEmptyWorkspace } from '../src/data/schema';
import {
  AssistantActionError,
  assistantActionToolCatalog,
  isAssistantExamPlanSummary,
  parseAssistantActionBatch,
  runAssistantActionBatch,
} from '../src/features/assistant/ai-action-engine';
import {
  applyPreparedAssistantActionBatch,
  prepareAssistantActionBatch,
} from '../src/features/assistant/assistant-action-session';
import {
  assistantActionBatchJsonSchema,
  assistantModelInstructions,
  assistantModelToolDefinitions,
  buildAssistantModelContext,
} from '../src/features/assistant/assistant-model-contract';

function local(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

const now = local(2026, 10, 5, 15);

{
  const workspace = createEmptyWorkspace(now);
  const raw = {
    version: 1,
    requestId: 'setup-maths',
    actions: [
      {
        type: 'create_topic',
        clientRef: 'trig',
        name: 'Trigonometry',
        subject: 'Mathematics',
        status: 'learning',
        priority: 3,
        estimatedMinutes: 120,
        notes: 'Hard topic',
      },
      {
        type: 'create_topic',
        clientRef: 'stats',
        name: 'Statistics',
        subject: 'Mathematics',
        status: 'new',
        priority: 2,
        estimatedMinutes: 75,
        notes: '',
      },
      {
        type: 'create_exam',
        clientRef: 'maths-exam',
        name: 'Maths exam',
        date: '2026-10-12',
        topicRefs: [{ clientRef: 'trig' }, { clientRef: 'stats' }],
      },
      {
        type: 'generate_exam_plan',
        examRefs: [{ clientRef: 'maths-exam' }],
        topicOverrides: [
          {
            topic: { clientRef: 'trig' },
            estimatedMinutes: 150,
            difficulty: 3,
            importance: 3,
          },
        ],
        revisionRatio: 0.2,
        revisionLeadDays: 2,
      },
    ],
  };

  const preview = runAssistantActionBatch(workspace, raw, {
    mode: 'preview',
    now,
  });

  assert.equal(preview.requiresConfirmation, true);
  assert.equal(preview.hasMutations, true);
  assert.equal(workspace.topics.length, 0, 'Preview must never mutate the source workspace.');
  assert.equal(workspace.exams.length, 0);
  assert.equal(preview.nextWorkspace.topics.length, 2);
  assert.equal(preview.nextWorkspace.exams.length, 1);

  const planResult = preview.results.find((result) => result.type === 'generate_exam_plan');
  assert.ok(planResult);
  assert.equal(
    isAssistantExamPlanSummary(planResult!.data),
    true,
    'The planner result should expose the typed deterministic capacity summary.',
  );
  assert.ok(isAssistantExamPlanSummary(planResult!.data));
  const data = planResult!.data;
  assert.equal(data.examCount, 1);
  assert.equal(data.uniqueTopicCount, 2);
  assert.equal(data.capacity.source, 'default');
  assert.equal(data.capacity.sustainableDailyMinutes, 90);
  assert.ok(data.totalPreparationRequiredMinutes > 0);
  assert.ok(data.totalRevisionRequiredMinutes > 0);
  assert.ok(data.totalUsableCapacityMinutes >= 0);
  assert.ok(data.bufferRatio >= 0.12 && data.bufferRatio <= 0.3);
  assert.equal(data.revisionRatio, 0.2);
  assert.equal(data.revisionLeadDays, 2);
  assert.equal(data.exams[0]?.examName, 'Maths exam');
  assert.ok(
    data.days.flatMap((day) => day.blocks).some((block) => block.topicName === 'Trigonometry'),
    'The assistant must invoke the MYELIN planner using same-batch topic/exam references.',
  );

  assert.throws(
    () => runAssistantActionBatch(workspace, raw, { mode: 'apply', now }),
    (error: unknown) =>
      error instanceof AssistantActionError && /requires confirmation/i.test(error.message),
  );

  const applied = runAssistantActionBatch(workspace, raw, {
    mode: 'apply',
    confirmed: true,
    now,
  });
  assert.equal(applied.nextWorkspace.topics.length, 2);
  assert.equal(applied.nextWorkspace.exams.length, 1);
  assert.equal(workspace.topics.length, 0, 'Apply returns a validated next snapshot; it does not mutate its input.');
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.topics.push(
    {
      id: 'topic_math_rates',
      name: 'Rates',
      subject: 'Mathematics',
      createdAt: now,
      status: 'learning',
      priority: 2,
      estimate: 45,
      notes: '',
      dueAt: 0,
      intervalDays: 0,
      lastGrade: 0,
      lastReviewed: 0,
      snoozeUntil: 0,
      cards: [],
    },
    {
      id: 'topic_physics_rates',
      name: 'Rates',
      subject: 'Physics',
      createdAt: now,
      status: 'learning',
      priority: 2,
      estimate: 45,
      notes: '',
      dueAt: 0,
      intervalDays: 0,
      lastGrade: 0,
      lastReviewed: 0,
      snoozeUntil: 0,
      cards: [],
    },
  );

  assert.throws(
    () =>
      runAssistantActionBatch(
        workspace,
        {
          version: 1,
          requestId: 'ambiguous',
          actions: [
            {
              type: 'update_topic',
              topic: { name: 'Rates', subject: 'Chemistry' },
              patch: { estimatedMinutes: 60 },
            },
          ],
        },
        { mode: 'preview', now },
      ),
    /No topic matches/i,
  );

  const safe = runAssistantActionBatch(
    workspace,
    {
      version: 1,
      requestId: 'specific',
      actions: [
        {
          type: 'update_topic',
          topic: { name: 'Rates', subject: 'Physics' },
          patch: { estimatedMinutes: 70, priority: 3 },
        },
      ],
    },
    { mode: 'preview', now },
  );
  const physics = safe.nextWorkspace.topics.find((topic) => topic.id === 'topic_physics_rates')!;
  assert.equal(physics.estimate, 70);
  assert.equal(physics.priority, 3);
}

{
  assert.throws(
    () =>
      parseAssistantActionBatch({
        version: 1,
        requestId: 'unknown-action',
        actions: [{ type: 'delete_everything' }],
      }),
    (error: unknown) =>
      error instanceof AssistantActionError &&
      error.actionIndex === 0 &&
      /Unsupported assistant action/i.test(error.message),
  );

  assert.throws(
    () =>
      parseAssistantActionBatch({
        version: 1,
        requestId: 'extra-field',
        actions: [
          {
            type: 'create_topic',
            name: 'Electricity',
            subject: 'Physics',
            estimatedMinutes: 60,
            priority: 2,
            status: 'new',
            notes: '',
            rawDatabasePatch: { admin: true },
          },
        ],
      }),
    /unsupported field/i,
  );
}

{
  const workspace = createEmptyWorkspace(now);
  const badBatch = {
    version: 1,
    requestId: 'atomic-failure',
    actions: [
      {
        type: 'create_topic',
        clientRef: 'bio',
        name: 'Life Processes',
        subject: 'Biology',
        estimatedMinutes: 90,
        priority: 2,
        status: 'learning',
        notes: '',
      },
      {
        type: 'create_exam',
        name: 'Broken exam',
        date: '2026-10-15',
        topicRefs: [{ clientRef: 'missing-topic' }],
      },
    ],
  };

  assert.throws(
    () => runAssistantActionBatch(workspace, badBatch, { mode: 'preview', now }),
    (error: unknown) =>
      error instanceof AssistantActionError &&
      error.actionIndex === 1 &&
      /Unknown topic client reference/i.test(error.message),
  );
  assert.equal(workspace.topics.length, 0, 'A failed batch must not partially mutate the source workspace.');
  assert.equal(workspace.exams.length, 0);
}

{
  const workspace = createEmptyWorkspace(now);
  const result = runAssistantActionBatch(
    workspace,
    {
      version: 1,
      requestId: 'task-linking',
      actions: [
        {
          type: 'create_topic',
          clientRef: 'electricity',
          name: 'Electricity',
          subject: 'Physics',
          status: 'learning',
          priority: 3,
          estimatedMinutes: 80,
          notes: '',
        },
        {
          type: 'create_exam',
          clientRef: 'physics-exam',
          name: 'Physics exam',
          date: '2026-10-20',
          topicRefs: [{ clientRef: 'electricity' }],
        },
        {
          type: 'create_task',
          title: 'Practice Electricity numericals',
          subject: '',
          topic: { clientRef: 'electricity' },
          exam: { clientRef: 'physics-exam' },
          taskType: 'practice',
          dueDate: '2026-10-15',
          estimatedMinutes: 40,
          priority: 3,
          notes: '',
        },
      ],
    },
    { mode: 'apply', confirmed: true, now },
  );

  assert.equal(result.nextWorkspace.tasks.length, 1);
  const task = result.nextWorkspace.tasks[0]!;
  assert.ok(task.topicId);
  assert.ok(task.examId);
  assert.equal(task.subject, 'Physics');
}

{
  const catalog = assistantActionToolCatalog();
  assert.deepEqual(
    catalog.map((tool) => tool.name),
    ['create_topic', 'update_topic', 'create_exam', 'create_task', 'generate_exam_plan'],
  );
  assert.equal(catalog.find((tool) => tool.name === 'generate_exam_plan')?.risk, 'read');
  assert.ok(
    catalog.filter((tool) => tool.risk === 'confirm').length >= 4,
    'Data-changing tools must be marked as confirmation-required.',
  );
}


{
  const workspace = createEmptyWorkspace(now);
  workspace.topics.push({
    id: 'privacy-topic',
    name: 'Electricity',
    subject: 'Physics',
    createdAt: now,
    status: 'learning',
    priority: 3,
    estimate: 60,
    notes: 'PRIVATE_TOPIC_NOTE_SHOULD_NOT_REACH_MODEL',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'privacy-card',
        prompt: 'PRIVATE_RECALL_PROMPT',
        answer: 'PRIVATE_RECALL_ANSWER',
        hint: 'PRIVATE_RECALL_HINT',
        dueAt: now - 1000,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 86400000,
        reps: 1,
      },
    ],
  });
  workspace.history.push({
    id: 'privacy-history',
    topicId: 'privacy-topic',
    at: now - 1000,
    kind: 'review',
    minutes: 15,
    grade: 2,
    effort: 3,
    prompt: 'PRIVATE_HISTORY_PROMPT',
    response: 'PRIVATE_HISTORY_RESPONSE',
    confidence: 'partial',
  });
  workspace.tasks.push({
    id: 'privacy-task',
    title: 'Practice Electricity',
    subject: 'Physics',
    topicId: 'privacy-topic',
    examId: null,
    type: 'practice',
    status: 'open',
    planState: 'inbox',
    dueAt: now + 86400000,
    estimatedMinutes: 30,
    actualMinutes: 0,
    priority: 2,
    notes: 'PRIVATE_TASK_NOTE_SHOULD_NOT_REACH_MODEL',
    scheduledStart: 0,
    scheduledEnd: 0,
    postponedUntil: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: 0,
  });

  for (let index = 0; index < 4; index += 1) {
    workspace.topics.push({
      id: `extra-topic-${index}`,
      name: `Extra Topic ${index}`,
      subject: 'Science',
      createdAt: now + index + 1,
      status: 'new',
      priority: 1,
      estimate: 45,
      notes: '',
      dueAt: 0,
      intervalDays: 0,
      lastGrade: 0,
      lastReviewed: 0,
      snoozeUntil: 0,
      cards: [],
    });
  }

  const context = buildAssistantModelContext(workspace, now, {
    currentRoute: '/today',
    maxTopics: 2,
    maxTasks: 5,
  });
  const serialized = JSON.stringify(context);

  assert.equal(context.currentRoute, '/today');
  assert.equal(context.topics.length, 2);
  assert.equal(context.truncated.topics, true);
  assert.ok(context.topics.some((topic) => topic.id === 'privacy-topic'));
  assert.equal(context.topics.find((topic) => topic.id === 'privacy-topic')!.dueRecallCards, 1);
  assert.equal(serialized.includes('PRIVATE_TOPIC_NOTE_SHOULD_NOT_REACH_MODEL'), false);
  assert.equal(serialized.includes('PRIVATE_RECALL_PROMPT'), false);
  assert.equal(serialized.includes('PRIVATE_RECALL_ANSWER'), false);
  assert.equal(serialized.includes('PRIVATE_HISTORY_PROMPT'), false);
  assert.equal(serialized.includes('PRIVATE_HISTORY_RESPONSE'), false);
  assert.equal(serialized.includes('PRIVATE_TASK_NOTE_SHOULD_NOT_REACH_MODEL'), false);
}

{
  const schema = assistantActionBatchJsonSchema();
  const schemaActionNames = schema.properties.actions.items.oneOf.map(
    (variant) => variant.properties.type.const,
  );
  const tools = assistantModelToolDefinitions();

  assert.deepEqual(
    schemaActionNames,
    ['create_topic', 'update_topic', 'create_exam', 'create_task', 'generate_exam_plan'],
  );
  assert.deepEqual(
    tools.map((tool) => tool.name),
    schemaActionNames,
    'Function-tool definitions and constrained batch schema must expose the same actions.',
  );
  assert.ok(
    tools.every(
      (tool) =>
        tool.parameters.type === 'object' &&
        tool.parameters.additionalProperties === false &&
        !tool.parameters.required.includes('type') &&
        !Object.prototype.hasOwnProperty.call(tool.parameters.properties, 'type'),
    ),
    'Per-tool parameter schemas should omit the action discriminator because the function name supplies it.',
  );
  assert.ok(
    assistantModelInstructions().some((instruction) => /Never invent a timetable/i.test(instruction)),
    'The model contract must explicitly delegate scheduling to MYELIN.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  const batch = {
    version: 1,
    requestId: 'idempotent-create',
    actions: [
      {
        type: 'create_topic',
        name: 'Quadratic Equations',
        subject: 'Mathematics',
        status: 'learning',
        priority: 3,
        estimatedMinutes: 90,
        notes: '',
      },
    ],
  };

  const first = runAssistantActionBatch(workspace, batch, {
    mode: 'apply',
    confirmed: true,
    now,
  });
  assert.equal(first.duplicate, false);
  assert.equal(first.nextWorkspace.assistantReceipts?.length, 1);

  const replay = runAssistantActionBatch(first.nextWorkspace, batch, {
    mode: 'apply',
    confirmed: true,
    now: now + 1000,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.nextWorkspace.topics.length, 1);
  assert.equal(replay.nextWorkspace.assistantReceipts?.length, 1);

  assert.throws(
    () =>
      runAssistantActionBatch(
        first.nextWorkspace,
        {
          version: 1,
          requestId: 'idempotent-create',
          actions: [
            {
              type: 'create_topic',
              name: 'Different Payload',
              subject: 'Mathematics',
              status: 'new',
              priority: 1,
              estimatedMinutes: 30,
              notes: '',
            },
          ],
        },
        { mode: 'apply', confirmed: true, now: now + 2000 },
      ),
    /already applied with different content/i,
    'Reusing a request ID for different content must fail closed.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  const batch = {
    version: 1,
    requestId: 'prepared-session',
    actions: [
      {
        type: 'create_topic',
        name: 'Statistics',
        subject: 'Mathematics',
        status: 'new',
        priority: 2,
        estimatedMinutes: 75,
        notes: '',
      },
    ],
  };

  const prepared = prepareAssistantActionBatch(workspace, batch, now);
  assert.equal(prepared.sourceRevision, workspace.revision);
  assert.equal(prepared.preview.requiresConfirmation, true);

  assert.throws(
    () =>
      applyPreparedAssistantActionBatch(
        workspace,
        prepared,
        'wrong-confirmation-key',
        now + 100,
      ),
    /confirmation no longer matches/i,
  );

  const changed = cloneWorkspace(workspace);
  changed.revision += 1;
  changed.updatedAt = now + 50;
  assert.throws(
    () =>
      applyPreparedAssistantActionBatch(
        changed,
        prepared,
        prepared.confirmationKey,
        now + 100,
      ),
    /changed after this assistant preview/i,
    'A stale preview must not overwrite a newer workspace revision.',
  );

  const applied = applyPreparedAssistantActionBatch(
    workspace,
    prepared,
    prepared.confirmationKey,
    now + 100,
  );
  assert.equal(applied.duplicate, false);
  assert.equal(applied.nextWorkspace.revision, workspace.revision + 1);
  assert.equal(applied.nextWorkspace.topics.length, 1);
  assert.equal(applied.nextWorkspace.assistantReceipts?.length, 1);

  const replay = applyPreparedAssistantActionBatch(
    applied.nextWorkspace,
    prepared,
    prepared.confirmationKey,
    now + 200,
  );
  assert.equal(replay.duplicate, true);
  assert.equal(
    replay.nextWorkspace.revision,
    applied.nextWorkspace.revision,
    'Replaying an already committed request should be a no-op, not a new workspace revision.',
  );
}

console.log('✓ assistant action batches are strict, typed and allowlisted');
console.log('✓ preview is atomic and never mutates the source workspace');
console.log('✓ mutating batches require explicit confirmation before apply');
console.log('✓ client references let one AI batch create topics, exams, tasks and then plan');
console.log('✓ ambiguous or missing references fail closed');
console.log('✓ unsupported actions and hidden extra fields are rejected');
console.log('✓ failed batches cannot partially apply changes');
console.log('✓ exam planning is delegated to MYELIN rather than generated by the model');
console.log('✓ model context is bounded and omits raw notes, answers, mistakes and history content');
console.log('✓ constrained JSON schema and function-tool schemas expose the same action contract');
console.log('✓ applied request IDs are durable and idempotent across replays');
console.log('✓ stale previews and mismatched confirmations fail closed');
