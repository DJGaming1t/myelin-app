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
  MOTIVATION_PRESETS,
  SUGGESTED_DOMAIN_PACKS,
  activeShieldSummary,
  addCustomScheduleWindow,
  addCustomShieldTarget,
  applyFocusShieldProfile,
  buildHistoricalTemptationAnalytics,
  buildSessionTemptationReport,
  canModifyShieldConfig,
  defaultFocusShieldConfig,
  evaluateFocusAwayReturn,
  focusShieldStorage,
  formatMinuteOfDay,
  importSuggestedDomainPack,
  removeCustomScheduleWindow,
  removeCustomShieldTarget,
  setAccountabilityPin,
  setFocusShieldMode,
  toggleAllowlistApp,
  toggleScheduleWindow,
  toggleShieldTarget,
  toggleWebsiteWildcard,
  updateFocusShieldCustomization,
  upsertAllowlistApp,
  upsertInstalledAppTarget,
} from './focus-shield';
import {
  NativePermissionState,
  drainNativeInterceptEvents,
  fetchInstalledAndroidApps,
  openFocusShieldPermissionSettings,
  probeFocusShieldNativeStatus,
  requestWebsiteVpnAuthorization,
} from './focus-shield-native';

const SHIELD_MODES: Array<{ value: FocusShieldMode; label: string; helper: string }> = [
  { value: 'off', label: 'Off', helper: 'Disabled' },
  { value: 'gentle', label: 'Gentle', helper: 'Calm block' },
  { value: 'hard', label: 'Hard', helper: 'Delay + reflect' },
  { value: 'strict', label: 'Strict', helper: 'Locked session' },
];

const UNLOCK_DELAY_OPTIONS = [5, 10, 20, 30] as const;
const BREAK_ALLOWANCE_OPTIONS = [0, 1, 2] as const;
const SCHEDULE_PRESET_SLOTS = [
  { label: 'Morning (08:00–11:00)', start: 8 * 60, end: 11 * 60, days: [1, 2, 3, 4, 5] },
  { label: 'Evening (19:00–22:00)', start: 19 * 60, end: 22 * 60, days: [1, 2, 3, 4, 5, 6] },
  { label: 'Overnight (22:30–06:30)', start: 22 * 60 + 30, end: 6 * 60 + 30, days: [0, 1, 2, 3, 4, 5, 6] },
] as const;

