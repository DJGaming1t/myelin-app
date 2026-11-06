/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace, Topic } from '../src/data/schema';
import {
  applyExamInput,
  createExam,
  deleteExamFromWorkspace,
  examAppliesToTopic,
  examCalendarDaysUntil,
  examStatus,
  examTopics,
  formatExamDateInput,
  nearestUpcomingExam,
  parseExamDateInput,
  sortExams,
  validateExamInput,
} from '../src/features/exams/exam-engine';
import { buildTodayPlan } from '../src/features/today/planner';

function topic(id: string, name: string, subject: string): Topic {
  return {
    id,
    name,
    subject,
    createdAt: Date.now(),
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
  };
}

function main() {
  const now = new Date(2026, 8, 30, 18, 30, 0).getTime();
  const todayDate = parseExamDateInput('2026-09-30');
  const tomorrowDate = parseExamDateInput('2026-10-01');
  const threeDaysDate = parseExamDateInput('2026-10-03');
  const pastDate = parseExamDateInput('2026-09-20');

  assert.ok(todayDate);
  assert.ok(tomorrowDate);
  assert.ok(threeDaysDate);
  assert.ok(pastDate);

  assert.equal(parseExamDateInput('2026-02-30'), null);
  assert.equal(parseExamDateInput('2026/10/01'), null);
  assert.equal(parseExamDateInput('1999-12-31'), null);
  assert.equal(formatExamDateInput(todayDate!), '2026-09-30');

  assert.equal(examStatus(todayDate!, now).kind, 'today');
  assert.equal(examStatus(todayDate!, now).label, 'Today');
  assert.equal(examCalendarDaysUntil(todayDate!, now), 0);
  assert.equal(examStatus(tomorrowDate!, now).label, 'Tomorrow');
  assert.equal(examCalendarDaysUntil(threeDaysDate!, now), 3);
  assert.equal(examStatus(pastDate!, now).kind, 'past');

  const maths = topic('math', 'Quadratics', 'Mathematics');
  const chemistry = topic('chem', 'Metals', 'Chemistry');
  const biology = topic('bio', 'Life Processes', 'Biology');
  const topics = [maths, chemistry, biology];

  const subjectExam = createExam(
    {
      name: 'Maths Midterm',
      date: tomorrowDate!,
      scope: 'subjects',
      subjects: ['Mathematics'],
      topicIds: ['chem'],
    },
    now,
    'exam_math',
  );

  assert.deepEqual(subjectExam.subjects, ['Mathematics']);
  assert.deepEqual(subjectExam.topicIds, [], 'Subject-scoped exams must not retain stale topic IDs.');
  assert.equal(examAppliesToTopic(subjectExam, maths), true);
  assert.equal(examAppliesToTopic(subjectExam, chemistry), false);
  assert.deepEqual(examTopics(subjectExam, topics).map((item) => item.id), ['math']);

  const topicExam = createExam(
    {
      name: 'Chemistry Quiz',
      date: threeDaysDate!,
      scope: 'topics',
      subjects: ['Chemistry'],
      topicIds: ['chem'],
    },
    now,
    'exam_chem',
  );

  assert.deepEqual(topicExam.subjects, [], 'Topic-scoped exams must not retain stale subject scope.');
  assert.deepEqual(topicExam.topicIds, ['chem']);
  assert.equal(examAppliesToTopic(topicExam, chemistry), true);
  assert.equal(examAppliesToTopic(topicExam, maths), false);

  assert.equal(
    validateExamInput(
      {
        name: 'Empty',
        date: tomorrowDate!,
        scope: 'subjects',
        subjects: [],
        topicIds: [],
      },
      topics,
    ),
    'Choose at least one subject that has topics in MYELIN.',
  );

  assert.equal(
    validateExamInput(
      {
        name: 'Empty topics',
        date: tomorrowDate!,
        scope: 'topics',
        subjects: [],
        topicIds: [],
      },
      topics,
    ),
    'Choose at least one topic for this exam.',
  );

  applyExamInput(subjectExam, {
    name: 'Focused Maths Test',
    date: threeDaysDate!,
    scope: 'topics',
    subjects: ['Mathematics'],
    topicIds: ['math'],
  });
  assert.equal(subjectExam.name, 'Focused Maths Test');
  assert.equal(subjectExam.scope, 'topics');
  assert.deepEqual(subjectExam.subjects, []);
  assert.deepEqual(subjectExam.topicIds, ['math']);

  const workspace = createEmptyWorkspace(now);
  workspace.topics.push(maths, chemistry, biology);
  workspace.exams.push(
    createExam(
      {
        name: 'Maths Tomorrow',
        date: tomorrowDate!,
        scope: 'subjects',
        subjects: ['Mathematics'],
        topicIds: [],
      },
      now,
      'exam_math_tomorrow',
    ),
    topicExam,
    createExam(
      {
        name: 'Old Test',
        date: pastDate!,
        scope: 'subjects',
        subjects: ['Biology'],
        topicIds: [],
      },
      now,
      'exam_old',
    ),
  );

  const sorted = sortExams(workspace.exams, now);
  assert.equal(sorted[0]?.id, 'exam_math_tomorrow');
  assert.equal(sorted[1]?.id, 'exam_chem');
  assert.equal(sorted[2]?.id, 'exam_old');
  assert.equal(nearestUpcomingExam(workspace, now)?.id, 'exam_math_tomorrow');

  const plan = buildTodayPlan(workspace, now, 45);
  assert.equal(plan.nextBlock?.topicId, 'math');
  assert.equal(plan.nextBlock?.examDays, 1);
  assert.match(plan.nextBlock?.reasons.join(' ') ?? '', /Maths Tomorrow/);

  const bioBlock = plan.blocks.find((block) => block.topicId === 'bio');
  if (bioBlock) {
    assert.equal(
      bioBlock.examDays,
      null,
      'A past Biology exam must not continue boosting Biology.',
    );
  }

  const todayWorkspace = createEmptyWorkspace(now);
  todayWorkspace.topics.push(maths);
  todayWorkspace.exams.push(
    createExam(
      {
        name: 'Exam Today',
        date: todayDate!,
        scope: 'topics',
        subjects: [],
        topicIds: ['math'],
      },
      now,
      'exam_today',
    ),
  );
  const todayPlan = buildTodayPlan(todayWorkspace, now, 45);
  assert.equal(todayPlan.nextBlock?.examDays, 0);
  assert.match(todayPlan.nextBlock?.reasons.join(' ') ?? '', /is today/);

  assert.equal(deleteExamFromWorkspace(workspace, 'exam_chem'), true);
  assert.equal(workspace.exams.some((exam) => exam.id === 'exam_chem'), false);
  assert.equal(workspace.topics.length, 3, 'Deleting an exam must never delete study material.');

  const validated = migrateAndValidateWorkspace(workspace);
  assert.equal(validated.exams.length, 2);

  console.log('✓ strict date parsing rejects impossible dates');
  console.log('✓ exam countdown uses calendar days, including the whole exam day');
  console.log('✓ subject scope affects only matching subjects');
  console.log('✓ topic scope affects only exact selected topics');
  console.log('✓ switching scope clears stale subject/topic selections');
  console.log('✓ upcoming exams sort ahead of past exams');
  console.log('✓ Today gives exam pressure only to included material');
  console.log('✓ past exams stop influencing Today');
  console.log('✓ deleting an exam preserves topics and study data');
  console.log('✓ resulting workspace passes schema validation');
}

main();
