import {
  CURRENT_SCHEMA_VERSION,
  WORKSPACE_FORMAT,
  WorkspaceState,
  createEmptyWorkspace,
  defaultWorkspaceSettings,
} from './schema';
import { validateWorkspaceV2 } from './validation';

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved workspace is not an object.');
  }
  return value as Record<string, unknown>;
}

function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    format: WORKSPACE_FORMAT,
    schemaVersion: 1,
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    exams: Array.isArray(raw.exams) ? raw.exams : [],
    mistakes: Array.isArray(raw.mistakes) ? raw.mistakes : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    breaks: Array.isArray(raw.breaks) ? raw.breaks : [],
    settings:
      raw.settings && typeof raw.settings === 'object'
        ? { ...defaultWorkspaceSettings(), ...(raw.settings as object) }
        : defaultWorkspaceSettings(),
  };
}
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    schemaVersion: 2,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    commitments: Array.isArray(raw.commitments) ? raw.commitments : [],
  };
}

export function migrateAndValidateWorkspace(raw: unknown): WorkspaceState {
  let current = asObject(raw);

  if (current.format !== WORKSPACE_FORMAT) {
    throw new Error('Saved data is not a MYELIN native workspace.');
  }

  let version =
    typeof current.schemaVersion === 'number' && Number.isInteger(current.schemaVersion)
      ? current.schemaVersion
      : 0;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error('This workspace was created by a newer MYELIN version.');
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 0) {
      current = migrateV0ToV1(current);
      version = 1;
      continue;
    }
    if (version === 1) {
      current = migrateV1ToV2(current);
      version = 2;
      continue;
    }

    throw new Error(`No migration is available from workspace schema ${version}.`);
  }

  return validateWorkspaceV2(current);
}

export function parseWorkspaceJson(raw: string): WorkspaceState {
  return migrateAndValidateWorkspace(JSON.parse(raw));
}

export function makeFreshWorkspace(now = Date.now()): WorkspaceState {
  return createEmptyWorkspace(now);
}
