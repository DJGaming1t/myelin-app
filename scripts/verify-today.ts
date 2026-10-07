/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { shortSession } from '../src/features/today/short-session';
import { createEmptyWorkspace, Topic } from '../src/data/schema';
import { createStudyTask } from '../src/features/planning/task-engine';
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

  const autopilotToday = createEmptyWorkspace(now - DAY);
  autopilotToday.settings.dailyMinutes = 60;
  autopilotToday.settings.focusMinutes = 45;
  autopilotToday.settings.breakMinutes = 10;
  autopilotToday.topics.push(
    topic('far_exam', 'Far exam topic', 'Mathematics', {
      priority: 1,
      status: 'learning',
      estimate: 90,
    }),
    topic('generic_high', 'Generic high priority', 'Physics', {
      priority: 3,
      status: 'learning',
      estimate: 45,
    }),
  );
  autopilotToday.exams.push({
    id: 'far_exam_id',
    name: 'Term exam',
    date: now + 60 * DAY,
    subjects: [],
    scope: 'topics',
    topicIds: ['far_exam'],
  });

  const autopilotPlan = buildTodayPlan(autopilotToday, now);
  const autopilotBlock = autopilotPlan.blocks.find(
    (block) => block.topicId === 'far_exam',
  );
  assert.ok(
    autopilotBlock,
    'Today should surface a topic that Exam Autopilot actually allocated for today.',
  );
  assert.ok(
    autopilotBlock?.reasons.some((reason) => /Autopilot planned/i.test(reason)),
    'Autopilot-backed Today work should explain that it came from the capacity plan.',
  );
  assert.equal(
    autopilotPlan.nextBlock?.topicId,
    'far_exam',
    'An actual Autopilot block should outrank unrelated generic study when no harder deadline intervenes.',
  );
  assert.equal(
    autopilotToday.tasks.length,
    0,
    'Making an Autopilot block actionable must not create synthetic task records.',
  );

  const linkedAutopilot = createEmptyWorkspace(now - DAY);
  linkedAutopilot.settings.dailyMinutes = 60;
  linkedAutopilot.settings.focusMinutes = 45;
  const linkedTopic = topic('linked_exam_topic', 'Linked exam topic', 'Science', {
    priority: 1,
    estimate: 90,
  });
  linkedAutopilot.topics.push(linkedTopic);
  linkedAutopilot.exams.push({
    id: 'linked_exam',
    name: 'Science exam',
    date: now + 45 * DAY,
    subjects: [],
    scope: 'topics',
    topicIds: [linkedTopic.id],
  });
  const linkedTask = createStudyTask({
    title: 'Practice linked exam topic',
    subject: 'Science',
    topicId: linkedTopic.id,
    estimatedMinutes: 45,
    planState: 'today',
    now,
  });
  linkedAutopilot.tasks.push(linkedTask);

  const linkedPlan = buildTodayPlan(linkedAutopilot, now);
  assert.equal(
    linkedPlan.nextBlock?.source,
    'task',
    'A concrete linked task should remain the actionable surface instead of duplicating it with a topic block.',
  );
  assert.equal(linkedPlan.nextBlock?.taskId, linkedTask.id);
  assert.ok(
    linkedPlan.nextBlock?.reasons.some((reason) => /Autopilot planned/i.test(reason)),
    'Linked concrete work should inherit Autopilot priority without creating a duplicate topic recommendation.',
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

  const feedbackAdaptive = createEmptyWorkspace(now - DAY);
  feedbackAdaptive.settings.dailyMinutes = 90;
  feedbackAdaptive.settings.focusMinutes = 45;
  feedbackAdaptive.settings.breakMinutes = 10;
  feedbackAdaptive.topics.push(
    topic('feedback_hard', 'Hard feedback topic', 'Mathematics', {
      priority: 1,
      status: 'learning',
      estimate: 90,
    }),
    topic('feedback_generic', 'Generic high priority', 'Physics', {
      priority: 3,
      status: 'learning',
      estimate: 90,
    }),
  );
  feedbackAdaptive.history.push(
    {
      id: 'feedback_focus',
      topicId: 'feedback_hard',
      at: now - DAY - 2 * 60 * 60 * 1000,
      kind: 'study',
      minutes: 40,
      grade: 0,
      effort: 5,
      prompt: '',
      response: '',
      confidence: 'partial',
      plannedMinutes: 30,
    },
    {
      id: 'feedback_recall',
      topicId: 'feedback_hard',
      at: now - DAY - 60 * 60 * 1000,
      kind: 'review',
      minutes: 3,
      grade: 1,
      effort: 3,
      prompt: 'Recall',
      response: 'Missed',
      confidence: 'unsure',
    },
  );

  const feedbackPlan = buildTodayPlan(feedbackAdaptive, now);
  assert.equal(
    feedbackPlan.nextBlock?.topicId,
    'feedback_hard',
    'Repeated difficult focus + weak recall should raise this topic above generic priority alone.',
  );
  assert.ok(
    (feedbackPlan.nextBlock?.minutes ?? 45) < 45,
    'A topic repeatedly experienced as difficult should get a shorter next focus block.',
  );
  assert.ok(
    feedbackPlan.nextBlock?.reasons.some((reason) => /demanding|reinforcement/i.test(reason)),
    'The adapted Today recommendation should explain the feedback signal.',
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

  const reviewMileage = createEmptyWorkspace(now - DAY);
  reviewMileage.settings.dailyMinutes = 60;
  reviewMileage.topics.push(topic('reviewed_topic', 'Reviewed topic', 'Science'));
  reviewMileage.history.push({
    id: 'review_minutes',
    topicId: 'reviewed_topic',
    at: todayStart + 30 * 60 * 1000,
    kind: 'review',
    minutes: 7,
    grade: 3,
    effort: 3,
    prompt: 'Recall prompt',
    response: 'Recall answer',
    confidence: 'sure',
  });
  assert.equal(
    minutesUsedToday(reviewMileage, now),
    7,
    'Post-focus retrieval time must feed back into Today mileage.',
  );
  assert.equal(
    buildTodayPlan(reviewMileage, now).remainingBudgetMinutes,
    53,
    'Review history should reduce the remaining daily mileage pool.',
  );

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
  console.log('✓ Autopilot blocks flow into Today without synthetic tasks or duplicate linked work');
  console.log('✓ due-review priority');
  console.log('✓ meaningful priority instead of arbitrary subject alternation');
  console.log('✓ low-energy block shortening');
  console.log('✓ repeated effort + recall feedback raises topic priority while shortening its next block');
  console.log('✓ breaks fit inside the time budget');
  console.log('✓ already-used time reduces remaining capacity');
  console.log('✓ standalone task focus reduces remaining capacity');
  console.log('✓ post-focus retrieval minutes feed back into the same Today mileage pool');
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

  const todayScreen = read('app/(app)/today/index.tsx');
  const recommendationMotion = read('src/features/today/useRecommendationMotion.ts');
  const planCard = read('src/features/today/PlanBlockCard.tsx');
  const springPressable = read('src/components/motion/SpringPressable.tsx');
  const inboxCard = read('src/features/planning/StudyInboxCard.tsx');
  assert.ok(todayScreen.includes('min available'), 'Today does not expose remaining capacity when requested.');
  assert.ok(
    todayScreen.includes('Tasks + exam work share one mileage pool') &&
      todayScreen.includes('workloadLedger.deduplicatedMinutes'),
    'Today must expose that tasks and exam work share one deduplicated mileage ledger.',
  );
  assert.ok(
    todayScreen.includes('CAPACITY WARNING') &&
      todayScreen.includes('deadlineFeasibility.firstOverloadedDeadline'),
    'Today must surface the first impossible deadline from the unified workload ledger.',
  );
  assert.ok(
    todayScreen.includes('RECOVERED WINDOW') &&
      todayScreen.includes('buildAppliedReclaimedWindows') &&
      todayScreen.includes('timerRemainingMs'),
    'Today should surface the next recovered Autopilot block and keep it protection-aware while Focus is active.',
  );
  assert.ok(
    todayScreen.includes('Start recovered focus') &&
      todayScreen.includes('View in Day Map'),
    'Today should launch a ready recovered block directly but hand protected/future blocks to Day Map.',
  );
  assert.ok(
    todayScreen.includes('Reminder expired while MYELIN was opening') &&
      todayScreen.includes('The old {expiredReminderKind} timing is no longer trusted') &&
      todayScreen.includes('Current action ·'),
    'Today should explain that an expired cold-launch reminder is stale and show only the latest current action.',
  );
  assert.ok(
    todayScreen.includes('openExpiredReminderFallback') &&
      todayScreen.includes('dismissExpiredReminderFallback') &&
      todayScreen.includes("router.replace('/(app)/today')"),
    'The expired reminder fallback should offer a safe current action and a clean dismiss path that removes the fallback params.',
  );
  assert.ok(
    todayScreen.includes('Move or reduce') &&
      todayScreen.includes('Review tasks'),
    'Today capacity pressure must provide a concrete relief direction instead of a generic warning.',
  );
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
    inboxCard.includes('scheduleTask(target, start, end)'),
    'Inbox scheduling does not persist the selected time as a real scheduled task.',
  );
  const syllabusScreen = read('app/(app)/settings/ai-syllabus.tsx');
  assert.ok(
    syllabusScreen.includes('Start in Today') &&
      syllabusScreen.includes("router.replace('/(app)/today')"),
    'Applied syllabus Autopilot should hand the user directly into the normal Today flow.',
  );
  assert.equal(
    inboxCard.includes('if (!slot)') && inboxCard.includes('moveToday(taskId)'),
    false,
    'Inbox Schedule still falls back to Today when no suggestion exists.',
  );

  console.log('✓ small real topics remain schedulable');
  console.log('✓ Today keeps capacity available without making it the primary hierarchy');
  console.log('✓ Today surfaces the first deadline that cannot fit and a deterministic relief target');
  console.log('✓ Today surfaces the next recovered Autopilot block and respects live pre-miss protection');
  console.log('✓ expired cold-launch reminders fall back to Today’s latest safe action instead of stale notification timing');
  console.log('✓ Today choices meet the 44-point touch target');
  console.log('✓ Today layout is responsive and plan-card motion respects accessibility');
  console.log('✓ Not now animates to the next recommendation or a calm fallback and remains undoable');
  console.log('✓ unscheduled work opens a real scheduling chooser and never auto-falls back to Today');
  console.log('✓ applied syllabus Autopilot hands off into Today instead of creating a parallel timetable');
}

main();
