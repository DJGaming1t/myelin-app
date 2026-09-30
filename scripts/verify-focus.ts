/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  addParkedDistraction,
  beginBreak,
  breakActualMinutes,
  createFocusSession,
  extendFiveMinuteLaunch,
  focusActualMinutes,
  formatTimer,
  pauseFocusTimer,
  removeParkedDistraction,
  resumeFocusTimer,
  timerIsComplete,
  timerRemainingMs,
} from '../src/features/focus/focus-engine';
import {
  FocusKeyValueStore,
  createFocusStorage,
} from '../src/features/focus/focus-storage';

const MINUTE = 60_000;
const now = 1_800_000_000_000;

class MemoryStore implements FocusKeyValueStore {
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

async function main() {
  let session = createFocusSession({
    topicId: 'topic_math',
    topicName: 'Quadratic Equations',
    subject: 'Mathematics',
    plannedMinutes: 45,
    breakMinutes: 10,
    launchMode: 'full',
    tinyStep: 'Solve question 1 without notes',
    now,
    id: 'focus_test',
  });

  assert.equal(timerRemainingMs(session, now), 45 * MINUTE);
  assert.equal(timerRemainingMs(session, now + 10 * MINUTE), 35 * MINUTE);

  session = pauseFocusTimer(session, now + 10 * MINUTE);
  assert.equal(session.runningSince, null);
  assert.equal(timerRemainingMs(session, now + 25 * MINUTE), 35 * MINUTE);

  session = resumeFocusTimer(session, now + 25 * MINUTE);
  assert.equal(timerRemainingMs(session, now + 30 * MINUTE), 30 * MINUTE);
  assert.equal(focusActualMinutes(session, now + 30 * MINUTE), 15);

  session = addParkedDistraction(session, 'Check that message later', now + 31 * MINUTE);
  assert.equal(session.distractions.length, 1);
  assert.equal(session.distractions[0]?.text, 'Check that message later');
  assert.equal(
    JSON.stringify({
      plannedMinutes: session.plannedFocusMinutes,
      tinyStep: session.tinyStep,
    }).includes('Check that message later'),
    false,
    'Distraction text should not be part of permanent study metadata.',
  );

  const distractionId = session.distractions[0]!.id;
  session = removeParkedDistraction(session, distractionId);
  assert.equal(session.distractions.length, 0);

  const five = createFocusSession({
    topicId: 'topic_chem',
    topicName: 'Metals',
    subject: 'Chemistry',
    plannedMinutes: 45,
    breakMinutes: 10,
    launchMode: 'five-minute',
    tinyStep: 'Write the reactivity series',
    now,
    id: 'focus_five',
  });

  assert.equal(five.plannedFocusMinutes, 5);
  assert.equal(timerIsComplete(five, now + 5 * MINUTE), true);

  const extended = extendFiveMinuteLaunch(five, now + 6 * MINUTE);
  assert.equal(extended.plannedFocusMinutes, 45);
  assert.equal(timerRemainingMs(extended, now + 6 * MINUTE), 40 * MINUTE);
  assert.equal(timerIsComplete(extended, now + 45 * MINUTE), false);
  assert.equal(timerIsComplete(extended, now + 46 * MINUTE), true);

  const finishedFocus = pauseFocusTimer(
    createFocusSession({
      topicId: 'topic_bio',
      topicName: 'Life Processes',
      subject: 'Biology',
      plannedMinutes: 25,
      breakMinutes: 8,
      launchMode: 'full',
      tinyStep: '',
      now,
      id: 'focus_bio',
    }),
    now + 18 * MINUTE,
  );

  assert.equal(focusActualMinutes(finishedFocus, now + 30 * MINUTE), 18);

  const onBreak = beginBreak(finishedFocus, 18, now + 20 * MINUTE);
  assert.equal(onBreak.phase, 'break');
  assert.equal(onBreak.focusLogged, true);
  assert.equal(onBreak.focusActualMinutes, 18);
  assert.equal(breakActualMinutes(onBreak, now + 24 * MINUTE), 4);

  assert.equal(formatTimer(65_000), '01:05');
  assert.equal(formatTimer(0), '00:00');

  const memory = new MemoryStore();
  const storage = createFocusStorage(memory);

  await storage.save('user:A', five);
  assert.equal((await storage.load('user:A'))?.topicId, 'topic_chem');
  assert.equal(await storage.load('user:B'), null, 'Active focus state must be isolated by owner.');

  const restored = await storage.load('user:A');
  assert.ok(restored);
  assert.equal(
    timerRemainingMs(restored!, now + 3 * MINUTE),
    2 * MINUTE,
    'Timestamp-based timer should recover after the app was not running.',
  );

  await storage.clear('user:A');
  assert.equal(await storage.load('user:A'), null);

  await memory.setItem(
    '@myelin/native/focus/user%3AA',
    JSON.stringify({ format: 'wrong', version: 1 }),
  );
  assert.equal(await storage.load('user:A'), null, 'Invalid active-session data should be discarded safely.');

  const workspace = createEmptyWorkspace(now);
  workspace.topics.push({
    id: 'topic_math',
    name: 'Quadratic Equations',
    subject: 'Mathematics',
    createdAt: now,
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
  });

  workspace.history.push({
    id: 'session_focus',
    topicId: 'topic_math',
    at: now + 45 * MINUTE,
    kind: 'study',
    minutes: 38,
    grade: 0,
    effort: 4,
    prompt: '',
    response: '',
    confidence: 'unsure',
    plannedMinutes: 45,
    startedAt: now,
    endedAt: now + 38 * MINUTE,
    launchMode: 'five-minute',
    tinyStep: 'Start with question 1',
  });

  const validated = migrateAndValidateWorkspace(workspace);
  const history = validated.history[0]!;
  assert.equal(history.plannedMinutes, 45);
  assert.equal(history.minutes, 38);
  assert.equal(history.tinyStep, 'Start with question 1');

  console.log('✓ absolute timestamps survive background/app close');
  console.log('✓ pause and resume preserve elapsed time');
  console.log('✓ five-minute launch can extend into the full block');
  console.log('✓ distraction parking stays in active-session state');
  console.log('✓ break timing and partial duration are measurable');
  console.log('✓ active sessions are isolated per workspace owner');
  console.log('✓ invalid active-session state fails safely');
  console.log('✓ planned-vs-actual focus metadata survives workspace validation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
