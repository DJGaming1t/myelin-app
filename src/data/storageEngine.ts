import { migrateAndValidateWorkspace, parseWorkspaceJson } from './migrations';
import { WorkspaceState, createEmptyWorkspace } from './schema';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type WorkspaceLoadResult = {
  workspace: WorkspaceState;
  recovered: boolean;
  recoverySource: 'primary' | 'pending' | 'backup' | 'fresh';
  resetBecauseCorrupt: boolean;
};

const ROOT = '@myelin/native/workspace';

function encodeOwner(ownerKey: string) {
  return encodeURIComponent(ownerKey);
}

export function getWorkspaceStorageKeys(ownerKey: string) {
  const base = `${ROOT}/${encodeOwner(ownerKey)}`;
  return {
    primary: `${base}/primary`,
    pending: `${base}/pending`,
    backup: `${base}/backup`,
    quarantine: `${base}/quarantine`,
    importRecovery: `${base}/import-recovery`,
  };
}

type ValidCandidate = {
  source: 'primary' | 'pending' | 'backup';
  raw: string;
  workspace: WorkspaceState;
};

function candidate(source: ValidCandidate['source'], raw: string | null): ValidCandidate | null {
  if (!raw) return null;
  try {
    return { source, raw, workspace: parseWorkspaceJson(raw) };
  } catch {
    return null;
  }
}

function newest(candidates: ValidCandidate[]): ValidCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    if (b.workspace.revision !== a.workspace.revision) {
      return b.workspace.revision - a.workspace.revision;
    }
    return b.workspace.updatedAt - a.workspace.updatedAt;
  })[0];
}

export function createWorkspaceStorageEngine(store: KeyValueStore) {
  return {
    async load(ownerKey: string): Promise<WorkspaceLoadResult> {
      const keys = getWorkspaceStorageKeys(ownerKey);
      const [primaryRaw, pendingRaw, backupRaw] = await Promise.all([
        store.getItem(keys.primary),
        store.getItem(keys.pending),
        store.getItem(keys.backup),
      ]);

      const valid = [
        candidate('primary', primaryRaw),
        candidate('pending', pendingRaw),
        candidate('backup', backupRaw),
      ].filter((value): value is ValidCandidate => Boolean(value));

      const selected = newest(valid);

      if (selected) {
        const recovered = selected.source !== 'primary';

        if (recovered) {
          await store.setItem(keys.primary, selected.raw);
        }

        if (pendingRaw) {
          await store.removeItem(keys.pending);
        }

        return {
          workspace: selected.workspace,
          recovered,
          recoverySource: selected.source,
          resetBecauseCorrupt: false,
        };
      }

      const hadSavedData = Boolean(primaryRaw || pendingRaw || backupRaw);

      if (hadSavedData) {
        const quarantine = JSON.stringify({
          capturedAt: Date.now(),
          ownerKey,
          primary: primaryRaw,
          pending: pendingRaw,
          backup: backupRaw,
        });

        await store.setItem(keys.quarantine, quarantine);
        await Promise.all([
          store.removeItem(keys.primary),
          store.removeItem(keys.pending),
          store.removeItem(keys.backup),
        ]);
      }

      const workspace = createEmptyWorkspace();
      await store.setItem(keys.primary, JSON.stringify(workspace));

      return {
        workspace,
        recovered: false,
        recoverySource: 'fresh',
        resetBecauseCorrupt: hadSavedData,
      };
    },

    async save(ownerKey: string, workspace: WorkspaceState): Promise<WorkspaceState> {
      const keys = getWorkspaceStorageKeys(ownerKey);
      const validated = migrateAndValidateWorkspace(workspace);
      const serialized = JSON.stringify(validated);
      const previousPrimary = await store.getItem(keys.primary);

      await store.setItem(keys.pending, serialized);

      if (previousPrimary) {
        try {
          parseWorkspaceJson(previousPrimary);
          await store.setItem(keys.backup, previousPrimary);
        } catch {
          // Never replace a known-good backup with an invalid primary.
        }
      }

      await store.setItem(keys.primary, serialized);
      await store.removeItem(keys.pending);
      return validated;
    },

    async reset(ownerKey: string): Promise<WorkspaceState> {
      const keys = getWorkspaceStorageKeys(ownerKey);
      await Promise.all([
        store.removeItem(keys.primary),
        store.removeItem(keys.pending),
        store.removeItem(keys.backup),
        store.removeItem(keys.quarantine),
        store.removeItem(keys.importRecovery),
      ]);
      const workspace = createEmptyWorkspace();
      await store.setItem(keys.primary, JSON.stringify(workspace));
      return workspace;
    },

    async readQuarantine(ownerKey: string): Promise<string | null> {
      return store.getItem(getWorkspaceStorageKeys(ownerKey).quarantine);
    },

    async saveImportRecovery(ownerKey: string, workspace: WorkspaceState) {
      const validated = migrateAndValidateWorkspace(workspace);
      await store.setItem(
        getWorkspaceStorageKeys(ownerKey).importRecovery,
        JSON.stringify(validated),
      );
      return validated;
    },

    async loadImportRecovery(ownerKey: string): Promise<WorkspaceState | null> {
      const raw = await store.getItem(getWorkspaceStorageKeys(ownerKey).importRecovery);
      if (!raw) return null;
      try {
        return parseWorkspaceJson(raw);
      } catch {
        await store.removeItem(getWorkspaceStorageKeys(ownerKey).importRecovery);
        return null;
      }
    },

    async clearImportRecovery(ownerKey: string) {
      await store.removeItem(getWorkspaceStorageKeys(ownerKey).importRecovery);
    },
  };
}
