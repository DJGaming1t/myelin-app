import { router, useFocusEffect } from 'expo-router';
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    if (page === 'Apps' && status?.nativeModuleInstalled) void fetchInstalledAndroidApps().then(next => {
      if (!active) return; setApps(next); setAppError(next.length ? '' : 'No apps were returned. Reopen this page to retry.');
    });
    return () => { active = false; };
  }, [page, status?.nativeModuleInstalled]);

  const patch = (value: Parameters<typeof updateFocusShieldCustomization>[1]) => void change(previous => updateFocusShieldCustomization(previous, value));
  const matchingApps = (apps.length ? apps : config.targets.filter(t => t.kind === 'app').map(t => ({ packageName: t.identifier, label: t.label, category: t.category })))
    .filter(app => `${app.label} ${app.packageName}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pickerApps: InstalledAndroidApp[] = matchingApps.slice(0, 50);
  function addWebsite() {
    void change(previous => { const result = addCustomShieldTarget(previous, 'website', domain); if (!result.added) invalidBlockingInput(result.error); return result.config; }).then(saved => { if (saved) setDomain(''); });
  }
  function addSchedule() {
    const first = parseBlockingTime(start), last = parseBlockingTime(end);
    if (first === null || last === null || first === last || !days.length) { setError('Choose at least one day and different start/end times in 24-hour HH:MM format.'); return; }
    void change(previous => {
      const result = addCustomScheduleWindow(previous, { label: label.trim() || 'My block', days, startMinuteOfDay: first, endMinuteOfDay: last, profileId: previous.profileId });
      if (!result.added) invalidBlockingInput(result.error); return result.config;
    }).then(saved => { if (saved) { setLabel(''); setShowScheduleForm(false); } });
  }
  async function authorizeWebsites() {
    const result = await requestWebsiteVpnAuthorization(); setStatus(await probeFocusShieldNativeStatus());
    if (!result.vpnPrepared) setError('VPN approval was not completed. Website blocking is still unavailable.');
    else if (result.otherVpnActive) setError('Disconnect your other VPN first. App blocking can still be used.');
  }

  return <SafeAreaView style={s.safe}>
    <AmbientBackdrop />
    <ScreenHeader title="App blocking" subtitle="Make room for what matters." onBack={() => router.back()} variant="compact" />
    <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.hero}><Text style={s.eyebrow}>YOUR BOUNDARIES</Text>
        <Toggle title="Blocking enabled" detail={config.mode === 'off' ? 'Turn on when your choices are ready.' : `${summary.apps.length} apps · ${summary.websites.length} sites`}
          value={config.mode !== 'off'} disabled={!ready || busy} onChange={value => void change(previous => setFocusShieldMode(previous, value ? 'gentle' : 'off'))} />
        <Text style={s.caption}>{config.mode === 'off' ? 'Your choices are saved. Turn on when ready.' : status?.scheduleActiveNow ? `${status.activeScheduleLabel || 'Schedule'} window is open` : 'During Focus or the times you choose.'}</Text>
      </View>
      <View accessibilityRole="tablist" style={s.tabs}>{PAGES.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected: page === item }} onPress={() => setPage(item)} style={[s.tab, page === item && s.tabActive]}><Text style={[s.tabText, page === item && s.selectedText]}>{item === 'Websites' ? 'Sites' : item === 'Settings' ? 'Options' : item}</Text></Pressable>)}</View>
      {!ready ? <Text accessibilityRole="alert" style={s.body}>Loading blocking preferences…</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {Platform.OS !== 'android' || status && !status.nativeModuleInstalled ? <Card title="Android build needed"><Text style={s.body}>Native blocking needs a MYELIN Android build. Your Focus timer remains available.</Text></Card> : null}
      <View pointerEvents={!ready || busy ? 'none' : 'auto'} accessibilityState={{ busy }} style={busy ? s.busy : undefined}>
        {page === 'Apps' ? <>
          {status?.nativeModuleInstalled && (!status.usageStatsGranted || !status.overlayGranted || showPermissions) ? <Card title="Allow app blocking" detail="Two Android permissions are needed. Grant them one at a time.">
            <Permission title="Usage access" detail="Recognises which app is open." granted={status.usageStatsGranted} onPress={() => void openFocusShieldPermissionSettings('usage-access')} />
            <Permission title="Display over apps" detail="Shows the blocking screen." granted={status.overlayGranted} onPress={() => void openFocusShieldPermissionSettings('overlay')} />
            <Text style={s.caption}>Phone, emergency access, Home, Settings and your keyboard stay available.</Text>
          </Card> : null}
          <Card title="Choose apps" detail="Selected apps pause during the times you choose.">
            <TextInput accessibilityLabel="Search apps" placeholder="Search your apps" placeholderTextColor={colors.subtle} value={search} onChangeText={setSearch} style={s.input} />
            {appError ? <Text style={s.body}>{appError}</Text> : null}
            {pickerApps.map(app => {
              const selected = config.targets.some(t => t.kind === 'app' && t.identifier === app.packageName && t.enabled);
              return <Pressable key={app.packageName} accessibilityRole="checkbox" accessibilityLabel={app.label} accessibilityState={{ checked: selected, disabled: Boolean(app.isSystemEmergency) }} disabled={app.isSystemEmergency} style={s.appRow}
                onPress={() => void change(previous => { const existing = previous.targets.find(t => t.kind === 'app' && t.identifier === app.packageName); if (existing) return toggleShieldTarget(previous, existing.id); const result = upsertInstalledAppTarget(previous, app); if (!result.added) invalidBlockingInput(result.error); return result.config; })}>
                {app.iconUri ? <Image source={{ uri: app.iconUri }} style={s.icon} /> : <View style={s.iconFallback}><Text style={s.rowTitle}>{app.label.slice(0, 1)}</Text></View>}
                <View style={s.flex}><Text style={s.rowTitle}>{app.label}</Text>{app.isSystemEmergency ? <Text style={s.caption}>Always available</Text> : null}</View><Text style={[s.check, selected && s.selectedText]}>{selected ? '✓' : '○'}</Text>
              </Pressable>;
            })}
            {!matchingApps.length ? <Text style={s.body}>No apps match your search.</Text> : null}
            {matchingApps.length > 50 ? <Text style={s.caption}>Showing 50 apps. Search to find any other app.</Text> : null}
            {status?.usageStatsGranted && status.overlayGranted ? <Action label={showPermissions ? 'Hide permissions' : 'Review app permissions'} quiet onPress={() => setShowPermissions(value => !value)} /> : null}
          </Card>
        </> : null}
        {page === 'Websites' ? <>
          <Card title="Websites" detail="Block a domain and its subdomains across browsers.">
            <Toggle title="Website filtering" value={config.websiteBlockingEnabled} onChange={value => patch({ websiteBlockingEnabled: value })} />
            <TextInput accessibilityLabel="Website domain" value={domain} onChangeText={setDomain} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="youtube.com" placeholderTextColor={colors.subtle} style={s.input} />
            <Action label="Add website" onPress={addWebsite} />
            {config.targets.filter(t => t.kind === 'website').map(item => <View key={item.id} style={s.rule}>
              <Toggle title={item.label} value={item.enabled} onChange={() => void change(previous => toggleShieldTarget(previous, item.id))} />
              {item.enabled ? <Pressable accessibilityRole="button" onPress={() => void change(previous => toggleWebsiteWildcard(previous, item.id))} style={s.textAction}><Text style={s.caption}>{item.wildcardSubdomains !== false ? 'Includes subdomains ✓' : 'Exact domain only'} · Change</Text></Pressable> : null}
              {item.custom ? <Action label={`Remove ${item.label}`} quiet onPress={() => void change(previous => removeCustomShieldTarget(previous, item.id))} /> : null}
            </View>)}
          </Card>
          <Card title="Allow website filtering" detail="Uses Android’s VPN slot for a local website filter.">
            <Permission title="Local website filter" granted={status?.vpnPrepared && !status.otherVpnActive} onPress={() => void authorizeWebsites()} detail={status?.vpnActive ? 'Running now' : status?.otherVpnActive ? 'Another VPN is active. Disconnect it first.' : 'No remote VPN server or browsing traffic inspection.'} />
            <Text style={s.body}>Private DNS, browser Secure DNS, cached pages and existing connections can bypass filtering. Turn off Private DNS and Secure DNS when testing.</Text>
            {status?.privateDnsActive ? <Text style={s.error}>Android Private DNS is currently active.</Text> : null}{status?.vpnError ? <Text style={s.error}>{status.vpnError}</Text> : null}
          </Card>
        </> : null}
        {page === 'When' ? <>
          <Card title="During Focus" detail="Use your selected apps and websites with the Focus timer."><Toggle title="Block during Focus" detail="Pauses with the timer and during breaks." value={config.focusBlockingEnabled} onChange={value => patch({ focusBlockingEnabled: value })} /></Card>
          <Card title="On a schedule" detail="These times work independently of the Focus timer.">
            <Toggle title="Use schedules" value={!config.sessionOnly} onChange={value => patch({ sessionOnly: !value })} />
            {config.schedules.map(window => <View key={window.id} style={s.rule}><Toggle title={window.label} detail={`${formatMinuteOfDay(window.startMinuteOfDay)} – ${formatMinuteOfDay(window.endMinuteOfDay)}${window.endMinuteOfDay < window.startMinuteOfDay ? ' · next day' : ''}\n${window.days.map(day => DAYS[day]).join(', ')}`} value={window.enabled} onChange={() => void change(previous => toggleScheduleWindow(previous, window.id))} />{window.custom ? <Action label={`Delete ${window.label}`} quiet onPress={() => void change(previous => removeCustomScheduleWindow(previous, window.id))} /> : null}</View>)}
            <Action label={showScheduleForm ? 'Close new schedule' : '+ Add schedule'} quiet onPress={() => setShowScheduleForm(value => !value)} />
            {showScheduleForm ? <View style={s.form}>
              <TextInput accessibilityLabel="Schedule name" placeholder="Evening wind-down" placeholderTextColor={colors.subtle} value={label} onChangeText={setLabel} maxLength={60} style={s.input} />
              <Text style={s.caption}>24-hour time · HH:MM</Text><View style={s.timeRow}>
                <View style={s.flex}><Text style={s.body}>From</Text><TextInput accessibilityLabel="Schedule start time" placeholder="19:00" placeholderTextColor={colors.subtle} value={start} onChangeText={setStart} maxLength={5} keyboardType="numbers-and-punctuation" style={s.input} /></View>
                <View style={s.flex}><Text style={s.body}>Until</Text><TextInput accessibilityLabel="Schedule end time" placeholder="21:00" placeholderTextColor={colors.subtle} value={end} onChangeText={setEnd} maxLength={5} keyboardType="numbers-and-punctuation" style={s.input} /></View>
              </View><View style={s.days}>{DAYS.map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day} accessibilityState={{ checked: days.includes(index) }} onPress={() => setDays(old => old.includes(index) ? old.filter(value => value !== index) : [...old, index].sort())} style={[s.day, days.includes(index) && s.tabActive]}><Text style={s.tabText}>{day}</Text></Pressable>)}</View><Action label="Save schedule" onPress={addSchedule} />
            </View> : null}
            <Text style={s.caption}>Android can delay reminders. After reboot or when the app is closed, tap the schedule notification to start blocking. Allow notifications in Android Settings.</Text>
          </Card>
        </> : null}
        {page === 'Settings' ? <>
          <Card title="How firm should it be?">{MODES.map(item => <Pressable key={item.mode} accessibilityRole="radio" accessibilityState={{ checked: config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' }} onPress={() => void change(previous => setFocusShieldMode(previous, item.mode))} style={s.choice}><View style={s.flex}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.body}>{item.detail}</Text></View><Text style={s.check}>{config.mode === item.mode || item.mode === 'gentle' && config.mode === 'soft' ? '●' : '○'}</Text></Pressable>)}</Card>
          <Card title="Protect settings" detail="Optional confirmation before editing your blocking rules."><Toggle title="Fingerprint or device unlock" detail="Uses your phone’s system prompt. Locks again when you leave this page or background MYELIN. It does not unlock blocked apps." value={config.requireDeviceUnlock} onChange={value => patch({ requireDeviceUnlock: value })} /></Card>
          <Card title="Breaks & emergency access"><Text style={s.body}>Choose how many short break passes are available. Strict mode still requires emergency confirmation.</Text>
            <View style={s.days}>{[0, 1, 2].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: config.maxBreakAllowances === value }} style={[s.day, config.maxBreakAllowances === value && s.tabActive]} onPress={() => patch({ maxBreakAllowances: value })}><Text style={s.tabText}>{value} passes</Text></Pressable>)}</View>
            <TextInput accessibilityLabel="Accountability PIN" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" placeholder={summary.hasPin ? 'Replace PIN · leave empty to clear' : 'Optional accountability PIN'} placeholderTextColor={colors.subtle} style={s.input} />
            <Action label={pin ? 'Save PIN' : summary.hasPin ? 'Clear PIN' : 'Set PIN'} quiet onPress={() => { if (!pin && !summary.hasPin) { setError('Enter a PIN first.'); return; } void change(previous => { const result = setAccountabilityPin(previous, pin); if (!result.ok) invalidBlockingInput(result.error); return result.config; }); setPin(''); }} />
            <Text style={s.caption}>The blocker always keeps an emergency confirmation path. Your phone’s essential functions remain accessible.</Text>
          </Card>
          <Card title="Always allowed">{config.allowlist.map(item => <Toggle key={item.id} title={item.label} detail={item.emergency ? 'Essential · always available' : undefined} value={item.enabled} disabled={item.emergency} onChange={() => void change(previous => toggleAllowlistApp(previous, item.id))} />)}</Card>
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
  </SafeAreaView>;
}
function Card({ title, detail, children }: PropsWithChildren<{ title: string; detail?: string }>) {
  return <View style={s.card}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}{children}</View>;
}
function Toggle({ title, detail, value, disabled, onChange }: { title: string; detail?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <View style={s.toggle}><View style={s.flex}><Text style={s.rowTitle}>{title}</Text>{detail ? <Text style={s.body}>{detail}</Text> : null}</View><Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.text} /></View>;
}
function Action({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[s.button, quiet && s.quietButton]}><Text style={[s.buttonText, quiet && s.quietText]}>{label}</Text></Pressable>;
}
function Permission({ title, detail, granted, onPress }: { title: string; detail: string; granted?: boolean; onPress: () => void }) {
  return <View style={s.permission}><View style={s.flex}><Text style={s.rowTitle}>{title}</Text><Text style={s.body}>{detail}</Text></View><Action label={granted ? 'Review ✓' : 'Allow'} quiet={granted} onPress={onPress} /></View>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, content: { padding: space.lg, paddingBottom: 48, gap: 18, width: '100%', maxWidth: layout.contentMax, alignSelf: 'center' },
  hero: { borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.panelRaised, borderRadius: 24, padding: 20, gap: 8 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }, card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 18, gap: 12, marginBottom: 16 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: '700' }, rowTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, caption: { color: colors.subtle, fontSize: 12, lineHeight: 19 }, flex: { flex: 1, minWidth: 0 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 7 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { flexGrow: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 4, borderRadius: 14, backgroundColor: colors.panel },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 }, tabText: { color: colors.text, fontSize: 13, fontWeight: '600' }, selectedText: { color: colors.accent },
  input: { minHeight: 50, backgroundColor: colors.panelRaised, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: 12, padding: 14, color: colors.text, fontSize: 15 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 38, height: 38, borderRadius: 10 }, iconFallback: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  check: { color: colors.accent, fontSize: 24, minWidth: 30, textAlign: 'center' }, permission: { gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.bg, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  quietButton: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.lineStrong }, quietText: { color: colors.text }, textAction: { minHeight: 44, justifyContent: 'center' },
  rule: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, form: { gap: 14, paddingVertical: 12 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { minHeight: 46, minWidth: 46, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.panelRaised, justifyContent: 'center', alignItems: 'center' }, timeRow: { flexDirection: 'row', gap: 12 },
  choice: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 70, paddingVertical: 12 }, error: { color: colors.accent, fontSize: 14, lineHeight: 21, paddingVertical: 10 }, busy: { opacity: 0.65 },
});
