/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  addLocalDays,
  buildDayMap,
  commitmentOccurrencesForDay,
  freeStudyWindows,
  localDayKey,
  rebuildRemainingDay,
  suggestTaskSlots,
} from '../src/features/planning/day-engine';
import {
  completeTask,
  createStudyTask,
  postponeTask,
  recordTaskMinutes,
  reopenTask,
  scheduleTask,
  taskRemainingMinutes,
  unscheduleTask,
} from '../src/features/planning/task-engine';
import { buildTodayPlan } from '../src/features/today/planner';

function local(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const now = local(2026, 10, 1, 15, 0);

function main() {
  const migrated = migrateAndValidateWorkspace({
    format: 'myelin.native.workspace',
    schemaVersion: 1,
    revision: 3,
    updatedAt: now,
    topics: [],
    exams: [],
    mistakes: [],
    history: [],
    breaks: [],
    settings: {
      dailyMinutes: 90,
      focusMinutes: 45,
      breakMinutes: 10,
      energy: 'normal',
      reduceMotion: false,
    },
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.tasks, []);
  assert.deepEqual(migrated.commitments, []);

  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 150;
  workspace.topics.push({
    id: 'topic_trig',
    name: 'Trigonometry',
    subject: 'Mathematics',
    createdAt: now - 1000,
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
  });
  workspace.exams.push({
    id: 'exam_math',
    name: 'Maths test',
    date: addLocalDays(now, 4),
    subjects: ['Mathematics'],
    scope: 'subjects',
    topicIds: [],
  });

  const homework = createStudyTask({
    title: 'Finish Maths Exercise 5.2',
    subject: 'Mathematics',
    topicId: 'topic_trig',
    examId: 'exam_math',
    type: 'homework',
    planState: 'inbox',
    dueAt: local(2026, 10, 2, 23, 59),
    estimatedMinutes: 35,
    priority: 2,
    now,
  });
  workspace.tasks.push(homework);
  assert.equal(homework.planState, 'inbox');
  assert.equal(taskRemainingMinutes(homework), 35);

  homework.planState = 'today';
  scheduleTask(homework, local(2026, 10, 1, 15, 30), local(2026, 10, 1, 16, 5), now);
  assert.equal(homework.planState, 'scheduled');
  assert.equal(workspace.tasks.length, 1, 'Scheduling must move the same task, not duplicate it.');

  unscheduleTask(homework, 'today', now);
  assert.equal(homework.planState, 'today');
  assert.equal(workspace.tasks.length, 1);

  recordTaskMinutes(homework, 22, now);
  assert.equal(homework.status, 'open');
  assert.equal(homework.actualMinutes, 22);
  assert.equal(taskRemainingMinutes(homework), 13);
  recordTaskMinutes(homework, 13, now);
  assert.equal(homework.status, 'completed');
  reopenTask(homework, now);
  assert.equal(homework.status, 'open');
  assert.equal(homework.planState, 'inbox');
  assert.equal(homework.actualMinutes, 35);
  assert.equal(homework.estimatedMinutes, 60);
  assert.equal(taskRemainingMinutes(homework), 25);
  completeTask(homework, now);
  assert.equal(homework.status, 'completed');
  reopenTask(homework, now);

  postponeTask(homework, addLocalDays(now, 1), now);
  assert.equal(homework.planState, 'postponed');
  assert.equal(buildTodayPlan(workspace, now).blocks.some((block) => block.taskId === homework.id), false);
  unscheduleTask(homework, 'today', now);

  workspace.commitments.push(
    {
      id: 'school',
      title: 'School / travel',
      kind: 'school',
      startAt: local(2026, 9, 28, 7, 30),
      endAt: local(2026, 9, 28, 14, 15),
      startMinutes: 7 * 60 + 30,
      endMinutes: 14 * 60 + 15,
      recurrenceDays: [1, 2, 3, 4, 5],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuition',
      title: 'Tuition',
      kind: 'tuition',
      startAt: local(2026, 9, 30, 16, 0),
      endAt: local(2026, 9, 30, 18, 0),
      startMinutes: 16 * 60,
      endMinutes: 18 * 60,
      recurrenceDays: [1, 3, 4],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'overlap',
      title: 'Travel into tuition',
      kind: 'commute',
      startAt: local(2026, 9, 30, 15, 45),
      endAt: local(2026, 9, 30, 16, 15),
      startMinutes: 15 * 60 + 45,
      endMinutes: 16 * 60 + 15,
      recurrenceDays: [4],
      createdAt: now,
      updatedAt: now,
    },
  );

  const occurrences = commitmentOccurrencesForDay(workspace.commitments, now);
  assert.ok(occurrences.some((item) => item.id === 'school'));
  assert.ok(occurrences.some((item) => item.id === 'tuition'));
  const tuitionOccurrence = occurrences.find((item) => item.id === 'tuition')!;
  assert.equal(new Date(tuitionOccurrence.start).getHours(), 16);
  assert.equal(new Date(tuitionOccurrence.end).getHours(), 18);

  const tuition = workspace.commitments.find((item) => item.id === 'tuition')!;
  tuition.skippedDates = [localDayKey(now)];
  assert.equal(
    commitmentOccurrencesForDay(workspace.commitments, now).some((item) => item.id === 'tuition'),
    false,
    'A recurring commitment should support skipping only this calendar occurrence.',
  );
  tuition.skippedDates = [];
  assert.ok(
    commitmentOccurrencesForDay(workspace.commitments, addLocalDays(now, 7)).some(
      (item) => item.id === 'tuition',
    ),
    'Skipping one occurrence must not remove future weekly repeats.',
  );

  workspace.commitments.push({
    id: 'sleep',
    title: 'Sleep',
    kind: 'sleep',
    startAt: local(2026, 9, 30, 22, 30),
    endAt: local(2026, 9, 30, 6, 30),
    startMinutes: 22 * 60 + 30,
    endMinutes: 6 * 60 + 30,
    recurrenceDays: [3],
    createdAt: now,
    updatedAt: now,
  });
  const overnight = commitmentOccurrencesForDay(workspace.commitments, now);
  const carry = overnight.find((item) => item.id === 'sleep:carry');
  assert.ok(carry, 'A recurring block crossing midnight should carry into the next day.');
  assert.equal(carry!.start, local(2026, 10, 1, 0, 0));
  assert.equal(carry!.end, local(2026, 10, 1, 6, 30));

  const windows = freeStudyWindows(workspace, now, {
    includeScheduledTasks: false,
    from: local(2026, 10, 1, 14, 15),
  });
  assert.ok(windows.some((window) => window.start === local(2026, 10, 1, 14, 15)));
  assert.ok(
    windows.every(
      (window) =>
        window.end <= local(2026, 10, 1, 15, 45) ||
        window.start >= local(2026, 10, 1, 18, 0),
    ),
    'Overlapping fixed commitments should merge into one unavailable interval.',
  );

  const slots = suggestTaskSlots(workspace, homework, now, 3);
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.end > slot.start));

  scheduleTask(homework, slots[0]!.start, slots[0]!.end, now);
  const dayMap = buildDayMap(workspace, now);
  assert.equal(
    dayMap.entries.filter((entry) => entry.kind === 'task' && entry.taskId === homework.id).length,
    1,
    'A task must appear only once in Timeline mode.',
  );

  const extra = createStudyTask({
    title: 'Biology recall',
    subject: 'Biology',
    type: 'revision',
    planState: 'today',
    estimatedMinutes: 600,
    priority: 3,
    now,
  });
  workspace.tasks.push(extra);
  const overloaded = buildDayMap(workspace, now);
  assert.ok(overloaded.overloadMinutes > 0, 'Obviously unrealistic planned work should be detected.');

  const rebuild = rebuildRemainingDay(workspace, now);
  for (const move of rebuild.moves) {
    const fixed = commitmentOccurrencesForDay(workspace.commitments, move.start);
    assert.equal(
      fixed.some((item) => move.start < item.end && move.end > item.start),
      false,
      'Rebuild proposals must never overlap a fixed commitment.',
    );
  }

  const todayPlan = buildTodayPlan(workspace, now);
  const taskBlocks = todayPlan.blocks.filter((block) => block.source === 'task');
  assert.ok(taskBlocks.length > 0, 'Tasks should participate in the existing Today ranking.');
  assert.equal(
    todayPlan.blocks.some(
      (block) => block.source === 'topic' && block.topicId === 'topic_trig',
    ),
    false,
    'A concrete linked task should suppress a duplicate generic Topic block.',
  );

  const noLinks = createStudyTask({
    title: 'Finish project cover page',
    type: 'assignment',
    estimatedMinutes: 0,
    now,
  });
  const edge = createEmptyWorkspace(now);
  edge.tasks.push(noLinks);
  const validated = migrateAndValidateWorkspace(edge);
  assert.equal(validated.tasks[0]!.subject, '');
  assert.equal(validated.tasks[0]!.topicId, null);
  assert.equal(validated.tasks[0]!.examId, null);
  assert.equal(validated.tasks[0]!.dueAt, 0);
  assert.equal(validated.tasks[0]!.estimatedMinutes, 0);
  const standalonePlan = buildTodayPlan(edge, now);
  assert.equal(
    standalonePlan.nextBlock?.taskId,
    noLinks.id,
    'A standalone task should still appear as concrete work in Today.',
  );
  assert.equal(
    standalonePlan.nextBlock?.focusable,
    true,
    'A standalone task should be launchable in Focus without inventing a Topic.',
  );

  const missingLinks = structuredClone(workspace);
  missingLinks.topics = [];
  missingLinks.exams = [];
  const repaired = migrateAndValidateWorkspace(missingLinks);
  assert.ok(repaired.tasks.every((task) => task.topicId === null));
  assert.ok(repaired.tasks.every((task) => task.examId === null));

  console.log('✓ v1 workspaces migrate to schema v2 without data loss');
  console.log('✓ task create, schedule, unschedule, partial completion, completion and reopen');
  console.log('✓ postponed tasks stay out of Today');
  console.log('✓ recurring, overlapping and overnight commitments produce deterministic free windows');
  console.log('✓ one recurring occurrence can be skipped without breaking future repeats');
  console.log('✓ slot suggestions fit the task duration without duplicating the task');
  console.log('✓ Day Map projects one scheduled block per task');
  console.log('✓ overload detection is calm and deterministic');
  console.log('✓ rebuild proposals avoid fixed commitments');
  console.log('✓ tasks feed the existing Today engine and suppress duplicate linked Topic work');
  console.log('✓ standalone tasks remain focusable without a Topic');
  console.log('✓ optional task subject, due date, estimate, Topic and Exam are valid');
  console.log('✓ deleted Topic/Exam links degrade to null instead of crashing');
}

