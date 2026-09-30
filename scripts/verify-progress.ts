/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace, StudySession, Topic } from '../src/data/schema';
import {
  buildConfidenceCalibration,
  buildDailyStudyHistory,
  buildProgressSnapshot,
  buildTimeCalibration,
  buildTopicTrends,
  formatMinutesCompact,
} from '../src/features/progress/progress-engine';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 30, 12, 0, 0);
const todayStart = Date.UTC(2026, 8, 30, 0, 0, 0);

function topic(id: string, name: string, subject: string): Topic {
  return {
    id,
    name,
    subject,
    createdAt: now - 40 * DAY,
    status: 'review',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  };
}

function session(
  id: string,
  topicId: string,
  at: number,
  input: Partial<StudySession> = {},
): StudySession {
  return {
    id,
    topicId,
    at,
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
    ...input,
  };
}

function main() {
  const workspace = createEmptyWorkspace(now - 40 * DAY);
  workspace.topics.push(
    topic('math', 'Quadratic Equations', 'Mathematics'),
    topic('chem', 'Metals', 'Chemistry'),
  );

  // Three completed focus blocks for time calibration.
  workspace.history.push(
    session('focus_1', 'math', todayStart + 60 * 60 * 1000, {
      minutes: 50,
      plannedMinutes: 45,
      startedAt: todayStart,
      endedAt: todayStart + 50 * 60 * 1000,
      launchMode: 'full',
    }),
    session('focus_2', 'math', todayStart - DAY + 60 * 60 * 1000, {
      minutes: 45,
      plannedMinutes: 30,
      startedAt: todayStart - DAY,
      endedAt: todayStart - DAY + 45 * 60 * 1000,
      launchMode: 'full',
    }),
    session('focus_3', 'chem', todayStart - 2 * DAY + 60 * 60 * 1000, {
      minutes: 75,
      plannedMinutes: 60,
      startedAt: todayStart - 2 * DAY,
      endedAt: todayStart - 2 * DAY + 75 * 60 * 1000,
      launchMode: 'five-minute',
    }),
  );

  // Five graded recall attempts with confidence captured.
  workspace.history.push(
    session('review_1', 'math', todayStart - DAY + 2 * 60 * 60 * 1000, {
      kind: 'review',
      minutes: 2,
      grade: 1,
      confidence: 'sure',
      reviewAttemptId: 'attempt_1',
      prompt: 'Q1',
      response: 'A1',
    }),
    session('review_2', 'math', todayStart - 2 * DAY + 2 * 60 * 60 * 1000, {
      kind: 'review',
      minutes: 3,
      grade: 1,
      confidence: 'sure',
      reviewAttemptId: 'attempt_2',
      prompt: 'Q2',
      response: 'A2',
    }),
    session('review_3', 'math', todayStart - 3 * DAY + 2 * 60 * 60 * 1000, {
      kind: 'review',
      minutes: 2,
      grade: 2,
      confidence: 'partial',
      reviewAttemptId: 'attempt_3',
      prompt: 'Q3',
      response: 'A3',
    }),
    session('review_4', 'chem', todayStart - 4 * DAY + 2 * 60 * 60 * 1000, {
      kind: 'review',
      minutes: 4,
      grade: 3,
      confidence: 'partial',
      reviewAttemptId: 'attempt_4',
      prompt: 'Q4',
      response: 'A4',
    }),
    session('review_5', 'chem', todayStart - 5 * DAY + 2 * 60 * 60 * 1000, {
      kind: 'review',
      minutes: 2,
      grade: 3,
      confidence: 'unsure',
      reviewAttemptId: 'attempt_5',
      prompt: 'Q5',
      response: 'A5',
    }),
  );

  // Previous-week activity: Chemistry was busier, Maths quieter.
  workspace.history.push(
    session('old_math', 'math', todayStart - 8 * DAY + 60 * 60 * 1000, {
      minutes: 20,
    }),
    session('old_chem', 'chem', todayStart - 9 * DAY + 60 * 60 * 1000, {
      minutes: 90,
    }),
  );

  workspace.mistakes.push(
    {
      id: 'mistake_open',
      topicId: 'math',
      cardId: null,
      prompt: 'Open mistake',
      detail: '',
      correction: 'Correction',
      reason: 'concept',
      createdAt: now - DAY,
      dueAt: now - 1,
      resolvedAt: 0,
      wins: 0,
      lastWinDay: '',
      intervalDays: 0,
    },
    {
      id: 'mistake_resolved',
      topicId: 'chem',
      cardId: null,
      prompt: 'Resolved mistake',
      detail: '',
      correction: 'Correction',
      reason: 'application',
      createdAt: now - 10 * DAY,
      dueAt: 0,
      resolvedAt: now - DAY,
      wins: 2,
      lastWinDay: '2026-09-29',
      intervalDays: 0,
    },
  );

  const daily = buildDailyStudyHistory(workspace, now, 7);
  assert.equal(daily.length, 7);
  assert.equal(daily[6]?.minutes, 50, 'Today should contain the 50-minute focus block.');
  assert.equal(
    daily.reduce((sum, point) => sum + point.minutes, 0),
    185,
    'Seven-day study history should include focus and graded review minutes.',
  );

  const timing = buildTimeCalibration(workspace);
  assert.equal(timing.sampleSize, 3);
  assert.equal(timing.plannedMinutes, 135);
  assert.equal(timing.actualMinutes, 170);
  assert.equal(timing.direction, 'longer');
  assert.ok((timing.medianRatio ?? 0) > 1.2);
  assert.equal(timing.withinTwentyPercent, 1);

  const confidence = buildConfidenceCalibration(workspace);
  assert.equal(confidence.sampleSize, 5);
  assert.equal(confidence.enoughData, true);
  const sure = confidence.buckets.find((bucket) => bucket.confidence === 'sure');
  assert.equal(sure?.attempts, 2);
  assert.equal(sure?.again, 2);
  assert.equal(confidence.sureAgainRate, 1);
  assert.match(confidence.message, /marked “Sure”/);

  const trends = buildTopicTrends(workspace, now);
  const mathTrend = trends.find((trend) => trend.topicId === 'math');
  const chemTrend = trends.find((trend) => trend.topicId === 'chem');
  assert.equal(mathTrend?.direction, 'more-active');
  assert.equal(chemTrend?.direction, 'similar');

  const snapshot = buildProgressSnapshot(workspace, now);
  assert.equal(snapshot.study.todayMinutes, 50);
  assert.equal(snapshot.study.last7Minutes, 185);
  assert.equal(snapshot.study.previous7Minutes, 110);
  assert.equal(snapshot.study.activeDaysLast7, 6);
  assert.equal(snapshot.reviews.last30, 5);
  assert.deepEqual(
    {
      again: snapshot.reviews.again,
      practising: snapshot.reviews.practising,
      good: snapshot.reviews.good,
    },
    { again: 2, practising: 1, good: 2 },
  );
  assert.deepEqual(snapshot.mistakes, {
    total: 2,
    open: 1,
    resolved: 1,
    due: 1,
  });

  const sparse = createEmptyWorkspace(now);
  sparse.topics.push(topic('sparse', 'Sparse', 'Science'));
  sparse.history.push(
    session('sparse_focus', 'sparse', now, {
      minutes: 25,
      plannedMinutes: 30,
    }),
    session('sparse_review', 'sparse', now, {
      kind: 'review',
      minutes: 1,
      grade: 3,
      confidence: 'sure',
      reviewAttemptId: 'sparse_attempt',
    }),
  );

  const sparseTiming = buildTimeCalibration(sparse);
  assert.equal(sparseTiming.direction, 'insufficient');
  assert.equal(sparseTiming.averageRatio, null);

  const sparseConfidence = buildConfidenceCalibration(sparse);
  assert.equal(sparseConfidence.enoughData, false);
  assert.equal(sparseConfidence.sampleSize, 1);

  assert.equal(formatMinutesCompact(0), '0m');
  assert.equal(formatMinutesCompact(59), '59m');
  assert.equal(formatMinutesCompact(60), '1h');
  assert.equal(formatMinutesCompact(125), '2h 5m');

  console.log('✓ seven-day study history uses recorded session minutes');
  console.log('✓ current and previous week totals stay separate');
  console.log('✓ planned-vs-actual timing calibration uses completed focus blocks');
  console.log('✓ sparse timing data reports insufficient evidence');
  console.log('✓ confidence calibration uses pre-reference confidence plus actual grades');
  console.log('✓ overconfident Again outcomes surface without a mastery score');
  console.log('✓ sparse confidence data stays explicitly provisional');
  console.log('✓ review-result distribution is counted from graded history');
  console.log('✓ mistake open/due/resolved counts are evidence-based');
  console.log('✓ topic trends compare activity windows without claiming mastery');
}

main();
