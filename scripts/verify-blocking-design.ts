/** Interaction checks of the actual screen with mocked platform boundaries.
 * This does not measure layout or prove Android interception/biometrics work. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as engine from '../src/features/focus/focus-shield';
import { colors, layout, radius, space } from '../src/theme/tokens';

type Element = { type: any; props: any };
async function main() {
  let config = { ...engine.defaultFocusShieldConfig(), mode: 'gentle' as const, schedules: [] } as engine.FocusShieldConfig;
  let error = '', noticeSaved = true, cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  const apps = Array.from({ length: 65 }, (_, index) => ({ packageName: `org.test.app${index}`, label: `Test app ${index}` }));
  const status = { nativeModuleInstalled: true, usageStatsGranted: false, overlayGranted: false, vpnPrepared: false, otherVpnActive: false };
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value: any) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn: () => any) { return fn(); },
    useCallback(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((v,j) => v !== slots[i].deps[j])) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn: () => void, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((v,j) => v !== slots[i][j])) { slots[i] = deps; effects.push(fn); } },
  };
  const jsx = (type: any, props: any) => ({ type, props: props || {} });
  const native: any = { StyleSheet: { create: (x: any) => x, hairlineWidth: 1 }, Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
  for (const key of ['ActivityIndicator','Image','KeyboardAvoidingView','Pressable','ScrollView','Switch','Text','TextInput','View']) native[key] = key;
  const exports: any = {};
  const imports: Record<string, any> = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native,
    'expo-router': { router: { canGoBack: () => false, replace() {}, back() {} }, useFocusEffect: (fn: any) => hooks.useEffect(fn, [fn]) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/src/components/app/AppIcon': { AppIcon: 'AppIcon' }, '@/src/components/app/AmbientBackdrop': { AmbientBackdrop: 'AmbientBackdrop' }, '@/src/components/app/ScreenHeader': { ScreenHeader: 'ScreenHeader' },
    '@/src/data/WorkspaceProvider': { useWorkspace: () => ({ ownerKey: 'local:device' }) }, '@/src/theme/tokens': { colors, layout, radius, space },
    './focus-shield': { ...engine, focusShieldStorage: { subscribeAttempts: () => () => {}, loadAttempts: async () => [] } },
    './focus-shield-native': { probeFocusShieldNativeStatus: async () => status, fetchInstalledAndroidApps: async () => apps, openFocusShieldPermissionSettings: async () => true, requestWebsiteVpnAuthorization: async () => ({ vpnPrepared: false }) },
    './useBlockingSettings': {
      invalidBlockingInput(message: string) { throw Error(message); },
      parseBlockingTime(value: string) { const m = /^(\d{1,2}):(\d{2})$/.exec(value); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; },
      useBlockingSettings: () => ({ config, ready: true, busy: false, error, setError: (value: string) => { error = value; }, change: async (fn: any) => { if (!noticeSaved) return false; try { config = fn(config); return true; } catch (caught: any) { error = caught.message; return false; } } }),
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync('src/features/focus/BlockingScreen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(imports[name], `Unknown import ${name}`); return imports[name]; }, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} });
  let nodes: Element[] = [];
  function expand(value: any): void { if (Array.isArray(value)) { value.forEach(expand); return; } if (!value || typeof value !== 'object') return; if (typeof value.type === 'function') { expand(value.type(value.props)); return; } nodes.push(value); expand(value.props.children); }
  async function render() { for (let i = 0; i < 5; i++) { cursor = 0; nodes = []; expand(exports.default()); effects.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); } }
  function text(value: any): string { if (typeof value === 'string' || typeof value === 'number') return String(value); if (Array.isArray(value)) return value.map(text).join(''); return value?.props ? text(value.props.children) : ''; }
  function by(role: string, name: string): Element { const found = nodes.find(n => (n.props.accessibilityRole === role || role === 'switch' && n.type === 'Switch' || role === 'textbox' && n.type === 'TextInput') && (n.props.accessibilityLabel || text(n)) === name); assert.ok(found, `${role}: ${name}`); return found; }
  async function press(role: string, name: string) { const el = by(role, name); (el.props.onPress || el.props.onValueChange)(!el.props.value); await render(); }
  async function fill(name: string, value: string) { by('textbox', name).props.onChangeText(value); await render(); }
  await render();
  assert.ok(nodes.some(n => text(n) === 'One more step.'));
  assert.ok(by('button', 'Allow usage access'));
  assert.equal(nodes.filter(n => n.props.accessibilityRole === 'checkbox').length, 50);
  await press('button', 'Show more apps (15 remaining)');
  assert.equal(nodes.filter(n => n.props.accessibilityRole === 'checkbox').length, 65);
  await fill('Search apps', 'Test app 61');
  await press('checkbox', 'Test app 61');
  assert.ok(config.targets.some(t => t.identifier === 'org.test.app61' && t.enabled));
  await press('button', 'Clear app search');
  await press('button', `Selected · ${config.targets.filter(t => t.kind === 'app' && t.enabled).length}`);
  assert.ok(by('checkbox', 'Test app 61'));
  await fill('Search apps', 'not installed');
  assert.ok(nodes.some(n => text(n) === 'Nothing by that name'));
  await press('tab', 'When');
  await press('switch', 'Block during Focus'); assert.equal(config.focusBlockingEnabled, false);
  await press('button', '+ Add schedule');
  await fill('Schedule name', 'Evening revision'); await fill('Schedule start time', '25:00');
  await press('button', 'Save schedule'); assert.equal(config.schedules.length, 0);
  assert.ok(nodes.some(n => n.props.accessibilityRole === 'alert' && text(n).includes('Choose at least one day')));
  await fill('Schedule start time', '22:30'); await fill('Schedule end time', '06:30');
  await press('button', 'Weekend'); await press('button', 'Save schedule');
  assert.equal(config.schedules.length, 1); assert.deepEqual([...config.schedules[0].days], [0, 6]); assert.equal(config.sessionOnly, false);
  assert.ok(nodes.some(n => text(n) === 'Ends the next day'));
  await press('button', 'Delete Evening revision'); assert.equal(config.schedules.length, 1);
  await press('button', 'Keep it'); assert.equal(config.schedules.length, 1);
  await press('button', 'Delete Evening revision'); await press('button', 'Delete Evening revision'); assert.equal(config.schedules.length, 0);
  await press('tab', 'Websites');
  assert.equal(by('button', 'Add website').props.disabled, true);
  await fill('Website domain', 'example.com'); await press('button', 'Add website');
  assert.ok(config.targets.some(t => t.identifier === 'example.com'));
  await press('button', 'Remove example.com'); await press('button', 'Keep it');
  assert.ok(config.targets.some(t => t.identifier === 'example.com'));
  await press('tab', 'Settings');
  assert.ok(!nodes.some(n => n.props.accessibilityLabel === 'Accountability PIN'));
  await press('button', 'Breaks & emergency access'); await fill('Accountability PIN', '1234');
  noticeSaved = false; await press('button', 'Save PIN'); assert.equal(by('textbox', 'Accountability PIN').props.value, '1234');
  noticeSaved = true; await press('button', 'Save PIN'); assert.equal(by('textbox', 'Accountability PIN').props.value, '');
  assert.ok(engine.activeShieldSummary(config).hasPin);
  console.log('PASS: actual blocking screen permissions, app pagination/search/selection, empty states, independent schedules, invalid-time feedback, day presets, overnight labels, cancel/confirm deletion, website input and failed/successful PIN saves');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
