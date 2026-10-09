/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cloneWorkspace, createEmptyWorkspace } from '../src/data/schema';
import { createStudyTask, scheduleTask } from '../src/features/planning/task-engine';
import { planningModelContext, reviewAssistantPlanning, tryAssistantPlanningReply, tryAssistantTaskDeadlineReply } from '../src/features/assistant/assistant-planning-review';
import { tryAssistantPlanMathReply } from '../src/features/assistant/assistant-plan-math';
import { addLocalDays, startOfLocalDay } from '../src/features/planning/day-engine';

const at = (day: number, hour: number, minute = 0) => { const d = new Date(day); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime(); };
const now = new Date(2026, 9, 9, 12, 0).getTime();
const day = startOfLocalDay(now);
const ws = createEmptyWorkspace(now);
ws.settings.sleepEnabled = false;
ws.settings.dailyMinutes = 90;
ws.commitments.push({ id: 'school', title: 'School', kind: 'school', recurrenceDays: [1, 2, 3, 4, 5], startAt: 0, endAt: 0,
  startMinutes: 330, endMinutes: 840, createdAt: now, updatedAt: now });
const bio = createStudyTask({ title: 'Biology notebook', estimatedMinutes: 60, dueAt: at(day, 13), now });
scheduleTask(bio, at(day, 13, 30), at(day, 14, 30), now);
const math = createStudyTask({ title: 'Maths practice', estimatedMinutes: 50, planState: 'today', now });
const unknown = createStudyTask({ title: 'Unknown duration', planState: 'today', now });
const done = createStudyTask({ title: 'Completed task', planState: 'today', estimatedMinutes: 700, now });
done.status = 'completed';
ws.tasks.push(bio, math, unknown, done);
const before = cloneWorkspace(ws);
const r = reviewAssistantPlanning(ws, now);
assert.deepEqual(ws, before, 'Review must never mutate the workspace');
assert.equal(r.issues.find(i => i.code === 'commitment-overlap')?.minutes, 30);
assert.equal(r.issues.find(i => i.code === 'after-deadline')?.minutes, 90);
assert.equal(r.issues.find(i => i.code === 'deadline-capacity')?.minutes, 60, 'School blocks every minute before the13:00deadline');
assert.equal(r.issues.find(i => i.code === 'daily-overload')?.minutes, 30, '110 work +10break -90capacity');
assert.equal(r.unknownEstimates, 1);
assert.equal(r.completedTasksExcluded, 1);
assert(!r.issues.some(i => i.taskIds.includes(done.id)));
assert.match(tryAssistantPlanningReply('Review my plan', ws, now)!, /Nothing was changed/);
for (const request of ['Review my plan and delete Maths', 'Check my plan then move everything tomorrow', 'Add review practice tomorrow', 'My plan is to add Biology']) {
  assert.equal(tryAssistantPlanningReply(request, ws, now), null, 'Read-only matcher must not swallow another action');
}
const weekend = cloneWorkspace(ws);
weekend.tasks = [cloneWorkspace(ws).tasks[0]!];
scheduleTask(weekend.tasks[0]!, at(addLocalDays(day, 1), 10), at(addLocalDays(day, 1), 11), now);
assert(!reviewAssistantPlanning(weekend, now).issues.some(i => i.code === 'commitment-overlap'), 'No school on Saturday');
const skip = cloneWorkspace(ws); skip.commitments[0]!.skippedDates = ['2026-10-09'];
assert(!reviewAssistantPlanning(skip, now).issues.some(i => i.code === 'commitment-overlap'), 'Skipped occurrence must not block study');
const conflict = cloneWorkspace(ws);
const extra = createStudyTask({ title: 'English', estimatedMinutes: 30, now });
scheduleTask(extra, at(day, 14), at(day, 15), now); conflict.tasks.push(extra);
assert.equal(reviewAssistantPlanning(conflict, now).issues.find(i => i.code === 'task-overlap')?.minutes, 30);
const short = cloneWorkspace(ws); short.tasks[0]!.estimatedMinutes = 120;
assert.equal(reviewAssistantPlanning(short, now).issues.find(i => i.code === 'short-slot')?.minutes, 60);
const slept = createEmptyWorkspace(now);
const night = createStudyTask({ title: 'Late study', estimatedMinutes: 30, now });
scheduleTask(night, at(day, 23), at(day, 23, 30), now); slept.tasks.push(night);
assert.equal(reviewAssistantPlanning(slept, now).issues.find(i => i.code === 'sleep-overlap')?.minutes, 30);
const midnight = createEmptyWorkspace(now); midnight.settings.sleepEnabled = false;
midnight.commitments.push({ id: 'night', title: 'Overnight', kind: 'other', recurrenceDays: [5], startAt: 0, endAt: 0,
  startMinutes: 1380, endMinutes: 480, createdAt: now, updatedAt: now });
