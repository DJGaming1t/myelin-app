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

type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

type WorkspaceContextValue = {
  status: WorkspaceStatus;
  ownerKey: string | null;
  workspace: WorkspaceState | null;
  recovered: boolean;
  resetBecauseCorrupt: boolean;
  saveError: string;
  updateWorkspace: (change: (draft: WorkspaceState) => void) => WorkspaceState | null;
  resetWorkspace: () => Promise<void>;
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

  const workspaceRef = useRef<WorkspaceState | null>(null);
  const ownerKeyRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

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

  const updateWorkspace = useCallback((change: (draft: WorkspaceState) => void) => {
    const current = workspaceRef.current;
    const currentOwner = ownerKeyRef.current;
    if (!current || !currentOwner) return null;

    const next = cloneWorkspace(current);
    change(next);
    next.revision = current.revision + 1;
    next.updatedAt = Date.now();

    workspaceRef.current = next;
    setWorkspace(next);
    setSaveError('');

    saveQueue.current = saveQueue.current
      .then(() => workspaceStorage.save(currentOwner, next))
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : 'Could not save this workspace.');
      });

    return next;
  }, []);

  const resetWorkspace = useCallback(async () => {
    const currentOwner = ownerKeyRef.current;
    if (!currentOwner) return;

    setStatus('loading');
    setSaveError('');

    try {
      const fresh = await workspaceStorage.reset(currentOwner);
      if (ownerKeyRef.current !== currentOwner) return;
      workspaceRef.current = fresh;
      setWorkspace(fresh);
      setRecovered(false);
      setResetBecauseCorrupt(false);
      setStatus('ready');
    } catch (error) {
      if (ownerKeyRef.current !== currentOwner) return;
      setStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Could not reset this workspace.');
    }
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      ownerKey,
      workspace,
      recovered,
      resetBecauseCorrupt,
      saveError,
      updateWorkspace,
      resetWorkspace,
    }),
    [
      ownerKey,
      recovered,
      resetBecauseCorrupt,
      resetWorkspace,
      saveError,
      status,
      updateWorkspace,
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
