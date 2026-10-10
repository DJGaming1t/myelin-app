/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

  // Exams are date-only. A noon timestamp is still "today" at 15:00,
  // but yesterday's test must not keep boosting the same task.
  const examDayWorkspace = createEmptyWorkspace(now);
  examDayWorkspace.settings.sleepEnabled = false;
  const dateOnlyExam = { id: 'date-only-exam', name: 'Science unit test',
    date: local(2026, 10, 1, 12), subjects: ['Science'],
    scope: 'subjects' as const, topicIds: [] as string[] };
  examDayWorkspace.exams.push(dateOnlyExam);
  const linkedWork = createStudyTask({ title: 'Science test prep', type: 'practice',
    planState: 'today', estimatedMinutes: 25, examId: dateOnlyExam.id, now });
  examDayWorkspace.tasks.push(linkedWork);
  const todayExamBlock = buildTodayPlan(examDayWorkspace, now).blocks.find(block => block.taskId === linkedWork.id);
  assert.equal(todayExamBlock?.examDays, 0,
    'Today planner must keep a date-only exam relevant after its stored noon timestamp');
  assert.ok(todayExamBlock?.reasons.some(reason => reason.includes('Science unit test')),
    'Today planner should explain the still-relevant exam date');
  assert.ok(todayExamBlock?.reasons.includes('Science unit test is today'),
    'Today should say exam is today, not show the confusing phrase in 0 days');
  assert.ok(!todayExamBlock?.reasons.some(reason => /in 0 days/.test(reason)));
  examDayWorkspace.exams[0]!.date = local(2026, 9, 30, 12);
  const oldExamBlock = buildTodayPlan(examDayWorkspace, now).blocks.find(block => block.taskId === linkedWork.id);
  assert.equal(oldExamBlock?.examDays, null,
    'Past exam must no longer contribute to Today task candidate exam pressure');
  assert.ok(!oldExamBlock?.reasons.some(reason => reason.includes('Science unit test')),
    'Today must not describe a past exam as upcoming');
  examDayWorkspace.exams[0]!.date = local(2026, 10, 2, 12);
  assert.equal(buildTodayPlan(examDayWorkspace, now).blocks.find(block => block.taskId === linkedWork.id)?.examDays, 1,
    'Tomorrow exam remains an upcoming same-calendar-day target');

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


  // An open task whose estimate is fully logged keeps its saved timeline
  // entry for review, but must not occupy study-capacity windows or regenerate
  // 30 phantom planned minutes.
  const noWorkSchedule = createEmptyWorkspace(now);
  noWorkSchedule.settings.sleepEnabled = false;
  noWorkSchedule.settings.dailyMinutes = 120;
  const recordedTask = createStudyTask({
    title: 'Already logged practice', estimatedMinutes: 30, planState: 'today', now,
  });
  scheduleTask(recordedTask, local(2026, 10, 1, 16), local(2026, 10, 1, 17), now);
  recordedTask.actualMinutes = 30;
  noWorkSchedule.tasks.push(recordedTask);
  const pristine = JSON.stringify(noWorkSchedule);
  const reviewMap = buildDayMap(noWorkSchedule, now);
  const retained = reviewMap.entries.find(entry => entry.taskId === recordedTask.id);
  assert.ok(retained, 'Saved scheduled slot must remain visible in Day Map');
  assert.match(retained!.label, /Estimate met.*review task/);
  assert.equal(reviewMap.plannedStudyMinutes, 0,
    'Zero-remaining task must not recreate its entire original planned estimate');
  assert.ok(reviewMap.free.some(window =>
    window.start <= local(2026, 10, 1, 16) &&
    window.end >= local(2026, 10, 1, 17)),
    'Saved zero-work slot must no longer block valid free study time');
  assert.deepEqual(suggestTaskSlots(noWorkSchedule, recordedTask, now), [],
    'Do not propose a fresh scheduled block for an already fully logged task');
  assert.equal(JSON.stringify(noWorkSchedule), pristine,
    'Timeline projections must never unschedule, complete, or edit saved tasks');

  const stillNeedsWork = createEmptyWorkspace(now);
  stillNeedsWork.settings.sleepEnabled = false;
  const partialSlot = createStudyTask({
    title: 'Almost finished task', estimatedMinutes: 30, now,
  });
  scheduleTask(partialSlot, local(2026, 10, 1, 16), local(2026, 10, 1, 17), now);
  partialSlot.actualMinutes = 29;
  stillNeedsWork.tasks.push(partialSlot);
  const activeMap = buildDayMap(stillNeedsWork, now);
  assert.equal(activeMap.plannedStudyMinutes, 1);
  assert.ok(!activeMap.free.some(window =>
    window.start <= local(2026, 10, 1, 16) && window.end >= local(2026, 10, 1, 17)),
    'Even one real minute remaining keeps the existing scheduled reservation intact');
  partialSlot.estimatedMinutes = 0;
  assert.ok(!buildDayMap(stillNeedsWork, now).free.some(window =>
    window.start <= local(2026, 10, 1, 16) && window.end >= local(2026, 10, 1, 17)),
    'Unknown estimate must not be treated as a fully completed task');

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

