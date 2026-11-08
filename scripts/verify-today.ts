/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { shortSession } from '../src/features/today/short-session';
import { createEmptyWorkspace, Topic } from '../src/data/schema';
import {
  completeTask,
  createStudyTask,
  postponeTask,
  scheduleTask,
} from '../src/features/planning/task-engine';
import {
  buildTodayPlan,
  minutesUsedToday,
  nextLocalDayStart,
  startOfLocalDay,
} from '../src/features/today/planner';
import {
  buildDayMapSteps,
  computeCompletedFocusMinutesToday,
  computeStudyStreakDays,
  computeTodayProgress,
  formatCompletedFocusDuration,
  isBrickDone,
  selectTodayTasks,
  taskProgress,
  toDialAngle,
} from '../src/features/today/today-progress';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 30, 12, 0, 0);

function topic(
  id: string,
  name: string,
  subject: string,
  options: Partial<Topic> = {},
): Topic {
  return {
    id,
    name,
    subject,
    createdAt: now - DAY,
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
    ...options,
  };
}

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

function main() {
  const flexibleWorkspace = createEmptyWorkspace(now - DAY);
  const flexible = createStudyTask({ title: 'Bio work', planState: 'inbox', dueAt: now - DAY, now: now - DAY });
  flexibleWorkspace.tasks.push(flexible);
  assert.equal(computeTodayProgress(flexibleWorkspace, now).total, 0);
  assert.equal(computeTodayProgress(flexibleWorkspace, now, flexible.id).total, 1);
  const flexiblePlan = buildTodayPlan(flexibleWorkspace, now);
  if (flexiblePlan.nextBlock?.taskId === flexible.id) {
    assert(buildDayMapSteps(flexibleWorkspace, now, flexiblePlan).steps.some(step => step.taskId === flexible.id));
  }
  postponeTask(flexible, now + DAY, now);
  assert.equal(computeTodayProgress(flexibleWorkspace, now, flexible.id).total, 0);
  console.log('✓ recommended flexible task appears in Today; postponed tasks remain excluded');

  const workspace = createEmptyWorkspace(now - DAY);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 45;
  workspace.settings.breakMinutes = 10;
  workspace.settings.energy = 'normal';

  const examMath = topic('exam_math', 'Quadratics', 'Mathematics');
  const dueChem = topic('due_chem', 'Metals', 'Chemistry', {
    status: 'review',
    priority: 1,
    dueAt: now - 1,
  });
  const biology = topic('bio', 'Life Processes', 'Biology', {
    priority: 3,
    status: 'learning',
  });

  dueChem.cards.push({
    id: 'chem_card',
    prompt: 'Why is sodium extracted by electrolysis?',
    answer: 'It is too reactive for carbon reduction.',
    hint: 'Think reactivity series.',
    dueAt: now - 1000,
    intervalDays: 2,
    lastGrade: 2,
    lastReviewed: now - 2 * DAY,
    reps: 2,
  });

  workspace.topics.push(examMath, dueChem, biology);
  workspace.exams.push({
    id: 'exam_1',
    name: 'Math test',
    date: now + DAY,
    subjects: [],
    scope: 'topics',
    topicIds: ['exam_math'],
  });

  const plan = buildTodayPlan(workspace, now);
  assert.equal(plan.nextBlock?.topicId, 'exam_math', 'Tomorrow exam topic should rise to the top.');
  assert.ok(
    plan.blocks.some((block) => block.topicId === 'due_chem'),
    'Overdue review material should be represented in the plan.',
  );
  assert.ok(plan.plannedTotalMinutes <= plan.remainingBudgetMinutes);
  assert.equal(
    plan.plannedBreakMinutes,
    Math.max(0, plan.blocks.length - 1) * plan.breakMinutes,
    'Breaks must be explicitly budgeted.',
  );

  const dueOnly = createEmptyWorkspace(now - DAY);
  dueOnly.settings.dailyMinutes = 45;
  dueOnly.topics.push(
    topic('due', 'Due review', 'Science', {
      status: 'review',
      priority: 1,
      dueAt: now - 1,
    }),
    topic('new_high', 'New high-priority topic', 'Maths', {
      status: 'new',
      priority: 3,
    }),
  );
  assert.equal(
    buildTodayPlan(dueOnly, now).nextBlock?.topicId,
    'due',
    'An overdue topic should beat a merely high-priority new topic.',
  );

  const interleave = createEmptyWorkspace(now - DAY);
  interleave.settings.dailyMinutes = 110;
  interleave.settings.focusMinutes = 45;
  interleave.settings.breakMinutes = 10;
  interleave.topics.push(
    topic('math_a', 'Math A', 'Mathematics', { priority: 3, estimate: 45 }),
    topic('math_b', 'Math B', 'Mathematics', {
      priority: 3,
      status: 'new',
      estimate: 45,
    }),
    topic('chem_a', 'Chem A', 'Chemistry', {
      priority: 2,
      status: 'learning',
      estimate: 45,
    }),
  );

  const interleavedPlan = buildTodayPlan(interleave, now);
  assert.equal(interleavedPlan.blocks[0]?.topicId, 'math_a');
  assert.equal(
    interleavedPlan.blocks[1]?.topicId,
    'math_b',
    'Subject changes alone should not override the higher-priority next task.',
  );

  const lowEnergy = createEmptyWorkspace(now - DAY);
  lowEnergy.settings.dailyMinutes = 90;
  lowEnergy.settings.focusMinutes = 45;
  lowEnergy.settings.breakMinutes = 8;
  lowEnergy.settings.energy = 'low';
  lowEnergy.topics.push(
    topic('low_1', 'Topic one', 'Physics', { priority: 3, estimate: 60 }),
    topic('low_2', 'Topic two', 'Chemistry', { priority: 2, estimate: 60 }),
  );

  const lowPlan = buildTodayPlan(lowEnergy, now);
  assert.equal(lowPlan.targetFocusMinutes, 25);
  assert.ok(lowPlan.blocks.every((block) => block.minutes <= 25));
  assert.ok(lowPlan.breakMinutes >= 8);

  const used = createEmptyWorkspace(now - DAY);
  used.settings.dailyMinutes = 90;
  used.topics.push(topic('used_topic', 'Remaining topic', 'Biology'));
  const todayStart = startOfLocalDay(now);
  used.history.push({
    id: 'session_today',
    topicId: 'used_topic',
    at: todayStart + 60 * 60 * 1000,
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
  });
  used.breaks.push({ at: todayStart + 2 * 60 * 60 * 1000, minutes: 10 });

  assert.equal(minutesUsedToday(used, now), 40);

  const standaloneFocused = createEmptyWorkspace(now - DAY);
  standaloneFocused.settings.dailyMinutes = 90;
  const focusedTask = createStudyTask({
    title: 'Standalone homework',
    estimatedMinutes: 45,
    planState: 'today',
    now: todayStart + 1000,
  });
  focusedTask.focusDayKey = [
    new Date(now).getFullYear(),
    String(new Date(now).getMonth() + 1).padStart(2, '0'),
    String(new Date(now).getDate()).padStart(2, '0'),
  ].join('-');
  focusedTask.focusMinutesForDay = 20;
  standaloneFocused.tasks.push(focusedTask);
  assert.equal(
    minutesUsedToday(standaloneFocused, now),
    20,
    'Standalone task focus minutes should reduce today capacity.',
  );
  assert.equal(buildTodayPlan(standaloneFocused, now).remainingBudgetMinutes, 70);

  const usedPlan = buildTodayPlan(used, now);
  assert.equal(usedPlan.remainingBudgetMinutes, 50);
  assert.ok(usedPlan.plannedTotalMinutes <= 50);

  const nextDay = nextLocalDayStart(now);
  assert.ok(nextDay > now, 'Next-day snooze boundary must be in the future.');
  assert.equal(
    startOfLocalDay(nextDay),
    nextDay,
    'Deferred-for-today topics should return exactly at the next local day boundary.',
  );

  const snoozed = createEmptyWorkspace(now - DAY);
  snoozed.settings.dailyMinutes = 60;
  snoozed.topics.push(
    topic('snoozed', 'Do not schedule', 'Maths', {
      priority: 3,
      snoozeUntil: now + DAY,
    }),
    topic('available', 'Schedule me', 'Chemistry', { priority: 1 }),
  );
  assert.equal(buildTodayPlan(snoozed, now).nextBlock?.topicId, 'available');

  const exhausted = createEmptyWorkspace(now - DAY);
  exhausted.settings.dailyMinutes = 30;
  exhausted.topics.push(topic('x', 'X', 'Physics'));
  exhausted.history.push({
    id: 'done',
    topicId: 'x',
    at: todayStart + 1000,
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
  });
  const exhaustedPlan = buildTodayPlan(exhausted, now);
  assert.equal(exhaustedPlan.remainingBudgetMinutes, 0);
  assert.equal(exhaustedPlan.blocks.length, 0);

  const tiny = createEmptyWorkspace(now - DAY);
  tiny.settings.dailyMinutes = 10;
  tiny.topics.push(topic('tiny', 'Five-minute fact check', 'Science', { estimate: 5 }));
  assert.equal(buildTodayPlan(tiny, now).blocks[0]?.minutes, 5);

  console.log('✓ exam-aware priority');
  console.log('✓ due-review priority');
  console.log('✓ meaningful priority instead of arbitrary subject alternation');
  console.log('✓ low-energy block shortening');
  console.log('✓ breaks fit inside the time budget');
  console.log('✓ already-used time reduces remaining capacity');
  console.log('✓ standalone task focus reduces remaining capacity');
  console.log('✓ snoozed topics stay out');
  console.log('✓ exhausted budget adds no fake work');
  const snapshot = JSON.stringify(plan);
  const quick = shortSession(plan);
  assert.equal(quick?.minutes, 10, 'Short session should cap a longer block at ten minutes.');
  assert.equal(quick?.topicId, plan.nextBlock?.topicId);
  assert.equal(quick?.mode, 'study');
  assert.equal(JSON.stringify(plan), snapshot, 'Short session must not change the daily plan.');
  assert.equal(shortSession({ ...plan, remainingBudgetMinutes: 4 }), null);
  assert.equal(shortSession({ ...plan, blocks: [] }), null);
  assert.equal(shortSession({ ...plan, remainingBudgetMinutes: 7 })?.minutes, 7);
  assert.equal(shortSession({ ...plan, blocks: [{ ...plan.blocks[0]!, minutes: 5 }] })?.minutes, 5);
  assert.equal(shortSession({ ...plan, blocks: [{ ...plan.blocks[0]!, topicId: null, focusable: false }] }), null);
  console.log('✓ short sessions fit real capacity and leave the daily plan unchanged');

  // =========================================================================
  // STAGE 1 TESTS — Pure Progress, Completed Focus, Streak & Day Map Selectors
  // =========================================================================

  // 1. Zero tasks: 0% progress, 0 ratio, 0 steps
  const emptyWs = createEmptyWorkspace(now - DAY);
  const zeroProgress = computeTodayProgress(emptyWs, now);
  assert.equal(zeroProgress.total, 0);
  assert.equal(zeroProgress.done, 0);
  assert.equal(zeroProgress.incomplete, 0);
  assert.equal(zeroProgress.ratio, 0);
  assert.equal(zeroProgress.percent, 0);
  assert.equal(toDialAngle(zeroProgress.ratio), 0);
  const zeroSteps = buildDayMapSteps(emptyWs, now);
  assert.equal(zeroSteps.totalSteps, 0);
  assert.equal(zeroSteps.steps.length, 0);
  assert.equal(zeroSteps.previewSteps.length, 0);
  assert.equal(zeroSteps.nextStep, null);

  // 2. One incomplete task
  const oneOpenWs = createEmptyWorkspace(now - DAY);
  const singleTask = createStudyTask({
    title: 'Revise Trigonometry',
    subject: 'Mathematics',
    planState: 'today',
    estimatedMinutes: 30,
    now: todayStart + 1000,
  });
  oneOpenWs.tasks.push(singleTask);
  const oneOpenProgress = computeTodayProgress(oneOpenWs, now);
  assert.equal(oneOpenProgress.total, 1);
  assert.equal(oneOpenProgress.done, 0);
  assert.equal(oneOpenProgress.incomplete, 1);
  assert.equal(oneOpenProgress.ratio, 0);
  assert.equal(oneOpenProgress.percent, 0);
  const oneOpenSteps = buildDayMapSteps(oneOpenWs, now);
  assert.equal(oneOpenSteps.totalSteps, 1);
  assert.equal(oneOpenSteps.steps.length, 1);
  assert.equal(oneOpenSteps.steps[0]?.completed, false);
  assert.equal(oneOpenSteps.steps[0]?.current, true);
  assert.equal(oneOpenSteps.nextStep?.taskId, singleTask.id);
  assert.equal(isBrickDone(oneOpenSteps.steps[0]!), false);

  // 3. One completed task
  completeTask(singleTask, todayStart + 20_000);
  const oneDoneProgress = computeTodayProgress(oneOpenWs, now);
  assert.equal(oneDoneProgress.total, 1);
  assert.equal(oneDoneProgress.done, 1);
  assert.equal(oneDoneProgress.incomplete, 0);
  assert.equal(oneDoneProgress.ratio, 1);
  assert.equal(oneDoneProgress.percent, 100);
  assert.equal(toDialAngle(oneDoneProgress.ratio), 360);
  const oneDoneSteps = buildDayMapSteps(oneOpenWs, now);
  assert.equal(oneDoneSteps.totalSteps, 1);
  assert.equal(oneDoneSteps.completedSteps, 1);
  assert.equal(oneDoneSteps.remainingSteps, 0);
  assert.equal(oneDoneSteps.steps[0]?.completed, true);
  assert.equal(oneDoneSteps.steps[0]?.current, false);
  assert.equal(oneDoneSteps.nextStep, null);
  assert.equal(isBrickDone(oneDoneSteps.steps[0]!), true);

  // 4. Three completed out of seven tasks (3/7 -> 43%) & All seven completed (7/7 -> 100%)
  const sevenWs = createEmptyWorkspace(now - DAY);
  for (let i = 1; i <= 7; i += 1) {
    const t = createStudyTask({
      title: `Task ${i}`,
      subject: i % 2 === 0 ? 'Physics' : 'Chemistry',
      planState: 'today',
      estimatedMinutes: 25,
      priority: i === 4 ? 3 : 2,
      now: todayStart + i * 1000,
    });
    if (i <= 3) {
      completeTask(t, todayStart + (i + 10) * 1000);
    }
    sevenWs.tasks.push(t);
  }
  const threeOfSeven = computeTodayProgress(sevenWs, now);
  assert.equal(threeOfSeven.total, 7);
  assert.equal(threeOfSeven.done, 3);
  assert.equal(threeOfSeven.incomplete, 4);
  assert.equal(threeOfSeven.percent, 43);

  const sevenSteps = buildDayMapSteps(sevenWs, now);
  assert.equal(
    sevenSteps.steps.length,
    7,
    'Underlying Day Map step selector must retain all 7 real tasks.',
  );
  assert.equal(
    sevenSteps.previewSteps.length,
    5,
    'Preview steps default to a 5-step slice while steps retains all 7.',
  );
  assert.equal(sevenSteps.completedSteps, 3);
  assert.equal(sevenSteps.remainingSteps, 4);
  assert.equal(sevenSteps.steps.filter((s) => s.completed).length, 3);
  assert.equal(sevenSteps.steps.filter((s) => s.current).length, 1);
  assert.equal(
    sevenSteps.nextStep?.title,
    'Task 4',
    'Highest priority open task should be the current next step.',
  );

  for (const t of sevenWs.tasks) {
    if (t.status !== 'completed') completeTask(t, todayStart + 50_000);
  }
  const allSevenDone = computeTodayProgress(sevenWs, now);
  assert.equal(allSevenDone.total, 7);
  assert.equal(allSevenDone.done, 7);
  assert.equal(allSevenDone.incomplete, 0);
  assert.equal(allSevenDone.ratio, 1);
  assert.equal(allSevenDone.percent, 100);

  // 5. Variable task counts (12 tasks retained in full) & duplicate ID protection
  const twelveWs = createEmptyWorkspace(now - DAY);
  for (let i = 1; i <= 12; i += 1) {
    const t = createStudyTask({
      title: `Step ${i}`,
      planState: 'today',
      now: todayStart + i * 500,
    });
    twelveWs.tasks.push(t);
  }
  // Push duplicate reference of first task to verify deduplication
  twelveWs.tasks.push(twelveWs.tasks[0]!);
  const twelveProgress = computeTodayProgress(twelveWs, now);
  assert.equal(twelveProgress.total, 12, 'Duplicate task IDs must never be counted twice.');
  const twelveSteps = buildDayMapSteps(twelveWs, now);
  assert.equal(twelveSteps.steps.length, 12, 'Selector must retain all 12 real tasks.');
  assert.equal(twelveSteps.previewSteps.length, 5);
  assert.equal(
    taskProgress([
      { id: 'dup', completed: true },
      { id: 'dup', completed: true },
      { id: 'two', completed: false },
    ]).total,
    2,
  );

  // 6. Scheduled tasks crossing local day boundaries, tomorrow/yesterday exclusions, and postponed tasks
  const boundaryWs = createEmptyWorkspace(now - 2 * DAY);
  const crossedFromYesterday = createStudyTask({
    title: 'Late-night study crossing into today',
    now: todayStart - 2 * 3600_000,
  });
  scheduleTask(
    crossedFromYesterday,
    todayStart - 30 * 60_000,
    todayStart + 30 * 60_000,
    todayStart - 30 * 60_000,
  );

  const crossesIntoTomorrow = createStudyTask({
    title: 'Evening study crossing into tomorrow',
    now: todayStart + 1000,
  });
  scheduleTask(
    crossesIntoTomorrow,
    nextDay - 30 * 60_000,
    nextDay + 30 * 60_000,
    todayStart + 1000,
  );

  const strictlyTomorrow = createStudyTask({
    title: 'Tomorrow morning block',
    now: todayStart + 2000,
  });
  scheduleTask(
    strictlyTomorrow,
    nextDay + 9 * 3600_000,
    nextDay + 10 * 3600_000,
    todayStart + 2000,
  );

  const strictlyYesterday = createStudyTask({
    title: 'Yesterday afternoon block',
    now: todayStart - DAY,
  });
  scheduleTask(
    strictlyYesterday,
    todayStart - 5 * 3600_000,
    todayStart - 4 * 3600_000,
    todayStart - 5 * 3600_000,
  );

  const postponedTask = createStudyTask({
    title: 'Postponed until tomorrow',
    planState: 'today',
    now: todayStart + 3000,
  });
  postponeTask(postponedTask, nextDay, now);

  boundaryWs.tasks.push(
    crossedFromYesterday,
    crossesIntoTomorrow,
    strictlyTomorrow,
    strictlyYesterday,
    postponedTask,
  );
  const boundarySelected = selectTodayTasks(boundaryWs, now);
  assert.deepEqual(
    boundarySelected.map((t) => t.title),
    [
      'Late-night study crossing into today',
      'Evening study crossing into tomorrow',
    ],
    'Tasks crossing local midnight into or out of today must be included; strictly yesterday/tomorrow and postponed tasks must be excluded.',
  );

  // 7. Focus time: No completed focus sessions & Planned time without completed study time
  const plannedOnlyWs = createEmptyWorkspace(now - DAY);
  plannedOnlyWs.settings.dailyMinutes = 180;
  plannedOnlyWs.settings.focusMinutes = 45;
  plannedOnlyWs.topics.push(topic('phys', 'Optics', 'Physics', { estimate: 90 }));
  const plannedTask = createStudyTask({
    title: 'Planned 60m problem set',
    planState: 'scheduled',
    estimatedMinutes: 60,
    now: todayStart + 1000,
  });
  scheduleTask(plannedTask, now + 3600_000, now + 2 * 3600_000, now);
  plannedOnlyWs.tasks.push(plannedTask);
  // Add a break log and an in-progress/abandoned focusOutcome — neither is completed focus time
  plannedOnlyWs.breaks.push({ at: todayStart + 3600_000, minutes: 15 });
  plannedOnlyWs.focusOutcomes = [
    {
      id: 'focus_started_only',
      startedAt: now - 600_000,
      endedAt: 0,
      status: 'started',
      plannedMinutes: 45,
      minutes: 0,
      launchMode: 'full',
      taskOnly: false,
      overdue: false,
    },
    {
      id: 'focus_abandoned',
      startedAt: now - 1800_000,
      endedAt: now - 1200_000,
      status: 'abandoned',
      plannedMinutes: 45,
      minutes: 10,
      launchMode: 'full',
      taskOnly: true,
      overdue: false,
    },
  ];
  const plannedDayPlan = buildTodayPlan(plannedOnlyWs, now);
  assert.ok(plannedDayPlan.plannedStudyMinutes > 0, 'Plan has scheduled study minutes.');
  assert.equal(
    computeCompletedFocusMinutesToday(plannedOnlyWs, now),
    0,
    'Planned focus minutes, breaks, and started/abandoned outcomes must NEVER be counted as completed focus time.',
  );
  assert.equal(formatCompletedFocusDuration(0), '0m');

  // 8. Potential overlapping focus records across history, focusOutcomes, and task.focusMinutesForDay
  const overlapWs = createEmptyWorkspace(now - DAY);
  const todayKeyStr = [
    new Date(now).getFullYear(),
    String(new Date(now).getMonth() + 1).padStart(2, '0'),
    String(new Date(now).getDate()).padStart(2, '0'),
  ].join('-');

  // Case A: Topic session recorded in BOTH history ('session_focus_A') and focusOutcomes ('focus_A') -> 50m once
  overlapWs.history.push({
    id: 'session_focus_A',
    topicId: 'phys',
    at: todayStart + 2 * 3600_000,
    startedAt: todayStart + 3600_000,
    endedAt: todayStart + 3600_000 + 50 * 60_000,
    kind: 'study',
    minutes: 50,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
  });
  overlapWs.focusOutcomes = [
    {
      id: 'focus_A',
      startedAt: todayStart + 3600_000,
      endedAt: todayStart + 3600_000 + 50 * 60_000,
      status: 'finished',
      plannedMinutes: 50,
      minutes: 50,
      launchMode: 'full',
      taskOnly: false,
      overdue: false,
    },
  ];
  assert.equal(computeCompletedFocusMinutesToday(overlapWs, now), 50);

  // Case B: Standalone task focus recorded in BOTH task.focusMinutesForDay (50m) and focusOutcomes (taskOnly: true, 50m) -> +50m once (total 100m)
  const standaloneTask = createStudyTask({
    title: 'Standalone essay',
    planState: 'today',
    estimatedMinutes: 60,
    now: todayStart + 1000,
  });
  standaloneTask.focusDayKey = todayKeyStr;
  standaloneTask.focusMinutesForDay = 50;
  standaloneTask.lastFocusSessionId = 'focus_B';
  overlapWs.tasks.push(standaloneTask);
  overlapWs.focusOutcomes.push({
    id: 'focus_B',
    startedAt: todayStart + 3 * 3600_000,
    endedAt: todayStart + 3 * 3600_000 + 50 * 60_000,
    status: 'finished',
    plannedMinutes: 50,
    minutes: 50,
    launchMode: 'full',
    taskOnly: true,
    overdue: false,
  });
  assert.equal(
    computeCompletedFocusMinutesToday(overlapWs, now),
    100,
    'Standalone task focus recorded in both task.focusMinutesForDay and focusOutcomes must not be double-counted.',
  );

  // Case C: Overlapping wall-clock study intervals in history ([05:00..05:30] 30m and [05:15..05:45] 30m -> net +45m, total 145m)
  overlapWs.history.push(
    {
      id: 'session_overlap_1',
      topicId: 'phys',
      at: todayStart + 5 * 3600_000 + 30 * 60_000,
      startedAt: todayStart + 5 * 3600_000,
      endedAt: todayStart + 5 * 3600_000 + 30 * 60_000,
      kind: 'study',
      minutes: 30,
      grade: 0,
      effort: 3,
      prompt: '',
      response: '',
      confidence: 'unsure',
    },
    {
      id: 'session_overlap_2',
      topicId: 'phys',
      at: todayStart + 5 * 3600_000 + 45 * 60_000,
      startedAt: todayStart + 5 * 3600_000 + 15 * 60_000,
      endedAt: todayStart + 5 * 3600_000 + 45 * 60_000,
      kind: 'study',
      minutes: 30,
      grade: 0,
      effort: 3,
      prompt: '',
      response: '',
      confidence: 'unsure',
    },
  );
  assert.equal(
    computeCompletedFocusMinutesToday(overlapWs, now),
    145,
    'Overlapping wall-clock study sessions must merge overlapped minutes instead of double-counting.',
  );
  assert.equal(formatCompletedFocusDuration(130), '2h 10m');

  // 9. Study streak calculation (0 streak, active streak preserved before today's session, active streak including today)
  assert.equal(computeStudyStreakDays(emptyWs, now), 0);
  const streakWs = createEmptyWorkspace(now - 10 * DAY);
  for (let d = 1; d <= 3; d += 1) {
    streakWs.history.push({
      id: `streak_day_${d}`,
      topicId: 'phys',
      at: todayStart - d * DAY + 3600_000,
      kind: 'study',
      minutes: 25,
      grade: 0,
      effort: 3,
      prompt: '',
      response: '',
      confidence: 'unsure',
    });
  }
  assert.equal(
    computeStudyStreakDays(streakWs, now),
    3,
    'Streak from yesterday through 3 days ago remains 3 before today is studied.',
  );
  streakWs.history.push({
    id: 'streak_today',
    topicId: 'phys',
    at: todayStart + 3600_000,
    kind: 'study',
    minutes: 25,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
  });
  assert.equal(
    computeStudyStreakDays(streakWs, now),
    4,
    'Completing focus today advances the streak to 4 days.',
  );

  console.log('✓ Stage 1: zero, single, 3/7 (43%), 7/7 (100%) and variable task progress verified');
  console.log('✓ Stage 1: planned minutes, breaks and abandoned outcomes never count as completed focus');
  console.log('✓ Stage 1: overlapping history, focusOutcomes and task.focusMinutesForDay never double-count');
  console.log('✓ Stage 1: midnight-crossing scheduled tasks and postponed exclusions verified');
  console.log('✓ Stage 1: Day Map step selector retains all real tasks (0, 1, 7, 12) and deduplicates IDs');
  console.log('✓ Stage 1: study streak calculation verified across consecutive local days');

  const todayScreen = read('app/(app)/today/index.tsx');
  const recommendationMotion = read('src/features/today/useRecommendationMotion.ts');
  const planCard = read('src/features/today/PlanBlockCard.tsx');
  const springPressable = read('src/components/motion/SpringPressable.tsx');
  const inboxCard = read('src/features/planning/StudyInboxCard.tsx');
  assert.ok(todayScreen.includes('min available'), 'Today does not expose remaining capacity when requested.');
  assert.ok(todayScreen.includes('showAdjust'), 'Today capacity controls are not progressively disclosed.');
  assert.ok(todayScreen.includes('maxWidth: layout.contentMax'), 'Today is not bounded responsively.');
  assert.ok(todayScreen.includes('minHeight: layout.minTouch'), 'Today choices do not meet the shared touch target.');
  assert.ok(planCard.includes('<SpringPressable'), 'Plan cards are missing the shared spring press primitive.');
  assert.ok(
    springPressable.includes('useReducedMotion()'),
    'Shared spring press motion ignores reduced-motion preference.',
  );
  assert.ok(
    springPressable.includes('if (reduceMotion)'),
    'Shared press motion is not gated when reduced motion is enabled.',
  );
  assert.ok(
    todayScreen.includes('deferWithTransition(next)'),
    'Today is missing the animated Not now handoff.',
  );
  assert.ok(
    todayScreen.includes('useRecommendationMotion()') &&
      recommendationMotion.includes('withTiming') && recommendationMotion.includes('scheduleOnRN'),
    'Today does not animate the current recommendation out and the next recommendation in.',
  );
  assert.ok(
    recommendationMotion.includes('useReducedMotion()'),
    'Today recommendation handoff ignores reduced-motion preference.',
  );
  assert.ok(todayScreen.includes('undoDefer'), 'Today defer action is missing undo.');
  assert.ok(
    todayScreen.includes('undoWithTransition') &&
      todayScreen.includes('onPress={undoWithTransition}'),
    'Undo should animate the recommendation handoff instead of snapping back.',
  );
  assert.ok(
    todayScreen.includes('<MotionItem key={`undo:'),
    'Undo feedback should animate in and out.',
  );
  assert.ok(todayScreen.includes('nextLocalDayStart(Date.now())'), 'Today does not defer until the next local day.');
  assert.ok(
    todayScreen.includes('Nothing urgent right now.'),
    'Today is missing a calm fallback card after the recommendation queue is exhausted.',
  );
  assert.ok(
    inboxCard.includes('label="Schedule"') && inboxCard.includes('openScheduler(task.id)'),
    'Inbox scheduling must open a chooser instead of immediately committing the task.',
  );
  assert.ok(
    inboxCard.includes('scheduleTask(target, start, end)') ||
      inboxCard.includes('planning.schedule(scheduler.expected, choice)'),
    'Inbox scheduling does not persist the selected time as a real scheduled task.',
  );
  assert.equal(
    inboxCard.includes('if (!slot)') && inboxCard.includes('moveToday(taskId)'),
    false,
    'Inbox Schedule still falls back to Today when no suggestion exists.',
  );

  console.log('✓ small real topics remain schedulable');
  console.log('✓ Today keeps capacity available without making it the primary hierarchy');
  console.log('✓ Today choices meet the 44-point touch target');
  console.log('✓ Today layout is responsive and plan-card motion respects accessibility');
  console.log('✓ Not now animates to the next recommendation or a calm fallback and remains undoable');
  console.log('✓ unscheduled work opens a real scheduling chooser and never auto-falls back to Today');
}

main();
