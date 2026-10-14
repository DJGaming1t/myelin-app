/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as schema from '../src/data/schema';
import { createStudyTask, scheduleTask, recordTaskMinutes, reopenTask } from '../src/features/planning/task-engine';
import * as completion from '../src/features/planning/task-completion';

// Exercise the actual provider, hooks and achievement handlers with controlled saves/render commits.
function scenario() {
  const now = new Date(2026, 9, 14, 12).getTime(), owner = 'local:device';
  const w = schema.createEmptyWorkspace(now),task = createStudyTask({title:'Biology notebook',planState:'scheduled',dueAt:now+86400000,estimatedMinutes:25,now});
  task.id='t1';task.scheduledStart=now+3600000;task.scheduledEnd=now+5100000;w.tasks=[task];
  const writes: {owner:string;workspace:schema.WorkspaceState}[]=[],announcements:string[]=[],timers:(()=>void)[]=[];
  let failSave=false,failuresLeft=0,saveGate:Promise<void>|null=null,active:any;
  const react={
    createContext:()=>({Provider:'Provider'}),
    useState(value:any){const i=active.cursor++;const slot=active.slots[i]??= {value:typeof value==='function'?value():value};return [slot.value,(next:any)=>{slot.value=typeof next==='function'?next(slot.value):next}];},
    useRef(value:any){const i=active.cursor++;const slot=active.slots[i]??={value:{current:value}};if(!active.refs.includes(slot.value))active.refs.push(slot.value);return slot.value;},
    useCallback(fn:any,deps:any[]){const i=active.cursor++,old=active.slots[i];if(old&&deps.length===old.deps.length&&deps.every((v,j)=>v===old.deps[j]))return old.value;active.slots[i]={value:fn,deps};return fn;},
    useMemo(fn:any,deps:any[]){return react.useCallback(fn,deps)();},
    useEffect(fn:any,deps:any[]){const i=active.cursor++,old=active.slots[i];if(!old||!deps||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();active.slots[i]={deps,cleanup:undefined};const host=active;host.effects.push(()=>{host.slots[i].cleanup=fn()});}},
  };
  function host(fn:()=>any,commit=true){const h:any={slots:[],refs:[],effects:[],cursor:0,output:null,render(){const parent=active;active=h;h.cursor=0;h.effects=[];h.output=fn();if(commit)h.effects.forEach((f:any)=>f());active=parent;return h.output;}};h.render();return h;}
  let provider:any,achievement:any;
  const context=()=>{provider.render();return provider.output.props.value;};
  const jsx=(_type:any,props:any)=>({type:_type,props});
  function load(path:string){const mod:any={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,Date:class extends Date{static now(){return now}},Promise,Error,setTimeout:(f:()=>void)=>{timers.push(f);return timers.length},clearTimeout:()=>{},require(name:string){
    if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name.endsWith('/AuthProvider'))return{useAuth:()=>({ready:true,user:null,localMode:true})};
    if(name==='./schema')return schema;if(name==='./owner')return{workspaceOwnerKey:()=>owner};if(name==='./validation')return{};
    if(name==='./storage')return{workspaceStorage:{save:async(key:string,snapshot:schema.WorkspaceState)=>{writes.push({owner:key,workspace:snapshot});if(saveGate)await saveGate;if(failSave||failuresLeft>0){failuresLeft=Math.max(0,failuresLeft-1);throw Error('Disk unavailable');}}}};
    if(name.endsWith('/WorkspaceProvider'))return{useWorkspace:context};
    if(name==='./task-completion')return completion;
    if(name.endsWith('/AchievementProvider'))return{useAchievement:()=>{achievement.render();return achievement.output.props.value;}};
    if(name==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:(x:any)=>x},AccessibilityInfo:{announceForAccessibility:(s:string)=>announcements.push(s)}};
    if(name==='react-native-reanimated')return{__esModule:true,default:{View:'AnimatedView'}};
    if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({bottom:0})};
    if(name.endsWith('/useReducedMotion'))return{useReducedMotion:()=>true};if(name.endsWith('/tokens'))return{colors:{},layout:{},radius:{}};
    throw Error('Unexpected dependency '+name);
  }}, {filename:path});return mod.exports;}
  const p=load('src/data/WorkspaceProvider.tsx');provider=host(()=>p.WorkspaceProvider({children:null}),false);
  provider.refs[0].current=w;provider.refs[1].current=owner;provider.slots[1].value=owner;provider.slots[0].value='ready';provider.render();
  const a=load('src/features/achievement/AchievementProvider.tsx');achievement=host(()=>a.AchievementProvider({children:null}));
  const h=load('src/features/planning/useTaskCompletion.ts');const hook=host(()=>h.useQuickTaskCompletion());
  function toast(){achievement.render();return achievement.output.props.children[1]?.props.children?.props;}
  return{now,w,owner,writes,announcements,timers,provider,achievement,hook,context,toast,task:()=>provider.refs[0].current.tasks[0],workspace:()=>provider.refs[0].current,
    failOnce:()=>{failuresLeft=1},fail:(value:boolean)=>{failSave=value},gate:(value:Promise<void>|null)=>{saveGate=value},switchOwner:(key:string)=>{provider.refs[1].current=key;provider.slots[1].value=key;achievement.render();hook.render();}};
}
async function verify(){
  const s=scenario(),before=structuredClone(s.task());assert.equal(s.hook.output('t1'),true);assert.equal(s.hook.output('t1'),false);await s.context().waitForSaves();
  assert.equal(s.workspace().revision,1);assert.equal(s.writes.length,1);assert.equal(s.announcements.length,1);assert.equal(s.workspace().history.length,0);
  const old=s.toast();old.undo();old.undo();await s.context().waitForSaves();assert.equal(s.workspace().revision,2);assert.equal(s.writes.length,2);assert.deepEqual(s.task(),{...before,updatedAt:s.task().updatedAt});
  // Reused milliseconds do not let the superseded toast operate on a newer completion.
  s.hook.render();assert.equal(s.hook.output('t1'),true);const latest=structuredClone(s.workspace());old.undo();old.dismiss();assert.deepEqual(s.workspace(),latest);assert.ok(s.toast().notice.undo);
  console.log('✓ Actual quick hook completes once, restores scheduling, preserves evidence and rejects consumed/superseded toast callbacks');
  for(const mode of ['schedule','minutes','delete','reopen','notes']){
    const x=scenario();x.hook.output('t1');await x.context().waitForSaves();const toast=x.toast();
    x.context().updateWorkspace((draft:schema.WorkspaceState)=>{if(mode==='schedule')scheduleTask(draft.tasks[0],x.now+7200000,x.now+8700000,x.now+1);if(mode==='minutes')recordTaskMinutes(draft.tasks[0],10,x.now+1);if(mode==='delete')draft.tasks=[];if(mode==='reopen')reopenTask(draft.tasks[0],x.now+1);if(mode==='notes'){draft.tasks[0].notes='New notes';draft.tasks[0].dueAt+=86400000;}});await x.context().waitForSaves();
    const current=structuredClone(x.workspace()),count=x.writes.length;toast.undo();await x.context().waitForSaves();
    if(mode==='notes'){assert.equal(x.task().status,'open');assert.equal(x.task().notes,'New notes');assert.equal(x.task().dueAt,current.tasks[0].dueAt);}else{assert.deepEqual(x.workspace(),current);assert.equal(x.writes.length,count);assert.equal(x.toast().notice.title,'Your latest changes were kept');}
  }
  console.log('✓ New scheduling, completion state, recorded minutes and deletion remain intact; harmless notes/deadline edits survive valid Undo');
  const timerRace=scenario();timerRace.achievement.output.props.value({title:'Focus complete!',detail:'Recorded work'});timerRace.toast();const oldTimer=timerRace.timers.at(-1)!;timerRace.hook.output('t1');oldTimer();assert.ok(timerRace.toast().notice.undo,'Old toast timer cannot dismiss a newer completion');
  console.log('✓ Superseded informational-toast timers cannot erase the current completion Undo');
  const race=scenario();race.hook.output('t1');await race.context().waitForSaves();const toast=race.toast(),callback=race.hook.output,celebrate=race.achievement.output.props.value;
  race.switchOwner('user:other');const snapshot=structuredClone(race.workspace()),count=race.writes.length;
  toast.undo();toast.retry();celebrate({title:'Old owner',detail:'Hidden'});assert.equal(callback('t1'),false);await race.context().waitForSaves();assert.deepEqual(race.workspace(),snapshot);assert.equal(race.writes.length,count);assert.equal(race.toast(),undefined);
  console.log('✓ Old-owner completion/Undo/retry/celebration callbacks cannot write or surface another owner’s data');
  const loading=scenario();loading.hook.output('t1');await loading.context().waitForSaves();const hidden=loading.toast(),lateCelebrate=loading.achievement.output.props.value;loading.provider.slots[0].value='loading';assert.equal(loading.toast(),undefined);const loadingSnapshot=structuredClone(loading.workspace()),loadingWrites=loading.writes.length;hidden.undo();hidden.retry();lateCelebrate({title:'Late success',detail:'Hidden'});await loading.context().waitForSaves();assert.deepEqual(loading.workspace(),loadingSnapshot);assert.equal(loading.writes.length,loadingWrites);loading.provider.slots[0].value='error';loading.provider.slots[5].value='Could not load workspace';assert.equal(loading.toast(),undefined);
  console.log('✓ Loading/error workspaces hide recovery notices and reject retained toast callbacks');
  const failure=scenario();failure.fail(true);failure.hook.output('t1');await assert.rejects(failure.context().waitForSaves());assert.match(failure.context().saveError,/Disk/);
  failure.context().updateWorkspace((draft:schema.WorkspaceState)=>{draft.tasks[0].notes='Latest unsaved edit';});await assert.rejects(failure.context().waitForSaves());
  const saved=structuredClone(failure.workspace()),failedWrites=failure.writes.length;
  let release!:()=>void;failure.gate(new Promise<void>(r=>{release=r}));failure.fail(false);const notice=failure.toast();notice.retry();notice.retry();await Promise.resolve();await Promise.resolve();release();await failure.context().waitForSaves();await Promise.resolve();
  assert.equal(failure.writes.length,failedWrites+1);assert.deepEqual(failure.workspace(),saved);assert.equal(failure.context().saveError,'');assert.equal(failure.writes.at(-1)!.workspace.tasks[0].notes,'Latest unsaved edit');assert.equal(failure.task().status,'completed');
  const mixed=scenario();mixed.failOnce();mixed.context().updateWorkspace((draft:schema.WorkspaceState)=>{draft.tasks[0].notes='First';});mixed.context().updateWorkspace((draft:schema.WorkspaceState)=>{draft.tasks[0].notes='Latest';});await mixed.context().waitForSaves();assert.equal(mixed.context().saveError,'');assert.equal(mixed.writes.at(-1)!.workspace.tasks[0].notes,'Latest');
  console.log('✓ An older failed save cannot leave a stale error after the newer queued snapshot succeeds');
  // A queued retry must re-check ownership before selecting a snapshot.
  const queued=scenario();let unblock!:()=>void;queued.gate(new Promise<void>(r=>{unblock=r}));queued.hook.output('t1');await Promise.resolve();const pending=queued.context().retrySaves(queued.owner);queued.switchOwner('user:new');unblock();assert.equal(await pending,false);assert.ok(queued.writes.every(write=>write.owner===queued.owner));
  console.log('✓ Failed saves retry the latest live snapshot once without recompleting or changing revisions; queued retries reject changed owners');
}
void verify().catch(error=>{console.error(error);process.exitCode=1});
