/// <reference types="node" />
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { parseMyelinMiniDecision } from '../src/features/assistant/myelin-mini';

type FailureExample = {
  id: string;
  split: 'train' | 'validation';
  tags: string[];
  input: {
    currentDate: string;
    userRequest: string;
    context?: Record<string, unknown>;
  };
  output: unknown;
};

const DATE = '2026-10-07';
const TOMORROW = '2026-10-08';

function action(
  id: string,
  userRequest: string,
  actions: unknown[],
  context: Record<string, unknown> = {},
  tags: string[] = [],
): FailureExample {
  const requestId = `ft-${id}`;
  return {
    id,
    split: 'train',
    tags: ['failure-curriculum', 'actions', ...tags],
    input: { currentDate: DATE, userRequest, context },
    output: {
      version: 1,
      requestId,
      route: 'actions',
      confidence: 0.98,
      batch: {
        version: 1,
        requestId,
        actions,
      },
    },
  };
}

function clarify(
  id: string,
  userRequest: string,
  reason:
    | 'missing-date'
    | 'missing-required-detail'
    | 'ambiguous-reference'
    | 'missing-target',
  question: string,
  missingFields: string[],
  context: Record<string, unknown> = {},
): FailureExample {
  const requestId = `ft-${id}`;
  return {
    id,
    split: 'train',
    tags: ['failure-curriculum', 'clarify', reason],
    input: { currentDate: DATE, userRequest, context },
    output: {
      version: 1,
      requestId,
      route: 'clarify',
      confidence: 0.98,
      reason,
      question,
      missingFields,
    },
  };
}

function escalate(
  id: string,
  userRequest: string,
  reason:
    | 'ambiguous'
    | 'general-knowledge'
    | 'tutoring'
    | 'complex-reasoning'
    | 'multimodal'
    | 'unsupported-action'
    | 'safety'
    | 'low-confidence',
  note: string,
  context: Record<string, unknown> = {},
): FailureExample {
  const requestId = `ft-${id}`;
  return {
    id,
    split: 'train',
    tags: ['failure-curriculum', 'escalate', reason],
    input: { currentDate: DATE, userRequest, context },
    output: {
      version: 1,
      requestId,
      route: 'escalate',
      confidence: 0.98,
      reason,
      note,
    },
  };
}

const topicCatalog = [
  ['Quadratic Equations', 'Mathematics', 'quadratic'],
  ['Electricity', 'Physics', 'electricity'],
  ['Life Processes', 'Biology', 'life'],
  ['Federalism', 'Social Science', 'federalism'],
  ['Acids, Bases and Salts', 'Chemistry', 'acids'],
  ['Statistics', 'Mathematics', 'statistics'],
] as const;

const examples: FailureExample[] = [];

const addTopicPhrases = [
  (name: string, subject: string, minutes: number) =>
    `Add ${name} in ${subject}, about ${minutes} minutes.`,
  (name: string, subject: string, minutes: number) =>
    `${subject}: add ${name}, ${minutes}m, normal priority.`,
  (name: string, subject: string, minutes: number) =>
    `I need ${minutes} minutes for ${name}. Add it under ${subject}.`,
  (name: string, subject: string, minutes: number) =>
    `add ${name.toLowerCase()} ${subject.toLowerCase()} ${minutes}m`,
];

for (const [topicName, subject, slug] of topicCatalog) {
  addTopicPhrases.forEach((phrase, index) => {
    const minutes = 35 + index * 10;
    examples.push(
      action(
        `act-topic-${slug}-${index + 1}`,
        phrase(topicName, subject, minutes),
        [
          {
            type: 'create_topic',
            name: topicName,
            subject,
            status: 'new',
            priority: 2,
            estimatedMinutes: minutes,
            notes: '',
          },
        ],
        {},
        ['protocol-completeness', index === 3 ? 'shorthand' : 'plain-English'],
      ),
    );
  });
}

const existingTopics = [
  ['topic-trig', 'Trigonometry', 'Mathematics'],
  ['topic-metals', 'Metals and Non-metals', 'Chemistry'],
  ['topic-control', 'Control and Coordination', 'Biology'],
  ['topic-magnetic', 'Magnetic Effects of Electric Current', 'Physics'],
] as const;

for (const [topicId, topicName, subject] of existingTopics) {
  const context = {
    topics: [{ id: topicId, name: topicName, subject }],
  };
  examples.push(
    action(
      `act-review-${topicId}`,
      `I am done learning ${topicName}. Move it to review.`,
      [{ type: 'update_topic', topic: { topicId }, patch: { status: 'review' } }],
      context,
      ['do-not-over-escalate', 'existing-reference'],
    ),
  );
  examples.push(
    action(
      `act-priority-${topicId}`,
      `Make ${topicName} high priority.`,
      [{ type: 'update_topic', topic: { topicId }, patch: { priority: 3 } }],
      context,
      ['do-not-over-escalate', 'existing-reference'],
    ),
  );
  examples.push(
    action(
      `act-time-${topicId}`,
      `${topicName} will take 70 min. Update the estimate.`,
      [
        {
          type: 'update_topic',
          topic: { topicId },
          patch: { estimatedMinutes: 70 },
        },
      ],
      context,
      ['do-not-over-escalate', 'existing-reference'],
    ),
  );
}