main();

// A cancellation belongs to its start date, including the carry across midnight.
{
  const w = createEmptyWorkspace(now);
  const fixed = { id: 'night', title: 'Night shift', kind: 'other' as const,
    startAt: local(2026, 10, 1, 22), endAt: local(2026, 10, 2, 8),
    startMinutes: 22 * 60, endMinutes: 8 * 60, recurrenceDays: [4, 5],
    skippedDates: ['2026-10-01'], createdAt: now, updatedAt: now };
  w.commitments = [fixed];
  assert.equal(commitmentOccurrencesForDay(w.commitments, local(2026, 10, 1, 12)).length, 0);
  const next = commitmentOccurrencesForDay(w.commitments, local(2026, 10, 2, 12));
  assert.equal(next.length, 1, 'Skipping Thursday removes its Friday carry but keeps Friday night.');
  assert.equal(next[0]!.occurrenceDateKey, '2026-10-02');
  assert.equal(next[0]!.commitmentId, 'night');
  assert.equal(freeStudyWindows(w, local(2026, 10, 2, 12))[0]!.start, local(2026, 10, 2, 7));
  fixed.skippedDates = [];
  const restored = commitmentOccurrencesForDay(w.commitments, local(2026, 10, 2, 12));
  assert.equal(restored.length, 2);
  assert.equal(restored.find(item => item.id.endsWith(':carry'))!.occurrenceDateKey, '2026-10-01');
  fixed.skippedDates = ['2026-10-01'];
  const reloaded = migrateAndValidateWorkspace(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(reloaded.commitments[0]!.skippedDates, ['2026-10-01']);
  assert.throws(() => migrateAndValidateWorkspace({ ...w, commitments: [{ ...fixed, skippedDates: ['2026-02-30'] }] }), /skipped date/i);
}

import { taskUrgency } from '../src/features/planning/task-urgency';
{
  const task = createStudyTask({ title: 'Overdue task', dueAt: now - 60_000, now });
  assert.equal(taskUrgency(task, now)?.label, 'Overdue today');
  task.dueAt = local(2026, 9, 29, 23, 59);
  assert.equal(taskUrgency(task, now)?.label, '2 days overdue');
  completeTask(task, now);
  recordTaskMinutes(task, 10, now + 1000);
  assert.equal(task.completedAt, now, 'Finishing a timer must preserve an earlier manual completion.');
  assert.equal(taskUrgency(task, now), null);
}
console.log('✓ skipped dates survive reload, free time is reclaimed, overnight skips restore correctly, and due cues follow actual deadlines');
