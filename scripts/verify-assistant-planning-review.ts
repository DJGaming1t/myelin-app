/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cloneWorkspace, createEmptyWorkspace } from '../src/data/schema';
import { createStudyTask, scheduleTask } from '../src/features/planning/task-engine';
import { planningModelContext, reviewAssistantPlanning, tryAssistantPlanningReply } from '../src/features/assistant/assistant-planning-review';
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
const screen = fs.readFileSync('app/(app)/settings/ai-assistant.tsx', 'utf8');
assert.match(screen, /tryAssistantPlanningReply\(text, workspace, now\)/);
console.log('Planning review: real task deadlines,30min school conflict,break budget,weekends,skips,overnight,sleep,read-only matching and bounded context passed.');
