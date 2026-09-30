/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  applyMistakeRetest,
  applyMistakeInput,
  buildMistakeRetestQueue,
  captureRecallMistake,
  createMistake,
  deleteMistakeFromWorkspace,
  findOpenMistakeForCard,
  localDayKey,
  mistakeCounts,
  reopenMistake,
} from '../src/features/mistakes/mistake-engine';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 30, 12, 0, 0);

function main() {
  const workspace = createEmptyWorkspace(now - DAY);

  workspace.topics.push({
    id: 'topic_math',
    name: 'Quadratic Equations',
    subject: 'Mathematics',
    createdAt: now - DAY,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_disc',
        prompt: 'What does the discriminant tell us?',
        answer: 'It determines the nature of the roots.',
        hint: 'Think b² − 4ac.',
        dueAt: now,
        intervalDays: 2,
        lastGrade: 1,
        lastReviewed: now - DAY,
        reps: 2,
      },
    ],
  });

  const manual = createMistake(
    {
      topicId: 'topic_math',
      cardId: null,
      prompt: 'I used the wrong sign in the quadratic formula.',
      detail: 'I wrote +b instead of -b.',
      correction: 'The numerator begins with -b.',
      reason: 'calculation',
    },
    now,
    'mistake_manual',
  );
  workspace.mistakes.push(manual);

  assert.deepEqual(mistakeCounts(workspace, now), {
    due: 1,
    open: 1,
    resolved: 0,
    total: 1,
  });

  const recall = captureRecallMistake(workspace, {
    topicId: 'topic_math',
    cardId: 'card_disc',
    prompt: 'What does the discriminant tell us?',
    response: 'I was not sure.',
    correction: 'It determines the nature of the roots.',
    now: now + 1,
  });

  assert.equal(workspace.mistakes.length, 2);
  assert.equal(recall.reason, 'recall');
  assert.equal(findOpenMistakeForCard(workspace, 'topic_math', 'card_disc')?.id, recall.id);

  recall.wins = 1;
  recall.lastWinDay = localDayKey(now - DAY);
  recall.intervalDays = 2;
  recall.dueAt = now + DAY;

  const sameRecallAgain = captureRecallMistake(workspace, {
    topicId: 'topic_math',
    cardId: 'card_disc',
    prompt: 'What does the discriminant tell us?',
    response: 'Still mixed it up.',
    correction: 'It determines the nature of the roots.',
    now: now + 2,
  });

  assert.equal(sameRecallAgain.id, recall.id, 'The same open recall error should not duplicate.');
  assert.equal(workspace.mistakes.length, 2);
  assert.equal(sameRecallAgain.wins, 0, 'A fresh recall miss must reset the retest streak.');
  assert.equal(sameRecallAgain.lastWinDay, '');
  assert.equal(sameRecallAgain.dueAt, now + 2);

  const dueQueue = buildMistakeRetestQueue(workspace, now + 2);
  assert.equal(dueQueue.length, 2);
  assert.equal(dueQueue[0]?.topicId, 'topic_math');

  const missOutcome = applyMistakeRetest(manual, 'miss', now + 10);
  assert.equal(missOutcome.wins, 0);
  assert.equal(manual.dueAt, now + 10 + DAY);
  assert.equal(manual.intervalDays, 1);

  const firstWinAt = now + DAY + 20;
  const firstWin = applyMistakeRetest(manual, 'win', firstWinAt);
  assert.equal(firstWin.countedWin, true);
  assert.equal(firstWin.resolved, false);
  assert.equal(manual.wins, 1);
  assert.equal(manual.lastWinDay, localDayKey(firstWinAt));
  assert.equal(manual.dueAt, firstWinAt + 2 * DAY);

  const duplicateSameDay = applyMistakeRetest(manual, 'win', firstWinAt + 60 * 60 * 1000);
  assert.equal(duplicateSameDay.countedWin, false);
  assert.equal(manual.wins, 1, 'Two wins on the same day must not resolve the mistake.');

  applyMistakeInput(
    manual,
    {
      topicId: manual.topicId,
      cardId: manual.cardId,
      prompt: manual.prompt,
      detail: manual.detail,
      correction: 'The numerator starts with −b, then ± the square root term.',
      reason: manual.reason,
    },
    firstWinAt + 2 * 60 * 60 * 1000,
  );
  assert.equal(manual.wins, 0, 'Changing the correction must invalidate an old proof win.');

  const newFirstWinAt = firstWinAt + DAY;
  applyMistakeRetest(manual, 'win', newFirstWinAt);
  assert.equal(manual.wins, 1);

  const secondWinAt = newFirstWinAt + 3 * DAY;
  const secondWin = applyMistakeRetest(manual, 'win', secondWinAt);
  assert.equal(secondWin.countedWin, true);
  assert.equal(secondWin.resolved, true);
  assert.equal(manual.wins, 2);
  assert.equal(manual.resolvedAt, secondWinAt);
  assert.equal(manual.dueAt, 0);

  assert.equal(
    buildMistakeRetestQueue(workspace, secondWinAt).some((item) => item.id === manual.id),
    false,
    'Resolved mistakes must leave the due queue.',
  );

  reopenMistake(manual, secondWinAt + 1);
  assert.equal(manual.resolvedAt, 0);
  assert.equal(manual.wins, 0);
  assert.equal(manual.dueAt, secondWinAt + 1);

  workspace.history.push({
    id: 'session_mistake',
    topicId: 'topic_math',
    mistakeId: manual.id,
    at: secondWinAt + 2,
    kind: 'review',
    minutes: 1,
    grade: 3,
    effort: 3,
    prompt: manual.prompt,
    response: manual.correction,
    confidence: 'sure',
  });

  assert.equal(deleteMistakeFromWorkspace(workspace, manual.id), true);
  assert.equal(workspace.mistakes.some((item) => item.id === manual.id), false);
  assert.equal('mistakeId' in workspace.history[0]!, false);

  const validated = migrateAndValidateWorkspace(workspace);
  assert.equal(validated.mistakes.length, 1);
  assert.equal(validated.mistakes[0]?.cardId, 'card_disc');

  console.log('✓ manual mistake capture');
  console.log('✓ Again-style recall capture avoids duplicate open mistakes');
  console.log('✓ fresh recall misses reset retest win streaks');
  console.log('✓ due mistake queue excludes resolved/future items');
  console.log('✓ misses reset the streak and schedule a retry');
  console.log('✓ only one successful retest counts per local day');
  console.log('✓ editing the correction invalidates prior proof wins');
  console.log('✓ two spaced wins resolve a mistake');
  console.log('✓ resolved mistakes can be reopened safely');
  console.log('✓ deleting a mistake cleans historical mistake references');
  console.log('✓ resulting workspace passes schema validation');
}

main();
