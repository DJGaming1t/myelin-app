/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  applyQuestionInput,
  applyTopicInput,
  createQuestion,
  createTopic,
  deleteQuestionFromWorkspace,
  deleteTopicFromWorkspace,
  filterTopics,
  topicSubjects,
} from '../src/features/topics/topic-operations';

function main() {
  const workspace = createEmptyWorkspace(1_700_000_000_000);

  const maths = createTopic(
    {
      name: 'Quadratic Equations',
      subject: 'Mathematics',
      status: 'learning',
      priority: 3,
      estimate: 50,
      notes: 'Discriminant and nature of roots',
    },
    1_700_000_000_001,
    'topic_math',
  );

  const chemistry = createTopic(
    {
      name: 'Metals and Non-metals',
      subject: 'Chemistry',
      status: 'review',
      priority: 2,
      estimate: 35,
      notes: 'Reactivity series and extraction',
    },
    1_700_000_000_002,
    'topic_chem',
  );

  const question = createQuestion(
    {
      prompt: 'What does the discriminant tell us?',
      answer: 'It determines the nature of the roots.',
      hint: 'Think b² − 4ac.',
    },
    1_700_000_000_003,
    'card_disc',
  );

  maths.cards.push(question);
  workspace.topics.push(maths, chemistry);

  assert.deepEqual(topicSubjects(workspace.topics), ['Chemistry', 'Mathematics']);
  assert.equal(filterTopics(workspace.topics, { query: 'discriminant' })[0]?.id, 'topic_math');
  assert.equal(filterTopics(workspace.topics, { subject: 'Chemistry' }).length, 1);
  assert.equal(filterTopics(workspace.topics, { status: 'review' })[0]?.id, 'topic_chem');
  assert.equal(filterTopics(workspace.topics, {})[0]?.id, 'topic_math', 'High priority should sort first.');

  applyTopicInput(maths, {
    name: 'Quadratic Equations — Core',
    subject: 'Mathematics',
    status: 'review',
    priority: 2,
    estimate: 45,
    notes: 'Updated notes',
  });
  assert.equal(maths.name, 'Quadratic Equations — Core');
  assert.equal(maths.estimate, 45);

  applyQuestionInput(question, {
    prompt: 'How does D determine the nature of roots?',
    answer: 'D > 0: two real; D = 0: equal real; D < 0: no real roots.',
    hint: 'Compare D with zero.',
  });
  assert.match(question.answer, /D > 0/);

  workspace.mistakes.push({
    id: 'mistake_1',
    topicId: 'topic_math',
    cardId: 'card_disc',
    prompt: 'Mixed up D signs',
    detail: '',
    correction: '',
    reason: 'concept',
    createdAt: 1_700_000_000_004,
    dueAt: 0,
    resolvedAt: 0,
    wins: 0,
    lastWinDay: '',
    intervalDays: 0,
  });

  workspace.history.push({
    id: 'session_1',
    topicId: 'topic_math',
    cardId: 'card_disc',
    at: 1_700_000_000_005,
    kind: 'review',
    minutes: 10,
    grade: 2,
    effort: 3,
    prompt: question.prompt,
    response: 'Attempt',
    confidence: 'partial',
  });

  workspace.exams.push({
    id: 'exam_1',
    name: 'Midterm',
    date: 1_800_000_000_000,
    subjects: ['Mathematics'],
    scope: 'topics',
    topicIds: ['topic_math'],
  });

  assert.equal(deleteQuestionFromWorkspace(workspace, 'topic_math', 'card_disc'), true);
  assert.equal(maths.cards.length, 0);
  assert.equal(workspace.mistakes[0]?.cardId, null);
  assert.equal('cardId' in workspace.history[0], false);
  migrateAndValidateWorkspace(workspace);

  assert.equal(deleteTopicFromWorkspace(workspace, 'topic_math'), true);
  assert.equal(workspace.topics.some((topic) => topic.id === 'topic_math'), false);
  assert.equal(workspace.mistakes.length, 0);
  assert.equal(workspace.history.length, 0);
  assert.deepEqual(workspace.exams[0]?.topicIds, []);
  migrateAndValidateWorkspace(workspace);

  console.log('✓ topic creation and editing');
  console.log('✓ recall question creation and editing');
  console.log('✓ topic search/filter/sort');
  console.log('✓ question deletion cleans linked references');
  console.log('✓ topic deletion cascades safely');
  console.log('✓ resulting workspace passes schema validation');
}

main();
