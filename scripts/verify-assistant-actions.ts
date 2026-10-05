/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  AssistantActionError,
  assistantActionToolCatalog,
  parseAssistantActionBatch,
  runAssistantActionBatch,
} from '../src/features/assistant/ai-action-engine';

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
  const data = planResult!.data as {
    examCount: number;
    uniqueTopicCount: number;
    days: Array<{ blocks: Array<{ topicName: string; minutes: number }> }>;
  };
  assert.equal(data.examCount, 1);
  assert.equal(data.uniqueTopicCount, 2);
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

console.log('✓ assistant action batches are strict, typed and allowlisted');
console.log('✓ preview is atomic and never mutates the source workspace');
console.log('✓ mutating batches require explicit confirmation before apply');
console.log('✓ client references let one AI batch create topics, exams, tasks and then plan');
console.log('✓ ambiguous or missing references fail closed');
console.log('✓ unsupported actions and hidden extra fields are rejected');
console.log('✓ failed batches cannot partially apply changes');
console.log('✓ exam planning is delegated to MYELIN rather than generated by the model');
