/// <reference types="node" />
import assert from 'node:assert/strict';
import { scenario } from './verify-task-planning';
import { completeTask } from '../src/features/planning/task-engine';
import { createTopic } from '../src/features/topics/topic-operations';
import { createFocusSession } from '../src/features/focus/focus-engine';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done});return {promise,resolve};}
const input={taskId:'t1',plannedMinutes:25,breakMinutes:5,launchMode:'five-minute' as const,tinyStep:'Open one question'};
async function ready(){const s=scenario(),host=s.mount('src/features/focus/FocusProvider.tsx','FocusProvider',()=>({children:null}));await Promise.resolve();await Promise.resolve();host.render();assert.equal(host.output.props.value.ready,true);return {...s,host,focus:()=>{host.render();return host.output.props.value}};}
async function verify(){
  const s=await ready(),before=structuredClone(s.workspace()),start=s.focus().start;
  const [first,second]=await Promise.all([start(input),start(input)]);assert.ok(first);assert.equal(second,null);await s.context().waitForSaves();assert.equal(s.focusWrites.length,1);assert.equal(s.writes.length,1);assert.equal(s.workspace().revision,before.revision+1);assert.equal(s.workspace().focusOutcomes.length,1);assert.deepEqual(s.workspace().tasks,before.tasks);assert.equal(s.workspace().focusOutcomes[0].id,first.id);assert.equal(s.workspace().focusOutcomes[0].minutes,0);assert.equal(first.plannedFocusMinutes,5);assert.equal(first.fullTargetMinutes,25);
  const latest=await ready(),retained=latest.focus().start;latest.mutate(w=>{w.tasks[0].title='Latest title';w.tasks[0].subject='New subject';});const live=structuredClone(latest.workspace());const current=await retained(input);assert.equal(current!.topicName,'Latest title');assert.equal(current!.subject,'New subject');assert.deepEqual(latest.workspace().tasks,live.tasks);
  for(const mode of ['owner','loading','error','completed','deleted']){const x=await ready(),old=x.focus().start;if(mode==='owner')x.switchOwner();else if(mode==='loading'||mode==='error')x.setStatus(mode);else x.mutate(w=>{if(mode==='completed')completeTask(w.tasks[0],x.now());else w.tasks=[];});await x.context().waitForSaves();const live=structuredClone(x.workspace()),writes=x.writes.length;assert.equal(await old(input),null);assert.deepEqual(x.workspace(),live);assert.equal(x.writes.length,writes);assert.equal(x.focusWrites.length,0);}
  const cycle=await ready(),oldCycle=cycle.focus().start;cycle.switchOwner();cycle.host.render();await Promise.resolve();await Promise.resolve();cycle.host.render();cycle.switchOwner(cycle.owner);cycle.host.render();await Promise.resolve();await Promise.resolve();cycle.host.render();assert.equal(await oldCycle(input),null);assert.equal(cycle.focusWrites.length,0);
  const restore=scenario(),restoreGate=deferred();restore.gateRestore(restoreGate.promise);const pendingHost=restore.mount('src/features/focus/FocusProvider.tsx','FocusProvider',()=>({children:null}));assert.equal(await pendingHost.output.props.value.start(input),null);assert.equal(restore.focusWrites.length,0);restoreGate.resolve();await Promise.resolve();await Promise.resolve();pendingHost.render();assert.equal(pendingHost.output.props.value.ready,true);
  console.log('✓ Actual Focus start uses live owner/target data, waits for restoration, starts once and records one zero-minute outcome without changing tasks');
  for(const mode of ['owner','owner-new-session','loading','deleted','completed','discard','replaced','paused','owner-cycle','link']){
    const x=await ready(),gate=deferred();x.gateFocus(gate.promise);const pending=x.focus().start(input);await Promise.resolve();await Promise.resolve();await Promise.resolve();
    let other:any=null;
    if(mode==='owner-cycle'){const original=structuredClone(x.workspace());x.switchOwner();x.host.render();await Promise.resolve();await Promise.resolve();x.host.render();x.switchOwner(x.owner,original);x.host.render();await Promise.resolve();await Promise.resolve();x.host.render();}
    else if(mode==='owner'||mode==='owner-new-session'){const nextOwner=structuredClone(x.workspace());nextOwner.tasks[0].title='Other owner notebook';x.switchOwner('user:new',nextOwner);x.host.render();await Promise.resolve();await Promise.resolve();x.host.render();if(mode==='owner-new-session'){x.gateFocus(null);other=x.focus().start({...input,tinyStep:'New owner step'});}}
    else if(mode==='loading')x.setStatus('loading');
    else if(mode==='deleted'||mode==='completed')x.mutate(w=>{if(mode==='deleted')w.tasks=[];else completeTask(w.tasks[0],x.now());});
    else if(mode==='link'){x.mutate(w=>{w.topics.push(createTopic({name:'New topic',subject:'Biology',priority:2,status:'learning',estimate:25,notes:''},x.now(),'new-topic'));w.tasks[0].topicId='new-topic';});}
    else if(mode==='paused'){x.gateFocus(null);other=x.focus().pause();}
    else if(mode==='discard'){x.gateFocus(null);other=x.focus().discard();}
    else {x.host.refs[0].current=createFocusSession({...input,topicName:'Other session',subject:'Biology',now:x.now()});}
    await x.context().waitForSaves();const before=structuredClone(x.workspace()),writes=x.writes.length;gate.resolve();const accepted=await pending;if(mode==='paused')assert.ok(accepted);else assert.equal(accepted,null,mode);if(other)await other;await x.context().waitForSaves();
    if(mode==='paused'){assert.equal(x.workspace().focusOutcomes.length,1);assert.equal(x.writes.length,writes+1);assert.equal(x.focus().session.runningSince,null);}
    else if(mode==='owner-new-session'){assert.equal(x.workspace().focusOutcomes.length,1);assert.equal(x.workspace().focusOutcomes[0].id,x.focus().session.id);assert.equal(x.focus().session.tinyStep,'New owner step');assert.equal(x.focus().session.topicName,'Other owner notebook');assert.equal(x.writes.length,writes+1);}
    else {assert.deepEqual(x.workspace(),before,mode);assert.equal(x.writes.length,writes,mode);}
    if(mode==='deleted'||mode==='completed'||mode==='discard'||mode==='link')assert.equal(x.focus().session,null,'Invalid/discarded saved start does not remain active');
  }
  const failure=await ready(),beforeFail=structuredClone(failure.workspace());failure.failFocus();await assert.rejects(failure.focus().start(input),/Synthetic Focus save failure/);assert.equal(failure.focus().session,null);assert.deepEqual(failure.workspace(),beforeFail);assert.equal(failure.writes.length,0);const retry=await failure.focus().start(input);await failure.context().waitForSaves();assert.ok(retry);assert.equal(failure.focusWrites.length,1);assert.equal(failure.writes.length,1);assert.equal(failure.workspace().focusOutcomes.length,1);
  console.log('✓ Pending starts cannot write outcomes into a changed owner/session/target; failed session persistence records no outcome and retries once');
}
void verify().catch(e=>{console.error(e);process.exitCode=1});
