import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as engine from '../src/features/focus/focus-shield';
import { createFocusSession, timerRemainingMs } from '../src/features/focus/focus-engine';

async function main() {
  const data = new Map<string, string>();
  const storage = engine.createFocusShieldStorage({ getItem: async k => data.get(k) ?? null, setItem: async (k,v) => { data.set(k,v); }, removeItem: async k => { data.delete(k); } });
  const plain = engine.defaultFocusShieldConfig();
  const legacy = { ...plain } as Record<string, unknown>; delete legacy.focusBlockingEnabled; delete legacy.requireDeviceUnlock;
  assert.equal(engine.validateFocusShieldConfig(legacy).focusBlockingEnabled, true);
  assert.equal(engine.validateFocusShieldConfig(legacy).requireDeviceUnlock, false);
  const scheduled = engine.addCustomScheduleWindow({ ...plain, schedules: [], focusBlockingEnabled: false }, { label: 'Independent', days: [0,1,2,3,4,5,6], startMinuteOfDay: 0, endMinuteOfDay: 1439, profileId: 'custom' }).config;
  assert.equal(scheduled.sessionOnly, false);
  assert.ok(engine.getActiveScheduleWindow(scheduled, new Date(2026,9,21,12).getTime()));
  assert.equal(engine.evaluateFocusAwayReturn({ config: { ...scheduled, mode: 'hard' }, sessionRunning: true, phase: 'focus', backgroundedAt: 1000, returnedAt: 60000 }), null);

  let owner = 'A', authCalls = 0, enrolled = 2, defer = false;
  let session: ReturnType<typeof createFocusSession> | null = null;
  let authReply = { success: true }, resolveAuth: ((v: {success:boolean})=>void) | null = null;
  const slots: any[] = [], effects: (()=>void)[] = [], focusCleanups: (()=>void)[] = []; let cursor = 0;
  const react = {
    useRef(v: unknown) { const i=cursor++; return slots[i]??={current:v}; },
    useState(v:any) { const i=cursor++; if(!(i in slots))slots[i]=typeof v==='function'?v():v; return[slots[i],(x:any)=>{slots[i]=typeof x==='function'?x(slots[i]):x;}]; },
    useCallback(fn:unknown) { cursor++; return fn; },
    useEffect(fn:()=>any,deps:unknown[]) { const i=cursor++,prev=slots[i]; if(!prev||deps.some((d,n)=>d!==prev.deps[n]))effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
  };
  const listeners=new Set<(s:string)=>void>(), mod={exports:{} as any};
  const source=ts.transpileModule(fs.readFileSync('src/features/focus/useBlockingSettings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require(name:string){
    if(name==='react')return react;
    if(name==='expo-router')return{useFocusEffect(fn:()=>any){react.useEffect(()=>{const c=fn();focusCleanups.push(c);return c;},[]);}};
    if(name==='expo-local-authentication')return{SecurityLevel:{NONE:0},getEnrolledLevelAsync:async()=>enrolled,cancelAuthenticate:async()=>{},authenticateAsync:async()=>{authCalls++;return defer?new Promise(r=>{resolveAuth=r;}):authReply;}};
    if(name==='react-native')return{Platform:{OS:'android'},AppState:{addEventListener:(_:string,l:(s:string)=>void)=>{listeners.add(l);return{remove:()=>listeners.delete(l)};}}};
    if(name.endsWith('/WorkspaceProvider'))return{useWorkspace:()=>({ownerKey:owner})};
    if(name==='./FocusProvider')return{useFocus:()=>({session})};
    if(name==='./focus-engine')return{timerRemainingMs};
    if(name==='./focus-shield')return{...engine,focusShieldStorage:storage};
    throw Error(name);
  }});
  let state:any;
  function render(){cursor=0;state=mod.exports.useBlockingSettings();while(effects.length)effects.shift()!();}
  async function flush(){for(let i=0;i<8;i++)await Promise.resolve();render();}
  const patch=(p:engine.FocusShieldConfig)=>({...p,websiteBlockingEnabled:false});
  await storage.save('A',{...plain,requireDeviceUnlock:true});render();await flush();
  authReply={success:false};await state.change(patch);await flush();assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Cancelled auth cannot save');
  authReply={success:true};enrolled=0;await state.change(patch);await flush();assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Missing screen lock cannot save');
  enrolled=2;defer=true;let pending=state.change(patch);await flush();owner='B';render();await flush();resolveAuth!({success:true});await pending;await flush();
  assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Old-owner prompt cannot save');assert.equal((await storage.load('B')).websiteBlockingEnabled,true);
  owner='A';render();await flush();pending=state.change(patch);await flush();await storage.save('A',{...plain,requireDeviceUnlock:true,unlockDelaySeconds:30});await flush();resolveAuth!({success:true});await pending;await flush();
  assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Stale settings cannot overwrite a newer config');
  defer=false;for(const l of listeners)l('background');await state.change(patch);await flush();assert.equal((await storage.load('A')).websiteBlockingEnabled,false);
  const before=authCalls;for(const l of listeners)l('background');await state.change((p:engine.FocusShieldConfig)=>({...p,websiteBlockingEnabled:true}));await flush();assert.equal(authCalls,before+1,'Backgrounding relocks settings');
  await storage.save('A',{...plain,mode:'strict',requireDeviceUnlock:true});await flush();for(const l of listeners)l('background');defer=true;pending=state.change(patch);await flush();
  session=createFocusSession({topicName:'Biology',subject:'Science',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Read',now:Date.now()});render();resolveAuth!({success:true});await pending;await flush();assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Strict starting during auth prevents saving');
  session=null;render();for(const l of listeners)l('background');pending=state.change(patch);await flush();focusCleanups.at(-1)!();resolveAuth!({success:true});await pending;
  assert.equal((await storage.load('A')).websiteBlockingEnabled,true,'Leaving page invalidates pending auth');
  for(const [input,expected] of [['00:00',0],['9:30',570],['23:59',1439],['24:00',null],['12:60',null],['12',null],['-1:00',null]] as const)assert.equal(mod.exports.parseBlockingTime(input),expected);
  console.log('PASS: independent schedules, Focus opt-out, custom times, biometric cancellation/enrollment/account/config/background/unmount guards and strict-session races');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
