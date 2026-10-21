import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { BlockingShortcut } from './BlockingShortcut';
import { FocusShieldAttemptEntry, FocusShieldAwayNotice, FocusShieldConfig,
  activeShieldSummary, buildSessionTemptationReport, defaultFocusShieldConfig,
  evaluateFocusAwayReturn, focusShieldStorage } from './focus-shield';
import { drainNativeInterceptEvents, probeFocusShieldNativeStatus } from './focus-shield-native';

export function FocusShieldStudio() { return <BlockingShortcut />; }

export function useFocusShieldSession(input: {
  ownerKey: string | null;
  session: {
    id: string;
    phase: 'focus' | 'break';
    runningSince: number | null;
    plannedFocusMinutes: number;
    topicName: string;
    tinyStep?: string;
  } | null;
  remainingMs: number;
  onParkThought: (thought: string) => Promise<void> | void;
  onOpenParking: () => void;
}) {
  const { ownerKey, session, remainingMs, onParkThought, onOpenParking } = input;
  const [config, setConfig] = useState<FocusShieldConfig>(() => defaultFocusShieldConfig());
  const [awayNotice, setAwayNotice] = useState<FocusShieldAwayNotice | null>(null);
  const [attempts, setAttempts] = useState<FocusShieldAttemptEntry[]>([]);
  const [osMultiWindow, setOsMultiWindow] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const recentBackgroundsRef = useRef<number[]>([]);
  const identityRef = useRef({ ownerKey, sessionId: session?.id });
  identityRef.current = { ownerKey, sessionId: session?.id };
  const parkRef = useRef(onParkThought);
  parkRef.current = onParkThought;
  const stateRef = useRef({
    config,
    running: Boolean(session?.runningSince),
    phase: (session?.phase ?? 'focus') as 'focus' | 'break',
  });
  stateRef.current = {
    config,
    running: Boolean(session?.runningSince),
    phase: (session?.phase ?? 'focus') as 'focus' | 'break',
  };

  useEffect(() => {
    let cancelled = false;
    let changed = false;
    setConfig(defaultFocusShieldConfig());
    setAwayNotice(null);
    setAttempts([]);
    if (!ownerKey) return;
    const unsubscribe = focusShieldStorage.subscribe(ownerKey, next => {
      changed = true;
      if (!cancelled) setConfig(next);
    });
    void focusShieldStorage.load(ownerKey).then(loaded => {
      if (!cancelled && !changed) setConfig(loaded);
    }).catch(() => undefined);
    return () => { cancelled = true; unsubscribe(); };
  }, [ownerKey]);

  useEffect(() => {
    let disposed = false;
    async function ingestNativeEvents() {
      const status = await probeFocusShieldNativeStatus();
      if (disposed) return;
      setOsMultiWindow(status.isInMultiWindowMode || status.isInPictureInPictureMode);
      const identity = identityRef.current;
      if (!identity.ownerKey) return;
      const events = await drainNativeInterceptEvents();
      if (disposed || identityRef.current.ownerKey !== identity.ownerKey || identityRef.current.sessionId !== identity.sessionId) return;
      const nativeEvents = events.filter(event => event.ownerKey === identity.ownerKey || (!event.ownerKey && event.sessionId?.startsWith(`${identity.ownerKey}:`)));
      if (!nativeEvents.length) return;
      setAttempts((prev) => [...prev, ...nativeEvents.filter(event => event.sessionId === `${identity.ownerKey}:${identity.sessionId}`)]);
      for (const ev of nativeEvents) {
        // Account/session can change while a previous thought is being saved.
        if (disposed || identityRef.current.ownerKey !== identity.ownerKey || identityRef.current.sessionId !== identity.sessionId) return;
        if (ev.parkedThought && ev.sessionId === `${identity.ownerKey}:${identity.sessionId}`) {
          await parkRef.current(ev.parkedThought);
        }
        if (disposed || identityRef.current.ownerKey !== identity.ownerKey || identityRef.current.sessionId !== identity.sessionId) return;
        if (ownerKey) {
          await focusShieldStorage.appendAttempt(ownerKey, {
            timestamp: ev.timestamp,
            vector: ev.vector,
            packageName: ev.packageName,
            targetLabel: ev.targetLabel,
            parkedThought: ev.parkedThought,
            awaySeconds: ev.awaySeconds,
            outcome: ev.outcome,
          });
        }
      }
    }

    void ingestNativeEvents().catch(() => undefined);
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const returnedAt = Date.now();
        void ingestNativeEvents().catch(() => undefined);
        const notice = evaluateFocusAwayReturn({
          config: stateRef.current.config,
          sessionRunning: stateRef.current.running,
          phase: stateRef.current.phase,
          backgroundedAt: backgroundedAtRef.current,
          returnedAt,
          recentBackgroundTimestamps: recentBackgroundsRef.current,
        });
        backgroundedAtRef.current = null;
        if (notice) setAwayNotice(notice);
      } else if (backgroundedAtRef.current === null) {
        const bgTime = Date.now();
        backgroundedAtRef.current = bgTime;
        recentBackgroundsRef.current = [
          ...recentBackgroundsRef.current.filter((t) => bgTime - t <= 120_000),
          bgTime,
        ];
      }
    });
    return () => { disposed = true; sub.remove(); };
  }, [ownerKey, session?.id]);

  const summary = useMemo(() => ({ ...activeShieldSummary(config), enabled: config.mode !== 'off' && config.focusBlockingEnabled }), [config]);
  const report = useMemo(
    () => buildSessionTemptationReport(attempts, session?.plannedFocusMinutes ?? 25),
    [attempts, session?.plannedFocusMinutes],
  );

  return {
    config,
    setConfig,
    summary,
    awayNotice,
    dismissAwayNotice: () => setAwayNotice(null),
    parkFromAwayNotice: () => {
      setAwayNotice(null);
      onOpenParking();
    },
    osMultiWindow,
    report,
  };
}

