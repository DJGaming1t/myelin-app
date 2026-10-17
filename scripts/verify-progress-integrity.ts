/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEmptyWorkspace, FocusOutcome, StudySession, WorkspaceState } from '../src/data/schema';
import { createTopic, createQuestion } from '../src/features/topics/topic-operations';
import { buildProgressSnapshot, buildDailyStudyHistory, buildConfidenceCalibration, buildTimeCalibration, buildTopicTrends } from '../src/features/progress/progress-engine';
import { outcomeSnapshot } from '../src/features/adaptive/outcome-engine';
import { minutesUsedToday } from '../src/features/today/planner';
import { localDateKey } from '../src/features/planning/commitment-dates';
const DAY = 86400000, now = new Date(2026, 10, 2, 12).getTime();
const local = (offset: number, hour = 0) => new Date(2026, 10, 2 + offset, hour).getTime();
function fixture(): WorkspaceState {
  const w = createEmptyWorkspace(now);
  w.topics = ['a', 'b'].map(id => {
    const t = createTopic({ name: id, subject: 'Science', status: 'review', priority: 2, estimate: 25, notes: '' }, now, id);
    t.cards = [createQuestion({ prompt: 'Question', answer: 'Answer', hint: '' }, now, 'c-' + id)]; return t;
  }); return w;
}
function study(id: string, at = now, extra: Partial<StudySession> = {}): StudySession {
  return { id, topicId: 'a', at, kind: 'study', minutes: 10, grade: 0, effort: 3, prompt: '', response: '', confidence: 'sure', plannedMinutes: 10, ...extra };
}
function review(id: string, at = now, extra: Partial<StudySession> = {}): StudySession {
  return study(id, at, { kind: 'review', grade: 3, cardId: 'c-a', reviewAttemptId: id, elapsedDays: 2, minutes: 1, plannedMinutes: undefined, ...extra });
}
function outcome(id: string, extra: Partial<FocusOutcome> = {}): FocusOutcome {
  return { id, startedAt: now - 600000, endedAt: now, status: 'finished', plannedMinutes: 10, minutes: 10, launchMode: 'full', taskOnly: true, overdue: false, ...extra };
}
const future = fixture(); future.history = [study('now'), review('now-review'), study('future', now + 1), review('future-review', now + 3600000)];
future.focusOutcomes = [outcome('future-outcome', { endedAt: now + 1 })];
const snap = buildProgressSnapshot(future, now);
assert.equal(snap.study.todayMinutes, 11); assert.equal(snap.study.last7Minutes, 11); assert.equal(snap.study.last30Minutes, 11);
assert.equal(snap.reviews.total, 1); assert.equal(snap.reviews.last30, 1); assert.equal(snap.confidence.sampleSize, 1); assert.equal(snap.timing.sampleSize, 1);
assert.equal(buildDailyStudyHistory(future, now).at(-1)?.minutes, 11);
assert.equal(buildTopicTrends(future, now)[0].recentMinutes, 11);
assert.equal(buildConfidenceCalibration(future, now).sampleSize, 1); assert.equal(buildTimeCalibration(future, now).sampleSize, 1);
assert.equal(outcomeSnapshot(future, now).finished, 0, 'Future finish cannot be announced as completed');
assert.equal(outcomeSnapshot(future, now).starts, 1, 'An already recorded start remains visible');
const boundaries = fixture();
boundaries.history = [study('recent-start', local(-6)), study('previous-end', local(-6) - 1), study('previous-start', local(-13)), study('outside-previous', local(-13) - 1), study('thirty-start', local(-29)), study('outside-thirty', local(-29) - 1), study('midnight', local(0)), study('right-now'), review('review-boundary', local(-29)), review('review-outside', local(-29) - 1)];
const bs = buildProgressSnapshot(boundaries, now);
assert.equal(bs.study.todayMinutes, 20); assert.equal(bs.study.last7Minutes, 30); assert.equal(bs.study.previous7Minutes, 20);
assert.equal(bs.study.last30Minutes, 71); assert.equal(bs.reviews.last30, 1);
assert.equal(bs.topics[0].recentMinutes, 30); assert.equal(bs.topics[0].previousMinutes, 20);
const dates = fixture(); dates.history = [study('before-midnight', local(0) - 1), study('at-midnight', local(0)), study('future-today', now + 1)];
const daily = buildDailyStudyHistory(dates, now, 2);
assert.deepEqual(daily.map(p => [p.day, p.minutes]), [[localDateKey(local(-1)), 10], [localDateKey(local(0)), 10]]);
// Requery the same immutable data in another timezone, including the 25h DST day.
const originalTZ = process.env.TZ;
try {
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
    process.env.TZ = tz;
    const d = fixture(), clock = new Date(2026, 10, 2, 12).getTime(), midnight = new Date(2026, 10, 2).getTime();
    d.history = [study('one', midnight - 1), study('two', midnight)];
    assert.deepEqual(buildDailyStudyHistory(d, clock, 2).map(p => p.minutes), [10, 10]);
  }
} finally { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; }
console.log('✓ Supplied now bounds current-day totals/calibration/trends; previous-week/30-day windows and local dates/DST stay intact');
const identity = fixture();
identity.history = [review('legacy', now, { cardId: undefined }), review('valid'), review('wrong-owner', now, { topicId: 'b' }), review('missing-card', now, { cardId: 'deleted' }), review('missing-topic', now, { topicId: 'deleted', cardId: undefined })];
let ids = buildProgressSnapshot(identity, now);
assert.equal(ids.reviews.total, 2); assert.equal(ids.confidence.sampleSize, 2); assert.equal(ids.study.todayMinutes, 2); assert.equal(ids.topics[0].recentReviews, 2);
assert.equal(outcomeSnapshot(identity, now).retentionSamples, 1, 'Legacy topic reviews count globally but do not invent per-question retention');
identity.topics[1].cards[0].id = 'c-a'; identity.history = [review('a'), review('b', now, { topicId: 'b' })];
assert.equal(buildProgressSnapshot(identity, now).reviews.total, 2);
assert.equal(outcomeSnapshot(identity, now).retentionSamples, 2, 'Explicit topics disambiguate reused question IDs for retention');
identity.topics[0].cards.push({ ...identity.topics[0].cards[0] });
assert.equal(outcomeSnapshot(identity, now).retentionSamples, 1, 'Unresolvable duplicates inside a topic are excluded');
console.log('✓ Review attribution preserves topic-only/legacy evidence, rejects mismatches/orphans and disambiguates cross-topic duplicate card IDs');
const focus = fixture(), o = outcome('focus');
const matching = study('session_focus', now, { startedAt: o.startedAt, endedAt: o.endedAt, launchMode: o.launchMode });
focus.focusOutcomes = [o]; focus.history = [matching];
assert.equal(buildProgressSnapshot(focus, now).study.todayMinutes, 10); assert.equal(buildTimeCalibration(focus, now).sampleSize, 1);
for (const extra of [{ kind: 'review', grade: 3 }, { startedAt: o.startedAt - 1 }, { endedAt: o.endedAt - 1 }, { at: now - 1 }, { minutes: 5 }, { plannedMinutes: 20 }, { launchMode: 'five-minute' }, { startedAt: undefined }, { topicId: 'missing' }]) {
  focus.history = [{ ...matching, ...extra } as StudySession];
  assert.ok(buildProgressSnapshot(focus, now).study.todayMinutes > 10 || extra.topicId === 'missing', JSON.stringify(extra));
  if (extra.topicId === 'missing') assert.equal(buildProgressSnapshot(focus, now).study.todayMinutes, 10, 'Invalid history cannot hide valid standalone activity');
}
focus.history = [study('different-session')]; assert.equal(buildProgressSnapshot(focus, now).study.todayMinutes, 20);
focus.history = [matching]; focus.focusOutcomes = [{ ...o, taskOnly: false }];
assert.equal(buildProgressSnapshot(focus, now).study.todayMinutes, 10, 'Topic-linked Focus keeps its single history representation');
focus.history = []; focus.focusOutcomes = [o]; assert.equal(buildProgressSnapshot(focus, now).study.todayMinutes, 10, 'Standalone Focus remains counted');
focus.history = []; focus.focusOutcomes = [outcome('zero', { minutes: 0, plannedMinutes: 45 }), outcome('short', { minutes: 1, plannedMinutes: 45 })];
assert.equal(buildTimeCalibration(focus, now).sampleSize, 1); assert.equal(buildTimeCalibration(focus, now).actualMinutes, 1);
assert.equal(outcomeSnapshot(focus, now).starts, 2); assert.equal(outcomeSnapshot(focus, now).finished, 2, 'Zero-minute finishes remain historical completions');
focus.history = [study('zero-history', now, { minutes: 0, plannedMinutes: 45 }), study('short-history', now, { minutes: 1, plannedMinutes: 45 })];
assert.equal(buildTimeCalibration(focus, now).sampleSize, 2, 'One-minute work from both representations remains eligible');
focus.history.push(study('fractional-work', now, { minutes: 0.25, plannedMinutes: 5 }));
assert.equal(buildTimeCalibration(focus, now).sampleSize, 3, 'Positive fractional recorded work is not discarded');
const timingEstimate = fixture();
timingEstimate.history = [0, 1, 2].flatMap(i => [study('normal-' + i, now, { minutes: 25, plannedMinutes: 25 }), study('zero-' + i, now, { minutes: 0, plannedMinutes: 25 })]);
assert.equal(buildTimeCalibration(timingEstimate, now).sampleSize, 3);
assert.equal(buildTimeCalibration(timingEstimate, now).medianRatio, 1, 'Zero-work finishes no longer turn three on-plan blocks into a 50% median');
const capacity = fixture(); capacity.history = [study('work')]; capacity.breaks = [{ at: now, minutes: 5 }];
assert.equal(buildProgressSnapshot(capacity, now).study.todayMinutes, 10); assert.equal(minutesUsedToday(capacity, now), 15, 'Today capacity intentionally also includes breaks');
console.log('✓ Matching Focus history/outcomes count once; ID collisions and standalone/linked work survive; zero-minute timing is excluded without erasing starts/completions');
const retention = fixture(); retention.history = [review('hint-first', now - 120000, { hintUsed: true }), review('eligible-later', now - 60000), review('later-again', now, { grade: 1 })];
assert.equal(outcomeSnapshot(retention, now).retentionSamples, 1); assert.equal(outcomeSnapshot(retention, now).recalled, 1, 'Hinted earlier attempt does not block first eligible attempt');
retention.history = [review('immediate-first', now - 120000, { elapsedDays: 0 }), review('eligible-later', now - 60000)];
assert.equal(outcomeSnapshot(retention, now).recalled, 1, 'Eligibility still precedes deduplication');
retention.history = [review('delayed-fail', now - 120000, { grade: 1 }), review('eligible-good', now - 60000)];
assert.equal(outcomeSnapshot(retention, now).retentionSamples, 1); assert.equal(outcomeSnapshot(retention, now).recalled, 0);
retention.history = [review('immediate-retry', now, { elapsedDays: 0 }), review('under-24', now - 1, { elapsedDays: 1 - 1 / DAY })];
assert.equal(outcomeSnapshot(retention, now).retentionSamples, 0);
retention.history = [review('at-24', now, { elapsedDays: 1 }), review('thirty-exact', now - 30 * DAY), review('too-old', now - 30 * DAY - 1), review('future', now + 1)];
assert.equal(outcomeSnapshot(retention, now).retentionSamples, 2, 'Rolling 30x24-hour retention window remains distinct from Progress calendar windows');
const original = JSON.stringify(retention); Object.freeze(retention.history);
buildProgressSnapshot(retention, now); outcomeSnapshot(retention, now); assert.equal(JSON.stringify(retention), original, 'Aggregates never sort, rewrite or delete stored history');
const copy = fs.readFileSync('src/features/adaptive/LearningInsights.tsx', 'utf8');
assert.match(copy, /first eligible review per topic\/question\/local day/); assert.match(copy, /at least 24 hours/);
console.log('✓ First-eligible delayed-retention semantics and 24-hour definition remain; history stays read-only and copy names the actual rule');
