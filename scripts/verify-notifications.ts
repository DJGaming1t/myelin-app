/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  MAX_REMINDERS_PER_DAY,
  buildReminderPlan,
  defaultReminderSettings,
  examReminderCopy,
  formatTimeMinutes,
  isInQuietHours,
  moveOutOfQuietHours,
  normalizeReminderSettings,
  reminderPlanSignature,
  reviewReminderCopy,
} from '../src/features/notifications/reminder-engine';

function local(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function makeDueWorkspace(now: number) {
  const workspace = createEmptyWorkspace(now - 100_000);
  workspace.topics.push({
    id: 'topic_refraction',
    name: 'Refraction',
    subject: 'Physics',
    createdAt: now - 100_000,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: '',
    dueAt: now - 60_000,
    intervalDays: 1,
    lastGrade: 2,
    lastReviewed: now - 86_400_000,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_refraction',
        prompt: 'Why does light bend?',
        answer: 'Its speed changes between media.',
        hint: '',
        dueAt: now - 60_000,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 86_400_000,
        reps: 2,
      },
    ],
  });
  return workspace;
}

function main() {
  const now = local(2026, 9, 30, 12, 0);
  const settings = {
    ...defaultReminderSettings(),
    enabled: true,
    reviewTimeMinutes: 19 * 60 + 15,
    examTimeMinutes: 18 * 60 + 30,
    quietStartMinutes: 21 * 60 + 30,
    quietEndMinutes: 7 * 60,
  };

  const empty = createEmptyWorkspace(now);
  assert.deepEqual(buildReminderPlan(empty, settings, now), []);

  const due = makeDueWorkspace(now);
  const duePlan = buildReminderPlan(due, settings, now);
  const reviews = duePlan.filter((item) => item.kind === 'review');
  assert.ok(reviews.length > 0);
  assert.equal(new Date(reviews[0]!.at).getHours(), 19);
  assert.equal(new Date(reviews[0]!.at).getMinutes(), 15);
  assert.equal(reviews[0]!.data.dueCount, 1);

  const notReady = createEmptyWorkspace(now);
  notReady.topics.push({
    id: 'new_topic',
    name: 'New topic',
    subject: 'Science',
    createdAt: now,
    status: 'new',
    priority: 2,
    estimate: 30,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'new_card',
        prompt: 'New question',
        answer: 'New answer',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
    ],
  });
  assert.equal(
    buildReminderPlan(notReady, settings, now).some(
      (item) => item.kind === 'review',
    ),
    false,
    'A brand-new untouched topic must not create a fake due-review reminder.',
  );

  const late = local(2026, 9, 30, 22, 0);
  assert.equal(isInQuietHours(late, 21 * 60 + 30, 7 * 60), true);
  assert.equal(
    moveOutOfQuietHours(late, 21 * 60 + 30, 7 * 60),
    local(2026, 10, 1, 7, 0),
  );

  const early = local(2026, 9, 30, 6, 30);
  assert.equal(isInQuietHours(early, 21 * 60 + 30, 7 * 60), true);
  assert.equal(
    moveOutOfQuietHours(early, 21 * 60 + 30, 7 * 60),
    local(2026, 9, 30, 7, 0),
  );

  const noon = local(2026, 9, 30, 12, 0);
  assert.equal(
    moveOutOfQuietHours(noon, 21 * 60 + 30, 7 * 60),
    noon,
  );

  const examWorkspace = createEmptyWorkspace(now);
  examWorkspace.exams.push({
    id: 'exam_math',
    name: 'Mathematics test',
    date: local(2026, 10, 10, 12, 0),
    subjects: ['Mathematics'],
    scope: 'subjects',
    topicIds: [],
  });

  const examPlan = buildReminderPlan(
    examWorkspace,
    {
      ...settings,
      reviewEnabled: false,
      examOffsets: [7, 3, 1],
    },
    now,
  ).filter((item) => item.kind === 'exam');

  assert.equal(examPlan.length, 3);
  assert.deepEqual(
    examPlan.map((item) => item.data.days).sort((a, b) => Number(b) - Number(a)),
    [7, 3, 1],
  );
  examPlan.forEach((item) => {
    assert.equal(new Date(item.at).getHours(), 18);
    assert.equal(new Date(item.at).getMinutes(), 30);
    assert.ok(item.at < examWorkspace.exams[0]!.date);
  });

  const crowded = makeDueWorkspace(now);
  for (let index = 0; index < 5; index += 1) {
    crowded.exams.push({
      id: `exam_${index}`,
      name: `Exam ${index + 1}`,
      date: local(2026, 10, 3, 12, 0),
      subjects: ['Science'],
      scope: 'subjects',
      topicIds: [],
    });
  }

  const crowdedPlan = buildReminderPlan(
    crowded,
    {
      ...settings,
      examOffsets: [3],
      examTimeMinutes: settings.reviewTimeMinutes,
    },
    now,
  );

  const perDay = new Map<string, number>();
  for (const item of crowdedPlan) {
    const date = new Date(item.at);
    const key = [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ].join('-');
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  for (const count of perDay.values()) {
    assert.ok(count <= MAX_REMINDERS_PER_DAY);
  }

  const forbidden = /streak|falling behind|behind|urgent|failure|guilt|lose your|missed your/i;
  for (const voice of ['calm', 'signal', 'spark'] as const) {
    const reviewCopy = reviewReminderCopy(
      { voice },
      {
        count: 3,
        firstTopic: 'Refraction',
        topicCount: 2,
        hasMistake: true,
      },
    );
    const examCopy = examReminderCopy(
      { voice },
      'Mathematics test',
      3,
    );

    assert.equal(forbidden.test(`${reviewCopy.title} ${reviewCopy.body}`), false);
    assert.equal(forbidden.test(`${examCopy.title} ${examCopy.body}`), false);
  }

  const invalid = normalizeReminderSettings({
    reviewTimeMinutes: 99999,
    examTimeMinutes: -500,
    quietStartMinutes: 2000,
    quietEndMinutes: -1,
    examOffsets: [7, 7, 0, 31, 3],
    voice: 'spark',
  });
  assert.equal(invalid.reviewTimeMinutes, 1439);
  assert.equal(invalid.examTimeMinutes, 0);
  assert.equal(invalid.quietStartMinutes, 1439);
  assert.equal(invalid.quietEndMinutes, 0);
  assert.deepEqual(invalid.examOffsets, [7, 3]);
  assert.equal(invalid.voice, 'spark');

  const firstSignature = reminderPlanSignature(duePlan);
  const secondSignature = reminderPlanSignature(
    buildReminderPlan(due, { ...settings, voice: 'spark' }, now),
  );
  assert.notEqual(firstSignature, secondSignature);

  assert.equal(formatTimeMinutes(0), '12:00 AM');
  assert.equal(formatTimeMinutes(19 * 60 + 15), '7:15 PM');

  console.log('✓ no due study data means no fake review reminder');
  console.log('✓ due reviews create one daily digest at the chosen window');
  console.log('✓ overnight quiet hours shift reminders to the quiet-end boundary');
  console.log('✓ exam reminders use only configured lead times before the exam');
  console.log('✓ daily notification volume is capped even with crowded exam data');
  console.log('✓ Calm, Signal and Spark copy avoid guilt/streak/urgency language');
  console.log('✓ reminder settings are normalized and plan signatures detect copy changes');
}

main();
