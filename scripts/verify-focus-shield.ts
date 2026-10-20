import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { defaultFocusShieldConfig, createFocusShieldStorage, sha256Hex, applyFocusShieldProfile } from '../src/features/focus/focus-shield';
import * as shieldEngine from '../src/features/focus/focus-shield';
import { createFocusSession, timerRemainingMs } from '../src/features/focus/focus-engine';

async function verify() {
  for (const input of ['', 'abc', 's_test:4826', 'MYELIN 🔒', 'x'.repeat(1000)]) {
    assert.equal(sha256Hex(input), crypto.createHash('sha256').update(input).digest('hex'));
  }
  const values = new Map<string, string>();
  const storage = createFocusShieldStorage({getItem: async k=>values.get(k)??null,
    setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}});
  let count=0,other=0;const unsubscribe=storage.subscribe('A',()=>count++);
  storage.subscribe('B',()=>other++);
  await Promise.all([storage.save('A',applyFocusShieldProfile(defaultFocusShieldConfig(),'exam')),storage.save('A',defaultFocusShieldConfig())]);
  assert.equal(count,2);assert.equal(other,0);assert.equal((await storage.load('A')).mode,'off');
  unsubscribe();await storage.save('A',defaultFocusShieldConfig());assert.equal(count,2);
  const broken=createFocusShieldStorage({getItem:async()=>null,setItem:async()=>{throw Error('disk');},removeItem:async()=>{}});
  let emitted=false;broken.subscribe('A',()=>{emitted=true;});
  await assert.rejects(broken.save('A',defaultFocusShieldConfig()));assert.equal(emitted,false);

  // Actual controller hooks; mock only platform and persistence boundaries.
  const slots:any[]=[],pending:Array<()=>void>=[];let cursor=0;
  const react={
    useMemo(fn:()=>unknown){cursor++;return fn();},
    useRef(value:unknown){const i=cursor++;return slots[i]??={current:value};},
    useState(value:unknown){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],(v:unknown)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useEffect(fn:()=>any,deps:unknown[]){const i=cursor++,old=slots[i];if(!old||deps.some((d,n)=>d!==old.deps[n]))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const listeners=new Set<(state:string)=>void>();
  const appState={currentState:'active',addEventListener:(_:string,fn:(s:string)=>void)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}};
  const syncs:any[]=[],mod={exports:{} as any};
  const code=ts.transpileModule(fs.readFileSync('src/features/focus/FocusShieldSessionController.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code,{setInterval:()=>0,clearInterval:()=>{},module:mod,exports:mod.exports,require:(name:string)=>{
    if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx:()=>null};
    if(name==='react-native')return{AppState:appState,Text:'Text'};
    if(name==='./focus-shield')return{defaultFocusShieldConfig,focusShieldStorage:storage};
    if(name==='./focus-engine')return{timerRemainingMs};
    if(name==='./focus-shield-native')return{syncFocusShieldNativeSession:async(input:unknown)=>{syncs.push(input);return true;}};
    throw Error(name);
  }});
  let ownerKey:string|null='A';
  let session:any=createFocusSession({topicName:'Biology',subject:'Science',plannedMinutes:5,breakMinutes:1,launchMode:'full',tinyStep:'Read',now:Date.now()});
  function render(){cursor=0;mod.exports.FocusShieldSessionController({ownerKey,session});while(pending.length)pending.shift()!();}
  async function flush(){await Promise.resolve();await Promise.resolve();render();await Promise.resolve();}
  render();await flush();
  await storage.save('A',applyFocusShieldProfile(defaultFocusShieldConfig(),'exam'));render();await flush();
  assert.equal(syncs.at(-1).config.mode,'strict');assert.equal(syncs.at(-1).sessionRunning,true);assert.match(syncs.at(-1).sessionId,/^A:/);
  session={...session,plannedFocusMinutes:25};render();await flush();assert.ok(syncs.at(-1).remainingMs>24*60_000);
  session={...session,runningSince:null};render();await flush();assert.equal(syncs.at(-1).sessionRunning,false);
  session={...session,runningSince:Date.now(),phase:'break'};render();await flush();assert.equal(syncs.at(-1).phase,'break');
  ownerKey='B';render();await flush();assert.equal(syncs.at(-1).config.mode,'off');
  ownerKey=null;session=null;render();await flush();assert.equal(syncs.at(-1).sessionRunning,false);
  for(const slot of slots)slot?.cleanup?.();assert.equal(syncs.at(-1).phase,'idle');

  // A native event batch must stop if the owner changes during an awaited park save.
  slots.length=0;pending.length=0;listeners.clear();cursor=0;
  let releasePark!:()=>void;
  const parked:string[]=[];
  const parkGate=new Promise<void>(resolve=>{releasePark=resolve;});
  let activeParkGate=parkGate;
  const studio={exports:{} as any};
  const studioCode=ts.transpileModule(fs.readFileSync('src/features/focus/FocusShieldStudio.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(studioCode,{module:studio,exports:studio.exports,require:(name:string)=>{
    if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx:()=>null};
    if(name==='react-native')return{AppState:appState,Platform:{OS:'android'},StyleSheet:{create:(x:unknown)=>x}};
    if(name==='./focus-shield')return{...shieldEngine,focusShieldStorage:storage};
    if(name==='./focus-shield-native')return{
      probeFocusShieldNativeStatus:async()=>({isInMultiWindowMode:false,isInPictureInPictureMode:false}),
      drainNativeInterceptEvents:async()=>['one','two'].map((thought,id)=>({id:String(id),timestamp:Date.now(),sessionId:'A:focus1',vector:'blocked-app',outcome:'parked',parkedThought:thought,awaySeconds:5})),
    };
    if(name.endsWith('/tokens'))return{colors:{},layout:{},radius:{},space:{},spacing:{}};
    return{};
  }});
  let eventOwner='A';
  function renderEvents(){cursor=0;const owner=eventOwner;studio.exports.useFocusShieldSession({
    ownerKey:owner,session:{id:owner==='A'?'focus1':'focus2',phase:'focus',runningSince:Date.now(),plannedFocusMinutes:25,topicName:'Biology'},
    remainingMs:60_000,onOpenParking:()=>{},onParkThought:async(thought:string)=>{parked.push(`${owner}:${thought}`);if(owner==='A')await activeParkGate;},
  });while(pending.length)pending.shift()!();}
  renderEvents();for(let i=0;i<8;i++)await Promise.resolve();
  assert.deepEqual(parked,['A:one']);
  eventOwner='B';renderEvents();releasePark();for(let i=0;i<8;i++)await Promise.resolve();
  assert.deepEqual(parked,['A:one'],'A later queued thought must never be parked into the new owner.');
  let releaseUnmount!:()=>void;
  activeParkGate=new Promise<void>(resolve=>{releaseUnmount=resolve;});
  parked.length=0;eventOwner='A';renderEvents();for(let i=0;i<8;i++)await Promise.resolve();
  assert.deepEqual(parked,['A:one']);
  for(const slot of slots)slot?.cleanup?.();
  releaseUnmount();for(let i=0;i<8;i++)await Promise.resolve();
  assert.deepEqual(parked,['A:one'],'Unmounted Focus hooks must stop delivering the remaining native event batch.');

  const nativeModules:any={},bridgeModule={exports:{} as any},payloads:any[]=[];
  const bridgeCode=ts.transpileModule(fs.readFileSync('src/features/focus/focus-shield-native.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(bridgeCode,{module:bridgeModule,exports:bridgeModule.exports,require:(name:string)=>{
    if(name==='react-native')return{Platform:{OS:'android'},NativeModules:nativeModules,Linking:{sendIntent:async()=>{throw Error('no settings');}}};
    if(name==='./focus-shield')return shieldEngine;
    throw Error(name);
  }});
  const bridge=bridgeModule.exports;
  assert.equal((await bridge.probeFocusShieldNativeStatus()).nativeModuleInstalled,false);
  const syncInput={config:applyFocusShieldProfile(defaultFocusShieldConfig(),'exam'),sessionId:'A:session',sessionRunning:true,phase:'focus',remainingMs:60_000,topicName:'Biology',tinyStep:'Read'};
  assert.equal(await bridge.syncFocusShieldNativeSession(syncInput),false);
  nativeModules.MyelinFocusShield={getPermissionStatus:async()=>({usageStatsGranted:false,overlayGranted:false}),syncSessionState:async(json:string)=>{payloads.push(JSON.parse(json));return true;}};
  const denied=await bridge.probeFocusShieldNativeStatus();assert.equal(denied.nativeModuleInstalled,true);assert.equal(denied.usageStatsGranted,false);assert.equal(denied.overlayGranted,false);
  await bridge.syncFocusShieldNativeSession(syncInput);assert.equal(payloads.at(-1).active,true);assert.ok(payloads.at(-1).blockedPackages.length>0);
  for(const change of [{sessionRunning:false},{phase:'break'},{remainingMs:0}]){
    await bridge.syncFocusShieldNativeSession({...syncInput,...change});assert.equal(payloads.at(-1).active,false);
  }
  nativeModules.MyelinFocusShield.syncSessionState=async()=>{throw Error('permission/start denied');};
  assert.equal(await bridge.syncFocusShieldNativeSession(syncInput),false);
  assert.equal(await bridge.openFocusShieldPermissionSettings('usage-access'),false);

  const require=createRequire(import.meta.url),plugin=require('../plugins/withFocusShieldAndroid.js');
  const buildTemplate = 'classpath(\'org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0\')\napply plugin: "expo-root-project"';
  const aligned = plugin.alignKotlinBuildTools(buildTemplate);
  assert.ok(aligned.includes('ext.kspVersion = "2.3.0"'));
  assert.equal(plugin.alignKotlinBuildTools(aligned), aligned);
  const manifest:any={$:{},application:[{}]};plugin.ensurePermissionsAndQueries(manifest);const first=JSON.stringify(manifest);
  plugin.ensurePermissionsAndQueries(manifest);assert.equal(JSON.stringify(manifest),first);
  assert.equal(manifest.application[0].service[0].$['android:exported'],'false');
  const sample='package com.djgaming1t.myelin\nclass MainApplication { fun x() = PackageList(this).packages.apply { } }';
  const transformed=plugin.registerPackageInMainApplication(sample);assert.equal(plugin.registerPackageInMainApplication(transformed),transformed);
  assert.throws(()=>plugin.registerPackageInMainApplication('unsupported template'));
  console.log('✓ Focus Shield: standard SHA-256, durable owner-scoped subscriptions, timer extension/pause/break/account lifecycle, missing-module/permission/start failures, plugin idempotency and fail-fast registration');
}
void verify().catch(error=>{console.error(error);process.exitCode=1;});
