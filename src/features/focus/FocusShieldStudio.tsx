import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, layout, radius, space, spacing } from '@/src/theme/tokens';
import {
  FOCUS_SHIELD_PROFILES,
  FocusShieldAttemptEntry,
  FocusShieldAwayNotice,
  FocusShieldConfig,
  FocusShieldMode,
  InstalledAndroidApp,
  activeShieldSummary,
  applyFocusShieldProfile,
  buildSessionTemptationReport,
  canModifyShieldConfig,
  defaultFocusShieldConfig,
  evaluateFocusAwayReturn,
  focusShieldStorage,
  setAccountabilityPin,
  setFocusShieldMode,
  toggleShieldTarget,
  upsertInstalledAppTarget,
} from './focus-shield';
import {
  NativePermissionState,
  drainNativeInterceptEvents,
  fetchInstalledAndroidApps,
  openFocusShieldPermissionSettings,
  probeFocusShieldNativeStatus,
} from './focus-shield-native';

const SHIELD_MODES: Array<{ value: FocusShieldMode; label: string; helper: string }> = [
  { value: 'off', label: 'Off', helper: 'Disabled' },
  { value: 'gentle', label: 'Gentle', helper: 'Calm block' },
  { value: 'hard', label: 'Hard', helper: 'Delay + reflect' },
  { value: 'strict', label: 'Strict', helper: 'Locked session' },
];

