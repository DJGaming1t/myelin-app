import { router, useFocusEffect } from 'expo-router';
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { AppAvatar, BlockingGlyph, BlockingGlyphName, ShieldEmblem, StrengthMark, WeekStrip } from './BlockingVisuals';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, layout, radius, space } from '@/src/theme/tokens';
import {
  FocusShieldAttemptEntry, FocusShieldMode, InstalledAndroidApp, activeShieldSummary, addCustomScheduleWindow,
  addCustomShieldTarget, buildHistoricalTemptationAnalytics, focusShieldStorage, formatMinuteOfDay,
  removeCustomScheduleWindow, removeCustomShieldTarget, setAccountabilityPin, setFocusShieldMode,
  toggleAllowlistApp, toggleScheduleWindow, toggleShieldTarget, toggleWebsiteWildcard,
  updateFocusShieldCustomization, upsertInstalledAppTarget,
} from './focus-shield';
import { NativePermissionState, fetchInstalledAndroidApps, openFocusShieldPermissionSettings, probeFocusShieldNativeStatus } from './focus-shield-native';
import { invalidBlockingInput, parseBlockingTime, useBlockingSettings } from './useBlockingSettings';

type Page = 'Apps' | 'Websites' | 'When' | 'Settings';
const PAGES: Page[] = ['Apps', 'Websites', 'When', 'Settings'];
const PAGE_ICONS: Record<Page, BlockingGlyphName> = { Apps: 'apps', Websites: 'globe', When: 'calendar', Settings: 'sliders' };
const CATEGORY_LABELS = { social: 'Social', video: 'Video', gaming: 'Games', messaging: 'Messaging', custom: 'App' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// react-native-web uses activeThumbColor for the enabled thumb; Android uses thumbColor.
const WEB_SWITCH_PROPS = Platform.OS === 'web' ? { activeThumbColor: colors.text } : {};
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
  function authorizeWebsites() {
    if (Platform.OS !== 'android' || !status?.nativeModuleInstalled) {
      setError('Install the current Android build to enable browser blocking.'); return;
    }
    Alert.alert('Allow browser blocking?', 'Android accessibility lets MYELIN see screen content in supported browsers. During an active website block, MYELIN checks the address bar against your rules and stores the matched blocked domain on this device. Full addresses and page content are not saved or sent by MYELIN. Browser versions, other browsers and in-app pages can bypass this feature.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Continue', onPress: () => { void openFocusShieldPermissionSettings('browser-accessibility').then(opened => { if (!opened) setError('Could not open Android accessibility settings.'); }); } },
    ]);
  }

  const selectedApps = config.targets.filter(t => t.kind === 'app' && t.enabled).length;
  const selectedSites = config.targets.filter(t => t.kind === 'website' && t.enabled).length;
  const enabledSchedules = config.schedules.filter(item => item.enabled).length;
  const missingPermissions = status?.nativeModuleInstalled && (!status.usageStatsGranted || !status.overlayGranted);
  const rulesOn = config.mode !== 'off';
  const nativeUnavailable = Platform.OS !== 'android' || status && !status.nativeModuleInstalled;
  const timing = config.focusBlockingEnabled && !config.sessionOnly && enabledSchedules ? 'Focus + schedules' : config.focusBlockingEnabled ? 'Focus sessions' : !config.sessionOnly && enabledSchedules ? 'Scheduled times' : 'Choose when to block';
  function navigate(next: Page) { setPage(next); setPendingDelete(null); setError(''); }

  return <SafeAreaView style={s.safe}>
    <AmbientBackdrop />
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/focus')} style={({ pressed }) => [s.backButton, pressed && s.pressed]}><View style={{ transform: [{ rotate: '180deg' }] }}><BlockingGlyph name="arrow" size={24} /></View></Pressable>
        <View style={s.flex}><Text style={s.topbarKicker}>MYELIN / YOUR SPACE</Text><Text accessibilityRole="header" style={s.topbarTitle}>App blocking</Text></View>
        <View style={s.topbarMark}><BlockingGlyph name="shield" size={19} color={colors.accentBright} /></View>
      </View>
      <View style={s.hero}>
        <View pointerEvents="none" style={s.heroGlow} />
        <View style={s.heroTop}>
          <View style={s.flex}><Text style={s.heroKicker}>A LITTLE LESS DISTRACTION</Text><Text style={s.heroTitle}>Your quiet space.</Text>
            <View style={s.statusPill}><View style={[s.statusDot, rulesOn && s.statusDotOn]} /><Text style={s.statusText}>{!ready ? 'Loading preferences' : rulesOn ? 'Rules enabled' : 'Blocking is off'}</Text></View>
          </View>
          <ShieldEmblem size={62} />
        </View>
        {missingPermissions ? <Text style={s.heroDetail}>One more step. Allow Android permissions to block your selected apps.</Text> : null}
        <View style={s.stats}>
          <Stat value={selectedApps} label="apps" icon="apps" onPress={() => navigate('Apps')} />
          <Stat value={selectedSites} label="sites" icon="globe" onPress={() => navigate('Websites')} />
          <Stat value={config.sessionOnly ? 0 : enabledSchedules} label="schedules" icon="calendar" onPress={() => navigate('When')} />
        </View>
        <View style={s.heroFooter}><Pressable accessibilityRole="button" accessibilityLabel="Choose when to block" onPress={() => navigate('When')} style={s.timingRow}><BlockingGlyph name="calendar" size={16} color={colors.accentBright} /><Text style={s.timingText}>{timing}</Text><BlockingGlyph name="arrow" size={14} /></Pressable>
          <View style={s.masterSwitch}><Switch {...WEB_SWITCH_PROPS} hitSlop={14} accessibilityLabel="Blocking enabled" value={rulesOn} disabled={!ready || busy} onValueChange={value => void change(previous => setFocusShieldMode(previous, value ? 'gentle' : 'off'))} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.text} /></View>
        </View>
      </View>
      <View accessibilityRole="tablist" style={s.tabs}>{PAGES.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected: page === item }} onPress={() => navigate(item)} style={({ pressed }) => [s.tab, page === item && s.tabActive, pressed && s.pressed]}><BlockingGlyph name={PAGE_ICONS[item]} size={19} color={page === item ? colors.accentBright : colors.muted} /><Text style={[s.tabText, page === item && s.selectedText]}>{item === 'Websites' ? 'Sites' : item === 'Settings' ? 'Options' : item}</Text></Pressable>)}</View>
      {!ready ? <View style={s.feedback}><ActivityIndicator color={colors.accent} /><Text style={s.body}>Loading your preferences…</Text></View> : null}
      {error ? <View accessibilityRole="alert" style={s.errorBox}><Text style={s.error}>{error}</Text><Action label="Dismiss" quiet onPress={() => setError('')} /></View> : null}
      {nativeUnavailable ? <View style={s.previewNote}><BlockingGlyph name="shield" size={17} color={colors.subtle} /><Text style={s.previewText}>Preview only · Blocking runs in the Android app. Choices here stay on this device.</Text></View> : null}
      <View pointerEvents={!ready || busy ? 'none' : 'auto'} accessibilityState={{ busy }} accessibilityElementsHidden={!ready} importantForAccessibility={!ready ? 'no-hide-descendants' : 'auto'} style={busy ? s.busy : undefined}>
        {page === 'Apps' ? <>
          {status?.nativeModuleInstalled && (missingPermissions || showPermissions) ? <Card icon="shield" title="Finish app setup" detail="A one-time setup in Android Settings.">
            <Permission title="Usage access" detail="Recognises when a selected app is open." granted={status.usageStatsGranted} onPress={() => void openFocusShieldPermissionSettings('usage-access')} />
            <Permission title="Display over apps" detail="Places the blocking screen over that app." granted={status.overlayGranted} onPress={() => void openFocusShieldPermissionSettings('overlay')} />
          </Card> : null}
          <Card title="Choose apps" detail="Give your attention a little breathing room." icon="apps" flat>
            <View style={s.searchBox}><View style={s.searchSymbol}><BlockingGlyph name="search" size={20} color={colors.subtle} /></View><TextInput accessibilityLabel="Search apps" placeholder="Search your apps" placeholderTextColor={colors.subtle} value={search} onChangeText={setSearch} autoCorrect={false} style={s.searchInput} />{search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear app search" onPress={() => setSearch('')} style={s.clearButton}><Text style={s.rowTitle}>×</Text></Pressable> : null}</View>
            <View style={s.filterRow}>{[false, true].map(selected => <Pressable key={String(selected)} accessibilityRole="button" accessibilityState={{ selected: onlySelected === selected }} onPress={() => setOnlySelected(selected)} style={[s.filter, onlySelected === selected && s.filterActive]}><Text style={[s.caption, onlySelected === selected && s.selectedText]}>{selected ? `Selected · ${selectedApps}` : 'All apps'}</Text></Pressable>)}</View>
            {appsLoading ? <View style={s.feedback}><ActivityIndicator color={colors.accent} /><Text style={s.body}>Finding your apps…</Text></View> : null}
            {appError ? <View style={s.infoBox}><Text style={s.body}>{appError}</Text><Action label="Retry app list" quiet onPress={() => setAppLoadKey(value => value + 1)} /></View> : null}
            {pickerApps.map(app => {
              const selected = config.targets.some(t => t.kind === 'app' && t.identifier === app.packageName && t.enabled);
              const allowed = app.isSystemEmergency || config.allowlist.some(item => item.enabled && item.packageName === app.packageName);
              return <Pressable key={app.packageName} accessibilityRole="checkbox" accessibilityLabel={app.label} accessibilityState={{ checked: selected, disabled: Boolean(app.isSystemEmergency) }} disabled={app.isSystemEmergency} style={({ pressed }) => [s.appRow, selected && s.appRowSelected, pressed && s.pressed]}
                onPress={() => void change(previous => { const existing = previous.targets.find(t => t.kind === 'app' && t.identifier === app.packageName); if (existing) return toggleShieldTarget(previous, existing.id); const result = upsertInstalledAppTarget(previous, app); if (!result.added) invalidBlockingInput(result.error); return result.config; })}>
                <AppAvatar label={app.label} identifier={app.packageName} iconUri={app.iconUri} />
                <View style={s.flex}><Text style={s.rowTitle}>{app.label}</Text>{allowed ? <Text style={s.caption}>Always allowed{!app.isSystemEmergency ? ' · review in Options' : ''}</Text> : <Text style={s.caption}>{CATEGORY_LABELS[app.category] || 'App'}{selected ? ' · Selected' : ''}</Text>}</View><View style={[s.checkbox, selected && s.checkboxSelected]}>{selected ? <BlockingGlyph name="check" size={17} color={colors.bg} /> : null}</View>
              </Pressable>;
            })}
            {!matchingApps.length && !appsLoading ? <View style={s.empty}><Text style={s.emptyTitle}>{search ? 'Nothing by that name' : 'Your list starts here'}</Text><Text style={s.body}>{search ? 'Try a different app name or clear your search.' : 'Choose All apps, then tap the apps you want to block.'}</Text></View> : null}
            {matchingApps.length > appLimit ? <Action label={`Show more apps (${matchingApps.length - appLimit} remaining)`} quiet onPress={() => setAppLimit(value => value + 50)} /> : null}
          </Card>
          <Text style={s.safetyNote}>Phone, emergency access, Home, Settings and your keyboard stay available.</Text>
          {status?.usageStatsGranted && status.overlayGranted ? <Action label={showPermissions ? 'Hide permissions' : 'Review app permissions'} quiet onPress={() => setShowPermissions(value => !value)} /> : null}
        </> : null}
        {page === 'Websites' ? <>
          <Card title="A quieter internet" detail="A little more intention. A little less scrolling." icon="globe" flat>
            <Toggle title="Website filtering" value={config.websiteBlockingEnabled} onChange={value => patch({ websiteBlockingEnabled: value })} />
            <TextInput accessibilityLabel="Website domain" value={domain} onChangeText={setDomain} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="e.g. youtube.com" returnKeyType="done" onSubmitEditing={addWebsite} placeholderTextColor={colors.subtle} style={s.input} />
            <Action label="Add website" disabled={!domain.trim()} onPress={addWebsite} />
            <Text style={s.eyebrow}>YOUR SITES · {selectedSites} SELECTED</Text>
            {config.targets.filter(t => t.kind === 'website').map(item => <View key={item.id} style={[s.rule, item.enabled && s.ruleSelected]}>
              <Toggle icon="globe" title={item.label} value={item.enabled} onChange={() => void change(previous => toggleShieldTarget(previous, item.id))} />
              {item.enabled ? <Pressable accessibilityRole="button" onPress={() => void change(previous => toggleWebsiteWildcard(previous, item.id))} style={s.textAction}><Text style={s.caption}>{item.wildcardSubdomains !== false ? '✓ Including subdomains' : 'Exact domain only'} · Change</Text></Pressable> : null}
              {item.custom ? <DeleteAction id={item.id} label={`Remove ${item.label}`} pending={pendingDelete} onRequest={setPendingDelete} onConfirm={() => void change(previous => removeCustomShieldTarget(previous, item.id)).then(saved => { if (saved) { setPendingDelete(null); setNotice('Website removed'); } })} /> : null}
            </View>)}
          </Card>
          <Card icon="shield" title="Allow browser blocking" detail="Checks supported browsers without routing your internet through a VPN.">
            <Permission title="Browser accessibility" granted={status?.browserAccessibilityGranted} onPress={authorizeWebsites} detail={status?.browserAccessibilityGranted ? 'Permission enabled. Blocking applies during your selected study times.' : 'Allow this in Android Accessibility settings to check selected websites.'} />
            <Disclosure title="What browser blocking can and cannot do" open={showWebsiteHelp} onPress={() => setShowWebsiteHelp(value => !value)}><Text style={s.body}>Chrome, Chrome Beta, Brave and Edge are supported on a best-effort basis. Browser updates, other browsers, in-app pages and hidden address bars can bypass blocking. App blocking works separately.</Text></Disclosure>
            {config.websiteBlockingEnabled && !status?.browserAccessibilityGranted ? <Text style={s.error}>Website blocking needs browser accessibility permission.</Text> : null}
          </Card>
        </> : null}
        {page === 'When' ? <>
          <Card title="Find your rhythm" detail="Pair a quieter phone with your Focus timer." icon="shield"><Toggle title="Block during Focus" detail="Pauses with the timer and during breaks." value={config.focusBlockingEnabled} onChange={value => patch({ focusBlockingEnabled: value })} /></Card>
          <Card title="Your weekly routine" detail="Protect the same time, day after day." icon="calendar" flat>
            <Toggle title="Use schedules" value={!config.sessionOnly} onChange={value => patch({ sessionOnly: !value })} />
            {config.schedules.map(window => <View key={window.id} style={[s.scheduleCard, (!window.enabled || config.sessionOnly) && s.schedulePaused]}>
              <Toggle title={window.label} detail={window.enabled && !config.sessionOnly ? 'Repeats weekly' : 'Schedule paused'} value={window.enabled} onChange={() => void change(previous => toggleScheduleWindow(previous, window.id))} />
              <Text style={s.scheduleTime}>{formatMinuteOfDay(window.startMinuteOfDay)} <Text style={s.timeDash}>—</Text> {formatMinuteOfDay(window.endMinuteOfDay)}</Text>
              {window.endMinuteOfDay < window.startMinuteOfDay ? <Text style={s.selectedCaption}>Ends the next day</Text> : null}
              <WeekStrip days={window.days} enabled={window.enabled && !config.sessionOnly} />
              {window.custom ? <DeleteAction id={window.id} label={`Delete ${window.label}`} pending={pendingDelete} onRequest={setPendingDelete} onConfirm={() => void change(previous => removeCustomScheduleWindow(previous, window.id)).then(saved => { if (saved) { setPendingDelete(null); setNotice('Schedule deleted'); } })} /> : null}
            </View>)}
            {!config.schedules.length && !showScheduleForm ? <View style={s.empty}><View style={s.emptyEmblem}><BlockingGlyph name="calendar" size={30} color={colors.accentBright} /></View><Text style={s.emptyTitle}>Make time for yourself</Text><Text style={s.body}>An evening wind-down. A morning without scrolling. Start with one repeatable block.</Text></View> : null}
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
          <Card icon="sliders" flat title="How firm should it be?" detail={!rulesOn ? 'Choosing a level will enable blocking.' : 'Choose the support that works for you.'}>{MODES.map((item, index) => <Pressable key={item.mode} accessibilityRole="radio" accessibilityState={{ checked: config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' }} onPress={() => void change(previous => setFocusShieldMode(previous, item.mode))} style={({ pressed }) => [s.choice, (config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft') && s.choiceSelected, pressed && s.pressed]}><StrengthMark level={index + 1} selected={config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft'} /><View style={s.flex}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.body}>{item.detail}</Text></View><View style={[s.radio, (config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft') && s.radioSelected]}>{config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' ? <View style={s.radioDot} /> : null}</View></Pressable>)}</Card>
          <Card icon="lock" title="A lock on your intentions" detail="Add a little accountability to changes."><Toggle title="Fingerprint or device unlock" detail="Uses your phone’s system prompt. Locks again when you leave this page or background MYELIN. It does not unlock blocked apps." value={config.requireDeviceUnlock} onChange={value => patch({ requireDeviceUnlock: value })} /></Card>
          <Disclosure title="Breaks & emergency access" open={showBreaks} onPress={() => setShowBreaks(value => !value)}><Text style={s.body}>Choose how many short break passes are available. Strict mode still requires emergency confirmation.</Text>
            <View style={s.days}>{[0, 1, 2].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: config.maxBreakAllowances === value }} style={[s.day, config.maxBreakAllowances === value && s.tabActive]} onPress={() => patch({ maxBreakAllowances: value })}><Text style={s.tabText}>{value} passes</Text></Pressable>)}</View>
            <TextInput accessibilityLabel="Accountability PIN" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" placeholder={summary.hasPin ? 'Replace PIN · leave empty to clear' : 'Optional accountability PIN'} placeholderTextColor={colors.subtle} style={s.input} />
            <Action label={pin ? 'Save PIN' : summary.hasPin ? 'Clear PIN' : 'Set PIN'} quiet onPress={() => { if (!pin && !summary.hasPin) { setError('Enter a PIN first.'); return; } void change(previous => { const result = setAccountabilityPin(previous, pin); if (!result.ok) invalidBlockingInput(result.error); return result.config; }).then(saved => { if (saved) { setPin(''); setNotice(pin ? 'PIN saved' : 'PIN cleared'); } }); }} />
            <Text style={s.caption}>The blocker always keeps an emergency confirmation path. Your phone’s essential functions remain accessible.</Text>
          </Disclosure>
          <Disclosure title="Always-allowed apps" open={showAllowlist} onPress={() => setShowAllowlist(value => !value)}>{config.allowlist.map(item => <Toggle key={item.id} title={item.label} detail={item.emergency ? 'Essential · always available' : undefined} value={item.enabled} disabled={item.emergency} onChange={() => void change(previous => toggleAllowlistApp(previous, item.id))} />)}</Disclosure>
          <Card icon="sliders" title="Battery settings" detail="Only needed if your phone stops blocking unexpectedly."><Action label="Open Android battery settings" quiet onPress={() => void openFocusShieldPermissionSettings('battery')} /></Card>
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
function Card({ title, detail, icon, flat, children }: PropsWithChildren<{ title: string; detail?: string; icon?: BlockingGlyphName; flat?: boolean }>) {
  return <View style={[s.card, flat && s.flatCard]}><View style={s.cardHeading}>{icon ? <View style={s.headingIcon}><BlockingGlyph name={icon} size={20} color={colors.accentBright} /></View> : null}<View style={s.flex}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}</View></View>{children}</View>;
}
function Toggle({ title, detail, icon, value, disabled, onChange }: { icon?: BlockingGlyphName; title: string; detail?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <View style={s.toggle}>{icon ? <View style={s.siteIcon}><BlockingGlyph name={icon} size={19} color={colors.muted} /></View> : null}<View style={s.flex}><Text style={s.rowTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}</View><Switch {...WEB_SWITCH_PROPS} hitSlop={14} accessibilityLabel={title} accessibilityHint={detail} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.text} /></View>;
}
function Action({ label, onPress, quiet, disabled }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet && s.quietButton, pressed && s.pressed, disabled && s.busy]}><Text style={[s.buttonText, quiet && s.quietText]}>{label}</Text></Pressable>;
}
function Permission({ title, detail, granted, onPress }: { title: string; detail: string; granted?: boolean; onPress: () => void }) {
  return <View style={s.permission}><View style={s.permissionHeading}><View style={[s.permissionMark, granted && s.permissionGranted]}><Text style={[s.caption, granted && s.successText]}>{granted ? '✓' : '!'}</Text></View><View style={s.flex}><Text style={s.rowTitle}>{title}</Text><Text style={s.body}>{detail}</Text></View></View><Action label={granted ? `${title}: allowed · Review` : `Allow ${title.toLowerCase()}`} quiet={granted} onPress={onPress} /></View>;
}
function Stat({ value, label, icon, onPress }: { value: number; label: string; icon: BlockingGlyphName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label} selected`} onPress={onPress} style={({ pressed }) => [s.stat, pressed && s.pressed]}><View style={s.statTop}><Text style={s.statValue}>{value.toString().padStart(2, '0')}</Text><BlockingGlyph name={icon} size={14} color={colors.subtle} /></View><Text style={s.statLabel}>{label}</Text></Pressable>;
}
function Disclosure({ title, open, onPress, children }: PropsWithChildren<{ title: string; open: boolean; onPress: () => void }>) {
  return <View style={s.disclosure}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onPress} style={s.disclosureHeading}><Text style={[s.rowTitle, s.flex]}>{title}</Text><Text style={s.selectedText}>{open ? '−' : '+'}</Text></Pressable>{open ? <View style={s.disclosureBody}>{children}</View> : null}</View>;
}
function DeleteAction({ id, label, pending, onRequest, onConfirm }: { id: string; label: string; pending: string | null; onRequest: (id: string | null) => void; onConfirm: () => void }) {
  return pending === id ? <View style={s.deleteConfirmation}><Text style={s.body}>Remove this rule? You can add it again later.</Text><Action label={label} onPress={onConfirm} /><Action label="Keep it" quiet onPress={() => onRequest(null)} /></View> : <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onRequest(id)} style={s.textAction}><Text style={s.deleteText}>Remove</Text></Pressable>;
}
const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingHorizontal: 0, paddingVertical: 10 },
  backButton: { width: 44, height: 44, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  topbarKicker: { color: colors.subtle, fontSize: 9, lineHeight: 14, letterSpacing: 1.5, fontWeight: '600' },
  topbarTitle: { color: colors.text, fontSize: 22, lineHeight: 29, letterSpacing: -0.6, fontWeight: '600' },
  topbarMark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { color: colors.accentBright, fontSize: 8, lineHeight: 14, letterSpacing: 1.1, fontWeight: '600' },
  heroGlow: { position: 'absolute', top: -70, right: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,130,93,0.035)', borderWidth: 1, borderColor: 'rgba(255,160,122,0.045)' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,160,122,0.12)', paddingTop: 4 },
  masterSwitch: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  flatCard: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', gap: 10, marginBottom: 20 },
  headingIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFaint },
  siteIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  ruleSelected: { borderColor: 'rgba(255,160,122,0.18)', backgroundColor: '#171411' },
  emptyEmblem: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.accentBright }, radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentBright },
  previewNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 4 },
  previewText: { flex: 1, color: colors.subtle, fontSize: 11, lineHeight: 17 },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.md, paddingTop: 4, paddingBottom: 48, gap: 16, width: '100%', maxWidth: layout.readingMax, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  hero: { borderWidth: 1, borderColor: 'rgba(255,160,122,0.21)', backgroundColor: '#171310', borderRadius: 26, padding: 18, gap: 14, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.8, marginVertical: 5 },
  heroDetail: { color: colors.textDim, fontSize: 14, lineHeight: 21, maxWidth: 380 },
  statusPill: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.subtle }, statusDotOn: { backgroundColor: colors.accent },
  statusText: { color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '500', flexShrink: 1 },
  stats: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  stat: { flex: 1, minWidth: 0, minHeight: 65, gap: 5, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' }, statValue: { color: colors.text, fontSize: 23, lineHeight: 28, fontWeight: '500', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 11, lineHeight: 16 }, statDivider: { width: 1, backgroundColor: colors.lineStrong, marginRight: 12, marginVertical: 6 },
  timingRow: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, timingText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 20 },
  tabs: { flexDirection: 'row', backgroundColor: '#101013', borderRadius: 20, padding: 5, borderWidth: 1, borderColor: colors.line, gap: 3 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 62, gap: 6, paddingHorizontal: 2, paddingVertical: 9, borderRadius: 15 },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine, borderWidth: 1 }, tabText: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' }, selectedText: { color: colors.accentBright },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 12, marginBottom: 16 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 8 },
  sectionTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4, marginBottom: 3 }, rowTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 21 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 19 }, eyebrow: { color: colors.muted, fontSize: 10, lineHeight: 16, fontWeight: '700', letterSpacing: 1.3, marginTop: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 56 },
  input: { minHeight: 52, backgroundColor: colors.bgRaised, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: 12, padding: 14, color: colors.text, fontSize: 15 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141416', borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 16 }, searchSymbol: { paddingLeft: 15 }, searchInput: { flex: 1, minWidth: 0, minHeight: 52, color: colors.text, padding: 12, fontSize: 14 }, clearButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: colors.lineStrong }, filterActive: { backgroundColor: colors.accentFaint, borderColor: colors.accentLine },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 76, padding: 13, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }, appRowSelected: { backgroundColor: '#1B1512', borderColor: 'rgba(255,160,122,0.22)' },
  icon: { width: 40, height: 40, borderRadius: 12 }, iconFallback: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, iconSelected: { backgroundColor: colors.accentSoft },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent }, checkmark: { color: colors.bg, fontSize: 15, fontWeight: '800' }, selectedCaption: { color: colors.accentBright, fontSize: 11, lineHeight: 18 },
  check: { color: colors.accent, fontSize: 24, minWidth: 30, textAlign: 'center' },
  permission: { gap: 12, paddingVertical: 10 }, permissionHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, permissionMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, permissionGranted: { backgroundColor: 'rgba(184,221,177,0.1)' }, successText: { color: colors.success },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.bg, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' }, quietButton: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.lineStrong }, quietText: { color: colors.textDim },
  textAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 }, deleteText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, deleteConfirmation: { gap: 8, paddingVertical: 8 },
  rule: { padding: 14, gap: 2, borderWidth: 1, borderColor: colors.line, borderRadius: 19, backgroundColor: colors.panel }, form: { gap: 14, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.lineStrong }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.panelRaised, justifyContent: 'center', alignItems: 'center' }, timeRow: { flexDirection: 'row', gap: 12 },
  scheduleCard: { borderWidth: 1, borderColor: 'rgba(255,160,122,0.24)', borderRadius: 22, padding: 18, gap: 8, backgroundColor: '#1A1513' }, schedulePaused: { borderColor: colors.lineStrong, backgroundColor: colors.bgRaised }, scheduleTime: { color: colors.text, fontSize: 30, lineHeight: 40, letterSpacing: -0.7, fontWeight: '500', fontVariant: ['tabular-nums'] }, timeDash: { color: colors.subtle },
  choice: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 94, padding: 16, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }, choiceSelected: { backgroundColor: colors.accentFaint, borderColor: colors.accentLine },
  disclosure: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, marginBottom: 12 }, disclosureHeading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, disclosureBody: { padding: 16, paddingTop: 0, gap: 12 },
  empty: { padding: 24, gap: 12, alignItems: 'flex-start', borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.panel }, emptyTitle: { color: colors.textDim, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  infoBox: { gap: 6, padding: 16, backgroundColor: colors.panelRaised, borderRadius: 16, borderWidth: 1, borderColor: colors.line }, safetyNote: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingHorizontal: 8, paddingBottom: 16 },
  errorBox: { borderWidth: 1, borderColor: colors.accentLine, borderRadius: 16, padding: 14, gap: 8 }, error: { color: colors.danger, fontSize: 13, lineHeight: 21 }, saved: { color: colors.success, fontSize: 13, lineHeight: 20 },
  noticeBar: { backgroundColor: colors.panelRaised, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }, busy: { opacity: 0.5 }, pressed: { opacity: 0.75 }, feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, busyBar: { padding: 14, backgroundColor: colors.panelRaised, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
});
