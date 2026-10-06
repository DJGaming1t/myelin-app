/// <reference types="node" />
import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createTopic, createQuestion } from '../src/features/topics/topic-operations';
import { createStudyTask, postponeTask } from '../src/features/planning/task-engine';
import { applyReviewGrade, scheduleReview, buildReviewQueue } from '../src/features/review/review-engine';
import { DAY_MS, nextMemory, retrievability } from '../src/features/adaptive/memory-engine';
import { sleepingAt, sleepWindows, parseClock } from '../src/features/adaptive/sleep-engine';
import { neuralEvidence, learningInsights } from '../src/features/adaptive/insight-engine';
import { launchVariant, outcomeSnapshot, recordFocusOutcome } from '../src/features/adaptive/outcome-engine';
import { buildTopicFeedbackProfile } from '../src/features/adaptive/topic-feedback';
import { createFocusSession } from '../src/features/focus/focus-engine';
import { freeStudyWindows, suggestTaskSlots, rebuildRemainingDay } from '../src/features/planning/day-engine';
import { buildTodayPlan } from '../src/features/today/planner';
import { buildReminderPlan, defaultReminderSettings, isInQuietHours } from '../src/features/notifications/reminder-engine';
import { mergeWorkspaces, serializeNativeBackup, parseImportJson } from '../src/features/transfer/backup-engine';
import { buildProgressSnapshot } from '../src/features/progress/progress-engine';

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const now = at(4), w = createEmptyWorkspace(now);
const t = createTopic({ name: 'Cell division', subject: 'Biology', status: 'review', priority: 2, estimate: 25, notes: '' }, at(1), 'topic');
const card = createQuestion({ prompt: 'Mitosis?', answer: 'Two identical cells', hint: '', confusionGroup: 'Cell division' }, now, 'mitosis');
t.cards = [card]; w.topics = [t];
const first = scheduleReview(card, 'good', now);
assert.equal(first.memory.stability, 2.3065);
assert.equal(first.intervalDays, 2);
applyReviewGrade(t, card, 'good', now);
assert.ok(Math.abs(retrievability(card, now + card.memory!.stability * DAY_MS)! - 0.9) < 1e-12);
assert.ok(retrievability(card, now + 5 * DAY_MS)! < retrievability(card, now + DAY_MS)!);
assert.ok(scheduleReview(card, 'good', now + 5 * DAY_MS).intervalDays > scheduleReview(card, 'good', now + DAY_MS).intervalDays);
assert.ok(scheduleReview(card, 'again', now + 5 * DAY_MS).memory.stability <= card.memory!.stability);
assert.equal(scheduleReview(card, 'again', now).dueAt, now + 600000);
assert.ok(scheduleReview(card, 'good', now + 5 * DAY_MS, { hintUsed: true }).intervalDays < scheduleReview(card, 'good', now + 5 * DAY_MS).intervalDays);
for (const gap of [0, 0.01, 1, 3650, 10000]) for (const grade of [1, 2, 3] as const) {
  const m = nextMemory(card, grade, now + gap * DAY_MS);
  assert.ok(Number.isFinite(m.stability) && m.stability >= 0.01 && m.stability <= 3650);
  assert.ok(m.difficulty >= 1 && m.difficulty <= 10);
}
const legacy = { ...card }; delete legacy.memory;
assert.equal(migrateAndValidateWorkspace({ ...w, topics: [{ ...t, cards: [legacy] }] }).topics[0].cards[0].dueAt, legacy.dueAt, 'Migration preserves scheduled due dates.');
console.log('✓ per-question memory reference values, elapsed-time adaptation, hints, failure and bounds');

const mate = createQuestion({ prompt: 'Meiosis?', answer: 'Four haploid cells', hint: '', confusionGroup: 'cell division' }, now, 'meiosis');
const other = createQuestion({ prompt: 'Unrelated?', answer: '', hint: '' }, now, 'other');
card.dueAt = now; t.cards.push(other, mate);
const queue = buildReviewQueue(w, { now: now + 4 * DAY_MS });
assert.deepEqual(queue.slice(0, 2).map(q => q.cardId), ['mitosis', 'meiosis']);
assert.deepEqual(buildReviewQueue(w, { now, cardIds: ['meiosis'], includeNotDue: true }).map(q => q.cardId), ['meiosis']);
console.log('✓ explicit confusion groups form contrast pairs and targeted insights constrain the queue');

