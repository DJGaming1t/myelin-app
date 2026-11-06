/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { workspaceOwnerKey } from '../src/data/owner';
import { Topic, cloneWorkspace } from '../src/data/schema';
import {
  KeyValueStore,
  createWorkspaceStorageEngine,
  getWorkspaceStorageKeys,
} from '../src/data/storageEngine';

class MemoryStore implements KeyValueStore {
  private values = new Map<string, string>();

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

function makeTopic(now: number): Topic {
  return {
    id: 'topic_math_quadratics',
    name: 'Quadratic Equations',
    subject: 'Mathematics',
    createdAt: now,
    status: 'new',
    priority: 3,
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
  const store = new MemoryStore();
  const engine = createWorkspaceStorageEngine(store);

  const userA = workspaceOwnerKey({ kind: 'user', uid: 'firebase_user_A' });
  const userB = workspaceOwnerKey({ kind: 'user', uid: 'firebase_user_B' });
  const local = workspaceOwnerKey({ kind: 'local' });

  assert.notEqual(userA, userB, 'Different Firebase users must have different owner keys.');
  assert.notEqual(userA, local, 'Account and local workspaces must have different owner keys.');
  assert.notEqual(userB, local, 'Account and local workspaces must have different owner keys.');

  const freshA = await engine.load(userA);
  const freshB = await engine.load(userB);
  const freshLocal = await engine.load(local);

  assert.equal(freshA.workspace.topics.length, 0);
  assert.equal(freshB.workspace.topics.length, 0);
  assert.equal(freshLocal.workspace.topics.length, 0);

  const now = Date.now();
  const aRevision1 = cloneWorkspace(freshA.workspace);
  aRevision1.topics.push(makeTopic(now));
  aRevision1.revision = 1;
  aRevision1.updatedAt = now;
  await engine.save(userA, aRevision1);

  const reloadedA = await engine.load(userA);
  const reloadedB = await engine.load(userB);
  const reloadedLocal = await engine.load(local);

  assert.equal(reloadedA.workspace.topics[0]?.name, 'Quadratic Equations');
  assert.equal(reloadedB.workspace.topics.length, 0, 'User B must not see User A data.');
  assert.equal(reloadedLocal.workspace.topics.length, 0, 'Local mode must not see account data.');

  const aRevision2 = cloneWorkspace(reloadedA.workspace);
  aRevision2.topics[0].notes = 'Second revision';
  aRevision2.revision = 2;
  aRevision2.updatedAt = now + 1000;
  await engine.save(userA, aRevision2);

  const userAKeys = getWorkspaceStorageKeys(userA);
  await store.setItem(userAKeys.primary, '{broken json');

  const recoveredFromBackup = await engine.load(userA);
  assert.equal(recoveredFromBackup.recovered, true);
  assert.equal(recoveredFromBackup.recoverySource, 'backup');
  assert.equal(recoveredFromBackup.workspace.revision, 1);
  assert.equal(recoveredFromBackup.workspace.topics[0]?.name, 'Quadratic Equations');

  const pendingRevision = cloneWorkspace(recoveredFromBackup.workspace);
  pendingRevision.revision = 3;
  pendingRevision.updatedAt = now + 3000;
  pendingRevision.topics[0].notes = 'Recovered pending save';
  await store.setItem(userAKeys.pending, JSON.stringify(pendingRevision));

  const recoveredPending = await engine.load(userA);
  assert.equal(recoveredPending.recovered, true);
  assert.equal(recoveredPending.recoverySource, 'pending');
  assert.equal(recoveredPending.workspace.revision, 3);
  assert.equal(recoveredPending.workspace.topics[0]?.notes, 'Recovered pending save');

  const userC = workspaceOwnerKey({ kind: 'user', uid: 'firebase_user_C' });
  const userCKeys = getWorkspaceStorageKeys(userC);
  await store.setItem(userCKeys.primary, 'not json');
  await store.setItem(userCKeys.pending, '{"wrong":true}');
  await store.setItem(userCKeys.backup, '[]');

  const quarantined = await engine.load(userC);
  assert.equal(quarantined.resetBecauseCorrupt, true);
  assert.equal(quarantined.workspace.topics.length, 0);
  assert.ok(await engine.readQuarantine(userC), 'Damaged raw data should be retained for recovery.');

  const migrated = migrateAndValidateWorkspace({
    format: 'myelin.native.workspace',
    schemaVersion: 0,
    revision: 7,
    updatedAt: now,
    topics: [],
    exams: [],
    mistakes: [],
    history: [],
    settings: { dailyMinutes: 120 },
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.tasks, []);
  assert.deepEqual(migrated.commitments, []);
  assert.equal(migrated.revision, 7);
  assert.equal(migrated.settings.dailyMinutes, 120);
  assert.equal(migrated.settings.focusMinutes, 45);
  assert.equal(migrated.settings.breakMinutes, 10);

  assert.throws(
    () =>
      migrateAndValidateWorkspace({
        format: 'myelin.native.workspace',
        schemaVersion: 999,
      }),
    /newer MYELIN version/,
  );

  console.log('✓ per-user workspace isolation');
  console.log('✓ local workspace isolation');
  console.log('✓ durable save/reload');
  console.log('✓ backup recovery');
  console.log('✓ interrupted pending-save recovery');
  console.log('✓ corrupt-data quarantine');
  console.log('✓ schema migration guardrails');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


const workspaceProviderSource = fs.readFileSync(
  path.join(process.cwd(), 'src/data/WorkspaceProvider.tsx'),
  'utf8',
);
assert.ok(
  workspaceProviderSource.includes('const queuedSave = saveQueue.current'),
  'Workspace saves should keep a rejectable latest-save promise.',
);
assert.ok(
  workspaceProviderSource.includes('await saveQueue.current.catch(() => undefined)'),
  'Workspace reset should wait for already-started writes.',
);
