import { deleteUser } from 'firebase/auth';
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

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { workspaceStorage } from '@/src/data/storage';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { mergeWorkspaces } from '@/src/features/transfer/backup-engine';

import {
  deleteCloudSnapshot,
  readCloudSnapshot,
  writeCloudSnapshot,
} from './firestore-sync';
import {
  CloudSnapshot,
  decideSync,
  isPristineWorkspace,
  workspaceFingerprint,
} from './sync-engine';
import {
  SyncPreference,
  syncPreferenceStorage,
} from './sync-storage';

export const CLOUD_SYNC_RELEASE_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC === '1';

export type CloudSyncStatus =
  | 'unavailable'
  | 'off'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'paused'
  | 'conflict'
  | 'error';

export type ConflictChoice = 'device' | 'cloud' | 'merge';

type CloudSyncContextValue = {
  releaseEnabled: boolean;
  enabled: boolean;
  preferenceReady: boolean;
  status: CloudSyncStatus;
  message: string;
  lastSyncAt: number;
  conflict: boolean;
  enableSync: () => Promise<void>;
  disableSync: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (choice: ConflictChoice) => Promise<void>;
  deleteCloudCopy: () => Promise<void>;
  deleteAccountAndCloud: () => Promise<void>;
};

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

const emptyPreference = (): SyncPreference => ({
  enabled: false,
  baselineFingerprint: null,
  lastSyncAt: 0,
});