const task = createStudyTask({ title: 'Assignment', estimatedMinutes: 90, now, planState: 'today' });
w.tasks = [task]; postponeTask(task, at(5), now); postponeTask(task, at(5), now + 1);
assert.equal(task.postponements, 2);
assert.equal(buildTodayPlan(w, now).blocks.some(b => b.taskId === task.id), false);
task.postponedUntil = 0; task.planState = 'today';
assert.ok(buildTodayPlan(w, now).blocks.find(b => b.taskId === task.id)?.reasons.includes('try a five-minute first step'));
assert.equal(buildTodayPlan(w, at(4, 23)).blocks.length, 0);
assert.equal(buildTodayPlan(w, at(4, 5)).blocks.length, 0);
assert.ok(sleepingAt(w.settings, at(4, 23)));
assert.equal(sleepingAt(w.settings, at(4, 7)), null);
assert.equal(parseClock('24:00'), null); assert.equal(parseClock('07:15'), 435);
assert.ok(freeStudyWindows(w, now).every(window => sleepWindows(w.settings, now).every(s => window.end <= s.start || window.start >= s.end)));
const nextSlot = suggestTaskSlots(w, task, at(4, 22, 25), 1)[0];
assert.ok(nextSlot.start >= at(5, 7));
assert.ok(nextSlot.minutes <= w.settings.focusMinutes);
const many = createEmptyWorkspace(now); many.settings.dailyMinutes = 30;
many.tasks = [0, 1, 2].map(i => ({ ...createStudyTask({ title: `Task ${i}`, estimatedMinutes: 25, planState: 'today', now }), id: `task_${i}` }));
const rebuilt = rebuildRemainingDay(many, now);
const perDay = new Map<string, number>();
for (const move of rebuilt.moves) { const key = new Date(move.start).toDateString(); perDay.set(key, (perDay.get(key) ?? 0) + (move.end - move.start) / 60000 + many.settings.breakMinutes); }
assert.ok([...perDay.values()].every(m => m <= many.settings.dailyMinutes));
console.log('✓ avoidance count, no late-night catch-up, calendar sleep bounds and rescheduling capacity');

const focus = createFocusSession({ taskId: task.id, topicName: task.title, subject: '', plannedMinutes: 25, breakMinutes: 5, launchMode: 'five-minute', tinyStep: '', now, id: 'focus_v2' });
w.settings.launchExperiment = true;
task.launchTrial = { variant: launchVariant(task, true), offeredAt: now - 1000, startedAt: 0 };
recordFocusOutcome(w, focus, 'started'); recordFocusOutcome(w, focus, 'started');
assert.equal(w.focusOutcomes!.length, 1); assert.equal(task.launchTrial.startedAt, now);
recordFocusOutcome(w, focus, 'finished', 5, now + 300000); recordFocusOutcome(w, focus, 'finished', 5, now + 300000);
assert.equal(w.focusOutcomes!.length, 1);
assert.equal(buildProgressSnapshot(w, now + 300000).study.todayMinutes, 5);
const updated = { ...focus, id: 'focus_abandoned' };
recordFocusOutcome(w, updated, 'started'); recordFocusOutcome(w, updated, 'abandoned', 0, now + 300000);
assert.equal(outcomeSnapshot(w, now + 300000).fullBlocks, 1);
assert.equal(outcomeSnapshot(w, now + 2 * DAY_MS).trials.reduce((sum, trial) => sum + trial.starts, 0), 1);
assert.equal(outcomeSnapshot(w, now + 300000).trials.reduce((sum, trial) => sum + trial.offers, 0), 0, 'Unmatured offers are excluded.');
console.log('✓ idempotent starts/finishes, standalone focus in Progress and honest experiment windows');

