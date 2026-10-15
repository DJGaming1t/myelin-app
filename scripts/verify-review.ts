/// <reference types="node" />
import assert from 'node:assert/strict';
import './verify-review-ownership';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace, Topic } from '../src/data/schema';
import {
  applyReviewGrade,
  buildReviewQueue,
  isCardReady,
  reviewAttemptAlreadyRecorded,
  reviewCounts,
  scheduleReview,
} from '../src/features/review/review-engine';
import {
  ReviewKeyValueStore,
  createReviewStorage,
} from '../src/features/review/review-storage';
import {
  REVIEW_SESSION_FORMAT,
  REVIEW_SESSION_VERSION,
  ReviewSessionState,
} from '../src/features/review/types';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;

class MemoryStore implements ReviewKeyValueStore {
  values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

function topic(id: string, name: string, subject: string, status: Topic['status'] = 'review'): Topic {
  return {
    id,
    name,
    subject,
    createdAt: now - DAY,
    status,
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

async function main() {
  const workspace = createEmptyWorkspace(now - DAY);
  const maths = topic('math', 'Quadratics', 'Mathematics');
  const chemistry = topic('chem', 'Metals', 'Chemistry');
  const newPhysics = topic('physics', 'Light', 'Physics', 'new');

  maths.priority = 3;
  maths.cards.push(
    {
      id: 'math_due',
      prompt: 'What does the discriminant tell us?',
      answer: 'The nature of roots.',
      hint: 'Think D.',
      dueAt: now - 2 * DAY,
      intervalDays: 2,
      lastGrade: 2,
      lastReviewed: now - 4 * DAY,
      reps: 2,
    },
    {
      id: 'math_future',
      prompt: 'State the quadratic formula.',
      answer: 'Formula.',
      hint: '',
      dueAt: now + 5 * DAY,
      intervalDays: 5,
      lastGrade: 3,
      lastReviewed: now - DAY,
      reps: 3,
    },
  );

  chemistry.cards.push({
    id: 'chem_new',
    prompt: 'Why is sodium extracted by electrolysis?',
    answer: 'It is very reactive.',
    hint: 'Reactivity series.',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    reps: 0,
  });

  newPhysics.cards.push({
    id: 'physics_new',
    prompt: 'Define refraction.',
    answer: 'Change in direction of light.',
    hint: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    reps: 0,
  });

  workspace.topics.push(maths, chemistry, newPhysics);

  assert.equal(isCardReady(maths, maths.cards[0]!, now), true);
  assert.equal(isCardReady(maths, maths.cards[1]!, now), false);
  assert.equal(isCardReady(chemistry, chemistry.cards[0]!, now), true);
  assert.equal(
    isCardReady(newPhysics, newPhysics.cards[0]!, now),
    false,
    'Brand-new cards from an untouched topic should not be forced into global review.',
  );

  const mixed = buildReviewQueue(workspace, { now });
  assert.deepEqual(
    mixed.map((item) => item.cardId),
    ['math_due', 'chem_new'],
    'Due review should prioritize fading, overdue recall.',
  );

  const topicPractice = buildReviewQueue(workspace, {
    now,
    topicId: 'math',
    includeNotDue: true,
  });
  assert.equal(topicPractice.length, 2, 'Manual topic practice should include not-due cards.');

  assert.deepEqual(reviewCounts(workspace, now), { due: 2, total: 4 });

  const again = scheduleReview(maths.cards[0]!, 'again', now);
  assert.equal(again.grade, 1);
  assert.equal(again.intervalDays, 0);
  assert.equal(again.dueAt, now + 10 * 60 * 1000);

  const practisingNew = scheduleReview(chemistry.cards[0]!, 'practising', now);
  assert.equal(practisingNew.grade, 2);
  assert.equal(practisingNew.intervalDays, 1);

  const goodNew = scheduleReview(chemistry.cards[0]!, 'good', now);
  assert.equal(goodNew.grade, 3);
  assert.equal(goodNew.intervalDays, 2);

  const practisingExisting = scheduleReview(maths.cards[0]!, 'practising', now);
  assert.equal(practisingExisting.intervalDays, 7);

  const goodExisting = scheduleReview(maths.cards[0]!, 'good', now);
  assert.equal(goodExisting.intervalDays, 11);

  const beforeReps = chemistry.cards[0]!.reps;
  const applied = applyReviewGrade(chemistry, chemistry.cards[0]!, 'good', now);
  assert.equal(chemistry.cards[0]!.reps, beforeReps + 1);
  assert.equal(chemistry.cards[0]!.lastGrade, 3);
  assert.equal(chemistry.cards[0]!.dueAt, applied.dueAt);
  assert.equal(chemistry.status, 'review');
  assert.equal(chemistry.dueAt, applied.dueAt);

  const memory = new MemoryStore();
  const storage = createReviewStorage(memory);

  const persisted: ReviewSessionState = {
    format: REVIEW_SESSION_FORMAT,
    version: REVIEW_SESSION_VERSION,
    id: 'review_test',
    createdAt: now,
    topicId: null,
    mixed: true,
    queue: mixed,
    currentIndex: 0,
    stage: 'reference',
    answerDraft: 'It tells us how many real roots there are.',
    confidence: 'partial',
    hintUsed: true,
    cardStartedAt: now - 2 * 60 * 1000,
    attemptId: 'attempt_test',
    completedCards: 0,
  };

  await storage.save('user:A', persisted);
  const restored = await storage.load('user:A');
  assert.ok(restored);
  assert.equal(restored!.stage, 'reference');
  assert.equal(restored!.answerDraft, persisted.answerDraft);
  assert.equal(restored!.confidence, 'partial');
  assert.equal(restored!.hintUsed, true);
  assert.equal(restored!.attemptId, 'attempt_test');
  assert.equal(await storage.load('user:B'), null, 'Review session must be isolated per owner.');

  workspace.history.push({
    id: 'session_review',
    topicId: 'math',
    cardId: 'math_due',
    at: now,
    kind: 'review',
    minutes: 2,
    grade: 2,
    effort: 3,
    prompt: maths.cards[0]!.prompt,
    response: persisted.answerDraft,
    confidence: 'partial',
    hintUsed: true,
    reviewAttemptId: 'attempt_test',
    startedAt: now - 2 * 60 * 1000,
    endedAt: now,
  });

  assert.equal(reviewAttemptAlreadyRecorded(workspace, 'attempt_test'), true);
  assert.equal(reviewAttemptAlreadyRecorded(workspace, 'attempt_other'), false);

  const validated = migrateAndValidateWorkspace(workspace);
  const history = validated.history.find((entry) => entry.reviewAttemptId === 'attempt_test');
  assert.ok(history);
  assert.equal(history!.hintUsed, true);
  assert.equal(history!.confidence, 'partial');

  await memory.setItem(
    '@myelin/native/review/user%3AA',
    JSON.stringify({ format: 'wrong', version: 1 }),
  );
  assert.equal(await storage.load('user:A'), null, 'Invalid interrupted review data should fail safely.');

  console.log('✓ due-card readiness rules');
  console.log('✓ mixed-subject queue construction');
  console.log('✓ manual topic practice can include not-due cards');
  console.log('✓ Again / Practising / Good scheduling');
  console.log('✓ grading updates card and topic review state');
  console.log('✓ interrupted answer/reference state persists per owner');
  console.log('✓ review attempt IDs prevent duplicate grading after interruption');
  console.log('✓ hint and confidence metadata survive workspace validation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
