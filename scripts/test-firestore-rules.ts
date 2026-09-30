/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';

const projectId = 'demo-myelin-sync';
const rules = fs.readFileSync('firestore.rules', 'utf8');

const manifest = {
  format: 'myelin.cloud.workspace',
  version: 1,
  schemaVersion: 1,
  generation: 'g_test_1',
  fingerprint: 'abc-123',
  chunkCount: 1,
  byteLength: 120,
  workspaceRevision: 4,
  workspaceUpdatedAt: 1_800_000_000_000,
  uploadedAt: 1_800_000_001_000,
};

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });

  try {
    await env.clearFirestore();

    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const guest = env.unauthenticatedContext().firestore();

    const aliceManifest = doc(alice, 'users/alice/cloud/current');
    const aliceChunk = doc(
      alice,
      'users/alice/cloud/current/chunks/0000',
    );

    await assertSucceeds(setDoc(aliceManifest, manifest));
    await assertSucceeds(
      setDoc(aliceChunk, {
        generation: 'g_test_1',
        index: 0,
        payload: '{"safe":true}',
      }),
    );

    await assertSucceeds(getDoc(aliceManifest));
    await assertSucceeds(
      getDocs(collection(alice, 'users/alice/cloud/current/chunks')),
    );

    await assertFails(
      getDoc(doc(guest, 'users/alice/cloud/current')),
    );
    await assertFails(
      setDoc(doc(guest, 'users/alice/cloud/current'), manifest),
    );

    await assertFails(
      getDoc(doc(bob, 'users/alice/cloud/current')),
    );
    await assertFails(
      setDoc(doc(bob, 'users/alice/cloud/current'), manifest),
    );
    await assertFails(
      getDocs(collection(bob, 'users/alice/cloud/current/chunks')),
    );

    await assertFails(
      setDoc(aliceManifest, {
        ...manifest,
        surprise: 'not allowed',
      }),
    );

    await assertFails(
      setDoc(aliceManifest, {
        ...manifest,
        chunkCount: 65,
      }),
    );

    await assertFails(
      setDoc(
        doc(alice, 'users/alice/cloud/current/chunks/0001'),
        {
          generation: 'g_test_1',
          index: 1,
          payload: 'x'.repeat(200_001),
        },
      ),
    );

    await assertFails(
      setDoc(doc(alice, 'users/alice/private/anything'), {
        secret: true,
      }),
    );

    await assertSucceeds(deleteDoc(aliceChunk));
    await assertSucceeds(deleteDoc(aliceManifest));

    const deleted = await getDoc(aliceManifest);
    assert.equal(deleted.exists(), false);

    console.log('✓ unauthenticated users cannot read or write MYELIN cloud data');
    console.log('✓ one Firebase user cannot read, list or write another user’s sync data');
    console.log('✓ owners can access only their own bounded manifest/chunk paths');
    console.log('✓ unexpected manifest fields and oversized values are rejected');
    console.log('✓ unrelated Firestore paths remain default-denied');
    console.log('✓ owners can delete their cloud snapshot');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