export function FocusShieldStudio({
  onConfigChange,
  sessionRunning = false,
}: {
  onConfigChange?: (config: FocusShieldConfig) => void;
  sessionRunning?: boolean;
} = {}) {
  const { ownerKey } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [config, setConfig] = useState<FocusShieldConfig>(() => defaultFocusShieldConfig());
  const [historicalAttempts, setHistoricalAttempts] = useState<FocusShieldAttemptEntry[]>([]);
  const [permState, setPermState] = useState<NativePermissionState>({
    nativeModuleInstalled: false,
    usageStatsGranted: false,
    overlayGranted: false,
    batteryOptimizationIgnored: false,
    vpnPrepared: false,
    vpnActive: false,
    otherVpnActive: false,
    scheduleActiveNow: false,
    activeScheduleLabel: '',
    isInMultiWindowMode: false,
    isInPictureInPictureMode: false,
  });
  const [installedApps, setInstalledApps] = useState<InstalledAndroidApp[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [allowlistPkgInput, setAllowlistPkgInput] = useState('');
  const [customScheduleLabel, setCustomScheduleLabel] = useState('');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [pinDraft, setPinDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const ownerRef = useRef<string | null>(ownerKey);

  async function refreshPermissionsAndApps() {
    const status = await probeFocusShieldNativeStatus();
    setPermState(status);
    if (status.nativeModuleInstalled) {
      const apps = await fetchInstalledAndroidApps();
      if (apps.length) setInstalledApps(apps);
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
    const unsubscribeAttempts = ownerKey ? focusShieldStorage.subscribeAttempts(ownerKey, items => { if (!cancelled) setHistoricalAttempts(items); }) : () => {};
    setConfig(defaultFocusShieldConfig());
    ownerRef.current = ownerKey;
    setError('');
    setStatusMessage('');
    setHistoricalAttempts([]);
    if (ownerKey) void focusShieldStorage.loadAttempts(ownerKey).then(items => { if (!cancelled) setHistoricalAttempts(items); });
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
      unsubscribeAttempts();
    };
  }, [ownerKey]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { void refreshPermissionsAndApps(); }, 5000);
    return () => clearInterval(timer);
  }, [open]);

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

  async function handleAuthorizeVpn() {
    setError('');
    const result = await requestWebsiteVpnAuthorization();
    await refreshPermissionsAndApps();
    if (ownerRef.current && result.vpnPrepared) await focusShieldStorage.save(ownerRef.current, config);
    if (result.otherVpnActive) {
      setStatusMessage(
        'VPN authorized, but another VPN is currently active on this phone. Disconnect the other VPN to enable local DNS website blocking.',
      );
    } else if (result.vpnPrepared) {
      setStatusMessage('Local DNS Website Filter authorized. It will activate automatically during Focus.');
    } else {
      setError('VPN authorization was not completed.');
    }
  }

  function handleAddDomain() {
    const outcome = addCustomShieldTarget(config, 'website', domainInput);
    if (!outcome.added) {
      setError(outcome.error ?? 'Enter a valid domain such as youtube.com.');
      return;
    }
    setDomainInput('');
    setError('');
    void applyChange(outcome.config, 'Added domain to local DNS website shield.');
  }

  function handleImportDomainPack(packId: (typeof SUGGESTED_DOMAIN_PACKS)[number]['id']) {
    const outcome = importSuggestedDomainPack(config, packId);
    if (outcome.addedCount === 0) {
      setStatusMessage('All domains in that pack are already enabled.');
      return;
    }
    void applyChange(
      outcome.config,
      `Imported ${outcome.addedCount} distracting domain${outcome.addedCount === 1 ? '' : 's'}.`,
    );
  }

  function handleAddCustomSchedule() {
    const slot = SCHEDULE_PRESET_SLOTS[selectedSlotIdx] ?? SCHEDULE_PRESET_SLOTS[0];
    const label = customScheduleLabel.trim() || slot.label.split(' (')[0];
    const outcome = addCustomScheduleWindow(config, {
      label,
      days: [...slot.days],
      startMinuteOfDay: slot.start,
      endMinuteOfDay: slot.end,
      profileId: config.profileId,
    });
    if (!outcome.added) {
      setError(outcome.error ?? 'Could not add schedule window.');
      return;
    }
    setCustomScheduleLabel('');
    setError('');
    void applyChange(outcome.config, `Added recurring schedule "${label}".`);
  }

  function handleAddAllowlistPkg() {
    const clean = allowlistPkgInput.trim();
    if (!clean) return;
    const outcome = upsertAllowlistApp(config, {
      packageName: clean,
      label: clean.split('.').pop() || clean,
    });
    if (!outcome.added) {
      setError(outcome.error ?? 'Enter a valid Android package ID.');
      return;
    }
    setAllowlistPkgInput('');
    setError('');
    void applyChange(outcome.config, 'Added study app to Focus Shield allowlist.');
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
        ? 'Accountability PIN saved (salted SHA-256 hash).'
        : 'Accountability PIN cleared.',
    );
  }

  async function handleClearAnalytics() {
    if (!ownerKey) return;
    await focusShieldStorage.clearAttempts(ownerKey);
    setHistoricalAttempts([]);
    setStatusMessage('7-day temptation log cleared.');
  }

  const summary = activeShieldSummary(config);
  const apps = config.targets.filter((item) => item.kind === 'app');
  const websites = config.targets.filter((item) => item.kind === 'website');
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

  const analytics = useMemo(
    () => buildHistoricalTemptationAnalytics(historicalAttempts),
    [historicalAttempts],
  );

  const nativeAppReady =
    permState.nativeModuleInstalled &&
    permState.usageStatsGranted &&
    permState.overlayGranted;

  const nativeVpnReady =
    permState.nativeModuleInstalled &&
    permState.vpnPrepared &&
    !permState.otherVpnActive;

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
                  {summary.mode.toUpperCase()} · {summary.apps.length} APPS · {summary.websites.length} SITES
                  {summary.activeSchedule ? ' · SCHEDULED' : ''}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.shieldSubtitle}>
            {summary.enabled
              ? nativeAppReady && nativeVpnReady
                ? `Focus Shield ready · ${summary.apps.length} apps & ${summary.websites.length} domain rules selected${summary.enabledSchedules.length ? ` · ${summary.enabledSchedules.length} schedule(s)` : ''}`
                : `Grant Usage Access, Overlay & Local DNS VPN below for full app + website blocking`
              : 'Block distracting Android apps and websites during Focus or recurring schedules'}
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
                  1. Usage Access {permState.usageStatsGranted ? '✓ Granted' : '· Required for Apps'}
                </Text>
                <Text style={styles.permDesc}>
                  Detects when a blocked app opens during an active Focus timer or schedule window. Checked locally on-device.
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
                  2. Display Over Other Apps {permState.overlayGranted ? '✓ Granted' : '· Required for Apps'}
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
                  3. Local DNS Website Filter (VPN){' '}
                  {permState.otherVpnActive
                    ? '· Conflict (Other VPN Active)'
                    : permState.vpnActive
                      ? '✓ Active Now'
                      : permState.vpnPrepared
                        ? '✓ Authorized'
                        : '· Required for Websites'}
                </Text>
                <Text style={styles.permDesc}>
                  Runs an on-device loopback DNS sinkhole (10.215.173.2) during Focus so blocked domains fail to resolve across browsers while non-blocked sites connect directly at full speed.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleAuthorizeVpn()}
                style={[
                  styles.permButton,
                  permState.vpnPrepared && !permState.otherVpnActive && styles.permButtonGranted,
                ]}>
                <Text
                  style={[
                    styles.permButtonText,
                    permState.vpnPrepared && !permState.otherVpnActive && styles.permButtonTextGranted,
                  ]}>
                  {permState.vpnPrepared ? 'Authorized' : 'Authorize'}
                </Text>
              </Pressable>
            </View>

            {permState.otherVpnActive ? (
              <View style={styles.conflictNotice}>
                <Text style={styles.conflictNoticeTitle}>Another VPN is active on this device</Text>
                <Text style={styles.conflictNoticeText}>
                  Android permits only one active VPN at a time. App blocking will still work, or you can disconnect the other VPN to enable MYELIN’s local DNS website filter.
                </Text>
              </View>
            ) : null}

            <View style={styles.permRow}>
              <View style={styles.permCopy}>
                <Text style={styles.permTitle}>
                  4. Unrestricted Battery {permState.batteryOptimizationIgnored ? '✓ Ready' : '· Recommended'}
                </Text>
                <Text style={styles.permDesc}>
                  May help on phones with aggressive battery management; Android can still stop enforcement.
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

        <Text style={styles.helperCaption}>
          Website filtering needs Android VPN approval. Browser Secure DNS, Android Private DNS, cached pages and existing connections can bypass it. Disable Secure DNS and Private DNS for this test. A blocked site shows a browser connection error.
          {permState.privateDnsActive ? ' Android Private DNS is active on this phone.' : ''}
          {permState.vpnError ? ` ${permState.vpnError}` : ''}
          {permState.vpnActive ? ' Website VPN is running.' : ' Website VPN is currently stopped.'}
        </Text>
        <View style={styles.websiteSectionHeader}>
          <Text style={styles.microLabel}>
            BLOCKED WEBSITES & SUBDOMAINS (LOCAL DNS SINKHOLE)
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: config.websiteBlockingEnabled }}
            onPress={() =>
              void applyChange(
                updateFocusShieldCustomization(config, {
                  websiteBlockingEnabled: !config.websiteBlockingEnabled,
                }),
              )
            }
            style={[
              styles.inlineTogglePill,
              config.websiteBlockingEnabled && styles.inlineTogglePillActive,
            ]}>
            <Text
              style={[
                styles.inlineToggleText,
                config.websiteBlockingEnabled && styles.inlineToggleTextActive,
              ]}>
              {config.websiteBlockingEnabled ? '✓ Enabled' : 'Paused'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.chipGrid}>
          {websites.map((item) => {
            const wildcard = item.wildcardSubdomains !== false;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: item.enabled }}
                onPress={() => void applyChange(toggleShieldTarget(config, item.id))}
                onLongPress={() => {
                  if (item.custom) {
                    void applyChange(
                      removeCustomShieldTarget(config, item.id),
                      `Removed ${item.label}.`,
                    );
                  } else {
                    void applyChange(
                      toggleWebsiteWildcard(config, item.id),
                      `Updated subdomain matching for ${item.label}.`,
                    );
                  }
                }}
                style={[styles.targetChip, item.enabled && styles.targetChipActive]}>
                <Text style={[styles.targetChipText, item.enabled && styles.targetChipTextActive]}>
                  {item.enabled ? '✓ ' : ''}
                  {wildcard ? `*.${item.label}` : item.label}
                  {item.custom ? ' ×' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.packRow}>
          {SUGGESTED_DOMAIN_PACKS.map((pack) => (
            <Pressable
              key={pack.id}
              accessibilityRole="button"
              onPress={() => handleImportDomainPack(pack.id)}
              style={styles.packPill}>
              <Text style={styles.packPillText}>{pack.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.domainAddRow}>
          <TextInput
            accessibilityLabel="Add website domain to block"
            value={domainInput}
            onChangeText={setDomainInput}
            onSubmitEditing={handleAddDomain}
            placeholder="Add domain (e.g. twitch.tv or reddit.com)…"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            onPress={handleAddDomain}
            style={styles.pinSaveBtn}>
            <Text style={styles.pinSaveText}>+ Site</Text>
          </Pressable>
        </View>

        <View style={styles.chipGrid}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: config.blockDohCanary }}
            onPress={() =>
              void applyChange(
                updateFocusShieldCustomization(config, {
                  blockDohCanary: !config.blockDohCanary,
                }),
              )
            }
            style={[styles.targetChip, config.blockDohCanary && styles.targetChipActive]}>
            <Text style={[styles.targetChipText, config.blockDohCanary && styles.targetChipTextActive]}>
              {config.blockDohCanary ? '✓ ' : ''}Auto-downgrade browser DoH canary (use-application-dns.net)
            </Text>
          </Pressable>
        </View>

        <SpringPressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          scaleTo={0.99}
          lift={0}
          onPress={() => setShowAdvanced((v) => !v)}
          style={styles.advancedToggleRow}>
          <Text style={styles.advancedToggleText}>
            {showAdvanced
              ? 'Hide schedules, friction, allowlist & 7-day analytics'
              : `Schedules (${summary.enabledSchedules.length}), friction (${config.unlockDelaySeconds}s · ${config.maxBreakAllowances} pass) & 7-day analytics`}
          </Text>
          <Text style={styles.disclosureMark}>{showAdvanced ? '−' : '+'}</Text>
        </SpringPressable>

        <AnimatedDisclosure visible={showAdvanced} style={styles.advancedPanel}>
          <Text style={styles.microLabel}>RECURRING SCHEDULE WINDOWS (BOOT & ALARM RECOVERED)</Text>
          <View style={styles.chipGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: config.sessionOnly }}
              onPress={() =>
                void applyChange(
                  updateFocusShieldCustomization(config, {
                    sessionOnly: !config.sessionOnly,
                  }),
                )
              }
              style={[styles.targetChip, config.sessionOnly && styles.targetChipActive]}>
              <Text style={[styles.targetChipText, config.sessionOnly && styles.targetChipTextActive]}>
                {config.sessionOnly ? '✓ ' : ''}Only during manual Focus sessions
              </Text>
            </Pressable>
            {config.schedules.map((sched) => (
              <Pressable
                key={sched.id}
                accessibilityRole="button"
                accessibilityState={{ selected: sched.enabled }}
                onPress={() => void applyChange(toggleScheduleWindow(config, sched.id))}
                onLongPress={
                  sched.custom
                    ? () =>
                        void applyChange(
                          removeCustomScheduleWindow(config, sched.id),
                          `Removed schedule ${sched.label}.`,
                        )
                    : undefined
                }
                style={[styles.targetChip, sched.enabled && styles.targetChipActive]}>
                <Text style={[styles.targetChipText, sched.enabled && styles.targetChipTextActive]}>
                  {sched.enabled ? '✓ ' : ''}
                  {sched.label} ({formatMinuteOfDay(sched.startMinuteOfDay)}–{formatMinuteOfDay(sched.endMinuteOfDay)})
                  {sched.custom ? ' ×' : ''}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.packRow}>
            {SCHEDULE_PRESET_SLOTS.map((slot, idx) => {
              const active = selectedSlotIdx === idx;
              return (
                <Pressable
                  key={slot.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelectedSlotIdx(idx)}
                  style={[styles.packPill, active && styles.inlineTogglePillActive]}>
                  <Text style={[styles.packPillText, active && styles.inlineToggleTextActive]}>
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.domainAddRow}>
            <TextInput
              accessibilityLabel="Custom schedule label"
              value={customScheduleLabel}
              onChangeText={setCustomScheduleLabel}
              onSubmitEditing={handleAddCustomSchedule}
              placeholder="Schedule name (e.g. Evening Revision)…"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              maxLength={60}
              style={styles.searchInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleAddCustomSchedule}
              style={styles.pinSaveBtn}>
              <Text style={styles.pinSaveText}>+ Schedule</Text>
            </Pressable>
          </View>

          <Text style={styles.microLabel}>PROGRESSIVE UNLOCK FRICTION DELAY (SCALES ON REPEATED ATTEMPTS)</Text>
          <View style={styles.chipGrid}>
            {UNLOCK_DELAY_OPTIONS.map((sec) => {
              const selected = config.unlockDelaySeconds === sec;
              return (
                <Pressable
                  key={sec}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() =>
                    void applyChange(updateFocusShieldCustomization(config, { unlockDelaySeconds: sec }))
                  }
                  style={[styles.targetChip, selected && styles.targetChipActive]}>
                  <Text style={[styles.targetChipText, selected && styles.targetChipTextActive]}>
                    {sec}s base pause
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.microLabel}>EMERGENCY BREAK PASSES PER SESSION</Text>
          <View style={styles.chipGrid}>
            {BREAK_ALLOWANCE_OPTIONS.map((count) => {
              const selected = config.maxBreakAllowances === count;
              return (
                <Pressable
                  key={count}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() =>
                    void applyChange(updateFocusShieldCustomization(config, { maxBreakAllowances: count }))
                  }
                  style={[styles.targetChip, selected && styles.targetChipActive]}>
                  <Text style={[styles.targetChipText, selected && styles.targetChipTextActive]}>
                    {count === 0 ? '0 passes (Locked)' : `${count} × ${config.breakPassMinutes}m pass`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.microLabel}>ANTI-BYPASS & MULTI-WINDOW PROTECTION</Text>
          <View style={styles.chipGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: config.blockFloatingWindows }}
              onPress={() =>
                void applyChange(
                  updateFocusShieldCustomization(config, {
                    blockFloatingWindows: !config.blockFloatingWindows,
                  }),
                )
              }
              style={[styles.targetChip, config.blockFloatingWindows && styles.targetChipActive]}>
              <Text style={[styles.targetChipText, config.blockFloatingWindows && styles.targetChipTextActive]}>
                {config.blockFloatingWindows ? '✓ ' : ''}Hide floating overlays (Android 12+)
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: config.blockSplitScreen }}
              onPress={() =>
                void applyChange(
                  updateFocusShieldCustomization(config, {
                    blockSplitScreen: !config.blockSplitScreen,
                  }),
                )
              }
              style={[styles.targetChip, config.blockSplitScreen && styles.targetChipActive]}>
              <Text style={[styles.targetChipText, config.blockSplitScreen && styles.targetChipTextActive]}>
                {config.blockSplitScreen ? '✓ ' : ''}Guard split-screen & PiP
              </Text>
            </Pressable>
          </View>

          <Text style={styles.microLabel}>MOTIVATIONAL INTERCEPTION MESSAGE</Text>
          <View style={styles.chipGrid}>
            {MOTIVATION_PRESETS.map((preset, idx) => {
              const selected = config.customMotivation === preset;
              return (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() =>
                    void applyChange(updateFocusShieldCustomization(config, { customMotivation: preset }))
                  }
                  style={[styles.targetChip, selected && styles.targetChipActive]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.targetChipText, selected && styles.targetChipTextActive]}>
                    {selected ? '✓ ' : ''}“{preset.slice(0, 38)}…”
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.microLabel}>EMERGENCY & STUDY ALLOWLIST (NEVER BLOCKED OR DNS-FILTERED)</Text>
          <View style={styles.chipGrid}>
            {config.allowlist.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                disabled={item.emergency}
                accessibilityState={{ selected: item.enabled }}
                onPress={() => void applyChange(toggleAllowlistApp(config, item.id))}
                style={[styles.targetChip, item.enabled && styles.targetChipActive]}>
                <Text style={[styles.targetChipText, item.enabled && styles.targetChipTextActive]}>
                  {item.enabled ? '✓ ' : ''}{item.label}{item.emergency ? ' (Emergency)' : ''}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.domainAddRow}>
            <TextInput
              accessibilityLabel="Add study app package to allowlist"
              value={allowlistPkgInput}
              onChangeText={setAllowlistPkgInput}
              onSubmitEditing={handleAddAllowlistPkg}
              placeholder="Allowlist study app ID (e.g. com.ankiweb.ankidroid)…"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleAddAllowlistPkg}
              style={styles.pinSaveBtn}>
              <Text style={styles.pinSaveText}>+ Allow</Text>
            </Pressable>
          </View>

          <View style={styles.analyticsCard}>
            <View style={styles.analyticsHeader}>
              <Text style={styles.microLabel}>7-DAY FOCUS SHIELD TEMPTATION ANALYTICS</Text>
              {analytics.totalAttempts > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => void handleClearAnalytics()}>
                  <Text style={styles.clearAnalyticsText}>Clear log</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.analyticsHeadline}>
              {analytics.totalAttempts === 0
                ? 'Zero blocked launches or domain pulls in the last 7 days'
                : `${analytics.recoveryRatePercent}% Recovery Rate · ${analytics.recoveredCount}/${analytics.totalAttempts} pulls deflected`}
            </Text>
            <Text style={styles.analyticsSubtext}>
              Apps intercepted: {analytics.appInterceptions} · Websites blocked: {analytics.websiteInterceptions} · Thoughts parked: {analytics.parkedCount}
            </Text>
            {analytics.topTargets.length > 0 ? (
              <View style={styles.packRow}>
                {analytics.topTargets.map((t) => (
                  <View key={`${t.kind}:${t.label}`} style={styles.packPill}>
                    <Text style={styles.packPillText}>
                      {t.label} ×{t.count}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </AnimatedDisclosure>

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
          Local DNS VPN routes only DNS queries (10.111.222.1) on-device without inspecting HTTPS; allowed DNS queries use your network’s resolver. Schedules use inexact alarms. Android may delay them; after reboot or a cold start, tap the schedule notification to activate blocking.
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
    minWidth: 78,
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
  conflictNotice: {
    marginTop: 6,
    marginBottom: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    padding: 9,
  },
  conflictNoticeTitle: { color: colors.accent, fontSize: 11.5, fontWeight: '700' },
  conflictNoticeText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  microLabel: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 7,
  },
  websiteSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  inlineTogglePill: {
    minHeight: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  inlineTogglePillActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  inlineToggleText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  inlineToggleTextActive: { color: colors.accent },
  packRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  packPill: {
    minHeight: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  packPillText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  domainAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
    marginBottom: 8,
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
  advancedToggleRow: {
    minHeight: 44,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  advancedToggleText: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12.5,
    fontWeight: '700',
  },
  advancedPanel: {
    marginTop: 4,
    paddingBottom: 4,
  },
  analyticsCard: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    padding: 12,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearAnalyticsText: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: '600',
  },
  analyticsHeadline: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  analyticsSubtext: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 3,
  },
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
