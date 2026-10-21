import * as LocalAuthentication from 'expo-local-authentication';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from './FocusProvider';
import { timerRemainingMs } from './focus-engine';
import { FocusShieldConfig, activeShieldSummary, canModifyShieldConfig, defaultFocusShieldConfig, focusShieldStorage } from './focus-shield';

export function invalidBlockingInput(message?: string): never {
  const error = new Error(message || 'Check the details and try again.');
  error.name = 'BlockingInputError'; throw error;
}
export function parseBlockingTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

/** A system prompt authorizes only its owner and visit, never a stale edit. */
export function useBlockingSettings() {
  const { ownerKey } = useWorkspace();
  const { session } = useFocus();
  const [loaded, setLoaded] = useState<{ owner: string; config: FocusShieldConfig } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const life = useRef({ owner: ownerKey, epoch: 0, mounted: true, unlocked: false, pending: false, authenticating: false });
  if (life.current.owner !== ownerKey) { life.current.owner = ownerKey; life.current.epoch++; life.current.unlocked = false; }
  const current = useRef({ loaded, session }); current.current = { loaded, session };
  const config = ownerKey && loaded?.owner === ownerKey ? loaded.config : defaultFocusShieldConfig();

  useEffect(() => {
    let disposed = false, changed = false; setError('');
    if (!ownerKey) return;
    const unsubscribe = focusShieldStorage.subscribe(ownerKey, next => { changed = true; if (!disposed) setLoaded({ owner: ownerKey, config: next }); });
    void focusShieldStorage.load(ownerKey).then(next => { if (!disposed && !changed) setLoaded({ owner: ownerKey, config: next }); })
      .catch(() => { if (!disposed) setError('Could not read blocking settings. Reopen this page to retry.'); });
    return () => { disposed = true; unsubscribe(); };
  }, [ownerKey]);

  useFocusEffect(useCallback(() => {
    life.current.mounted = true;
    const invalidate = () => { life.current.epoch++; life.current.unlocked = false; };
    const sub = AppState.addEventListener('change', state => {
      // Device-credential fallback can cover the app. Only prompt success may retain the pending edit.
      if (state !== 'active' && !life.current.authenticating) invalidate();
    });
    return () => {
      invalidate(); life.current.mounted = false; sub.remove();
      if (life.current.authenticating && Platform.OS === 'android') void LocalAuthentication.cancelAuthenticate().catch(() => undefined);
    };
  }, []));

  async function change(reduce: (previous: FocusShieldConfig) => FocusShieldConfig) {
    const identity = life.current;
    if (identity.pending || !identity.mounted || !identity.owner || current.current.loaded?.owner !== identity.owner) return false;
    const owner = identity.owner, epoch = identity.epoch;
    const valid = () => life.current.mounted && life.current.owner === owner && life.current.epoch === epoch;
    identity.pending = true; setBusy(true); setError('');
    try {
      const before = current.current.loaded!.config;
      const next = reduce(before);
      const locked = () => {
        const focus = current.current.session;
        const running = before.focusBlockingEnabled && focus?.phase === 'focus' && focus.runningSince != null && timerRemainingMs(focus) > 0;
        return !canModifyShieldConfig(before, running || Boolean(activeShieldSummary(before).activeSchedule)).allowed;
      };
      if (locked()) { setError('Strict blocking is active. Wait for the block to finish before changing settings.'); return false; }
      if ((before.requireDeviceUnlock || next.requireDeviceUnlock) && !identity.unlocked) {
        if (Platform.OS !== 'android') { setError('Device authentication is currently available on Android.'); return false; }
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        if (!valid()) return false;
        if (level === LocalAuthentication.SecurityLevel.NONE) { setError('Set up a fingerprint or screen lock in Android Settings first.'); return false; }
        identity.authenticating = true;
        let result: LocalAuthentication.LocalAuthenticationResult;
        try {
          result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock blocking settings',
            promptSubtitle: 'Confirm changes to MYELIN app blocking', biometricsSecurityLevel: 'strong', disableDeviceFallback: false, cancelLabel: 'Cancel' });
        } finally { identity.authenticating = false; }
        if (!valid()) return false;
        if (!result.success) { setError('Settings were not changed. Use your fingerprint or device screen lock to try again.'); return false; }
        identity.unlocked = true;
      }
      if (!valid()) return false;
      if (current.current.loaded?.config !== before) { setError('Settings changed while unlocking. Please try again.'); return false; }
      if (locked()) { setError('Strict blocking started while unlocking. Settings were not changed.'); return false; }
      const saved = await focusShieldStorage.save(owner, next);
      if (valid()) setLoaded({ owner, config: saved });
      return valid();
    } catch (caught) {
      if (valid()) setError(caught instanceof Error && caught.name === 'BlockingInputError' ? caught.message : 'Could not change blocking settings. Your previous settings are still in place.');
      return false;
    } finally { identity.pending = false; if (life.current.mounted) setBusy(false); }
  }
  return { config, ready: Boolean(ownerKey && loaded?.owner === ownerKey), busy, error, setError, change };
}
