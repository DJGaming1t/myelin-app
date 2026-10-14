import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/src/features/auth/AuthProvider';

import { workspaceOwnerKey } from './owner';
import { WorkspaceState, cloneWorkspace, createEmptyWorkspace } from './schema';
import { workspaceStorage } from './storage';
import { validateWorkspaceV2 } from './validation';

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type WorkspaceUpdateGuard = {
  ownerKey: string;
  canApply: (current: WorkspaceState) => boolean;
};

type WorkspaceContextValue = {
  status: WorkspaceStatus;
  ownerKey: string | null;
  workspace: WorkspaceState | null;
  recovered: boolean;
  resetBecauseCorrupt: boolean;
  saveError: string;
  readWorkspace: (expectedOwner: string) => WorkspaceState | null;
  updateWorkspace: (change: (draft: WorkspaceState) => void, guard?: WorkspaceUpdateGuard) => WorkspaceState | null;
  waitForSaves: () => Promise<void>;
  retrySaves: (expectedOwner: string) => Promise<boolean>;
  resetWorkspace: () => Promise<void>;
  retryWorkspace: () => Promise<void>;
  replaceWorkspace: (next: WorkspaceState, expectedRevision: number) => Promise<WorkspaceState>;
  commitAssistantWorkspace: (
    next: WorkspaceState,
    expectedRevision: number,
  ) => Promise<WorkspaceState>;
  restoreImportRecovery: (expectedRevision: number) => Promise<WorkspaceState | null>;
  hasImportRecovery: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { ready: authReady, user, localMode } = useAuth();
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [resetBecauseCorrupt, setResetBecauseCorrupt] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasImportRecovery, setHasImportRecovery] = useState(false);

  const workspaceRef = useRef<WorkspaceState | null>(null);
  const ownerKeyRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const statusRef = useRef(status); statusRef.current = status;

  useEffect(() => {
    let cancelled = false;

    if (!authReady) {
      setStatus('loading');
      return () => {
        cancelled = true;
      };
    }

    const nextOwnerKey = localMode
      ? workspaceOwnerKey({ kind: 'local' })
      : user
        ? workspaceOwnerKey({ kind: 'user', uid: user.uid })
        : null;

    ownerKeyRef.current = nextOwnerKey;
    workspaceRef.current = null;
    setOwnerKey(nextOwnerKey);
    setWorkspace(null);
    setRecovered(false);
    setResetBecauseCorrupt(false);
    setSaveError('');
    setHasImportRecovery(false);

    if (!nextOwnerKey) {
      setStatus('idle');
      return () => {
        cancelled = true;
      };
    }

    setStatus('loading');

    workspaceStorage
      .load(nextOwnerKey)
      .then((result) => {
        if (cancelled || ownerKeyRef.current !== nextOwnerKey) return;
        workspaceRef.current = result.workspace;
        setWorkspace(result.workspace);
        setRecovered(result.recovered);
        setResetBecauseCorrupt(result.resetBecauseCorrupt);
        workspaceStorage
          .loadImportRecovery(nextOwnerKey)
          .then((recovery) => {
            if (!cancelled && ownerKeyRef.current === nextOwnerKey) {
              setHasImportRecovery(Boolean(recovery));
            }
          })
          .catch(() => undefined);
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled || ownerKeyRef.current !== nextOwnerKey) return;
        setStatus('error');
        setSaveError(error instanceof Error ? error.message : 'Could not load this workspace.');
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, localMode, user?.uid]);

  // Read the live owner-bound record without queuing a no-op mutation.
  const readWorkspace = useCallback((expectedOwner: string) =>
    statusRef.current === 'ready' && ownerKeyRef.current === expectedOwner ? workspaceRef.current : null, []);

  const updateWorkspace = useCallback((change: (draft: WorkspaceState) => void, guard?: WorkspaceUpdateGuard) => {
    const current = workspaceRef.current;
    const currentOwner = ownerKeyRef.current;
    if (!current || !currentOwner) return null;
    // Evaluate against the live record, before cloning, revisions or queued saves.
    if (guard && (guard.ownerKey !== currentOwner || !guard.canApply(current))) return null;

    const next = cloneWorkspace(current);
    change(next);
    next.revision = current.revision + 1;
    next.updatedAt = Date.now();

    workspaceRef.current = next;
    setWorkspace(next);
    setSaveError('');

    const queuedSave = saveQueue.current
      .catch(() => undefined)
      .then(() => workspaceStorage.save(currentOwner, next));

    saveQueue.current = queuedSave;
    void queuedSave.then(() => {
      if (ownerKeyRef.current === currentOwner && saveQueue.current === queuedSave) setSaveError('');
    }, (error) => {
      if (ownerKeyRef.current !== currentOwner || saveQueue.current !== queuedSave) return;
      setSaveError(error instanceof Error ? error.message : 'Could not save this workspace.');
    });

    return next;
  }, []);

  const waitForSaves = useCallback(async () => {
    await saveQueue.current;
  }, []);

  const retrySaves = useCallback(async (expectedOwner: string) => {
    if (ownerKeyRef.current !== expectedOwner || !workspaceRef.current) return false;
    // Retry persistence of the latest live snapshot, without repeating the user action.
    const queued = saveQueue.current.catch(() => undefined).then(async () => {
      if (ownerKeyRef.current !== expectedOwner || !workspaceRef.current) return false;
      await workspaceStorage.save(expectedOwner, cloneWorkspace(workspaceRef.current));
      return true;
    });
    saveQueue.current = queued;
    try {
      const saved = await queued;
      if (ownerKeyRef.current !== expectedOwner) return false;
      if (saved && saveQueue.current === queued) setSaveError('');
      return saved;
    } catch (error) {
      if (ownerKeyRef.current === expectedOwner && saveQueue.current === queued) setSaveError(error instanceof Error ? error.message : 'Could not save this workspace.');
      return false;
    }
  }, []);

  const retryWorkspace = useCallback(async () => {
    const currentOwner = ownerKeyRef.current;
    if (!currentOwner) return;

    setStatus('loading');
    setSaveError('');

    try {
      const result = await workspaceStorage.load(currentOwner);
      if (ownerKeyRef.current !== currentOwner) return;

      workspaceRef.current = result.workspace;
      setWorkspace(result.workspace);
      setRecovered(result.recovered);
      setResetBecauseCorrupt(result.resetBecauseCorrupt);

      const recovery = await workspaceStorage
        .loadImportRecovery(currentOwner)
        .catch(() => null);

      if (ownerKeyRef.current !== currentOwner) return;
      setHasImportRecovery(Boolean(recovery));
      setStatus('ready');
    } catch (error) {
      if (ownerKeyRef.current !== currentOwner) return;
      setStatus('error');
      setSaveError(
        error instanceof Error ? error.message : 'Could not load this workspace.',
      );
    }
  }, []);

  const resetWorkspace = useCallback(async () => {
    const currentOwner = ownerKeyRef.current;
    if (!currentOwner) return;

    setStatus('loading');
    setSaveError('');

    try {
      // Let an already-started write finish before deleting this workspace so
      // a late pending save cannot recreate data after a reset.
      await saveQueue.current.catch(() => undefined);
      const fresh = await workspaceStorage.reset(currentOwner);
      if (ownerKeyRef.current !== currentOwner) return;
      workspaceRef.current = fresh;
      setWorkspace(fresh);
      setRecovered(false);
      setResetBecauseCorrupt(false);
      setHasImportRecovery(false);
      setStatus('ready');
    } catch (error) {
      if (ownerKeyRef.current !== currentOwner) return;
      setStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Could not reset this workspace.');
    }
  }, []);

  const replaceWorkspace = useCallback(
    async (incoming: WorkspaceState, expectedRevision: number) => {
      const currentOwner = ownerKeyRef.current;
      const current = workspaceRef.current;
      if (!currentOwner || !current) throw new Error('No workspace is open.');
      if (current.revision !== expectedRevision) {
        throw new Error(
          'This workspace changed after the import preview. Preview the file again before importing.',
        );
      }

      await saveQueue.current;

      const latest = workspaceRef.current;
      if (!latest || latest.revision !== expectedRevision) {
        throw new Error(
          'This workspace changed while the import was preparing. No imported data was applied.',
        );
      }

      await workspaceStorage.saveImportRecovery(currentOwner, latest);

      const replacement = cloneWorkspace(incoming);
      replacement.revision = latest.revision + 1;
      replacement.updatedAt = Date.now();

      const saved = await workspaceStorage.save(currentOwner, replacement);
      if (ownerKeyRef.current !== currentOwner) {
        throw new Error('The active workspace changed before import completed.');
      }

      workspaceRef.current = saved;
      setWorkspace(saved);
      setRecovered(false);
      setResetBecauseCorrupt(false);
      setSaveError('');
      setHasImportRecovery(true);
      return saved;
    },
    [],
  );

  const commitAssistantWorkspace = useCallback(
    async (incoming: WorkspaceState, expectedRevision: number) => {
      const currentOwner = ownerKeyRef.current;
      const current = workspaceRef.current;
      if (!currentOwner || !current) throw new Error('No workspace is open.');
      if (current.revision !== expectedRevision) {
        throw new Error(
          'This workspace changed after the assistant preview. Preview the actions again before applying them.',
        );
      }

      await saveQueue.current;

      const latest = workspaceRef.current;
      if (!latest || latest.revision !== expectedRevision) {
        throw new Error(
          'This workspace changed while the assistant action was preparing. No assistant changes were applied.',
        );
      }

      const replacement = validateWorkspaceV2(cloneWorkspace(incoming));
      if (replacement.revision !== expectedRevision + 1) {
        throw new Error('Assistant workspace revision is invalid.');
      }

      const saved = await workspaceStorage.save(currentOwner, replacement);
      if (ownerKeyRef.current !== currentOwner) {
        throw new Error('The active workspace changed before assistant changes were saved.');
      }

      workspaceRef.current = saved;
      setWorkspace(saved);
      setRecovered(false);
      setResetBecauseCorrupt(false);
      setSaveError('');
      return saved;
    },
    [],
  );

  const restoreImportRecovery = useCallback(async (expectedRevision: number) => {
    const currentOwner = ownerKeyRef.current;
    const current = workspaceRef.current;
    if (!currentOwner || !current) return null;
    if (current.revision !== expectedRevision) {
      throw new Error(
        'This workspace changed before recovery could be restored. Try again from the latest screen.',
      );
    }

    await saveQueue.current;
    const recovery = await workspaceStorage.loadImportRecovery(currentOwner);
    if (!recovery) {
      setHasImportRecovery(false);
      return null;
    }

    const currentSnapshot = cloneWorkspace(current);
    const replacement = cloneWorkspace(recovery);
    replacement.revision = current.revision + 1;
    replacement.updatedAt = Date.now();

    const saved = await workspaceStorage.save(currentOwner, replacement);
    await workspaceStorage.saveImportRecovery(currentOwner, currentSnapshot);

    workspaceRef.current = saved;
    setWorkspace(saved);
    setRecovered(false);
    setResetBecauseCorrupt(false);
    setSaveError('');
    setHasImportRecovery(true);
    return saved;
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      ownerKey,
      workspace,
      recovered,
      resetBecauseCorrupt,
      saveError,
      readWorkspace,
      updateWorkspace,
      waitForSaves,
      retrySaves,
      resetWorkspace,
      retryWorkspace,
      replaceWorkspace,
      commitAssistantWorkspace,
      restoreImportRecovery,
      hasImportRecovery,
    }),
    [
      hasImportRecovery,
      ownerKey,
      recovered,
      resetBecauseCorrupt,
      replaceWorkspace,
      commitAssistantWorkspace,
      resetWorkspace,
      retryWorkspace,
      restoreImportRecovery,
      saveError,
      status,
      readWorkspace,
      updateWorkspace,
      waitForSaves,
      retrySaves,
      workspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return value;
}