const practiceCases = [
  ['topic-trig', 'Trigonometry', 'Mathematics', 'trig'],
  ['topic-electricity', 'Electricity', 'Physics', 'electricity'],
  ['topic-life', 'Life Processes', 'Biology', 'life'],
  ['topic-acids', 'Acids, Bases and Salts', 'Chemistry', 'acids'],
] as const;

for (const [topicId, topicName, subject, slug] of practiceCases) {
  const context = {
    topics: [{ id: topicId, name: topicName, subject }],
  };
  examples.push(
    action(
      `act-practice-${slug}-english`,
      `Add 30 minutes of ${topicName} practice for tomorrow, high priority.`,
      [
        {
          type: 'create_task',
          title: `Practice ${topicName}`,
          subject,
          topic: { topicId },
          taskType: 'practice',
          dueDate: TOMORROW,
          estimatedMinutes: 30,
          priority: 3,
          notes: '',
        },
      ],
      context,
      ['relative-date', 'do-not-over-escalate'],
    ),
  );
  examples.push(
    action(
      `act-practice-${slug}-hinglish`,
      `kal ${topicName.toLowerCase()} ke 30 min questions add kar do high priority`,
      [
        {
          type: 'create_task',
          title: `Practice ${topicName}`,
          subject,
          topic: { topicId },
          taskType: 'practice',
          dueDate: TOMORROW,
          estimatedMinutes: 30,
          priority: 3,
          notes: '',
        },
      ],
      context,
      ['relative-date', 'hinglish', 'shorthand'],
    ),
  );
}

const examTopics = {
  topics: [
    { id: 'topic-electricity', name: 'Electricity', subject: 'Physics' },
    { id: 'topic-magnetic', name: 'Magnetic Effects of Electric Current', subject: 'Physics' },
  ],
};
[
  'Physics test on 2026-10-20: Electricity and Magnetic Effects of Electric Current.',
  'Add my physics exam for 20 October with Electricity and Magnetic Effects.',
  'physics exam 20 oct electricity + magnetic effects',
].forEach((phrase, index) => {
  examples.push(
    action(
      `act-exam-physics-${index + 1}`,
      phrase,
      [
        {
          type: 'create_exam',
          name: 'Physics exam',
          date: '2026-10-20',
          topicRefs: [
            { topicId: 'topic-electricity' },
            { topicId: 'topic-magnetic' },
          ],
        },
      ],
      examTopics,
      ['exam', index === 2 ? 'shorthand' : 'plain-English'],
    ),
  );
});

const clarifyDatePhrases = [
  'Add my science exam.',
  'I have a maths test, add it.',
  'chem exam add kar do',
  'Create an English exam for me.',
];
for (const [index, phrase] of clarifyDatePhrases.entries()) {
  examples.push(
    clarify(
      `clarify-date-${index + 1}`,
      phrase,
      'missing-date',
      'What date is the exam?',
      ['date'],
    ),
  );
}

const clarifyTargetPhrases = [
  'Make it high priority.',
  'Move that to review.',
  'Change it to 60 minutes.',
  'isko high priority kar do',
];
for (const [index, phrase] of clarifyTargetPhrases.entries()) {
  examples.push(
    clarify(
      `clarify-target-${index + 1}`,
      phrase,
      'missing-target',
      'Which topic or task do you mean?',
      ['target'],
    ),
  );
}

const ambiguousContext = {
  topics: [
    { id: 'motion-physics', name: 'Motion', subject: 'Physics' },
    { id: 'motion-maths', name: 'Motion', subject: 'Mathematics' },
  ],
};
[
  'Put Motion into review.',
  'Make Motion high priority.',
  'Motion ka time 45 min kar do.',
].forEach((phrase, index) => {
  examples.push(
    clarify(
      `clarify-ambiguous-${index + 1}`,
      phrase,
      'ambiguous-reference',
      'Do you mean Motion in Physics or Motion in Mathematics?',
      ['topic'],
      ambiguousContext,
    ),
  );
});

