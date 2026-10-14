/// <reference types="node" />
import assert from 'node:assert/strict';
import { scenario } from './verify-task-planning';
import type { StudyTask } from '../src/data/schema';
import * as engine from '../src/features/planning/task-engine';
import { createDayRebuildPreview } from '../src/features/planning/day-rebuild';

async function ready() {
  const s=scenario('daymap');s.mutate(w=>{w.tasks[1].planState='today';});await s.context().waitForSaves();s.root.render();return s;
}
async function verify(){
  const s=await ready(),before=structuredClone(s.workspace()),count=s.writes.length;
  s.actions('Rebuild my evening')[0]();s.root.render();assert.deepEqual(s.workspace(),before);assert.equal(s.writes.length,count);
  assert.match(s.text(),/2\s+activities\s+proposed/);assert.match(s.text(),/Today/);
  const expected=createDayRebuildPreview(before,s.owner,s.now()),apply=s.actions('Apply plan')[0];apply();apply();await s.context().waitForSaves();assert.equal(s.workspace().revision,before.revision+1);assert.equal(s.writes.length,count+1);
  for(const move of expected.moves){const task=s.workspace().tasks.find((t:any)=>t.id===move.taskId)!;const original=before.tasks.find((t:StudyTask)=>t.id===move.taskId)!;assert.deepEqual(task,{...original,planState:'scheduled',scheduledStart:move.start,scheduledEnd:move.end,postponedUntil:0,updatedAt:s.now()});}
  assert.equal(s.reflows.at(-1)!.before.revision,before.revision);assert.equal(s.reflows.at(-1)!.after,s.workspace());s.root.render();assert.equal(s.actions('Apply plan').length,0);assert.match(s.text(),/Rebuilt plan applied/);
  console.log('✓ Actual preview is read-only; applying the entire reviewed batch saves once, preserves owned/nonowned evidence and consumes old callbacks');
  for(const mode of ['complete','delete','schedule','minutes','notes','commitment','capacity']){
    const x=await ready();x.actions('Rebuild my evening')[0]();x.root.render();const stale=x.actions('Apply plan')[0];
    x.mutate(w=>{if(mode==='complete')engine.completeTask(w.tasks[1],x.now());if(mode==='delete')w.tasks.pop();if(mode==='schedule')engine.scheduleTask(w.tasks[1],x.now()+3600000,x.now()+5100000);if(mode==='minutes')engine.recordTaskMinutes(w.tasks[1],5,x.now());if(mode==='notes')w.tasks[1].notes='New notes';if(mode==='capacity')w.settings.dailyMinutes=30;if(mode==='commitment')w.commitments.push({id:'fixed',title:'New class',kind:'school',startMinutes:720,endMinutes:780,startAt:x.now(),endAt:x.now()+3600000,recurrenceDays:[],skippedDates:[],createdAt:x.now(),updatedAt:x.now()});});
    await x.context().waitForSaves();const latest=structuredClone(x.workspace()),writes=x.writes.length;stale();await x.context().waitForSaves();assert.deepEqual(x.workspace(),latest);assert.equal(x.writes.length,writes);x.root.render();assert.equal(x.actions('Apply plan').length,0);assert.match(x.text(),/workspace changed/);
    assert.equal(x.workspace().tasks[0].scheduledStart,latest.tasks[0].scheduledStart,'Rejected batch cannot partially change its first valid task');
    x.actions('Refresh preview')[0]();x.root.render();assert.deepEqual(x.workspace(),latest);const currentPreview=createDayRebuildPreview(latest,x.owner,x.now());
    if(currentPreview.moves.length){x.actions('Apply plan')[0]();await x.context().waitForSaves();assert.equal(x.workspace().revision,latest.revision+1);if(mode==='complete')assert.equal(x.workspace().tasks[1].status,'completed');if(mode==='notes')assert.equal(x.workspace().tasks[1].notes,'New notes');if(mode==='minutes')assert.equal(x.workspace().tasks[1].actualMinutes,5);}
  }
  console.log('✓ Revision conflicts keep every task unchanged; explicit refresh protects newer completion/deletion/scheduling/work/notes/fixed time/capacity');
  for(const mode of ['expiry','backwards','nextday']){const x=await ready();x.actions('Rebuild my evening')[0]();x.root.render();const old=x.actions('Apply plan')[0],latest=structuredClone(x.workspace()),writes=x.writes.length;x.advance(mode==='expiry'?60000:mode==='backwards'?-1000:86400000);old();await x.context().waitForSaves();assert.deepEqual(x.workspace(),latest);assert.equal(x.writes.length,writes);x.root.render();assert.equal(x.actions('Apply plan').length,0);assert.match(x.text(),/timing is out of date/);x.actions('Refresh preview')[0]();x.root.render();assert.ok(x.actions('Apply plan')[0]);x.actions('Apply plan')[0]();await x.context().waitForSaves();assert.equal(x.workspace().revision,latest.revision+1);}
  const empty=await ready();empty.mutate(w=>{engine.completeTask(w.tasks[0],empty.now());w.tasks[1].planState='postponed';w.tasks[1].postponedUntil=empty.now()+86400000;});await empty.context().waitForSaves();empty.root.render();const noMoves=structuredClone(empty.workspace()),emptyWrites=empty.writes.length;empty.actions('Rebuild my evening')[0]();empty.root.render();assert.match(empty.text(),/No available moves/);assert.equal(empty.actions('Apply plan').length,0);assert.deepEqual(empty.workspace(),noMoves);assert.equal(empty.writes.length,emptyWrites);empty.actions('Cancel')[0]();empty.root.render();assert.equal(empty.actions('Refresh preview').length,0);
  console.log('✓ Clock expiry/backwards/day changes require a fresh preview; empty previews never offer a no-op write');
  const superseded=await ready();superseded.actions('Rebuild my evening')[0]();superseded.root.render();const oldApply=superseded.actions('Apply plan')[0],oldCancel=superseded.actions('Cancel')[0];superseded.actions('Rebuild my evening')[0]();superseded.root.render();oldApply();oldCancel();superseded.root.render();assert.ok(superseded.actions('Apply plan')[0]);const untouched=structuredClone(superseded.workspace());superseded.actions('Cancel')[0]();oldApply();assert.deepEqual(superseded.workspace(),untouched);
  for(const status of ['owner','loading','error']){const x=await ready();const oldBuild=x.actions('Rebuild my evening')[0];oldBuild();x.root.render();const old=x.actions('Apply plan')[0],cancel=x.actions('Cancel')[0],latest=structuredClone(x.workspace()),writes=x.writes.length;if(status==='owner')x.switchOwner();else x.setStatus(status);old();cancel();oldBuild();await x.context().waitForSaves();assert.deepEqual(x.workspace(),latest);assert.equal(x.writes.length,writes);x.root.render();assert.equal(x.actions('Apply plan').length,0);}
  const late=await ready();const buildLatest=late.actions('Rebuild my evening')[0];late.mutate(w=>{w.tasks[1].notes='Latest notes';});await late.context().waitForSaves();late.root.render();buildLatest();late.root.render();const live=late.workspace();late.actions('Apply plan')[0]();assert.equal(late.reflows.at(-1)!.before,live);assert.equal(late.workspace().tasks[1].notes,'Latest notes');
  console.log('✓ Superseded/cancelled/old-owner/nonready preview callbacks cannot apply, discard or recreate a newer preview; reflow gets the live baseline');
}
void verify().catch(e=>{console.error(e);process.exitCode=1});
