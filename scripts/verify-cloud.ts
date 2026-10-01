/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  decideSync,
  isPristineWorkspace,
  makeCloudManifest,
  parseCloudWorkspace,
  splitUtf8,
  utf8ByteLength,
  validateCloudManifest,
  workspaceFingerprint,
} from '../src/features/cloud-sync/sync-engine';

const now = 1_800_000_000_000;

function workspace() {
  const value = createEmptyWorkspace(now);
  value.revision = 7;
  value.updatedAt = now;
  value.topics.push({
    id: 'topic_sync',
    name: 'Refraction',
    subject: 'Physics',
    createdAt: now - 100_000,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: 'Remember refractive index.',
    dueAt: now + 10_000,
    intervalDays: 2,
    lastGrade: 3,
    lastReviewed: now - 20_000,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_sync',
        prompt: 'What is refractive index?',
        answer: 'A ratio describing how light speed changes.',
        hint: 'Think speed.',
        dueAt: now + 10_000,
        intervalDays: 2,
        lastGrade: 3,
        lastReviewed: now - 20_000,
        reps: 3,
      },
    ],
  });
  return value;
}

function main() {
  const base = workspace();
  const fingerprint = workspaceFingerprint(base);

  const timestampOnly = {
    ...base,
    revision: 999,
    updatedAt: now + 500_000,
  };
  assert.equal(
    workspaceFingerprint(timestampOnly),
    fingerprint,
    'Revision/timestamp-only changes must not create false sync conflicts.',
  );

  const changed = structuredClone(base);
  changed.topics[0]!.notes = 'Changed content.';
  assert.notEqual(workspaceFingerprint(changed), fingerprint);

  assert.equal(isPristineWorkspace(createEmptyWorkspace(now)), true);
  const customSettings = createEmptyWorkspace(now);
  customSettings.settings.dailyMinutes = 120;
  assert.equal(isPristineWorkspace(customSettings), false);

  const unicode = 'abc🙂漢字'.repeat(50_000);
  const chunks = splitUtf8(unicode, 32_000);
  assert.equal(chunks.join(''), unicode);
  assert.ok(chunks.length > 1);
  chunks.forEach((chunk) => {
    assert.ok(utf8ByteLength(chunk) <= 32_000);
  });

  const packed = makeCloudManifest(base, 'g_test_sync', now + 1);
  assert.equal(packed.manifest.chunkCount, packed.chunks.length);
  assert.equal(packed.manifest.fingerprint, fingerprint);
  assert.deepEqual(
    parseCloudWorkspace(packed.manifest, packed.chunks),
    base,
  );

  const damaged = [...packed.chunks];
  damaged[0] = damaged[0] + ' ';
  assert.throws(
    () => parseCloudWorkspace(packed.manifest, damaged),
    /size check|fingerprint check|JSON is damaged/,
  );

  assert.throws(
    () =>
      validateCloudManifest({
        ...packed.manifest,
        generation: 'bad generation with spaces',
      }),
    /generation is invalid/,
  );

  assert.equal(
    decideSync({
      localFingerprint: 'local',
      cloudFingerprint: null,
      baselineFingerprint: null,
      localPristine: false,
    }),
    'upload',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'same',
      cloudFingerprint: 'same',
      baselineFingerprint: null,
      localPristine: false,
    }),
    'none',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'empty-device',
      cloudFingerprint: 'cloud',
      baselineFingerprint: null,
      localPristine: true,
    }),
    'download',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'device',
      cloudFingerprint: 'cloud',
      baselineFingerprint: null,
      localPristine: false,
    }),
    'conflict',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'local-new',
      cloudFingerprint: 'baseline',
      baselineFingerprint: 'baseline',
      localPristine: false,
    }),
    'upload',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'baseline',
      cloudFingerprint: 'cloud-new',
      baselineFingerprint: 'baseline',
      localPristine: false,
    }),
    'download',
  );

  assert.equal(
    decideSync({
      localFingerprint: 'local-new',
      cloudFingerprint: 'cloud-new',
      baselineFingerprint: 'baseline',
      localPristine: false,
    }),
    'conflict',
  );

  console.log('✓ workspace fingerprints ignore revision timestamps but detect content changes');
  console.log('✓ pristine detection includes customized settings');
  console.log('✓ UTF-8 chunking preserves Unicode and respects byte limits');
  console.log('✓ cloud manifest/chunks round-trip through strict workspace validation');
  console.log('✓ damaged cloud snapshots fail size/fingerprint validation');
  console.log('✓ initial, one-sided and two-sided sync decisions are deterministic');
}

main();


const cloudProviderSource = fs.readFileSync(
  path.join(process.cwd(), 'src/features/cloud-sync/CloudSyncProvider.tsx'),
  'utf8',
);
const cloudScreenSource = fs.readFileSync(
  path.join(process.cwd(), 'app/(app)/settings/cloud-sync.tsx'),
  'utf8',
);
assert.ok(
  cloudProviderSource.includes("if (!user || localMode) return 'unavailable';"),
  'Account deletion must report an unavailable identity without depending on cloud sync release.',
);
assert.ok(
  cloudProviderSource.includes('if (CLOUD_SYNC_RELEASE_ENABLED) {'),
  'Released cloud data must be deleted before Auth account deletion.',
);
assert.ok(
  cloudScreenSource.includes('disabled={!signedIn || busy}'),
  'Account deletion UI must not be disabled merely because cloud sync is locked.',
);
assert.ok(
  cloudProviderSource.includes("return 'reauth-required'"),
  'Account deletion must expose recent-login recovery instead of silently failing.',
);