const early = createStudyTask({ title: 'Early study', estimatedMinutes: 30, now });
scheduleTask(early, at(addLocalDays(day, 1), 7), at(addLocalDays(day, 1), 7, 30), now); midnight.tasks.push(early);
assert.equal(reviewAssistantPlanning(midnight, now).issues.find(i => i.code === 'commitment-overlap')?.minutes, 30, 'Overnight recurrence carries to Saturday');
const bounds = cloneWorkspace(ws); bounds.tasks[0]!.notes = 'PRIVATE_NOTE';
const recorded = cloneWorkspace(ws);
recorded.history.push({ id: 'history', topicId: 'respiration', at: at(day, 10), kind: 'study', minutes: 30,
  grade: 2, effort: 3, prompt: 'PRIVATE_RESPONSE_PROMPT', response: 'PRIVATE_RESPONSE', confidence: 'partial' });
assert.equal(reviewAssistantPlanning(recorded, now).issues.find(i => i.code === 'daily-overload')?.minutes, 60,
  'Thirty minutes already studied must reduce the remaining daily budget');
bounds.topics.push({ id: 'respiration', name: 'Respiration', subject: 'Biology', createdAt: now, status: 'review', priority: 2,
  estimate: 30, notes: 'PRIVATE_TOPIC_NOTE', dueAt: now, intervalDays: 1, lastGrade: 1, lastReviewed: now - 86400000, snoozeUntil: 0, cards: [] });
const mistake = { id: 'due-mistake', topicId: 'respiration', cardId: null, prompt: 'PRIVATE_MISTAKE_PROMPT',
  detail: 'PRIVATE_MISTAKE_DETAIL', correction: 'PRIVATE_CORRECTION', reason: 'concept' as const,
  createdAt: now - 86400000, dueAt: now, resolvedAt: 0, wins: 0, lastWinDay: '', intervalDays: 1 };
bounds.mistakes.push(mistake, { ...mistake, id: 'resolved', resolvedAt: now - 1000 },
  { ...mistake, id: 'future', dueAt: now + 86400000 });
const mistakeBefore = cloneWorkspace(bounds);
const mistakeReview = reviewAssistantPlanning(bounds, now);
assert.equal(mistakeReview.dueMistakes, 1, 'Resolved and future mistakes must not appear as due');
assert.deepEqual(mistakeReview.dueMistakeTopics, ['Respiration']);
assert.match(tryAssistantPlanningReply('Review my plan', bounds, now)!, /1 saved mistake is due for review \(Respiration\)/);
assert.deepEqual(bounds, mistakeBefore, 'Review must not resolve or postpone saved mistakes');
const context = JSON.parse(planningModelContext(reviewAssistantPlanning(bounds, now)));
assert(context.checks.length <= 8);
assert(!JSON.stringify(context).includes('PRIVATE_'), 'Full notes, mistakes and student answers stay outside model context');
const empty = createEmptyWorkspace(now);
assert.match(tryAssistantPlanningReply('Check my schedule', empty, now)!, /Unrecorded commitments/);
const imminent = createEmptyWorkspace(now);
imminent.settings.sleepEnabled = false;
imminent.settings.dailyMinutes = 90;
const urgent = createStudyTask({ title: 'Unscheduled urgent work', estimatedMinutes: 60, dueAt: at(day, 12, 30), now });
imminent.tasks.push(urgent);
assert.equal(reviewAssistantPlanning(imminent, now).issues.find(i => i.code === 'deadline-capacity')?.minutes, 30,
  'A known60-minute task cannot fit into30minutes before its deadline even if unscheduled');
