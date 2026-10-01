/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createEmptyWorkspace, Topic } from '../src/data/schema';
import {
  buildTodayPlan,
  minutesUsedToday,
  nextLocalDayStart,
  startOfLocalDay,
} from '../src/features/today/planner';

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
    'chem_a',
    'A useful different subject should beat immediate same-subject repetition.',
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
  console.log('✓ subject interleaving');
  console.log('✓ low-energy block shortening');
  console.log('✓ breaks fit inside the time budget');
  console.log('✓ already-used time reduces remaining capacity');
  console.log('✓ snoozed topics stay out');
  console.log('✓ exhausted budget adds no fake work');
  const todayScreen = read('app/(app)/today/index.tsx');
  const planCard = read('src/features/today/PlanBlockCard.tsx');
  const springPressable = read('src/components/motion/SpringPressable.tsx');
  assert.ok(todayScreen.includes('min left today'), 'Today does not show remaining daily capacity.');
  assert.ok(todayScreen.includes('capacityTrack'), 'Today capacity progress indicator is missing.');
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
  assert.ok(todayScreen.includes('deferForToday(next)'), 'Today is missing the defer-for-today action.');
  assert.ok(todayScreen.includes('undoDefer'), 'Today defer action is missing undo.');
  assert.ok(todayScreen.includes('nextLocalDayStart(Date.now())'), 'Today does not defer until the next local day.');

  console.log('✓ small real topics remain schedulable');
  console.log('✓ Today shows used/remaining capacity clearly');
  console.log('✓ Today choices meet the 44-point touch target');
  console.log('✓ Today layout is responsive and plan-card motion respects accessibility');
  console.log('✓ recommended blocks can be deferred for today and undone');
}

main();
