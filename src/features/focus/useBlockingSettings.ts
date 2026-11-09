import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from './FocusProvider';
import { timerRemainingMs } from './focus-engine';
import {
  FocusShieldConfig,
  defaultFocusShieldConfig,
  focusShieldStorage,
} from './focus-shield';
import { syncFocusShieldNativeSession } from './focus-shield-native';

export class BlockingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockingInputError';
  }
}

export function invalidBlockingInput(message = 'Check that blocking rule and try again.'): never {
  throw new BlockingInputError(message);
}

export function parseBlockingTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function useBlockingSettings() {
  const { ownerKey } = useWorkspace();
  const { session } = useFocus();
  const [config, setConfig] = useState<FocusShieldConfig>(() => defaultFocusShieldConfig());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configRef = useRef(config);
  configRef.current = config;
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;

  useEffect(() => {
    if (!ownerKey) {
      const fallback = defaultFocusShieldConfig();
      configRef.current = fallback;
      setConfig(fallback);
      setReady(false);
      setBusy(false);
      setError('');
      return;
    }
    let cancelled = false;
    setReady(false);
    setError('');
    const unsub = focusShieldStorage.subscribe(ownerKey, (next) => {
      if (cancelled) return;
      configRef.current = next;
      setConfig(next);
      setReady(true);
    });
    void focusShieldStorage
      .load(ownerKey)
      .then((loaded) => {
        if (cancelled) return;
        configRef.current = loaded;
        setConfig(loaded);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
          setError('Could not load saved blocking preferences.');
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ownerKey]);

  const change = useCallback(
    async (recipe: (previous: FocusShieldConfig) => FocusShieldConfig): Promise<boolean> => {
      const activeOwner = ownerRef.current;
      if (!activeOwner || busy) return false;
      setError('');
      let next: FocusShieldConfig;
      try {
        next = recipe(configRef.current);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid blocking rule.');
        return false;
      }
      setBusy(true);
      try {
        await focusShieldStorage.save(activeOwner, next);
        if (ownerRef.current !== activeOwner) return false;
        configRef.current = next;
        setConfig(next);
        const remainingMs = session ? timerRemainingMs(session, Date.now()) : 0;
        await syncFocusShieldNativeSession({
          config: next,
          sessionId: session?.id ?? null,
          sessionRunning: Boolean(session?.runningSince),
          phase: session?.phase ?? 'idle',
          remainingMs,
          topicName: session?.topicName ?? '',
          tinyStep: session?.tinyStep ?? '',
        });
        return true;
      } catch (err) {
        if (ownerRef.current === activeOwner) {
          setError(err instanceof Error ? err.message : 'Could not save blocking rule.');
        }
        return false;
      } finally {
        if (ownerRef.current === activeOwner) {
          setBusy(false);
        }
      }
    },
    [busy, session],
  );

  return {
    config,
    ready,
    busy,
    error,
    setError,
    change,
  };
}
