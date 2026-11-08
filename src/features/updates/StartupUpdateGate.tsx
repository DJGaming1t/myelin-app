import * as Updates from 'expo-updates';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';

import { MyelinArrival } from '@/src/components/app/MyelinArrival';

const STARTUP_UPDATE_GATE_MS = 4500;

export function StartupUpdateGate({ children }: PropsWithChildren) {
  const {
    isStartupProcedureRunning,
    isUpdatePending,
  } = Updates.useUpdates();

  const shouldCheck = Updates.isEnabled;
  const shouldGate = shouldCheck && Updates.isEmbeddedLaunch;
  const [ready, setReady] = useState(!shouldGate);
  const released = useRef(!shouldGate);
  const reloadStarted = useRef(false);
  const manualCheckStarted = useRef(false);

  useEffect(() => {
    if (!shouldGate) return;

    const timeout = setTimeout(() => {
      released.current = true;
      setReady(true);
    }, STARTUP_UPDATE_GATE_MS);

    return () => clearTimeout(timeout);
  }, [shouldGate]);

  useEffect(() => {
    if (!shouldCheck || reloadStarted.current) return;

    if (isUpdatePending) {
      reloadStarted.current = true;
      void Updates.reloadAsync().catch(() => {
        released.current = true;
        setReady(true);
      });
      return;
    }

    if (isStartupProcedureRunning || manualCheckStarted.current) return;

    manualCheckStarted.current = true;

    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();

        if (!check.isAvailable) {
          if (shouldGate && !released.current) {
            released.current = true;
            setReady(true);
          }
          return;
        }

        await Updates.fetchUpdateAsync();

        reloadStarted.current = true;
        await Updates.reloadAsync();
      } catch {
        if (shouldGate && !released.current) {
          released.current = true;
          setReady(true);
        }
      }
    })();
  }, [
    isStartupProcedureRunning,
    isUpdatePending,
    shouldCheck,
    shouldGate,
  ]);

  if (ready) return <>{children}</>;

  return <MyelinArrival loading label="Checking for updates…" />;
}

