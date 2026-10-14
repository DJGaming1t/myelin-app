/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as schema from '../src/data/schema';
import * as engine from '../src/features/planning/task-engine';
import * as edit from '../src/features/planning/task-edit';

function scenario(dueAt?: number, newTask = false) {
  const now = new Date(2026, 9, 14, 12).getTime(), owner = 'local:device';
  const workspace = schema.createEmptyWorkspace(now), task = engine.createStudyTask({ title:'Notebook', planState:'postponed', estimatedMinutes:0, dueAt:dueAt ?? now+6*3600000+12345, now });
  task.id='t1';task.postponedUntil=now+86400000;workspace.tasks=newTask?[]:[task];
  let active:any, backs=0, deletion:any;const writes:schema.WorkspaceState[]=[];
  const react:any={createContext:()=>({Provider:'Provider'}),
    useState(value:any){const i=active.cursor++,slot=active.slots[i]??={value:typeof value==='function'?value():value};return[slot.value,(v:any)=>{slot.value=typeof v==='function'?v(slot.value):v}];},
    useRef(value:any){const i=active.cursor++,slot=active.slots[i]??={value:{current:value}};if(!active.refs.includes(slot.value))active.refs.push(slot.value);return slot.value;},
    useCallback(fn:any,deps:any[]){const i=active.cursor++,slot=active.slots[i];if(slot&&deps.every((v,j)=>v===slot.deps[j]))return slot.value;active.slots[i]={value:fn,deps};return fn;},
    useMemo(fn:any,deps:any[]){return react.useCallback(fn,deps)();},useEffect(){active.cursor++;}};
  const jsx=(type:any,props:any,key:any)=>({type,props,key});
  function host(fn:()=>any){const h:any={cursor:0,slots:[],refs:[],output:null,render(){const parent=active;active=h;h.cursor=0;h.output=fn();active=parent;return h.output;}};h.render();return h;}
  let provider:any;
  const context=()=>{provider.render();return provider.output.props.value;};
  function load(file:string){const m:any={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,Date,Promise,Error,require(name:string){
    if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name.endsWith('/AuthProvider'))return{useAuth:()=>({ready:true,user:null,localMode:true})};
    if(name==='./schema')return schema;if(name==='./owner')return{workspaceOwnerKey:()=>owner};if(name==='./validation')return{};if(name==='./storage')return{workspaceStorage:{save:async(_key:string,w:schema.WorkspaceState)=>{writes.push(w)}}};
    if(name.endsWith('/WorkspaceProvider'))return{useWorkspace:context};if(name.endsWith('/task-engine'))return engine;if(name==='./task-edit')return edit;
    if(name.endsWith('/TaskQuickActions'))return{TaskQuickActions:'QuickActions',TaskDueLabel:'DueLabel',useTaskCompletion:()=>{const expected=context().ownerKey;return(id:string)=>!!context().updateWorkspace((w:schema.WorkspaceState)=>engine.completeTask(w.tasks.find(t=>t.id===id)!),{ownerKey:expected,canApply:(w:schema.WorkspaceState)=>w.tasks.some(t=>t.id===id&&t.status==='open')});}};
    if(name==='expo-router')return{router:{back:()=>{backs++}}};if(name.endsWith('/ScreenHeader'))return{ScreenHeader:'Header'};
    if(name==='react-native')return{View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:(s:any)=>s},Alert:{alert:(_t:any,_d:any,buttons:any)=>{deletion=buttons[1].onPress}}};
    if(name.endsWith('/tokens'))return{colors:{},layout:{},radius:{},spacing:{}};throw Error(name);
  }});return m.exports;}
  const p=load('src/data/WorkspaceProvider.tsx');provider=host(()=>p.WorkspaceProvider({children:null}));provider.slots[0].value='ready';provider.slots[1].value=owner;provider.slots[2].value=workspace;provider.refs[0].current=workspace;provider.refs[1].current=owner;
  const form=load('src/features/planning/TaskForm.tsx'),props={taskId:newTask?undefined:'t1'};const wrapper=host(()=>form.TaskForm(props));const child=wrapper.output;const editor=host(()=>child.type(child.props));
  function nodes(node:any):any[]{if(!node)return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return[node,...nodes(node.props?.children)];}
  const input=(name:string)=>nodes(editor.output).find(n=>n.type==='TextInput'&&(n.props.accessibilityLabel===name||n.props.placeholder===name));
  const action=(name:string)=>nodes(editor.output).find(n=>n.props?.label===name||n.type==='Pressable'&&nodes(n.props.children).some(c=>c.type==='Text'&&c.props.children===name))?.props.onPress;
  return {now,task,workspace:()=>provider.refs[0].current,writes,context,editor,wrapper,input,action,backs:()=>backs,delete:()=>deletion(),switchOwner:()=>{provider.refs[1].current='user:new';provider.slots[1].value='user:new';},mutate:(fn:(w:schema.WorkspaceState)=>void)=>context().updateWorkspace(fn)};
}
async function verify(){
  // Today/tomorrow/custom preserve exact sub-minute timestamps through unrelated saves.
  for(const offset of [0,86400000,5*86400000]){
    const s=scenario(new Date(2026,9,14,18,0,12,345).getTime()+offset);const deadline=s.task.dueAt;s.input('Question numbers, pages, what counts as done…').props.onChangeText('New notes');s.editor.render();const save=s.action('Save task');save();save();await s.context().waitForSaves();assert.equal(s.workspace().tasks[0].dueAt,deadline);assert.equal(s.workspace().tasks[0].estimatedMinutes,0);assert.equal(s.workspace().tasks[0].planState,'postponed');assert.equal(s.workspace().revision,1);assert.equal(s.backs(),1);
  }
  const live=scenario();live.input('Question numbers, pages, what counts as done…').props.onChangeText('Typed notes');live.editor.render();const staleSave=live.action('Save task');live.mutate(w=>{engine.recordTaskMinutes(w.tasks[0],5);w.tasks[0].dueAt+=86400000;w.tasks[0].title='New title';engine.scheduleTask(w.tasks[0],live.now+3600000,live.now+5400000);});staleSave();await live.context().waitForSaves();const t=live.workspace().tasks[0];assert.equal(t.actualMinutes,5);assert.equal(t.dueAt,live.task.dueAt+86400000);assert.equal(t.title,'New title');assert.equal(t.notes,'Typed notes');assert.equal(t.planState,'scheduled');assert.equal(t.scheduledStart,live.now+3600000);live.editor.render();assert.equal(live.input('Time already done in minutes').props.value,'5');
  for(const path of ['custom','chip']){const s=scenario();const before=structuredClone(s.workspace());if(path==='custom')s.input('Minutes').props.onChangeText('37');else s.action('15m')();s.editor.render();assert.deepEqual(s.workspace(),before,'Changing the estimate never persists without Save task');assert.equal(s.writes.length,0);s.action('Save task')();await s.context().waitForSaves();assert.equal(s.workspace().tasks[0].estimatedMinutes,path==='custom'?37:15);assert.equal(s.workspace().tasks[0].actualMinutes,before.tasks[0].actualMinutes);assert.equal(s.workspace().tasks[0].dueAt,before.tasks[0].dueAt);assert.equal(s.writes.length,1);}
  console.log('✓ Actual form preserves exact deadlines, zero estimates, newer work/fields/schedules and saves/navigates once');
  for(const change of ['minutes','session']){
    const s=scenario();s.input('Time already done in minutes').props.onChangeText('2');s.input('Question numbers, pages, what counts as done…').props.onChangeText('Keep draft');s.editor.render();s.mutate(w=>{if(change==='minutes')engine.recordTaskMinutes(w.tasks[0],5);else w.tasks[0].lastFocusSessionId='new-session';});await s.context().waitForSaves();const before=structuredClone(s.workspace()),count=s.writes.length;s.action('Save task')();assert.deepEqual(s.workspace(),before);assert.equal(s.backs(),0);await s.context().waitForSaves();assert.equal(s.writes.length,count);s.editor.render();assert.ok(s.action('Use latest recorded time'));s.action('Use latest recorded time')();s.editor.render();s.action('Save task')();await s.context().waitForSaves();assert.equal(s.workspace().tasks[0].actualMinutes,before.tasks[0].actualMinutes);assert.equal(s.workspace().tasks[0].lastFocusSessionId,before.tasks[0].lastFocusSessionId);assert.equal(s.workspace().tasks[0].notes,'Keep draft');
  }
  const deadline=scenario();deadline.action('Tomorrow')();deadline.editor.render();deadline.mutate(w=>{w.tasks[0].dueAt+=2*86400000;});const latest=structuredClone(deadline.workspace());deadline.action('Save task')();assert.deepEqual(deadline.workspace(),latest);deadline.editor.render();deadline.action('Use latest deadline')();deadline.editor.render();deadline.action('Save task')();assert.equal(deadline.workspace().tasks[0].dueAt,latest.tasks[0].dueAt);
  const manual=scenario();manual.input('Time already done in minutes').props.onChangeText('3');manual.editor.render();manual.action('Save task')();assert.equal(manual.workspace().tasks[0].actualMinutes,3);
  console.log('✓ Manual corrections guard newer minutes/session/deadline, retain drafts, recover explicitly and remain available');
  for(const mode of ['delete','owner']){const s=scenario();const save=s.action('Save task');if(mode==='delete')s.mutate(w=>{w.tasks=[];});else s.switchOwner();const current=structuredClone(s.workspace());save();assert.deepEqual(s.workspace(),current);assert.equal(s.backs(),0);if(mode==='delete'){s.wrapper.render();assert.equal(s.wrapper.output.type,'View');}}
  const add=scenario(undefined,true);add.input('Finish Maths Exercise 5.2').props.onChangeText('New task');add.editor.render();const create=add.action('Add to Inbox');create();create();assert.equal(add.workspace().tasks.length,1);assert.equal(add.workspace().revision,1);assert.equal(add.backs(),1);
  for(const status of ['open','completed'] as const){const s=scenario();s.task.status=status;s.editor.render();const act=s.action(status==='open'?'Mark complete':'Reopen task');act();act();assert.equal(s.workspace().revision,1);assert.equal(s.backs(),1);}
  for(const status of ['open','completed'] as const){const s=scenario();s.task.status=status;s.editor.render();const stale=s.action(status==='open'?'Mark complete':'Reopen task');s.mutate(w=>{if(status==='open')engine.completeTask(w.tasks[0]);else engine.reopenTask(w.tasks[0]);});const latest=structuredClone(s.workspace());stale();assert.deepEqual(s.workspace(),latest);assert.equal(s.backs(),0);}
  const oldDelete=scenario();oldDelete.action('Delete task')();oldDelete.switchOwner();oldDelete.delete();assert.equal(oldDelete.workspace().tasks.length,1);assert.equal(oldDelete.backs(),0);
  const deletion=scenario();deletion.action('Delete task')();const confirm=deletion.delete;confirm();confirm();assert.equal(deletion.workspace().revision,1);assert.equal(deletion.backs(),1);
  const invalid=scenario();invalid.input('Time already done in minutes').props.onChangeText('Infinity');invalid.editor.render();invalid.action('Save task')();assert.equal(invalid.workspace().revision,0);
  console.log('✓ Missing/old-owner forms cannot mutate or recreate tasks; add/complete/reopen/delete are single-flight; invalid time rejected');
}
void verify().catch(e=>{console.error(e);process.exitCode=1});
