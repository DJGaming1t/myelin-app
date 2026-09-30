import {
  WorkspaceState,
  cloneWorkspace,
  createEmptyWorkspace,
  defaultWorkspaceSettings,
} from '@/src/data/schema';
import { migrateAndValidateWorkspace } from '@/src/data/migrations';

export const CLOUD_FORMAT = 'myelin.cloud.workspace' as const;
export const CLOUD_VERSION = 1 as const;
export const MAX_CLOUD_BYTES = 8 * 1024 * 1024;
export const MAX_CLOUD_CHUNKS = 64;
export const MAX_CHUNK_BYTES = 180_000;

export type SyncDecision = 'upload' | 'download' | 'none' | 'conflict';

export type CloudManifest = {
  format: typeof CLOUD_FORMAT;
  version: typeof CLOUD_VERSION;
  schemaVersion: number;
  generation: string;
  fingerprint: string;
  chunkCount: number;
  byteLength: number;
  workspaceRevision: number;
  workspaceUpdatedAt: number;
  uploadedAt: number;
};

export type CloudSnapshot = {
  manifest: CloudManifest;
  workspace: WorkspaceState;
};

function utf8BytesForCodePoint(codePoint: number) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)!;
    bytes += utf8BytesForCodePoint(codePoint);
    if (codePoint > 0xffff) index += 1;
  }
  return bytes;
}

export function splitUtf8(value: string, maxBytes = MAX_CHUNK_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1024) {
    throw new Error('Cloud chunk size is invalid.');
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)!;
    const character = String.fromCodePoint(codePoint);
    const bytes = utf8BytesForCodePoint(codePoint);

    if (current && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }

    current += character;
    currentBytes += bytes;
    if (codePoint > 0xffff) index += 1;
  }

  if (current || value.length === 0) chunks.push(current);
  if (chunks.length > MAX_CLOUD_CHUNKS) {
    throw new Error('This workspace is too large for MYELIN cloud sync.');
  }
  return chunks;
}

function stableHash(input: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0).toString(36);
}

function fingerprintSource(workspace: WorkspaceState) {
  const normalized = cloneWorkspace(migrateAndValidateWorkspace(workspace));
  normalized.revision = 0;
  normalized.updatedAt = 0;
  return JSON.stringify(normalized);
}

export function workspaceFingerprint(workspace: WorkspaceState) {
  const source = fingerprintSource(workspace);
  return [
    utf8ByteLength(source).toString(36),
    stableHash(source, 2166136261),
    stableHash(source, 3335557771),
  ].join('-');
}

export function isPristineWorkspace(workspace: WorkspaceState) {
  const noRecords =
    workspace.topics.length === 0 &&
    workspace.exams.length === 0 &&
    workspace.mistakes.length === 0 &&
    workspace.history.length === 0 &&
    workspace.breaks.length === 0 &&
    workspace.tasks.length === 0 &&
    workspace.commitments.length === 0;

  return (
    noRecords &&
    JSON.stringify(workspace.settings) === JSON.stringify(defaultWorkspaceSettings())
  );
}

export function decideSync(input: {
  localFingerprint: string;
  cloudFingerprint: string | null;
  baselineFingerprint: string | null;
  localPristine: boolean;
}): SyncDecision {
  const {
    localFingerprint,
    cloudFingerprint,
    baselineFingerprint,
    localPristine,
  } = input;

  if (!cloudFingerprint) return 'upload';
  if (localFingerprint === cloudFingerprint) return 'none';

  if (!baselineFingerprint) {
    return localPristine ? 'download' : 'conflict';
  }

  const localChanged = localFingerprint !== baselineFingerprint;
  const cloudChanged = cloudFingerprint !== baselineFingerprint;

  if (localChanged && !cloudChanged) return 'upload';
  if (!localChanged && cloudChanged) return 'download';
  if (!localChanged && !cloudChanged) return 'none';
  return 'conflict';
}

export function serializeCloudWorkspace(workspace: WorkspaceState) {
  const validated = migrateAndValidateWorkspace(workspace);
  const json = JSON.stringify(validated);
  const byteLength = utf8ByteLength(json);
  if (byteLength > MAX_CLOUD_BYTES) {
    throw new Error('This workspace is larger than the 8 MB cloud-sync limit.');
  }

  return {
    json,
    byteLength,
    fingerprint: workspaceFingerprint(validated),
    chunks: splitUtf8(json),
  };
}

export function parseCloudWorkspace(
  manifest: CloudManifest,
  chunks: string[],
): WorkspaceState {
  validateCloudManifest(manifest);

  if (chunks.length !== manifest.chunkCount) {
    throw new Error('Cloud workspace is incomplete.');
  }

  const json = chunks.join('');
  if (utf8ByteLength(json) !== manifest.byteLength) {
    throw new Error('Cloud workspace size check failed.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Cloud workspace JSON is damaged.');
  }

  const workspace = migrateAndValidateWorkspace(raw);
  if (workspaceFingerprint(workspace) !== manifest.fingerprint) {
    throw new Error('Cloud workspace fingerprint check failed.');
  }

  return workspace;
}

export function validateCloudManifest(value: unknown): CloudManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cloud manifest is invalid.');
  }
  const raw = value as Record<string, unknown>;

  if (raw.format !== CLOUD_FORMAT || raw.version !== CLOUD_VERSION) {
    throw new Error('Cloud workspace format is not supported.');
  }

  const stringField = (name: string, max: number) => {
    const field = raw[name];
    if (typeof field !== 'string' || !field || field.length > max) {
      throw new Error(`Cloud ${name} is invalid.`);
    }
    return field;
  };

  const integerField = (name: string, min: number, max: number) => {
    const field = raw[name];
    if (
      typeof field !== 'number' ||
      !Number.isInteger(field) ||
      field < min ||
      field > max
    ) {
      throw new Error(`Cloud ${name} is invalid.`);
    }
    return field;
  };

  const generation = stringField('generation', 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(generation)) {
    throw new Error('Cloud generation is invalid.');
  }

  const fingerprint = stringField('fingerprint', 120);

  return {
    format: CLOUD_FORMAT,
    version: CLOUD_VERSION,
    schemaVersion: integerField('schemaVersion', 1, 100),
    generation,
    fingerprint,
    chunkCount: integerField('chunkCount', 1, MAX_CLOUD_CHUNKS),
    byteLength: integerField('byteLength', 1, MAX_CLOUD_BYTES),
    workspaceRevision: integerField('workspaceRevision', 0, 1_000_000_000),
    workspaceUpdatedAt: integerField(
      'workspaceUpdatedAt',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    uploadedAt: integerField('uploadedAt', 1, Number.MAX_SAFE_INTEGER),
  };
}

export function makeCloudManifest(
  workspace: WorkspaceState,
  generation: string,
  uploadedAt = Date.now(),
): { manifest: CloudManifest; chunks: string[] } {
  const validated = migrateAndValidateWorkspace(workspace);
  const serialized = serializeCloudWorkspace(validated);

  return {
    manifest: {
      format: CLOUD_FORMAT,
      version: CLOUD_VERSION,
      schemaVersion: validated.schemaVersion,
      generation,
      fingerprint: serialized.fingerprint,
      chunkCount: serialized.chunks.length,
      byteLength: serialized.byteLength,
      workspaceRevision: validated.revision,
      workspaceUpdatedAt: validated.updatedAt,
      uploadedAt,
    },
    chunks: serialized.chunks,
  };
}

export function emptyWorkspaceFingerprint() {
  return workspaceFingerprint(createEmptyWorkspace(1));
}