w.history = [
  { id: 'h1', topicId: t.id, cardId: card.id, at: now, kind: 'review', minutes: 1, grade: 1, effort: 3, prompt: '', response: '', confidence: 'sure', elapsedDays: 2, predictedRecall: 0.8 },
  { id: 'h2', topicId: t.id, cardId: mate.id, at: now, kind: 'review', minutes: 1, grade: 3, effort: 3, prompt: '', response: '', confidence: 'unsure', elapsedDays: 2 },
  { id: 'h3', topicId: t.id, cardId: mate.id, at: now + 1000, kind: 'review', minutes: 1, grade: 3, effort: 3, prompt: '', response: '', confidence: 'unsure', elapsedDays: 0 },
];
assert.equal(neuralEvidence(w).total, 1, 'Same-day repeats cannot farm connections.');
assert.deepEqual(learningInsights(w, now + 1000)[0].cardIds, [card.id]);
assert.equal(outcomeSnapshot(w, now + 1000).retentionSamples, 2);
assert.equal(outcomeSnapshot(w, now + 1000).recalled, 1);
const before = neuralEvidence(w).total; card.dueAt = at(1); card.memory!.stability = 0.1;
assert.equal(neuralEvidence(w).total, before, 'Due reviews do not erase earned accomplishments.');
const backup = parseImportJson(serializeNativeBackup(w, now), now).workspace;
assert.deepEqual(backup.topics[0].cards[0].memory, card.memory);
assert.equal(backup.topics[0].cards[1].confusionGroup, '');
assert.equal(backup.topics[0].cards[2].confusionGroup, 'cell division');
assert.equal(backup.tasks[0].postponements, 2);
assert.equal(backup.focusOutcomes!.length, 2);
assert.equal(mergeWorkspaces(backup, backup).workspace.focusOutcomes!.length, 2);
assert.throws(() => migrateAndValidateWorkspace({ ...w, topics: [{ ...t, cards: [{ ...card, memory: { ...card.memory, stability: NaN } }] }] }));
console.log('✓ confidence actions, delayed retention, permanent earned evidence, backup/import and invalid data rejection');

const adaptiveTopicWorkspace = createEmptyWorkspace(now);
const adaptiveTopic = createTopic(
  { name: 'Quadratics', subject: 'Mathematics', status: 'learning', priority: 2, estimate: 60, notes: '' },
  now,
  'adaptive-topic',
);
adaptiveTopicWorkspace.topics = [adaptiveTopic];
adaptiveTopicWorkspace.history = [
  {
    id: 'single-bad-review',
    topicId: adaptiveTopic.id,
    at: now - 1000,
    kind: 'review',
    minutes: 2,
    grade: 1,
    effort: 3,
    prompt: 'x',
    response: 'y',
    confidence: 'unsure',
  },
];
const singleBad = buildTopicFeedbackProfile(adaptiveTopicWorkspace, adaptiveTopic.id, now);
assert.equal(singleBad.evidenceCount, 1);
assert.equal(singleBad.priorityBoost, 0, 'One bad result must not overreact the planner.');
assert.equal(singleBad.blockMultiplier, 1);

adaptiveTopicWorkspace.history.unshift({
  id: 'hard-focus',
  topicId: adaptiveTopic.id,
  at: now - 60_000,
  kind: 'study',
  minutes: 35,
  grade: 0,
  effort: 5,
  prompt: '',
  response: '',
  confidence: 'partial',
  plannedMinutes: 25,
});
const adapted = buildTopicFeedbackProfile(adaptiveTopicWorkspace, adaptiveTopic.id, now);
assert.ok(adapted.priorityBoost > 0);
assert.ok(adapted.blockMultiplier < 1, 'Repeated difficulty should shorten the next focus block.');
assert.ok(adapted.workloadMultiplier > 1, 'Repeated difficulty should increase remaining workload.');
assert.equal(adapted.difficulty, 3);
assert.ok(adapted.reasons.includes('recent focus felt demanding'));
assert.ok(adapted.reasons.includes('recent recall needs reinforcement'));
console.log('✓ topic feedback waits for evidence, then adapts priority, block size and workload');

const notices = createEmptyWorkspace(now); notices.topics = [structuredClone(t)]; notices.topics[0].cards[0].dueAt = at(1);
notices.focusOutcomes = [1, 2, 3].map(day => ({ id: `sample_${day}`, startedAt: at(day, 17), endedAt: at(day, 17, 25), status: 'finished' as const, minutes: 25, plannedMinutes: 25, launchMode: 'full' as const, taskOnly: true, overdue: false }));
notices.commitments = [{ id: 'busy', title: 'Class', kind: 'school', startAt: at(4, 16), endAt: at(4, 18), startMinutes: 960, endMinutes: 1080, recurrenceDays: [0,1,2,3,4,5,6], createdAt: now, updatedAt: now }];
const prefs = { ...defaultReminderSettings(), enabled: true };
const reminders = buildReminderPlan(notices, prefs, now);
assert.equal(new Date(reminders[0].at).getHours(), 18, 'Learned 17:00 time moves past class.');
assert.ok(reminders.every(r => !sleepingAt(notices.settings, r.at) && !isInQuietHours(r.at, prefs.quietStartMinutes, prefs.quietEndMinutes)));
notices.history = w.history;
assert.ok(buildReminderPlan(notices, prefs, now + 1000).every(r => new Date(r.at).getDate() !== 4), 'No review nudge after reviewing today.');
console.log('✓ learned notification timing, commitment/sleep/quiet-hour avoidance and behavior-based suppression');