urgent.estimatedMinutes = 0;
assert(!reviewAssistantPlanning(imminent, now).issues.some(i => i.code === 'deadline-capacity'), 'Do not guess unknown duration');
urgent.estimatedMinutes = 60; urgent.dueAt = at(addLocalDays(day, 1), 9);
imminent.commitments = cloneWorkspace(ws).commitments;
imminent.commitments[0]!.recurrenceDays = [6];
const evening = at(day, 22);
imminent.settings.sleepEnabled = true;
assert.equal(reviewAssistantPlanning(imminent, evening).issues.find(i => i.code === 'deadline-capacity')?.minutes, 30,
  'Only30minutes remain tonight before sleep; school blocks the next morning until after the09:00deadline');
urgent.estimatedMinutes = 20;
assert(!reviewAssistantPlanning(imminent, evening).issues.some(i => i.code === 'deadline-capacity'),
  'Do not report individual deadline overload when the known work fits the optimistic bound');
urgent.postponedUntil = at(addLocalDays(day, 1), 10);
assert.equal(reviewAssistantPlanning(imminent, evening).issues.find(i => i.code === 'deadline-capacity')?.minutes, 20,
  'Postponing availability until after the deadline leaves no recorded capacity');

// These are generic, user-supplied arithmetic checks, NOT an evaluation of Qwen.
// A supported match is read-only; compound actions and ambiguous dates must fall through.
const mathCases: [string, RegExp][] = [
  ['I have 100 minutes free. I want 3 25-minute study blocks and 2 10-minute breaks. Does it fit?', /95 minutes.*5 minutes left/s],
  ['I have 85 minutes free, I want 2 40-minute study blocks and 1 12-minute break. Does it fit?', /92 minutes.*short by 7 minutes/s],
  ['Maths is 08:35-09:20 and English is 09:05-09:40 on the same day. What is the overlap?', /09:05 to 09:20 for 15 minutes/],
  ['Maths is 08:35-09:20 and English is 09:20-09:40 on the same day. What is the overlap?', /do not overlap/],
  ['My assignment is due at 14:30 and I plan to finish at 15:10 on the same day. Am I late?', /40 minutes after/],
  ['My homework is due at 18:00 and I expect to finish it at 17:25 on the same day. Is that on time?', /35 minutes before/],
];
for (const [query, expected] of mathCases) {
  const reply = tryAssistantPlanMathReply(query);
  assert.match(reply!, expected, query);
  assert.match(reply!, /Nothing was changed/);
}
for (const query of [
  'I have 100 minutes free. I want 3 25-minute study blocks and 2 10-minute breaks. Does it fit? Also delete Maths',
  'Maths is 08:35-09:20 and English is 09:05-09:40. What is the overlap?',
  'Maths is 08:35-08:20 and English is 08:05-08:40 on the same day. What is the overlap?',
  'Maths is 24:35-25:20 and English is 09:05-09:40 on the same day. What is the overlap?',
  'My task is due tomorrow at 14:30 and I plan to finish at 15:10 on the same day. Am I late?',
  'My assignment is due at 14:30 and I plan to finish at 15:10 on the same day. Am I late? Move it.',
  'I have 0 minutes free. I want 3 25-minute study blocks and 2 10-minute breaks. Does it fit?',
  'I have 100 minutes free. I want 3 25-minute study blocks and 2 0-minute breaks. Does it fit?',
]) assert.equal(tryAssistantPlanMathReply(query), null, 'Unsupported or compound requests must not be partially answered: ' + query);

// Grounded saved-task questions use the existing planner's actual constraints.
// They never mutate task state, invent availability, or guarantee that several tasks fit.
const safeBefore = cloneWorkspace(ws);
const exactBio = tryAssistantTaskDeadlineReply('Can I finish "Biology notebook" before its deadline?', ws, now)!;
assert.match(exactBio, /60 estimated min left/);
assert.match(exactBio, /at most 0 min/);
assert.match(exactBio, /at least 60 min short/);
assert.match(exactBio, /Other recorded conflicts/);
assert.match(exactBio, /90 min after its recorded deadline/);
assert.deepEqual(ws, safeBefore, 'Read-only task check cannot update workspace');

