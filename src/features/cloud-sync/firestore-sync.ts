import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

import { migrateAndValidateWorkspace } from '@/src/data/migrations';
import { WorkspaceState } from '@/src/data/schema';
import { firestore } from '@/src/lib/firebase';

import {
  CloudSnapshot,
  MAX_CHUNK_BYTES,
  makeCloudManifest,
  parseCloudWorkspace,
  utf8ByteLength,
  validateCloudManifest,
} from './sync-engine';

function manifestRef(uid: string) {
  return doc(firestore, 'users', uid, 'cloud', 'current');
}

function chunksRef(uid: string) {
  return collection(firestore, 'users', uid, 'cloud', 'current', 'chunks');
}

function chunkRef(uid: string, index: number) {
  return doc(
    firestore,
    'users',
    uid,
    'cloud',
    'current',
    'chunks',
    String(index).padStart(4, '0'),
  );
}

function generationId(now = Date.now()) {
  return `g_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function readCloudSnapshot(uid: string): Promise<CloudSnapshot | null> {
  const manifestSnapshot = await getDoc(manifestRef(uid));
  if (!manifestSnapshot.exists()) return null;

  const manifest = validateCloudManifest(manifestSnapshot.data());

  const chunkSnapshots = await Promise.all(
    Array.from({ length: manifest.chunkCount }, (_, index) =>
      getDoc(chunkRef(uid, index)),
    ),
  );

  const chunks = chunkSnapshots.map((snapshot, index) => {
    if (!snapshot.exists()) {
      throw new Error('Cloud workspace is missing a chunk.');
    }

    const data = snapshot.data();
    if (
      data.generation !== manifest.generation ||
      data.index !== index ||
      typeof data.payload !== 'string'
    ) {
      throw new Error('Cloud workspace chunk metadata is invalid.');
    }

    if (utf8ByteLength(data.payload) > MAX_CHUNK_BYTES) {
      throw new Error('Cloud workspace chunk is too large.');
    }

    return data.payload;
  });

  return {
    manifest,
    workspace: parseCloudWorkspace(manifest, chunks),
  };
}

export async function writeCloudSnapshot(
  uid: string,
  workspace: WorkspaceState,
  uploadedAt = Date.now(),
): Promise<CloudSnapshot> {
  const validated = migrateAndValidateWorkspace(workspace);
  const { manifest, chunks } = makeCloudManifest(
    validated,
    generationId(uploadedAt),
    uploadedAt,
  );

  const existingChunks = await getDocs(chunksRef(uid));
  if (existingChunks.size + chunks.length + 1 > 450) {
    throw new Error('Cloud workspace contains too many stale chunks to update safely.');
  }

  const batch = writeBatch(firestore);
  for (const snapshot of existingChunks.docs) {
    batch.delete(snapshot.ref);
  }

  chunks.forEach((payload, index) => {
    batch.set(chunkRef(uid, index), {
      generation: manifest.generation,
      index,
      payload,
    });
  });

  batch.set(manifestRef(uid), manifest);
  await batch.commit();

  return { manifest, workspace: validated };
}

export async function deleteCloudSnapshot(uid: string) {
  const chunks = await getDocs(chunksRef(uid));

  for (let offset = 0; offset < chunks.docs.length; offset += 400) {
    const batch = writeBatch(firestore);
    chunks.docs.slice(offset, offset + 400).forEach((snapshot) => {
      batch.delete(snapshot.ref);
    });
    await batch.commit();
  }

  const finalBatch = writeBatch(firestore);
  finalBatch.delete(manifestRef(uid));
  await finalBatch.commit();
}
