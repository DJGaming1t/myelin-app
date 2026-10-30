import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useWorkspace } from '@/src/data/WorkspaceProvider';

import {
  OnboardingOutcome,
  OnboardingRecord,
  createOnboardingRecord,
  hasMeaningfulWorkspaceData,
} from './onboarding-engine';
import { onboardingStorage } from './onboarding-storage';

type OnboardingContextValue = {
  ready: boolean;
  shouldShow: boolean;
  record: OnboardingRecord | null;
  finish: (outcome?: Exclude<OnboardingOutcome, 'existing-data'>) => Promise<void>;
  restart: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { ownerKey, status, workspace } = useWorkspace();
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<OnboardingRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    setRecord(null);

    if (!ownerKey) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (status === 'error') {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (status !== 'ready' || !workspace) {
      return () => {
        cancelled = true;
      };
    }

    const workspaceAtLoad = workspace;

    onboardingStorage
      .load(ownerKey)
      .then(async (stored) => {
        if (cancelled) return;

        if (stored) {
          setRecord(stored);
          setReady(true);
          return;
        }

        if (hasMeaningfulWorkspaceData(workspaceAtLoad)) {
          const experienced = createOnboardingRecord('existing-data');
          await onboardingStorage.save(ownerKey, experienced);
          if (cancelled) return;
          setRecord(experienced);
        }

        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
    // Deliberately keyed to owner/status rather than workspace revision.
    // Once a fresh user begins onboarding, creating their first topic must not
    // make the provider auto-classify them as an experienced user mid-flow.
  }, [ownerKey, status]);

  const finish = useCallback(
    async (outcome: 'completed' | 'skipped' = 'completed') => {
      if (!ownerKey) return;
      const next = createOnboardingRecord(outcome);
      await onboardingStorage.save(ownerKey, next);
      setRecord(next);
      setReady(true);
    },
    [ownerKey],
  );

  const restart = useCallback(async () => {
    if (!ownerKey) return;
    await onboardingStorage.clear(ownerKey);
    setRecord(null);
    setReady(true);
  }, [ownerKey]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ready,
      shouldShow:
        ready &&
        Boolean(ownerKey) &&
        status === 'ready' &&
        Boolean(workspace) &&
        !record,
      record,
      finish,
      restart,
    }),
    [finish, ownerKey, ready, record, restart, status, workspace],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used inside OnboardingProvider.');
  }
  return value;
}