const targetTask = createEmptyWorkspace(now);
targetTask.settings.sleepEnabled = false;
targetTask.settings.dailyMinutes = 90;
const deadlineTask = createStudyTask({ title: 'Chemistry practical notebook', estimatedMinutes: 60, dueAt: at(day, 12, 30), now });
targetTask.tasks.push(deadlineTask);
assert.match(tryAssistantTaskDeadlineReply('Can I finish my Chemistry practical notebook before its deadline?', targetTask, now)!, /at most 30 min.*at least 30 min short/s);
deadlineTask.estimatedMinutes = 20;
const optimistic = tryAssistantTaskDeadlineReply('Will I finish chemistry practical NOTEBOOK by the due date?', targetTask, now)!;
assert.match(optimistic, /at most 30 min/);
assert.match(optimistic, /might fit/);
assert.match(optimistic, /does NOT guarantee/);
assert.doesNotMatch(optimistic, /will definitely fit/i);

const used = cloneWorkspace(targetTask);
used.history.push({ ...recorded.history[0]!, at: at(day, 11), minutes: 85 });
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', used, now)!, /at most 5 min.*at least 15 min short/s);
const postponed = cloneWorkspace(targetTask);
postponed.tasks[0]!.postponedUntil = at(day, 13);
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', postponed, now)!, /at most 0 min.*at least 20 min short/s);

const unknownTitle = tryAssistantTaskDeadlineReply('Can I finish History essay before its deadline?', targetTask, now)!;
assert.match(unknownTitle, /couldn't find a recorded task/);
assert.match(unknownTitle, /Nothing was changed/);
const missingDue = cloneWorkspace(targetTask);
missingDue.tasks[0]!.dueAt = 0;
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', missingDue, now)!, /no recorded deadline/);
const missingEstimate = cloneWorkspace(targetTask);
missingEstimate.tasks[0]!.estimatedMinutes = 0;
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', missingEstimate, now)!, /no estimated duration/);
const completed = cloneWorkspace(targetTask);
completed.tasks[0]!.status = 'completed';
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', completed, now)!, /already marked completed/);
const overdue = cloneWorkspace(targetTask);
overdue.tasks[0]!.dueAt = now - 1000;
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', overdue, now)!, /has passed/);
const beyondHorizon = cloneWorkspace(targetTask);
beyondHorizon.tasks[0]!.dueAt = at(addLocalDays(day, 20), 15);
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', beyondHorizon, now)!, /beyond the next seven local dates/);
const duplicates = cloneWorkspace(targetTask);
duplicates.tasks.push(createStudyTask({ title: 'Chemistry practical notebook', estimatedMinutes: 30, now }));
assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry practical notebook before its deadline?', duplicates, now)!, /More than one task/);
assert.deepEqual(targetTask.tasks.length, 1);

assert.match(tryAssistantTaskDeadlineReply('Can I finish Chemistry before its deadline?', targetTask, now)!, /couldn't find a recorded task/);
for (const query of [
  'Can I finish Chemistry practical notebook before its deadline and delete it?',
  'Can I finish Biology notebook tomorrow?',
  'Review my tasks and can I finish Chemistry practical notebook before its deadline?',
  'Can I finish Chemistry practical notebook before its deadline? Also add Maths',
  'Can I finish a new task before its deadline? Also delete my existing work',
]) assert.equal(tryAssistantTaskDeadlineReply(query, targetTask, now), null,
  'Unsupported request must not be partially interpreted: ' + query);

const screen = fs.readFileSync('app/(app)/settings/ai-assistant.tsx', 'utf8');
assert.match(screen, /tryAssistantPlanningReply\(text, workspace, now\)/);
assert.match(screen, /tryAssistantPlanMathReply\(text\)/);
assert.match(screen, /tryAssistantTaskDeadlineReply\(text, workspace, now\)/);
console.log('Planning review: real task deadlines,30min school conflict,break budget,weekends,skips,overnight,sleep,read-only matching and bounded context passed.');
