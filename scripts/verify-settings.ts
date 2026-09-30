/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  KeyValueStore,
  createWorkspaceStorageEngine,
  getWorkspaceStorageKeys,
} from '../src/data/storageEngine';
import {
  applyStudyDefaults,
  providerLabels,
  workspaceDataSummary,
} from '../src/features/settings/settings-engine';

class MemoryStore implements KeyValueStore {
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
  const fresh = createEmptyWorkspace(1_800_000_000_000);
  assert.equal(fresh.settings.reduceMotion, false);

  const migrated = migrateAndValidateWorkspace({
    format: 'myelin.native.workspace',
    schemaVersion: 0,
    revision: 2,
    updatedAt: 1_800_000_000_000,
    topics: [],
    exams: [],
    mistakes: [],
    history: [],
    settings: {
      dailyMinutes: 120,
      focusMinutes: 30,
      breakMinutes: 5,
      energy: 'normal',
    },
  });
  assert.equal(migrated.settings.reduceMotion, false);
  assert.equal(migrated.settings.dailyMinutes, 120);

  const withReducedMotion = createEmptyWorkspace(1_800_000_000_001);
  withReducedMotion.settings.reduceMotion = true;
  const validatedReduced = migrateAndValidateWorkspace(withReducedMotion);
  assert.equal(validatedReduced.settings.reduceMotion, true);

  applyStudyDefaults(withReducedMotion.settings, {
    dailyMinutes: 999,
    focusMinutes: 2,
    breakMinutes: 50,
  });
  assert.equal(withReducedMotion.settings.dailyMinutes, 720);
  assert.equal(withReducedMotion.settings.focusMinutes, 5);
  assert.equal(withReducedMotion.settings.breakMinutes, 30);
  assert.equal(
    withReducedMotion.settings.reduceMotion,
    true,
    'Changing study defaults must not overwrite accessibility preferences.',
  );

  withReducedMotion.topics.push({
    id: 'topic_math',
    name: 'Quadratics',
    subject: 'Mathematics',
    createdAt: 1_800_000_000_000,
    status: 'learning',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_1',
        prompt: 'What is the discriminant?',
        answer: 'b² − 4ac',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
      {
        id: 'card_2',
        prompt: 'What if D < 0?',
        answer: 'No real roots.',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
    ],
  });
  withReducedMotion.exams.push({
    id: 'exam_1',
    name: 'Maths test',
    date: 1_800_086_400_000,
    scope: 'topics',
    subjects: [],
    topicIds: ['topic_math'],
  });
  withReducedMotion.mistakes.push({
    id: 'mistake_1',
    topicId: 'topic_math',
    cardId: null,
    prompt: 'Sign error',
    detail: '',
    correction: 'Use -b.',
    reason: 'calculation',
    createdAt: 1_800_000_000_000,
    dueAt: 1_800_000_000_000,
    resolvedAt: 0,
    wins: 0,
    lastWinDay: '',
    intervalDays: 0,
  });
  withReducedMotion.history.push({
    id: 'session_1',
    topicId: 'topic_math',
    at: 1_800_000_000_000,
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
  });
  withReducedMotion.breaks.push({
    at: 1_800_000_100_000,
    minutes: 5,
  });

  assert.deepEqual(workspaceDataSummary(withReducedMotion), {
    topics: 1,
    questions: 2,
    exams: 1,
    mistakes: 1,
    sessions: 1,
    breaks: 1,
  });

  assert.deepEqual(
    providerLabels(['password', 'google.com', 'password']),
    ['Email & password', 'Google'],
  );
  assert.deepEqual(providerLabels([]), ['Firebase account']);

  const store = new MemoryStore();
  const storage = createWorkspaceStorageEngine(store);
  const owner = 'user:privacy-test';
  const keys = getWorkspaceStorageKeys(owner);

  await store.setItem(keys.primary, '{bad primary');
  await store.setItem(keys.pending, '{bad pending');
  await store.setItem(keys.backup, '{bad backup');

  const recovered = await storage.load(owner);
  assert.equal(recovered.resetBecauseCorrupt, true);
  assert.ok(
    await storage.readQuarantine(owner),
    'Corrupt data should be quarantined before an explicit user reset.',
  );

  const reset = await storage.reset(owner);
  assert.equal(reset.topics.length, 0);
  assert.equal(reset.settings.reduceMotion, false);
  assert.equal(
    await storage.readQuarantine(owner),
    null,
    'Explicit workspace reset must remove the quarantined recovery copy too.',
  );

  assert.equal(await store.getItem(keys.pending), null);
  assert.equal(await store.getItem(keys.backup), null);
  assert.ok(await store.getItem(keys.primary));

  console.log('✓ reduced-motion preference defaults safely for old workspaces');
  console.log('✓ reduced-motion preference persists through validation');
  console.log('✓ study defaults clamp to schema-safe limits');
  console.log('✓ study-default edits do not overwrite accessibility settings');
  console.log('✓ local-data summary counts current workspace records');
  console.log('✓ account provider labels are deduplicated and readable');
  console.log('✓ corrupt data is quarantined before explicit reset');
  console.log('✓ explicit reset clears primary copies, backups and quarantine');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