[
  ['Explain why electric current produces a magnetic field.', 'tutoring'],
  ['Teach me quadratic equations from scratch.', 'tutoring'],
  ['Who wrote The Diary of Anne Frank?', 'general-knowledge'],
  ['Why did the First World War start?', 'general-knowledge'],
  ['Read this photo and add every topic you can see.', 'multimodal'],
  ['Look at this timetable image and schedule everything.', 'multimodal'],
  ['Delete my entire MYELIN account.', 'unsupported-action'],
  ['Delete every task and exam at once.', 'unsupported-action'],
  ['Reorganize my whole month and explain which subject I should sacrifice.', 'complex-reasoning'],
  ['Compare all my exams and tell me the best long-term strategy with reasons.', 'complex-reasoning'],
] as const satisfies ReadonlyArray<readonly [string, Parameters<typeof escalate>[2]]>
).forEach(([phrase, reason], index) => {
  const notes: Record<string, string> = {
    tutoring: 'The request needs subject teaching rather than a MYELIN study-management action.',
    'general-knowledge': 'The request asks for factual knowledge outside MYELIN Mini.',
    multimodal: 'The request depends on image understanding and should use a multimodal model.',
    'unsupported-action': 'The requested destructive operation is outside the MYELIN Mini action allowlist.',
    'complex-reasoning': 'The request needs higher-level reasoning before any deterministic MYELIN actions are proposed.',
  };
  examples.push(
    escalate(
      `escalate-${reason}-${index + 1}`,
      phrase,
      reason,
      notes[reason]!,
    ),
  );
});

const validation: FailureExample[] = [
  action(
    'fv-action-hinglish',
    'kal electricity ke 25 min numericals add kar do',
    [
      {
        type: 'create_task',
        title: 'Practice Electricity numericals',
        subject: 'Physics',
        topic: { topicId: 'topic-electricity' },
        taskType: 'practice',
        dueDate: TOMORROW,
        estimatedMinutes: 25,
        priority: 2,
        notes: '',
      },
    ],
    {
      topics: [{ id: 'topic-electricity', name: 'Electricity', subject: 'Physics' }],
    },
    ['hinglish'],
  ),
  clarify(
    'fv-clarify-date',
    'Add my biology test.',
    'missing-date',
    'What date is your biology test?',
    ['date'],
  ),
  clarify(
    'fv-clarify-target',
    'Put it in review please.',
    'missing-target',
    'Which topic do you want to put in review?',
    ['topic'],
  ),
  escalate(
    'fv-escalate-tutoring',
    'Explain how photosynthesis works.',
    'tutoring',
    'The request needs subject teaching rather than a MYELIN study-management action.',
  ),
  escalate(
    'fv-escalate-reasoning',
    'I am behind in three subjects. Decide what I should give up and explain why.',
    'complex-reasoning',
    'The request needs higher-level reasoning before any deterministic MYELIN actions are proposed.',
  ),
].map((example) => ({ ...example, split: 'validation' as const }));

examples.push(...validation);

function validate(rows: FailureExample[]) {
  const ids = new Set<string>();
  const requestIds = new Set<string>();
  const routeCounts = new Map<string, number>();
  let hinglish = 0;

  for (const row of rows) {
    assert.equal(ids.has(row.id), false, `Duplicate curriculum id: ${row.id}`);
    ids.add(row.id);

    const raw = row.output as { requestId?: unknown };
    assert.equal(typeof raw.requestId, 'string');
    const parsed = parseMyelinMiniDecision(row.output, String(raw.requestId));
    assert.equal(requestIds.has(parsed.requestId), false, `Duplicate curriculum requestId: ${parsed.requestId}`);
    requestIds.add(parsed.requestId);

    routeCounts.set(parsed.route, (routeCounts.get(parsed.route) ?? 0) + 1);
    if (row.tags.includes('hinglish')) hinglish += 1;
  }

  assert.ok(rows.length >= 70, 'Failure curriculum should contain at least 70 examples.');
  assert.ok((routeCounts.get('actions') ?? 0) >= 45);
  assert.ok((routeCounts.get('clarify') ?? 0) >= 10);
  assert.ok((routeCounts.get('escalate') ?? 0) >= 10);
  assert.ok(hinglish >= 5);

  return {
    total: rows.length,
    train: rows.filter((row) => row.split === 'train').length,
    validation: rows.filter((row) => row.split === 'validation').length,
    actions: routeCounts.get('actions') ?? 0,
    clarify: routeCounts.get('clarify') ?? 0,
    escalate: routeCounts.get('escalate') ?? 0,
    hinglish,
  };
}

const stats = validate(examples);
const checkOnly = process.argv.includes('--check');
const outputPath = resolve(
  process.env.MYELIN_MINI_FAILURE_DATA ??
    'training/myelin-mini/failure-curriculum-v1.jsonl',
);

if (!checkOnly) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    examples.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );
}

console.log(
  [
    `MYELIN Mini failure curriculum: ${stats.total}`,
    `train=${stats.train}`,
    `validation=${stats.validation}`,
    `actions=${stats.actions}`,
    `clarify=${stats.clarify}`,
    `escalate=${stats.escalate}`,
    `hinglish=${stats.hinglish}`,
    checkOnly ? 'mode=check' : `output=${outputPath}`,
  ].join(' | '),
);