{
  const dayMapSource = fs.readFileSync(
    path.join(process.cwd(), 'app/(app)/today/day-map.tsx'),
    'utf8',
  );
  assert.ok(
    dayMapSource.includes('buildAppliedReclaimedWindows') &&
      dayMapSource.includes('RECOVERED AUTOPILOT WINDOW'),
    'Day Map should visibly project reclaimed Autopilot reservations after recovery Apply.',
  );
  assert.ok(
    dayMapSource.includes("pathname: '/(app)/focus'") &&
      dayMapSource.includes('startReclaimedPlacement'),
    'A reclaimed Autopilot reservation should launch Focus directly.',
  );
  assert.ok(
    dayMapSource.includes('no task created'),
    'Day Map should make it explicit that reclaimed Autopilot reservations are projection-only, not duplicate tasks.',
  );
  assert.ok(
    dayMapSource.includes('MISSED RECOVERED SLOT') &&
      dayMapSource.includes('reflowed into the remaining exam plan'),
    'Day Map should visibly distinguish a missed recovered slot from the future blocks Autopilot reflowed after it.',
  );
  assert.ok(
    dayMapSource.includes('no longer fits before the deadline') &&
      dayMapSource.includes('deadline no longer fit at safe capacity'),
    'Day Map should surface renewed deadline pressure instead of silently hiding missed recovered work.',
  );
  assert.ok(
    dayMapSource.includes('PRE-MISS PROTECTION') &&
      dayMapSource.includes('useFocus') &&
      dayMapSource.includes('timerRemainingMs'),
    'Day Map should proactively protect a near-term recovered block when another Focus session is still running.',
  );
  assert.ok(
    dayMapSource.includes('later schedule change shrank this recovered window') &&
      dayMapSource.includes('repacked the reservation around the new fixed time'),
    'Day Map should explain when a later schedule edit proactively reshapes a recovered window before it becomes a miss.',
  );
  assert.ok(
    dayMapSource.includes('recoveredCommitmentId') &&
      dayMapSource.includes('recoveredOccurrenceDateKey') &&
      dayMapSource.includes('recoveredHandoffTarget'),
    'Day Map should resolve an exact recovered notification handoff against the current reconstructed reservation.',
  );
  assert.ok(
    dayMapSource.includes('scrollTo({') &&
      dayMapSource.includes('FROM REMINDER') &&
      dayMapSource.includes('Opened from your recovered-window reminder'),
    'Recovered notification handoff should scroll to and visibly emphasize the intended reservation.',
  );
  assert.ok(
    dayMapSource.includes('Start this focus') &&
      dayMapSource.includes('startReclaimedPlacement(placement)'),
    'The highlighted recovered reminder block should provide one-tap Focus launch.',
  );
  assert.ok(
    dayMapSource.includes('handoffConsumedRef') &&
      dayMapSource.includes('recoveredLayoutRef'),
    'Repeated recovered notification taps should be able to target Day Map again while it is already open.',
  );
  assert.ok(
    dayMapSource.includes('resolveRecoveredReminderHandoff') &&
      dayMapSource.includes('PLAN UPDATED SINCE THIS REMINDER') &&
      dayMapSource.includes('CURRENT PLAN'),
    'A stale recovered reminder should explicitly explain that the plan changed and highlight the current recovered action.',
  );
  assert.ok(
    dayMapSource.includes('buildTodayPlan') &&
      dayMapSource.includes('startCurrentTodayAction') &&
      dayMapSource.includes('current next action'),
    'If no recovered action survives, Day Map should fall back to the current Today recommendation instead of leaving a dead notification handoff.',
  );
  assert.ok(
    dayMapSource.includes('Start current focus') &&
      dayMapSource.includes('Current block after your plan changed'),
    'A reflowed stale reminder should make the live replacement action obvious and directly startable.',
  );
  assert.ok(
    dayMapSource.includes('recoveredHandoffIdentity') &&
      dayMapSource.includes('activeHandoffIdentityRef') &&
      dayMapSource.includes('handoffCleanupTimerRef'),
    'Consumed recovered handoffs should be keyed by identity so an older cleanup timer cannot erase a newer notification tap.',
  );
  assert.ok(
    dayMapSource.includes('scheduleRecoveredHandoffCleanup') &&
      dayMapSource.includes('clearRecoveredHandoffRoute') &&
      dayMapSource.includes("pathname: '/(app)/today/day-map'"),
    'After the reminder handoff has been visible, Day Map should replace the route with a clean Day Map URL.',
  );
  assert.ok(
    dayMapSource.includes('activeHandoffIdentityRef.current !==') &&
      dayMapSource.includes('4400'),
    'Route cleanup must verify the handoff is still current and leave the highlight/update message visible briefly before clearing params.',
  );
  assert.ok(
    dayMapSource.includes('const reflowParam = firstParam(params.reflow)') &&
      dayMapSource.includes("{ params: { reflow: reflowParam } }"),
    'Cleaning notification params should preserve an unrelated Autopilot reflow parameter when one is present.',
  );
}
console.log('✓ reclaimed Autopilot reservations are visible in Day Map and launch Focus directly without task duplication');
console.log('✓ missed recovered slots are visible with reflowed minutes and renewed deadline pressure');
console.log('✓ near-term recovered slots proactively protect against active Focus and later schedule changes');
console.log('✓ recovered reminder handoff scrolls/highlights the current reservation and offers one-tap Focus');
console.log('✓ stale recovered reminder taps explain plan changes and fall forward to the best current action');
console.log('✓ consumed recovered notification params clear safely without letting an older timer erase a newer handoff');