function friendlySyncError(error: unknown) {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (
    code === 'unavailable' ||
    code === 'firestore/unavailable' ||
    code === 'failed-precondition'
  ) {
    return 'Cloud sync is unavailable right now. Your device workspace is still saved locally.';
  }
  if (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied'
  ) {
    return 'Cloud sync was blocked by Firestore Security Rules. No local data was changed.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Cloud sync could not complete. Your local workspace is unchanged.';
}

export function CloudSyncProvider({ children }: PropsWithChildren) {
  const { user, localMode } = useAuth();
  const {
    ownerKey,
    workspace,
    waitForSaves,
    replaceWorkspace,
  } = useWorkspace();
  const { session: focusSession, discard: discardFocus } = useFocus();
  const { session: reviewSession, discardReview } = useReview();

  const [preference, setPreference] = useState<SyncPreference>(emptyPreference);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [status, setStatus] = useState<CloudSyncStatus>(
    CLOUD_SYNC_RELEASE_ENABLED ? 'off' : 'unavailable',
  );
  const [message, setMessage] = useState('');
  const [conflictSnapshot, setConflictSnapshot] =
    useState<CloudSnapshot | null>(null);

  const preferenceRef = useRef(preference);
  const workspaceRef = useRef(workspace);
  const syncingRef = useRef(false);
  const statusRef = useRef<CloudSyncStatus>(
    CLOUD_SYNC_RELEASE_ENABLED ? 'off' : 'unavailable',
  );

  useEffect(() => {
    preferenceRef.current = preference;
  }, [preference]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setPreferenceReady(false);
    setConflictSnapshot(null);
    setMessage('');

    if (!CLOUD_SYNC_RELEASE_ENABLED) {
      setPreference(emptyPreference());
      setStatus('unavailable');
      setPreferenceReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (!user || localMode) {
      setPreference(emptyPreference());
      setStatus('off');
      setPreferenceReady(true);
      return () => {
        cancelled = true;
      };
    }

    syncPreferenceStorage
      .load(user.uid)
      .then((loaded) => {
        if (cancelled) return;
        preferenceRef.current = loaded;
        setPreference(loaded);
        setStatus(loaded.enabled ? 'idle' : 'off');
        setPreferenceReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fresh = emptyPreference();
        preferenceRef.current = fresh;
        setPreference(fresh);
        setStatus('off');
        setPreferenceReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [localMode, user?.uid]);

  const savePreference = useCallback(
    async (next: SyncPreference) => {
      if (!user) return;
      preferenceRef.current = next;
      setPreference(next);
      await syncPreferenceStorage.save(user.uid, next);
    },
    [user],
  );

  const syncNow = useCallback(async () => {
    const currentUser = user;
    const currentWorkspace = workspaceRef.current;
    const currentPreference = preferenceRef.current;

    if (!CLOUD_SYNC_RELEASE_ENABLED) {
      setStatus('unavailable');
      setMessage(
        'Cloud sync code is installed but production activation is still locked until Firestore rules are deployed.',
      );
      return;
    }
    if (!currentUser || localMode || !currentWorkspace) {
      setStatus('off');
      return;
    }
    if (!currentUser.emailVerified) {
      setStatus('paused');
      setMessage('Verify your account before syncing study data.');
      return;
    }
    if (!currentPreference.enabled || syncingRef.current) return;

    syncingRef.current = true;
    setStatus('syncing');
    setMessage('');

    try {
      await waitForSaves();

      const local = workspaceRef.current;
      if (!local) throw new Error('No local workspace is open.');

      const cloud = await readCloudSnapshot(currentUser.uid);
      const localFingerprint = workspaceFingerprint(local);
      const cloudFingerprint = cloud?.manifest.fingerprint ?? null;
      const decision = decideSync({
        localFingerprint,
        cloudFingerprint,
        baselineFingerprint: currentPreference.baselineFingerprint,
        localPristine: isPristineWorkspace(local),
      });

      if (decision === 'conflict') {
        setConflictSnapshot(cloud);
        setStatus('conflict');
        setMessage(
          'This device and the cloud both changed since the last successful sync. Choose which copy to keep or merge them safely.',
        );
        return;
      }

      if (decision === 'upload') {
        const uploaded = await writeCloudSnapshot(currentUser.uid, local);
        const next = {
          enabled: true,
          baselineFingerprint: uploaded.manifest.fingerprint,
          lastSyncAt: Date.now(),
        };
        await savePreference(next);
        setConflictSnapshot(null);
        setStatus('synced');
        setMessage('Device changes synced to the cloud.');
        return;
      }

      if (decision === 'download') {
        if (!cloud) throw new Error('Cloud workspace disappeared before download.');
        if (focusSession || reviewSession) {
          setStatus('paused');
          setMessage(
            'Cloud has newer study data. Finish the current Focus or Review session before applying it.',
          );
          return;
        }

        const current = workspaceRef.current;
        if (!current) throw new Error('No local workspace is open.');
        await replaceWorkspace(cloud.workspace, current.revision);

        const next = {
          enabled: true,
          baselineFingerprint: cloud.manifest.fingerprint,
          lastSyncAt: Date.now(),
        };
        await savePreference(next);
        setConflictSnapshot(null);
        setStatus('synced');
        setMessage('Newer cloud data was applied to this device.');
        return;
      }

      const next = {
        enabled: true,
        baselineFingerprint: localFingerprint,
        lastSyncAt: Date.now(),
      };
      await savePreference(next);
      setConflictSnapshot(null);
      setStatus('synced');
      setMessage('Cloud and device are already in sync.');
    } catch (error) {
      setStatus('error');
      setMessage(friendlySyncError(error));
    } finally {
      syncingRef.current = false;
    }
  }, [
    focusSession,
    localMode,
    replaceWorkspace,
    reviewSession,
    savePreference,
    user,
    waitForSaves,
  ]);

  const enableSync = useCallback(async () => {
    if (!CLOUD_SYNC_RELEASE_ENABLED) {
      setStatus('unavailable');
      setMessage(
        'Production cloud sync is locked until the tested Firestore rules are deployed.',
      );
      return;
    }
    if (!user || localMode) return;
    const next = {
      ...preferenceRef.current,
      enabled: true,
    };
    await savePreference(next);
    setStatus('idle');
    await syncNow();
  }, [localMode, savePreference, syncNow, user]);

  const disableSync = useCallback(async () => {
    if (!user) return;
    const next = {
      ...preferenceRef.current,
      enabled: false,
    };
    await savePreference(next);
    setConflictSnapshot(null);
    setStatus('off');
    setMessage('Cloud sync is off. Local study data remains on this device.');
  }, [savePreference, user]);

  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      if (
        !CLOUD_SYNC_RELEASE_ENABLED ||
        !user ||
        localMode ||
        !workspaceRef.current
      ) {
        return;
      }
      if (!conflictSnapshot) {
        await syncNow();
        return;
      }
      if ((choice === 'cloud' || choice === 'merge') && (focusSession || reviewSession)) {
        setStatus('paused');
        setMessage(
          'Finish the current Focus or Review session before replacing or merging device data.',
        );
        return;
      }

      syncingRef.current = true;
      setStatus('syncing');
      setMessage('');

      try {
        await waitForSaves();
        const local = workspaceRef.current;
        if (!local) throw new Error('No local workspace is open.');

        const latestCloud = await readCloudSnapshot(user.uid);
        const expectedCloudFingerprint = conflictSnapshot.manifest.fingerprint;
        if (
          !latestCloud ||
          latestCloud.manifest.fingerprint !== expectedCloudFingerprint
        ) {
          setConflictSnapshot(null);
          throw new Error(
            'The cloud copy changed again. Sync once more before resolving the conflict.',
          );
        }

        if (choice === 'device') {
          const uploaded = await writeCloudSnapshot(user.uid, local);
          await savePreference({
            enabled: true,
            baselineFingerprint: uploaded.manifest.fingerprint,
            lastSyncAt: Date.now(),
          });
          setConflictSnapshot(null);
          setStatus('synced');
          setMessage('This device copy replaced the conflicting cloud copy.');
          return;
        }

        if (choice === 'cloud') {
          await replaceWorkspace(latestCloud.workspace, local.revision);
          await savePreference({
            enabled: true,
            baselineFingerprint: latestCloud.manifest.fingerprint,
            lastSyncAt: Date.now(),
          });
          setConflictSnapshot(null);
          setStatus('synced');
          setMessage('The cloud copy replaced this device workspace.');
          return;
        }

        const merged = mergeWorkspaces(local, latestCloud.workspace);
        const saved = await replaceWorkspace(merged.workspace, local.revision);
        const uploaded = await writeCloudSnapshot(user.uid, saved);
        await savePreference({
          enabled: true,
          baselineFingerprint: uploaded.manifest.fingerprint,
          lastSyncAt: Date.now(),
        });
        setConflictSnapshot(null);
        setStatus('synced');
        setMessage(
          'Device and cloud data were merged safely. Conflicting record IDs were preserved separately.',
        );
      } catch (error) {
        setStatus('error');
        setMessage(friendlySyncError(error));
      } finally {
        syncingRef.current = false;
      }
    },
    [
      conflictSnapshot,
      focusSession,
      localMode,
      replaceWorkspace,
      reviewSession,
      savePreference,
      syncNow,
      user,
      waitForSaves,
    ],
  );

  const deleteCloudCopy = useCallback(async () => {
    if (!CLOUD_SYNC_RELEASE_ENABLED || !user || localMode) return;
    setStatus('syncing');
    setMessage('');
    try {
      await deleteCloudSnapshot(user.uid);
      await savePreference({
        enabled: false,
        baselineFingerprint: null,
        lastSyncAt: 0,
      });
      setConflictSnapshot(null);
      setStatus('off');
      setMessage('The cloud copy was deleted. Local study data remains on this device.');
    } catch (error) {
      setStatus('error');
      setMessage(friendlySyncError(error));
    }
  }, [localMode, savePreference, user]);

  const deleteAccountAndCloud = useCallback(async () => {
    if (!user || localMode) return;
    const uid = user.uid;
    const localOwnerKey = ownerKey;

    setStatus('syncing');
    setMessage('');
    try {
      await Promise.all([
        focusSession ? discardFocus() : Promise.resolve(),
        reviewSession ? discardReview() : Promise.resolve(),
      ]);

      // A build with cloud sync disabled has never been allowed to upload a
      // cloud workspace, so account deletion must still remain available.
      // Once cloud sync is released, delete its copy before deleting Auth.
      if (CLOUD_SYNC_RELEASE_ENABLED) {
        await deleteCloudSnapshot(uid);
      }
      await syncPreferenceStorage.save(uid, {
        enabled: false,
        baselineFingerprint: null,
        lastSyncAt: 0,
      });

      try {
        await deleteUser(user);
      } catch (error) {
        setPreference(emptyPreference());
        setStatus('off');
        const code = (error as { code?: string } | null)?.code;
        if (code === 'auth/requires-recent-login') {
          setMessage(
            'Cloud study data was deleted, but Firebase requires a recent sign-in before the account itself can be deleted. Sign out, sign in again, then retry account deletion.',
          );
          return;
        }
        throw error;
      }

      if (localOwnerKey) {
        await workspaceStorage.reset(localOwnerKey);
      }
      await syncPreferenceStorage.clear(uid);
      setPreference(emptyPreference());
      setConflictSnapshot(null);
      setStatus('off');
      setMessage('Account, cloud study data and this device workspace were deleted.');
    } catch (error) {
      setStatus('error');
      setMessage(friendlySyncError(error));
    }
  }, [
    discardFocus,
    discardReview,
    focusSession,
    localMode,
    ownerKey,
    reviewSession,
    user,
  ]);

  useEffect(() => {
    if (
      !CLOUD_SYNC_RELEASE_ENABLED ||
      !preferenceReady ||
      !preference.enabled ||
      !user ||
      localMode ||
      !workspace
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (
        statusRef.current !== 'syncing' &&
        statusRef.current !== 'conflict'
      ) {
        void syncNow();
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [
    localMode,
    preference.enabled,
    preferenceReady,
    syncNow,
    user?.uid,
    workspace?.revision,
  ]);

  useEffect(() => {
    if (
      !CLOUD_SYNC_RELEASE_ENABLED ||
      !preferenceReady ||
      !preference.enabled ||
      !user ||
      localMode
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (
        statusRef.current !== 'syncing' &&
        statusRef.current !== 'conflict'
      ) {
        void syncNow();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [
    localMode,
    preference.enabled,
    preferenceReady,
    syncNow,
    user?.uid,
  ]);

  const value = useMemo<CloudSyncContextValue>(
    () => ({
      releaseEnabled: CLOUD_SYNC_RELEASE_ENABLED,
      enabled: preference.enabled,
      preferenceReady,
      status,
      message,
      lastSyncAt: preference.lastSyncAt,
      conflict: status === 'conflict',
      enableSync,
      disableSync,
      syncNow,
      resolveConflict,
      deleteCloudCopy,
      deleteAccountAndCloud,
    }),
    [
      deleteAccountAndCloud,
      deleteCloudCopy,
      disableSync,
      enableSync,
      message,
      preference.enabled,
      preference.lastSyncAt,
      preferenceReady,
      resolveConflict,
      status,
      syncNow,
    ],
  );

  return (
    <CloudSyncContext.Provider value={value}>
      {children}
    </CloudSyncContext.Provider>
  );
}

export function useCloudSync() {
  const value = useContext(CloudSyncContext);
  if (!value) {
    throw new Error('useCloudSync must be used inside CloudSyncProvider.');
  }
  return value;
}