export function FocusShieldStudio({
  onConfigChange,
  sessionRunning = false,
}: {
  onConfigChange?: (config: FocusShieldConfig) => void;
  sessionRunning?: boolean;
} = {}) {
  const { ownerKey } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<FocusShieldConfig>(() => defaultFocusShieldConfig());
  const [permState, setPermState] = useState<NativePermissionState>({
    nativeModuleInstalled: false,
    usageStatsGranted: false,
    overlayGranted: false,
    batteryOptimizationIgnored: false,
    isInMultiWindowMode: false,
    isInPictureInPictureMode: false,
  });
  const [installedApps, setInstalledApps] = useState<InstalledAndroidApp[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const ownerRef = useRef<string | null>(ownerKey);

  const appsLoadedRef = useRef(false);

  async function refreshPermissionsAndApps() {
    const status = await probeFocusShieldNativeStatus();
    setPermState(status);
    if (status.nativeModuleInstalled && !appsLoadedRef.current) {
      const apps = await fetchInstalledAndroidApps();
      setInstalledApps(apps);
      appsLoadedRef.current = true;
    }
  }

  useEffect(() => {
    void refreshPermissionsAndApps();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermissionsAndApps();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let changed = false;
    setConfig(defaultFocusShieldConfig());
    ownerRef.current = ownerKey;
    setError('');
    setStatusMessage('');
    if (!ownerKey) {
      const fallback = defaultFocusShieldConfig();
      setConfig(fallback);
      onConfigChange?.(fallback);
      return () => {
        cancelled = true;
      };
    }
    const unsubscribe = focusShieldStorage.subscribe(ownerKey, next => {
      changed = true;
      if (!cancelled) { setConfig(next); onConfigChange?.(next); }
    });
    focusShieldStorage
      .load(ownerKey)
      .then((loaded) => {
        if (cancelled || changed || ownerRef.current !== ownerKey) return;
        setConfig(loaded);
        onConfigChange?.(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ownerKey]);

  async function applyChange(next: FocusShieldConfig, feedback = '') {
    const guard = canModifyShieldConfig(config, sessionRunning);
    if (!guard.allowed) {
      setError(guard.reason ?? 'Strict Mode is locked during an active session.');
      return;
    }
    const activeOwner = ownerRef.current;

    if (feedback) setStatusMessage(feedback);
    if (!activeOwner) return;
    try {
      const saved = await focusShieldStorage.save(activeOwner, next);
      if (ownerRef.current !== activeOwner) return;
      setConfig(saved);
      onConfigChange?.(saved);
      setError('');
    } catch {
      setError('Could not save Focus Shield preferences on this device.');
    }
  }

  function handleSavePin() {
    const outcome = setAccountabilityPin(config, pinDraft);
    if (!outcome.ok) {
      setError(outcome.error ?? 'Invalid PIN.');
      return;
    }
    setPinDraft('');
    void applyChange(
      outcome.config,
      outcome.config.pinHash
        ? 'Accountability PIN saved.'
        : 'Accountability PIN cleared.',
    );
  }

  const summary = activeShieldSummary(config);
  const apps = config.targets.filter((item) => item.kind === 'app');
  const blockedPkgSet = useMemo(
    () => new Set(summary.apps.map((item) => item.identifier.toLowerCase())),
    [summary.apps],
  );
  const filteredInstalledApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return installedApps.slice(0, 30);
    return installedApps
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.packageName.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [installedApps, appSearch]);

  const nativeReady =
    permState.nativeModuleInstalled &&
    permState.usageStatsGranted &&
    permState.overlayGranted;

  return (
    <View style={styles.shieldShell}>
      <SpringPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        scaleTo={0.99}
        lift={0}
        style={styles.disclosureRow}
        onPress={() => setOpen((v) => !v)}>
        <View style={styles.shieldHeaderCopy}>
          <View style={styles.shieldTitleRow}>
            <Text style={styles.action}>Set up distraction blocking · optional</Text>
            {summary.enabled ? (
              <View style={styles.shieldActivePill}>
                <Text style={styles.shieldActivePillText}>
                  {summary.mode.toUpperCase()} · {summary.apps.length} APPS
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.shieldSubtitle}>
            {summary.enabled
              ? nativeReady
                ? `Native Focus Shield ready · Selected ${summary.apps.length} Android apps`
                : `Grant Usage Access & Overlay permissions below to enable real app interception`
              : 'Block distracting Android apps automatically during Focus sessions'}
          </Text>
        </View>
        <Text style={styles.disclosureMark}>{open ? '−' : '+'}</Text>
      </SpringPressable>

      <AnimatedDisclosure visible={open} style={styles.stepsCard}>
        {Platform.OS === 'android' ? (
          <View style={styles.permissionDashboard}>
            <Text style={styles.microLabel}>ANDROID NATIVE ENFORCEMENT PERMISSIONS</Text>
            <View style={styles.permRow}>
              <View style={styles.permCopy}>
                <Text style={styles.permTitle}>
                  1. Usage Access {permState.usageStatsGranted ? '✓ Granted' : '· Required'}
                </Text>
                <Text style={styles.permDesc}>
                  Detects when a blocked app opens during an active Focus timer. Checked locally on-device only while Focus is running.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void openFocusShieldPermissionSettings('usage-access')}
                style={[
                  styles.permButton,
                  permState.usageStatsGranted && styles.permButtonGranted,
                ]}>
                <Text
                  style={[
                    styles.permButtonText,
                    permState.usageStatsGranted && styles.permButtonTextGranted,
                  ]}>
                  {permState.usageStatsGranted ? 'Granted' : 'Grant'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.permRow}>
              <View style={styles.permCopy}>
                <Text style={styles.permTitle}>
                  2. Display Over Other Apps {permState.overlayGranted ? '✓ Granted' : '· Required'}
                </Text>
                <Text style={styles.permDesc}>
                  Displays the MYELIN Focus Shield screen immediately over blocked apps.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void openFocusShieldPermissionSettings('overlay')}
                style={[
                  styles.permButton,
                  permState.overlayGranted && styles.permButtonGranted,
                ]}>
                <Text
                  style={[
                    styles.permButtonText,
                    permState.overlayGranted && styles.permButtonTextGranted,
                  ]}>
                  {permState.overlayGranted ? 'Granted' : 'Grant'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.permRow}>
              <View style={styles.permCopy}>
                <Text style={styles.permTitle}>
                  3. Unrestricted Battery {permState.batteryOptimizationIgnored ? '✓ Ready' : '· Recommended'}
                </Text>
                <Text style={styles.permDesc}>
                  May help on phones with aggressive battery management. Android can still stop enforcement.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void openFocusShieldPermissionSettings('battery')}
                style={[
                  styles.permButton,
                  permState.batteryOptimizationIgnored && styles.permButtonGranted,
                ]}>
                <Text
                  style={[
                    styles.permButtonText,
                    permState.batteryOptimizationIgnored && styles.permButtonTextGranted,
                  ]}>
                  {permState.batteryOptimizationIgnored ? 'Ready' : 'Configure'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.microLabel}>SHIELD PROFILE</Text>
        <View style={styles.chipGrid}>
          {FOCUS_SHIELD_PROFILES.map((profile) => {
            const selected = config.profileId === profile.id && config.mode !== 'off';
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() =>
                  void applyChange(
                    applyFocusShieldProfile(config, profile.id),
                    `${profile.label} profile applied.`,
                  )
                }
                style={[styles.profileChip, selected && styles.profileChipActive]}>
                <Text style={[styles.profileChipTitle, selected && styles.profileChipTitleActive]}>
                  {profile.label}
                </Text>
                <Text style={styles.profileChipBadge}>{profile.badge}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.microLabel}>STRICTNESS MODE</Text>
        <View style={styles.modeRow}>
          {SHIELD_MODES.map((item) => {
            const active =
              config.mode === item.value ||
              (item.value === 'gentle' && config.mode === 'soft');
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => void applyChange(setFocusShieldMode(config, item.value))}
                style={[styles.modeChip, active && styles.modeChipActive]}>
                <Text style={[styles.modeChipTitle, active && styles.modeChipTitleActive]}>
                  {item.label}
                </Text>
                <Text style={styles.modeChipHelper} numberOfLines={1}>
                  {item.helper}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.microLabel}>BLOCKED ANDROID APPS (PACKAGE-VERIFIED)</Text>
        <View style={styles.chipGrid}>
          {apps.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: item.enabled }}
              onPress={() => void applyChange(toggleShieldTarget(config, item.id))}
              style={[styles.targetChip, item.enabled && styles.targetChipActive]}>
              <Text style={[styles.targetChipText, item.enabled && styles.targetChipTextActive]}>
                {item.enabled ? '✓ ' : ''}{item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {installedApps.length > 0 ? (
          <View style={styles.installedPickerSection}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAppPicker((v) => !v)}
              style={styles.pickerToggleBtn}>
              <Text style={styles.pickerToggleText}>
                {showAppPicker
                  ? 'Hide installed Android apps'
                  : `+ Pick from ${installedApps.length} installed apps on this phone`}
              </Text>
            </Pressable>
            {showAppPicker ? (
              <View style={styles.pickerBox}>
                <TextInput
                  accessibilityLabel="Search installed Android apps"
                  value={appSearch}
                  onChangeText={setAppSearch}
                  placeholder="Search installed apps by name or package…"
                  placeholderTextColor={colors.subtle}
                  selectionColor={colors.accent}
                  autoCapitalize="none"
                  style={styles.searchInput}
                />
                <ScrollView nestedScrollEnabled style={styles.installedList}>
                  {filteredInstalledApps.map((app) => {
                    const isBlocked = blockedPkgSet.has(app.packageName.toLowerCase());
                    return (
                      <Pressable
                        key={app.packageName}
                        accessibilityRole="button"
                        disabled={app.isSystemEmergency}
                        onPress={() => {
                          const res = upsertInstalledAppTarget(config, app);
                          if (res.added) void applyChange(res.config);
                          else if (res.error) setError(res.error);
                        }}
                        style={styles.installedItem}>
                        {app.iconUri ? (
                          <Image source={{ uri: app.iconUri }} style={styles.appIcon} />
                        ) : (
                          <View style={styles.appIconPlaceholder} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.installedLabel} numberOfLines={1}>
                            {app.label}
                          </Text>
                          <Text style={styles.installedPkg} numberOfLines={1}>
                            {app.packageName}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.installedStatus,
                            isBlocked && styles.installedStatusActive,
                          ]}>
                          {app.isSystemEmergency
                            ? 'Emergency Safe'
                            : isBlocked
                              ? '✓ Blocked'
                              : '+ Block'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.pinSection}>
          <Text style={styles.microLabel}>
            ACCOUNTABILITY PIN (OPTIONAL · SALTED SHA-256){summary.hasPin ? ' · SET ✓' : ''}
          </Text>
          <View style={styles.pinRow}>
            <TextInput
              accessibilityLabel="Accountability PIN"
              value={pinDraft}
              onChangeText={setPinDraft}
              placeholder={summary.hasPin ? 'Enter new 4-8 digit PIN or leave blank to clear' : 'Optional 4-8 digit PIN for Strict override'}
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={styles.searchInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleSavePin}
              style={styles.pinSaveBtn}>
              <Text style={styles.pinSaveText}>{pinDraft.trim() ? 'Save PIN' : 'Clear'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.copy, { marginTop: 12 }]}>
          {Platform.OS === 'ios'
            ? 'In Settings, use Focus to silence notifications or Screen Time to limit distracting apps.'
            : 'In phone Settings, open Digital Wellbeing → Focus mode. Choose distracting apps and turn it on. Keep MYELIN available for your timer.'}{' '}
          MYELIN does not control or verify these system settings.
        </Text>
        <Text style={styles.helperCaption}>
          Phone calls, emergency dialers, SMS, and system keyboards are always allowlisted. Website domain blocking is scheduled for Chunk B (local DNS VPN).
        </Text>

        <SpringPressable
          accessibilityRole="button"
          scaleTo={0.988}
          lift={0}
          style={styles.stepButton}
          onPress={() => void openFocusShieldPermissionSettings('digital-wellbeing')}>
          <Text style={styles.action}>
            {Platform.OS === 'web' ? 'Read Focus mode instructions' : 'Open phone settings'}
          </Text>
        </SpringPressable>

        {statusMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>
            {statusMessage}
          </Text>
        ) : null}
        {error ? <Text style={[styles.copy, styles.errorCopy]}>{error}</Text> : null}
      </AnimatedDisclosure>
    </View>
  );
}

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
      if (!identity.ownerKey || !identity.sessionId) return;
      const events = await drainNativeInterceptEvents();
      if (disposed || identityRef.current.ownerKey !== identity.ownerKey || identityRef.current.sessionId !== identity.sessionId) return;
      const nativeEvents = events.filter(event => event.sessionId === `${identity.ownerKey}:${identity.sessionId}`);
      if (!nativeEvents.length) return;
      setAttempts((prev) => [...prev, ...nativeEvents]);
      for (const ev of nativeEvents) {
        // Account/session can change while a previous thought is being saved.
        if (disposed || identityRef.current.ownerKey !== identity.ownerKey || identityRef.current.sessionId !== identity.sessionId) return;
        if (ev.parkedThought) {
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

  const summary = useMemo(() => activeShieldSummary(config), [config]);
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
  shieldShell: {
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.xs,
  },
  shieldHeaderCopy: { flex: 1, minWidth: 0 },
  shieldTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  shieldActivePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  shieldActivePillText: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  shieldSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  disclosureRow: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  disclosureMark: {
    color: colors.accent,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  stepsCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 4,
  },
  permissionDashboard: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  permCopy: { flex: 1, minWidth: 0 },
  permTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  permDesc: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  permButton: {
    minHeight: 36,
    minWidth: 74,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permButtonGranted: {
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
  },
  permButtonText: { color: colors.accent, fontSize: 11.5, fontWeight: '800' },
  permButtonTextGranted: { color: colors.success },
  microLabel: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 7,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  profileChip: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  profileChipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  profileChipTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  profileChipTitleActive: { color: colors.accent },
  profileChipBadge: {
    color: colors.subtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeChip: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 7,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  modeChipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  modeChipTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  modeChipTitleActive: { color: colors.accent },
  modeChipHelper: { color: colors.subtle, fontSize: 9.5, marginTop: 2 },
  targetChip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  targetChipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  targetChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  targetChipTextActive: { color: colors.accent, fontWeight: '700' },
  installedPickerSection: { marginTop: 10 },
  pickerToggleBtn: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  pickerToggleText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  pickerBox: {
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    padding: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 12.5,
  },
  installedList: { maxHeight: 220, marginTop: 8 },
  installedItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  appIcon: { width: 28, height: 28, borderRadius: 6 },
  appIconPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.panel,
  },
  installedLabel: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  installedPkg: { color: colors.subtle, fontSize: 10.5 },
  installedStatus: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  installedStatusActive: { color: colors.accent },
  pinSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pinRow: { flexDirection: 'row', gap: 8 },
  pinSaveBtn: {
    minWidth: 78,
    minHeight: layout.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pinSaveText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  helperCaption: { color: colors.subtle, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  errorCopy: { color: colors.danger, marginTop: 8 },
  stepButton: {
    minHeight: layout.minTouch,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  feedbackText: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
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
