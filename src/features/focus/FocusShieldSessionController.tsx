import { useEffect, useRef, useState } from 'react';
import { AppState, Text } from 'react-native';
import { defaultFocusShieldConfig, focusShieldStorage, FocusShieldConfig } from './focus-shield';
import { syncFocusShieldNativeSession } from './focus-shield-native';
import { timerRemainingMs } from './focus-engine';
import { FocusSessionState } from './types';

/** Own native synchronization for the provider lifetime, including navigation away from Focus. */
export function FocusShieldSessionController({ ownerKey, session }: {
  ownerKey: string | null;
  session: FocusSessionState | null;
}) {
  const [loaded, setLoaded] = useState<{ owner: string; config: FocusShieldConfig } | null>(null);
  const [error, setError] = useState(false);
  const live = useRef({ ownerKey, session, loaded });
  live.current = { ownerKey, session, loaded };

  useEffect(() => {
    if (!ownerKey) return;
    let cancelled = false;
    let changed = false;
    const unsubscribe = focusShieldStorage.subscribe(ownerKey, config => {
      changed = true;
      if (!cancelled) setLoaded({ owner: ownerKey, config });
    });
    void focusShieldStorage.load(ownerKey).then(config => {
      if (!cancelled && !changed) setLoaded({ owner: ownerKey, config });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; unsubscribe(); };
  }, [ownerKey]);

  useEffect(() => {
    let disposed = false;
    async function sync() {
      const { ownerKey: owner, session: current, loaded: preferences } = live.current;
      const config = owner && preferences?.owner === owner ? preferences.config : defaultFocusShieldConfig();
      const focusSession = config.focusBlockingEnabled ? current : null;
      const running = !!owner && focusSession?.runningSince != null && timerRemainingMs(focusSession) > 0;
      // Native expiry handles background operation; new FGS starts require a visible app.
      if (AppState.currentState !== 'active' && (running || !config.sessionOnly)) return;
      const ok = await syncFocusShieldNativeSession({
        config, ownerKey: owner, sessionId: owner && focusSession ? `${owner}:${focusSession.id}` : owner ? `${owner}:scheduled` : null,
        sessionRunning: running, phase: focusSession?.phase ?? 'idle',
        remainingMs: focusSession ? timerRemainingMs(focusSession) : 0,
        topicName: focusSession?.topicName ?? 'App blocking', tinyStep: focusSession?.tinyStep ?? '',
      });
      if (!disposed) setError(config.mode !== 'off' && (running || !config.sessionOnly) && !ok);
    }
    void sync();
    const scheduleTick = setInterval(() => {
      const preferences = live.current.loaded;
      if (AppState.currentState === 'active' && preferences?.config.mode !== 'off' && preferences?.config.sessionOnly === false) void sync();
    }, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { disposed = true; clearInterval(scheduleTick); subscription.remove(); };
  }, [ownerKey, loaded, session]);

  useEffect(() => () => {
    void syncFocusShieldNativeSession({ config: defaultFocusShieldConfig(), sessionId: null,
      sessionRunning: false, phase: 'idle', remainingMs: 0, topicName: '', tinyStep: '' });
  }, []);

  return error ? <Text accessibilityRole="alert" style={{ color: '#FF805B', padding: 12 }}>
    Some Focus Shield protections could not start. Open App blocking in Settings to check permissions.
  </Text> : null;
}
