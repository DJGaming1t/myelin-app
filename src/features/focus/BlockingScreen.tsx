import { router, useFocusEffect } from 'expo-router';
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/src/components/app/AppIcon';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, layout, radius, space } from '@/src/theme/tokens';
import {
  FocusShieldAttemptEntry, FocusShieldMode, InstalledAndroidApp, activeShieldSummary, addCustomScheduleWindow,
  addCustomShieldTarget, buildHistoricalTemptationAnalytics, focusShieldStorage, formatMinuteOfDay,
  removeCustomScheduleWindow, removeCustomShieldTarget, setAccountabilityPin, setFocusShieldMode,
  toggleAllowlistApp, toggleScheduleWindow, toggleShieldTarget, toggleWebsiteWildcard,
  updateFocusShieldCustomization, upsertInstalledAppTarget,
} from './focus-shield';
import { NativePermissionState, fetchInstalledAndroidApps, openFocusShieldPermissionSettings, probeFocusShieldNativeStatus, requestWebsiteVpnAuthorization } from './focus-shield-native';
import { invalidBlockingInput, parseBlockingTime, useBlockingSettings } from './useBlockingSettings';

type Page = 'Apps' | 'Websites' | 'When' | 'Settings';
const PAGES: Page[] = ['Apps', 'Websites', 'When', 'Settings'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES: { mode: FocusShieldMode; title: string; detail: string }[] = [
  { mode: 'gentle', title: 'Gentle', detail: 'A clear stop, with a short break available.' },
  { mode: 'hard', title: 'Firm', detail: 'A longer pause after repeated attempts.' },
  { mode: 'strict', title: 'Strict', detail: 'Settings stay locked while blocking is active.' },
];

export default function BlockingScreen() {
  const { ownerKey } = useWorkspace();
  const { config, ready, busy, error, setError, change } = useBlockingSettings();
  const [page, setPage] = useState<Page>('Apps');
  const [status, setStatus] = useState<NativePermissionState | null>(null);
  const [apps, setApps] = useState<InstalledAndroidApp[]>([]);
  const [appError, setAppError] = useState('');
  const [appsLoading, setAppsLoading] = useState(false), [appLoadKey, setAppLoadKey] = useState(0);
  const [onlySelected, setOnlySelected] = useState(false), [appLimit, setAppLimit] = useState(50);
  const [notice, setNotice] = useState(''), [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [showBreaks, setShowBreaks] = useState(false), [showAllowlist, setShowAllowlist] = useState(false);
  const [showWebsiteHelp, setShowWebsiteHelp] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [search, setSearch] = useState(''), [domain, setDomain] = useState('');
  const [label, setLabel] = useState(''), [start, setStart] = useState('19:00'), [end, setEnd] = useState('21:00');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [pin, setPin] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false), [showAdvanced, setShowAdvanced] = useState(false);
  const [motivation, setMotivation] = useState('');
  const [history, setHistory] = useState<{ owner: string; items: FocusShieldAttemptEntry[] } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const summary = activeShieldSummary(config);
  const analytics = useMemo(() => buildHistoricalTemptationAnalytics(history?.owner === ownerKey ? history.items : []), [history, ownerKey]);
  useEffect(() => { if (error) scroll.current?.scrollTo({ y: 0, animated: false }); }, [error]);
  useEffect(() => {
    setApps([]); setAppError(''); setOnlySelected(false); setAppLimit(50); setNotice(''); setPendingDelete(null); setScheduleError(''); setShowBreaks(false); setShowAllowlist(false); setShowWebsiteHelp(false); setShowPermissions(false);
    setPin(''); setDomain(''); setLabel(''); setMotivation(''); setSearch(''); setShowScheduleForm(false); setShowAdvanced(false);
    if (!ownerKey) return;
    let disposed = false, changed = false;
    const unsubscribe = focusShieldStorage.subscribeAttempts(ownerKey, items => { changed = true; if (!disposed) setHistory({ owner: ownerKey, items }); });
    void focusShieldStorage.loadAttempts(ownerKey).then(items => { if (!disposed && !changed) setHistory({ owner: ownerKey, items }); }).catch(() => undefined);
    return () => { disposed = true; unsubscribe(); };
  }, [ownerKey]);
  useEffect(() => { setMotivation(config.customMotivation); }, [config.customMotivation]);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() { const next = await probeFocusShieldNativeStatus(); if (active) setStatus(next); }
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); sub.remove(); };
  }, []));
  useEffect(() => {
    let active = true;
    if (page === 'Apps' && status?.nativeModuleInstalled) {
      setAppsLoading(true);
      void fetchInstalledAndroidApps().then(next => {
        if (!active) return; setApps(next); setAppError(next.length ? '' : 'Your app list could not be loaded. Try again.');
      }).catch(() => { if (active) setAppError('Your app list could not be loaded. Try again.'); })
        .finally(() => { if (active) setAppsLoading(false); });
    }
    return () => { active = false; };
  }, [page, status?.nativeModuleInstalled, appLoadKey, ownerKey]);
  useEffect(() => { setAppLimit(50); }, [search, onlySelected]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);

  const patch = (value: Parameters<typeof updateFocusShieldCustomization>[1]) => void change(previous => updateFocusShieldCustomization(previous, value));
  const matchingApps = (apps.length ? apps : config.targets.filter(t => t.kind === 'app').map(t => ({ packageName: t.identifier, label: t.label, category: t.category })))
    .filter(app => `${app.label} ${app.packageName}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(app => !onlySelected || config.targets.some(t => t.kind === 'app' && t.identifier === app.packageName && t.enabled));
  const pickerApps: InstalledAndroidApp[] = matchingApps.slice(0, appLimit);
  function addWebsite() {
    void change(previous => { const result = addCustomShieldTarget(previous, 'website', domain); if (!result.added) invalidBlockingInput(result.error); return result.config; }).then(saved => { if (saved) { setDomain(''); setNotice('Website added'); } });
  }
  function addSchedule() {
    const first = parseBlockingTime(start), last = parseBlockingTime(end);
    if (first === null || last === null || first === last || !days.length) { setScheduleError('Choose at least one day and different start/end times, such as 19:00 and 21:00.'); return; }
    setScheduleError('');
    void change(previous => {
      const result = addCustomScheduleWindow(previous, { label: label.trim() || 'My block', days, startMinuteOfDay: first, endMinuteOfDay: last, profileId: previous.profileId });
      if (!result.added) invalidBlockingInput(result.error); return result.config;
    }).then(saved => { if (saved) { setLabel(''); setShowScheduleForm(false); setNotice('Schedule saved'); } });
  }
  async function authorizeWebsites() {
    const result = await requestWebsiteVpnAuthorization(); setStatus(await probeFocusShieldNativeStatus());
    if (!result.vpnPrepared) setError('VPN approval was not completed. Website blocking is still unavailable.');
    else if (result.otherVpnActive) setError('Disconnect your other VPN first. App blocking can still be used.');
  }

  const selectedApps = config.targets.filter(t => t.kind === 'app' && t.enabled).length;
  const selectedSites = config.targets.filter(t => t.kind === 'website' && t.enabled).length;
  const enabledSchedules = config.schedules.filter(item => item.enabled).length;
  const missingPermissions = status?.nativeModuleInstalled && (!status.usageStatsGranted || !status.overlayGranted);
  const rulesOn = config.mode !== 'off';
  const nativeUnavailable = Platform.OS !== 'android' || status && !status.nativeModuleInstalled;
  const headline = !rulesOn ? 'A little space. More focus.' : missingPermissions ? 'One more step.' : 'Your time, on your terms.';
  const timing = config.focusBlockingEnabled && !config.sessionOnly && enabledSchedules ? 'Focus + schedules' : config.focusBlockingEnabled ? 'Focus sessions' : !config.sessionOnly && enabledSchedules ? 'Scheduled times' : 'Choose when to block';
  function navigate(next: Page) { setPage(next); setPendingDelete(null); setError(''); }

  return <SafeAreaView style={s.safe}>
    <AmbientBackdrop />
    <ScreenHeader title="App blocking" onBack={() => router.canGoBack() ? router.back() : router.replace('/(app)/focus')} variant="compact" />
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} stickyHeaderIndices={[1]} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <View style={s.heroTop}><View style={s.statusPill}><View style={[s.statusDot, rulesOn && s.statusDotOn]} /><Text style={s.statusText}>{!ready ? 'LOADING' : rulesOn ? 'RULES ENABLED' : 'BLOCKING OFF'}</Text></View>
          <Switch accessibilityLabel="Blocking enabled" value={rulesOn} disabled={!ready || busy} onValueChange={value => void change(previous => setFocusShieldMode(previous, value ? 'gentle' : 'off'))} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.text} />
        </View>
        <Text style={s.heroTitle}>{headline}</Text>
        <Text style={s.heroDetail}>{!rulesOn ? 'Keep distractions out of the moments that matter.' : missingPermissions ? 'Allow Android permissions to block your selected apps.' : 'Choose your distractions. Decide when they can wait.'}</Text>
        <View style={s.stats}>
          <Stat value={selectedApps} label="apps selected" onPress={() => navigate('Apps')} />
          <View style={s.statDivider} />
          <Stat value={selectedSites} label="sites selected" onPress={() => navigate('Websites')} />
          <View style={s.statDivider} />
          <Stat value={config.sessionOnly ? 0 : enabledSchedules} label="schedules on" onPress={() => navigate('When')} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose when to block" onPress={() => navigate('When')} style={s.timingRow}><AppIcon name="calendar" size={17} color={colors.accent} /><Text style={s.timingText}>{timing}</Text><AppIcon name="chevron" size={16} /></Pressable>
      </View>
      <View accessibilityRole="tablist" style={s.tabs}>{PAGES.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected: page === item }} onPress={() => navigate(item)} style={({ pressed }) => [s.tab, page === item && s.tabActive, pressed && s.pressed]}><Text style={[s.tabText, page === item && s.selectedText]}>{item === 'Websites' ? 'Sites' : item === 'Settings' ? 'Options' : item}</Text></Pressable>)}</View>
      {!ready ? <View style={s.feedback}><ActivityIndicator color={colors.accent} /><Text style={s.body}>Loading your preferences…</Text></View> : null}
      {error ? <View accessibilityRole="alert" style={s.errorBox}><Text style={s.error}>{error}</Text><Action label="Dismiss" quiet onPress={() => setError('')} /></View> : null}
      {nativeUnavailable ? <View style={s.infoBox}><Text style={s.rowTitle}>Set up here. Block on Android.</Text><Text style={s.body}>Your choices are saved, but this preview cannot block apps or websites. Use the MYELIN Android build to activate them.</Text></View> : null}
      <View pointerEvents={!ready || busy ? 'none' : 'auto'} accessibilityState={{ busy }} accessibilityElementsHidden={!ready} importantForAccessibility={!ready ? 'no-hide-descendants' : 'auto'} style={busy ? s.busy : undefined}>
        {page === 'Apps' ? <>
          {status?.nativeModuleInstalled && (missingPermissions || showPermissions) ? <Card title="Finish app setup" detail="A one-time setup in Android Settings.">
            <Permission title="Usage access" detail="Recognises when a selected app is open." granted={status.usageStatsGranted} onPress={() => void openFocusShieldPermissionSettings('usage-access')} />
            <Permission title="Display over apps" detail="Places the blocking screen over that app." granted={status.overlayGranted} onPress={() => void openFocusShieldPermissionSettings('overlay')} />
          </Card> : null}
          <Card title="Choose apps" detail="What would you like a little distance from?">
            <View style={s.searchBox}><Text style={s.searchSymbol} accessible={false}>⌕</Text><TextInput accessibilityLabel="Search apps" placeholder="Search your apps" placeholderTextColor={colors.subtle} value={search} onChangeText={setSearch} autoCorrect={false} style={s.searchInput} />{search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear app search" onPress={() => setSearch('')} style={s.clearButton}><Text style={s.rowTitle}>×</Text></Pressable> : null}</View>
            <View style={s.filterRow}>{[false, true].map(selected => <Pressable key={String(selected)} accessibilityRole="button" accessibilityState={{ selected: onlySelected === selected }} onPress={() => setOnlySelected(selected)} style={[s.filter, onlySelected === selected && s.filterActive]}><Text style={[s.caption, onlySelected === selected && s.selectedText]}>{selected ? `Selected · ${selectedApps}` : 'All apps'}</Text></Pressable>)}</View>
            {appsLoading ? <View style={s.feedback}><ActivityIndicator color={colors.accent} /><Text style={s.body}>Finding your apps…</Text></View> : null}
            {appError ? <View style={s.infoBox}><Text style={s.body}>{appError}</Text><Action label="Retry app list" quiet onPress={() => setAppLoadKey(value => value + 1)} /></View> : null}
            {pickerApps.map(app => {
              const selected = config.targets.some(t => t.kind === 'app' && t.identifier === app.packageName && t.enabled);
              const allowed = app.isSystemEmergency || config.allowlist.some(item => item.enabled && item.packageName === app.packageName);
              return <Pressable key={app.packageName} accessibilityRole="checkbox" accessibilityLabel={app.label} accessibilityState={{ checked: selected, disabled: Boolean(app.isSystemEmergency) }} disabled={app.isSystemEmergency} style={({ pressed }) => [s.appRow, selected && s.appRowSelected, pressed && s.pressed]}
                onPress={() => void change(previous => { const existing = previous.targets.find(t => t.kind === 'app' && t.identifier === app.packageName); if (existing) return toggleShieldTarget(previous, existing.id); const result = upsertInstalledAppTarget(previous, app); if (!result.added) invalidBlockingInput(result.error); return result.config; })}>
                {app.iconUri ? <Image source={{ uri: app.iconUri }} style={s.icon} /> : <View style={[s.iconFallback, selected && s.iconSelected]}><Text style={s.rowTitle}>{app.label.slice(0, 1)}</Text></View>}
                <View style={s.flex}><Text style={s.rowTitle}>{app.label}</Text>{allowed ? <Text style={s.caption}>Always allowed{!app.isSystemEmergency ? ' · review in Options' : ''}</Text> : selected ? <Text style={s.selectedCaption}>Added to your block list</Text> : null}</View><View style={[s.checkbox, selected && s.checkboxSelected]}>{selected ? <Text style={s.checkmark}>✓</Text> : null}</View>
              </Pressable>;
            })}
            {!matchingApps.length && !appsLoading ? <View style={s.empty}><Text style={s.emptyTitle}>{search ? 'Nothing by that name' : 'Your list starts here'}</Text><Text style={s.body}>{search ? 'Try a different app name or clear your search.' : 'Choose All apps, then tap the apps you want to block.'}</Text></View> : null}
            {matchingApps.length > appLimit ? <Action label={`Show more apps (${matchingApps.length - appLimit} remaining)`} quiet onPress={() => setAppLimit(value => value + 50)} /> : null}
          </Card>
          <Text style={s.safetyNote}>Phone, emergency access, Home, Settings and your keyboard stay available.</Text>
          {status?.usageStatsGranted && status.overlayGranted ? <Action label={showPermissions ? 'Hide permissions' : 'Review app permissions'} quiet onPress={() => setShowPermissions(value => !value)} /> : null}
        </> : null}
        {page === 'Websites' ? <>
          <Card title="A quieter internet" detail="Choose the sites you want to spend less time on.">
            <Toggle title="Website filtering" value={config.websiteBlockingEnabled} onChange={value => patch({ websiteBlockingEnabled: value })} />
            <TextInput accessibilityLabel="Website domain" value={domain} onChangeText={setDomain} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="e.g. youtube.com" returnKeyType="done" onSubmitEditing={addWebsite} placeholderTextColor={colors.subtle} style={s.input} />
            <Action label="Add website" disabled={!domain.trim()} onPress={addWebsite} />
            <Text style={s.eyebrow}>YOUR SITES · {selectedSites} SELECTED</Text>
            {config.targets.filter(t => t.kind === 'website').map(item => <View key={item.id} style={s.rule}>
              <Toggle title={item.label} value={item.enabled} onChange={() => void change(previous => toggleShieldTarget(previous, item.id))} />
              {item.enabled ? <Pressable accessibilityRole="button" onPress={() => void change(previous => toggleWebsiteWildcard(previous, item.id))} style={s.textAction}><Text style={s.caption}>{item.wildcardSubdomains !== false ? '✓ Including subdomains' : 'Exact domain only'} · Change</Text></Pressable> : null}
              {item.custom ? <DeleteAction id={item.id} label={`Remove ${item.label}`} pending={pendingDelete} onRequest={setPendingDelete} onConfirm={() => void change(previous => removeCustomShieldTarget(previous, item.id)).then(saved => { if (saved) { setPendingDelete(null); setNotice('Website removed'); } })} /> : null}
            </View>)}
          </Card>
          <Card title="Allow website filtering" detail="Uses Android’s VPN slot for a local website filter.">
            <Permission title="Local website filter" granted={status?.vpnPrepared && !status.otherVpnActive} onPress={() => void authorizeWebsites()} detail={status?.vpnActive ? 'Running now' : status?.otherVpnActive ? 'Another VPN is active. Disconnect it first.' : 'No remote VPN server or browsing traffic inspection.'} />
            <Disclosure title="What website filtering can and cannot do" open={showWebsiteHelp} onPress={() => setShowWebsiteHelp(value => !value)}><Text style={s.body}>Private DNS, browser Secure DNS, cached pages and existing connections can bypass filtering. Turn off Private DNS and Secure DNS when testing. Android allows one VPN at a time.</Text></Disclosure>
            {status?.privateDnsActive ? <Text style={s.error}>Android Private DNS is currently active.</Text> : null}{status?.vpnError ? <Text style={s.error}>{status.vpnError}</Text> : null}
          </Card>
        </> : null}
        {page === 'When' ? <>
          <Card title="Find your rhythm" detail="Block with your timer, on a schedule, or both."><Toggle title="Block during Focus" detail="Pauses with the timer and during breaks." value={config.focusBlockingEnabled} onChange={value => patch({ focusBlockingEnabled: value })} /></Card>
          <Card title="Your weekly routine" detail="These blocks run independently of Focus.">
            <Toggle title="Use schedules" value={!config.sessionOnly} onChange={value => patch({ sessionOnly: !value })} />
            {config.schedules.map(window => <View key={window.id} style={[s.scheduleCard, (!window.enabled || config.sessionOnly) && s.schedulePaused]}>
              <Toggle title={window.label} detail={window.enabled && !config.sessionOnly ? 'Repeats weekly' : 'Schedule paused'} value={window.enabled} onChange={() => void change(previous => toggleScheduleWindow(previous, window.id))} />
              <Text style={s.scheduleTime}>{formatMinuteOfDay(window.startMinuteOfDay)} <Text style={s.timeDash}>—</Text> {formatMinuteOfDay(window.endMinuteOfDay)}</Text>
              {window.endMinuteOfDay < window.startMinuteOfDay ? <Text style={s.selectedCaption}>Ends the next day</Text> : null}
              <Text style={s.body}>{window.days.map(day => DAYS[day]).join(' · ')}</Text>
              {window.custom ? <DeleteAction id={window.id} label={`Delete ${window.label}`} pending={pendingDelete} onRequest={setPendingDelete} onConfirm={() => void change(previous => removeCustomScheduleWindow(previous, window.id)).then(saved => { if (saved) { setPendingDelete(null); setNotice('Schedule deleted'); } })} /> : null}
            </View>)}
            {!config.schedules.length && !showScheduleForm ? <View style={s.empty}><AppIcon name="calendar" size={28} color={colors.accent} /><Text style={s.emptyTitle}>Make time for yourself</Text><Text style={s.body}>An evening wind-down. A morning without scrolling. Start with one repeatable block.</Text></View> : null}
            <Action label={showScheduleForm ? 'Close new schedule' : '+ Add schedule'} quiet onPress={() => { setShowScheduleForm(value => !value); setScheduleError(''); }} />
            {showScheduleForm ? <View style={s.form}>
              <Text style={s.sectionTitle}>New schedule</Text><Text style={s.body}>Name</Text>
              <TextInput accessibilityLabel="Schedule name" placeholder="Evening wind-down" placeholderTextColor={colors.subtle} value={label} onChangeText={setLabel} maxLength={60} style={s.input} />
              <Text style={s.caption}>Use 24-hour time, for example 19:00.</Text><View style={s.timeRow}>
                <View style={s.flex}><Text style={s.body}>From</Text><TextInput accessibilityLabel="Schedule start time" placeholder="19:00" placeholderTextColor={colors.subtle} value={start} onChangeText={setStart} maxLength={5} keyboardType="numbers-and-punctuation" style={s.input} /></View>
                <View style={s.flex}><Text style={s.body}>Until</Text><TextInput accessibilityLabel="Schedule end time" placeholder="21:00" placeholderTextColor={colors.subtle} value={end} onChangeText={setEnd} maxLength={5} keyboardType="numbers-and-punctuation" style={s.input} /></View>
              </View><Text style={s.body}>Repeat on</Text><View style={s.filterRow}>{[{ label: 'Weekdays', days: [1, 2, 3, 4, 5] }, { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] }, { label: 'Weekend', days: [0, 6] }].map(preset => <Pressable key={preset.label} accessibilityRole="button" accessibilityState={{ selected: preset.days.length === days.length && preset.days.every(day => days.includes(day)) }} style={[s.filter, preset.days.length === days.length && preset.days.every(day => days.includes(day)) && s.filterActive]} onPress={() => setDays(preset.days)}><Text style={s.caption}>{preset.label}</Text></Pressable>)}</View><View style={s.days}>{DAYS.map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day} accessibilityState={{ checked: days.includes(index) }} onPress={() => setDays(old => old.includes(index) ? old.filter(value => value !== index) : [...old, index].sort())} style={[s.day, days.includes(index) && s.tabActive]}><Text style={s.tabText}>{day}</Text></Pressable>)}</View>{scheduleError ? <Text accessibilityRole="alert" style={s.error}>{scheduleError}</Text> : null}<Action label="Save schedule" onPress={addSchedule} />
            </View> : null}
            <Text style={s.caption}>Android can delay reminders. After reboot or when the app is closed, tap the schedule notification to start blocking. Allow notifications in Android Settings.</Text>
          </Card>
        </> : null}
        {page === 'Settings' ? <>
          <Card title="How firm should it be?" detail={!rulesOn ? 'Choosing a level will enable blocking.' : 'Choose the support that works for you.'}>{MODES.map(item => <Pressable key={item.mode} accessibilityRole="radio" accessibilityState={{ checked: config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' }} onPress={() => void change(previous => setFocusShieldMode(previous, item.mode))} style={({ pressed }) => [s.choice, (config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft') && s.choiceSelected, pressed && s.pressed]}><View style={s.flex}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.body}>{item.detail}</Text></View><Text style={s.check}>{config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' ? '●' : '○'}</Text></Pressable>)}</Card>
          <Card title="A lock on your intentions" detail="Add a little accountability to changes."><Toggle title="Fingerprint or device unlock" detail="Uses your phone’s system prompt. Locks again when you leave this page or background MYELIN. It does not unlock blocked apps." value={config.requireDeviceUnlock} onChange={value => patch({ requireDeviceUnlock: value })} /></Card>
          <Disclosure title="Breaks & emergency access" open={showBreaks} onPress={() => setShowBreaks(value => !value)}><Text style={s.body}>Choose how many short break passes are available. Strict mode still requires emergency confirmation.</Text>
            <View style={s.days}>{[0, 1, 2].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: config.maxBreakAllowances === value }} style={[s.day, config.maxBreakAllowances === value && s.tabActive]} onPress={() => patch({ maxBreakAllowances: value })}><Text style={s.tabText}>{value} passes</Text></Pressable>)}</View>
            <TextInput accessibilityLabel="Accountability PIN" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" placeholder={summary.hasPin ? 'Replace PIN · leave empty to clear' : 'Optional accountability PIN'} placeholderTextColor={colors.subtle} style={s.input} />
            <Action label={pin ? 'Save PIN' : summary.hasPin ? 'Clear PIN' : 'Set PIN'} quiet onPress={() => { if (!pin && !summary.hasPin) { setError('Enter a PIN first.'); return; } void change(previous => { const result = setAccountabilityPin(previous, pin); if (!result.ok) invalidBlockingInput(result.error); return result.config; }).then(saved => { if (saved) { setPin(''); setNotice(pin ? 'PIN saved' : 'PIN cleared'); } }); }} />
            <Text style={s.caption}>The blocker always keeps an emergency confirmation path. Your phone’s essential functions remain accessible.</Text>
          </Disclosure>
          <Disclosure title="Always-allowed apps" open={showAllowlist} onPress={() => setShowAllowlist(value => !value)}>{config.allowlist.map(item => <Toggle key={item.id} title={item.label} detail={item.emergency ? 'Essential · always available' : undefined} value={item.enabled} disabled={item.emergency} onChange={() => void change(previous => toggleAllowlistApp(previous, item.id))} />)}</Disclosure>
          <Card title="Battery settings" detail="Only needed if your phone stops blocking unexpectedly."><Action label="Open Android battery settings" quiet onPress={() => void openFocusShieldPermissionSettings('battery')} /></Card>
          <Action label={showAdvanced ? 'Hide more options' : 'More options & activity'} quiet onPress={() => setShowAdvanced(value => !value)} />
          {showAdvanced ? <>
            <Card title="Your reminder"><TextInput accessibilityLabel="Blocking reminder message" value={motivation} onChangeText={setMotivation} multiline maxLength={220} style={s.input} /><Action label="Save message" onPress={() => patch({ customMotivation: motivation })} /></Card>
            <Card title="Pause before a break"><Text style={s.body}>The delay grows after repeated attempts in Firm or Strict mode.</Text><View style={s.days}>{[5, 10, 20, 30].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: config.unlockDelaySeconds === value }} style={[s.day, config.unlockDelaySeconds === value && s.tabActive]} onPress={() => patch({ unlockDelaySeconds: value })}><Text style={s.tabText}>{value}s</Text></Pressable>)}</View>
              <Toggle title="Hide other overlays" value={config.blockFloatingWindows} onChange={value => patch({ blockFloatingWindows: value })} /><Toggle title="Multi-window check-in" detail="A reminder to return to full-screen Focus." value={config.blockSplitScreen} onChange={value => patch({ blockSplitScreen: value })} /><Toggle title="Ask compatible browsers to use system DNS" detail="Browsers can ignore this request." value={config.blockDohCanary} onChange={value => patch({ blockDohCanary: value })} />
            </Card><Card title="Last 7 days"><Text style={s.body}>{analytics.appInterceptions} app blocks · {analytics.websiteInterceptions} website blocks</Text><Text style={s.caption}>Recorded local events only. A blocked website request is not counted as a return to studying.</Text></Card>
          </> : null}
        </> : null}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    {notice && !busy ? <View style={s.noticeBar}><Text accessibilityLiveRegion="polite" style={s.saved}>✓ {notice}</Text></View> : null}
    {busy ? <View accessibilityLiveRegion="polite" style={s.busyBar}><ActivityIndicator size="small" color={colors.accent} /><Text style={s.body}>Confirming your change…</Text></View> : null}
  </SafeAreaView>;
}
function Card({ title, detail, children }: PropsWithChildren<{ title: string; detail?: string }>) {
  return <View style={s.card}><View style={s.cardHeading}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}</View>{children}</View>;
}
function Toggle({ title, detail, value, disabled, onChange }: { title: string; detail?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <View style={s.toggle}><View style={s.flex}><Text style={s.rowTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}</View><Switch accessibilityLabel={title} accessibilityHint={detail} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.text} /></View>;
}
function Action({ label, onPress, quiet, disabled }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet && s.quietButton, pressed && s.pressed, disabled && s.busy]}><Text style={[s.buttonText, quiet && s.quietText]}>{label}</Text></Pressable>;
}
function Permission({ title, detail, granted, onPress }: { title: string; detail: string; granted?: boolean; onPress: () => void }) {
  return <View style={s.permission}><View style={s.permissionHeading}><View style={[s.permissionMark, granted && s.permissionGranted]}><Text style={[s.caption, granted && s.successText]}>{granted ? '✓' : '!'}</Text></View><View style={s.flex}><Text style={s.rowTitle}>{title}</Text><Text style={s.body}>{detail}</Text></View></View><Action label={granted ? `${title}: allowed · Review` : `Allow ${title.toLowerCase()}`} quiet={granted} onPress={onPress} /></View>;
}
function Stat({ value, label, onPress }: { value: number; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={({ pressed }) => [s.stat, pressed && s.pressed]}><Text style={s.statValue}>{value.toString().padStart(2, '0')}</Text><Text style={s.statLabel}>{label}</Text></Pressable>;
}
function Disclosure({ title, open, onPress, children }: PropsWithChildren<{ title: string; open: boolean; onPress: () => void }>) {
  return <View style={s.disclosure}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onPress} style={s.disclosureHeading}><Text style={[s.rowTitle, s.flex]}>{title}</Text><Text style={s.selectedText}>{open ? '−' : '+'}</Text></Pressable>{open ? <View style={s.disclosureBody}>{children}</View> : null}</View>;
}
function DeleteAction({ id, label, pending, onRequest, onConfirm }: { id: string; label: string; pending: string | null; onRequest: (id: string | null) => void; onConfirm: () => void }) {
  return pending === id ? <View style={s.deleteConfirmation}><Text style={s.body}>Remove this rule? You can add it again later.</Text><Action label={label} onPress={onConfirm} /><Action label="Keep it" quiet onPress={() => onRequest(null)} /></View> : <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onRequest(id)} style={s.textAction}><Text style={s.deleteText}>Remove</Text></Pressable>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.md, paddingTop: 4, paddingBottom: 48, gap: 20, width: '100%', maxWidth: layout.readingMax, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.panelWarm, borderRadius: 28, padding: 20, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroTitle: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9, maxWidth: 360 },
  heroDetail: { color: colors.textDim, fontSize: 14, lineHeight: 21, maxWidth: 380 },
  statusPill: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.subtle }, statusDotOn: { backgroundColor: colors.accent },
  statusText: { color: colors.textDim, fontSize: 10, lineHeight: 16, letterSpacing: 1.2, fontWeight: '700', flexShrink: 1 },
  stats: { flexDirection: 'row', alignItems: 'stretch', paddingTop: 12, paddingBottom: 4 },
  stat: { flex: 1, minWidth: 0, minHeight: 64, gap: 4 }, statValue: { color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: '500', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 11, lineHeight: 16 }, statDivider: { width: 1, backgroundColor: colors.lineStrong, marginRight: 12, marginVertical: 6 },
  timingRow: { borderTopWidth: 1, borderTopColor: colors.accentLine, paddingTop: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }, timingText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 20 },
  tabs: { flexDirection: 'row', backgroundColor: colors.panel, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.line, gap: 2 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 2, borderRadius: 12 },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine, borderWidth: 1 }, tabText: { color: colors.textDim, fontSize: 13, fontWeight: '600' }, selectedText: { color: colors.accentBright },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 12, marginBottom: 16 }, cardHeading: { gap: 6, paddingBottom: 4 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: '600', letterSpacing: -0.35 }, rowTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 21 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 19 }, eyebrow: { color: colors.muted, fontSize: 10, lineHeight: 16, fontWeight: '700', letterSpacing: 1.3, marginTop: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 56 },
  input: { minHeight: 52, backgroundColor: colors.bgRaised, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: 12, padding: 14, color: colors.text, fontSize: 15 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 14 }, searchSymbol: { paddingLeft: 14, color: colors.muted, fontSize: 24 }, searchInput: { flex: 1, minWidth: 0, minHeight: 52, color: colors.text, padding: 12, fontSize: 14 }, clearButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.lineStrong }, filterActive: { backgroundColor: colors.accentFaint, borderColor: colors.accentLine },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' }, appRowSelected: { backgroundColor: colors.accentFaint, borderColor: colors.accentLine },
  icon: { width: 40, height: 40, borderRadius: 12 }, iconFallback: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, iconSelected: { backgroundColor: colors.accentSoft },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent }, checkmark: { color: colors.bg, fontSize: 15, fontWeight: '800' }, selectedCaption: { color: colors.accentBright, fontSize: 11, lineHeight: 18 },
  check: { color: colors.accent, fontSize: 24, minWidth: 30, textAlign: 'center' },
  permission: { gap: 12, paddingVertical: 10 }, permissionHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, permissionMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, permissionGranted: { backgroundColor: 'rgba(184,221,177,0.1)' }, successText: { color: colors.success },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.bg, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' }, quietButton: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.lineStrong }, quietText: { color: colors.textDim },
  textAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 }, deleteText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, deleteConfirmation: { gap: 8, paddingVertical: 8 },
  rule: { paddingVertical: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, form: { gap: 14, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.lineStrong }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.panelRaised, justifyContent: 'center', alignItems: 'center' }, timeRow: { flexDirection: 'row', gap: 12 },
  scheduleCard: { borderWidth: 1, borderColor: colors.accentLine, borderRadius: 18, padding: 14, gap: 4, backgroundColor: colors.accentFaint }, schedulePaused: { borderColor: colors.lineStrong, backgroundColor: colors.bgRaised }, scheduleTime: { color: colors.text, fontSize: 25, lineHeight: 34, fontWeight: '500', fontVariant: ['tabular-nums'] }, timeDash: { color: colors.subtle },
  choice: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 80, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line }, choiceSelected: { backgroundColor: colors.accentFaint, borderColor: colors.accentLine },
  disclosure: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, marginBottom: 12 }, disclosureHeading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, disclosureBody: { padding: 16, paddingTop: 0, gap: 12 },
  empty: { paddingVertical: 28, paddingHorizontal: 8, gap: 10, alignItems: 'flex-start' }, emptyTitle: { color: colors.textDim, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  infoBox: { gap: 6, padding: 16, backgroundColor: colors.panelRaised, borderRadius: 16, borderWidth: 1, borderColor: colors.line }, safetyNote: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingHorizontal: 8, paddingBottom: 16 },
  errorBox: { borderWidth: 1, borderColor: colors.accentLine, borderRadius: 16, padding: 14, gap: 8 }, error: { color: colors.danger, fontSize: 13, lineHeight: 21 }, saved: { color: colors.success, fontSize: 13, lineHeight: 20 },
  noticeBar: { backgroundColor: colors.panelRaised, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }, busy: { opacity: 0.5 }, pressed: { opacity: 0.75 }, feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, busyBar: { padding: 14, backgroundColor: colors.panelRaised, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
});