export function FocusShieldActiveBanner({
  shield,
}: {
  shield: ReturnType<typeof useFocusShieldSession>;
}) {
  return (
    <>
      {shield.osMultiWindow && shield.summary.enabled ? (
        <View style={styles.awayBanner}>
          <Text style={styles.awayBannerEyebrow}>ANDROID MULTI-WINDOW DETECTED</Text>
          <Text style={styles.awayBannerTitle}>Split-screen or Picture-in-Picture is active</Text>
          <Text style={styles.awayBannerText}>
            Expand MYELIN to full-screen so side-by-side apps cannot pull attention from your current step.
          </Text>
        </View>
      ) : null}

      <AnimatedDisclosure visible={Boolean(shield.awayNotice)} style={styles.awayBanner}>
        {shield.awayNotice ? (
          <>
            <View style={styles.awayBannerTop}>
              <Text style={styles.awayBannerEyebrow}>FOCUS SHIELD CHECK-IN</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss Focus Shield check-in"
                hitSlop={8}
                onPress={shield.dismissAwayNotice}>
                <Text style={styles.awayBannerDismiss}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.awayBannerTitle}>{shield.awayNotice.label}</Text>
            <Text style={styles.awayBannerText}>{shield.awayNotice.summary}</Text>
            <SpringPressable
              accessibilityRole="button"
              scaleTo={0.988}
              lift={0}
              onPress={shield.parkFromAwayNotice}
              style={styles.awayParkButton}>
              <Text style={styles.awayParkButtonText}>Park what pulled me away →</Text>
            </SpringPressable>
          </>
        ) : null}
      </AnimatedDisclosure>
    </>
  );
}

const styles = StyleSheet.create({
  awayBanner: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panelRaised,
    padding: 13,
  },
  awayBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  awayBannerEyebrow: {
    color: colors.accent,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  awayBannerDismiss: { color: colors.subtle, fontSize: 18, fontWeight: '600' },
  awayBannerTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 4 },
  awayBannerText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  awayReflectionText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: 5,
  },
  awayParkButton: {
    minHeight: 42,
    marginTop: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awayParkButtonText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },
});
