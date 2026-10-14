/// <reference types="node" />
import assert from 'node:assert/strict';
import { scenario } from './verify-task-planning';
import type { Commitment } from '../src/data/schema';
import { commitmentOccurrencesForDay, addLocalDays, startOfLocalDay } from '../src/features/planning/day-engine';
import { localDateKey } from '../src/features/planning/commitment-dates';
import { restorableOccurrenceDates } from '../src/features/planning/day-skip';
import * as engine from '../src/features/planning/task-engine';

function fixed(now: number, overnight = false): Commitment {
  const day = startOfLocalDay(now), start = overnight ? addLocalDays(day,-1) : day;
  return { id:'fixed',title:'Tuition',kind:'tuition',startAt:start+17*3600000,endAt:start+18*3600000,
    startMinutes:overnight?23*60:17*60,endMinutes:overnight?60:18*60,
    recurrenceDays:[new Date(start).getDay()],skippedDates:['2026-10-01'],createdAt:now,updatedAt:now };
}
async function ready(overnight=false) {
  const s=scenario('daymap','scheduled');s.mutate(w=>{w.commitments=[fixed(s.now(),overnight)];});await s.context().waitForSaves();s.root.render();return s;
}
async function verify(){
  const s=scenario('daymap','scheduled'),before=structuredClone(s.workspace()),skip=s.actions('Skip')[0];assert.ok(skip);skip();skip();await s.context().waitForSaves();
  assert.equal(s.writes.length,1);assert.equal(s.workspace().revision,before.revision+1);
  assert.deepEqual(s.workspace().tasks[0],{...before.tasks[0],planState:'postponed',scheduledStart:0,scheduledEnd:0,postponedUntil:addLocalDays(startOfLocalDay(s.now()),1),postponements:before.tasks[0].postponements+1,lastPostponedAt:s.now(),updatedAt:s.now()});
  assert.deepEqual(s.workspace(),{...before,tasks:s.workspace().tasks,revision:before.revision+1,updatedAt:s.now()});assert.equal(s.reflows.at(-1)!.before.revision,before.revision);assert.equal(s.reflows.at(-1)!.after,s.workspace());s.root.render();assert.match(s.text(),/Task skipped until tomorrow/);assert.equal(s.actions('Skip').length,0);
  for(const mode of ['complete','delete','schedule','minutes','session','estimate','deadline','defer','owner','loading','error','nextday']){
    const x=scenario('daymap','scheduled'),old=x.actions('Skip')[0];
    if(mode==='owner')x.switchOwner();else if(mode==='loading'||mode==='error')x.setStatus(mode);else if(mode==='nextday')x.advance(86400000);else x.mutate(w=>{const t=w.tasks[0];if(mode==='complete')engine.completeTask(t,x.now());if(mode==='delete')w.tasks.shift();if(mode==='schedule')engine.scheduleTask(t,x.now()+3600000,x.now()+5100000);if(mode==='minutes')engine.recordTaskMinutes(t,5,x.now());if(mode==='session')t.lastFocusSessionId='new';if(mode==='estimate')t.estimatedMinutes+=5;if(mode==='deadline')t.dueAt+=3600000;if(mode==='defer')engine.postponeTask(t,x.now()+86400000,x.now());});
    await x.context().waitForSaves();const live=structuredClone(x.workspace()),writes=x.writes.length,reflows=x.reflows.length;old();await x.context().waitForSaves();assert.deepEqual(structuredClone(x.workspace()),live,mode);assert.equal(x.writes.length,writes,mode);assert.equal(x.reflows.length,reflows,mode);
    if(mode==='nextday'){x.root.render();assert.equal(x.actions('Skip').length,0);assert.match(x.text(),/earlier day/);}
    if(mode==='minutes'){x.root.render();assert.match(x.text(),/current plan was kept/);x.actions('Skip')[0]();await x.context().waitForSaves();assert.equal(x.workspace().tasks[0].actualMinutes,5);}
  }
  const notes=scenario('daymap','scheduled'),old=notes.actions('Skip')[0];notes.mutate(w=>{w.tasks[0].notes='Latest notes';w.tasks[0].title='Latest title';});const live=notes.workspace();old();assert.equal(notes.workspace().tasks[0].notes,'Latest notes');assert.equal(notes.workspace().tasks[0].title,'Latest title');assert.equal(notes.reflows.at(-1)!.before,live);
  console.log('✓ Actual missed-task Skip accepts once, preserves deadlines/evidence and rejects owner/nonready/new-record/day conflicts before writes or reflow');
  for(const overnight of [false,true]){
    const x=await ready(overnight),source=x.workspace().commitments[0],date=localDateKey(overnight?addLocalDays(x.now(),-1):x.now()),count=x.writes.length;
    const skip=x.actions('Skip this occurrence')[0];assert.ok(skip);skip();skip();await x.context().waitForSaves();assert.equal(x.writes.length,count+1);assert.deepEqual(structuredClone(x.workspace().commitments[0]),{...source,skippedDates:[...source.skippedDates!,date],updatedAt:x.now()});
    assert.equal(commitmentOccurrencesForDay(x.workspace().commitments,x.now()).length,0);x.root.render();assert.match(x.text(),/Future repeats unchanged/);assert.deepEqual(structuredClone(restorableOccurrenceDates(x.workspace().commitments[0],x.now())),[date]);
    const restore=x.actions('Restore occurrence')[0];assert.ok(restore);const current=x.workspace(),writes=x.writes.length;restore();restore();await x.context().waitForSaves();assert.equal(x.writes.length,writes+1);assert.deepEqual(structuredClone(x.workspace().commitments[0].skippedDates),source.skippedDates);assert.equal(x.reflows.at(-1)!.before,current);assert.equal(x.reflows.at(-1)!.after,x.workspace());
    const restored=structuredClone(x.workspace()),afterWrites=x.writes.length;skip();restore();await x.context().waitForSaves();assert.deepEqual(structuredClone(x.workspace()),restored,'Consumed skip/restore cannot replay after opposite action');assert.equal(x.writes.length,afterWrites);assert.equal(commitmentOccurrencesForDay(x.workspace().commitments,x.now()).length,1);
    assert.equal(commitmentOccurrencesForDay(x.workspace().commitments,addLocalDays(x.now(),7)).length,1,'Future repeats unchanged');
    x.root.render();x.actions('Skip this occurrence')[0]();await x.context().waitForSaves();assert.equal(x.writes.length,afterWrites+1,'Fresh rendered controls remain actionable');
  }
  for(const restore of [false,true])for(const mode of ['delete','time','days','oneoff','state','owner','loading','error','nextday']){
    const x=await ready();if(restore){x.actions('Skip this occurrence')[0]();await x.context().waitForSaves();x.root.render();}const old=x.actions(restore?'Restore occurrence':'Skip this occurrence')[0];
    if(mode==='owner')x.switchOwner();else if(mode==='loading'||mode==='error')x.setStatus(mode);else if(mode==='nextday')x.advance(86400000);else x.mutate(w=>{const c=w.commitments[0];if(mode==='delete')w.commitments=[];if(mode==='time')c.endMinutes+=30;if(mode==='days')c.recurrenceDays=[(new Date(x.now()).getDay()+1)%7];if(mode==='oneoff')c.recurrenceDays=[];if(mode==='state')c.skippedDates=restore?[]:[...c.skippedDates!,localDateKey(x.now())];});
    await x.context().waitForSaves();const current=structuredClone(x.workspace()),writes=x.writes.length,reflows=x.reflows.length;old();await x.context().waitForSaves();assert.deepEqual(structuredClone(x.workspace()),current,`${restore}/${mode}`);assert.equal(x.writes.length,writes);assert.equal(x.reflows.length,reflows);
  }
  const harmless=await ready(),skipLatest=harmless.actions('Skip this occurrence')[0];harmless.mutate(w=>{w.commitments[0].title='Renamed';w.commitments[0].skippedDates!.push('2026-10-02');w.tasks[0].notes='New unrelated notes';});const baseline=harmless.workspace();skipLatest();assert.equal(harmless.reflows.at(-1)!.before,baseline);assert.equal(harmless.workspace().commitments[0].title,'Renamed');assert.deepEqual(structuredClone(harmless.workspace().commitments[0].skippedDates),['2026-10-01','2026-10-02',localDateKey(harmless.now())]);assert.equal(harmless.workspace().tasks[0].notes,'New unrelated notes');

  const limit=await ready();limit.mutate(w=>{w.commitments[0].skippedDates=Array.from({length:366},(_,i)=>localDateKey(new Date(2010,0,6+i*7,12).getTime()));});await limit.context().waitForSaves();limit.root.render();const capped=structuredClone(limit.workspace()),capWrites=limit.writes.length;limit.actions('Skip this occurrence')[0]();await limit.context().waitForSaves();assert.deepEqual(structuredClone(limit.workspace()),capped);assert.equal(limit.writes.length,capWrites);limit.root.render();assert.match(limit.text(),/Remove an older skipped date/);
  const invalid=await ready();invalid.mutate(w=>{w.commitments[0].skippedDates=['2026-10-14'];w.commitments[0].recurrenceDays=[];});invalid.root.render();assert.equal(invalid.actions('Restore occurrence').length,0,'Nonrecurring leftover exceptions do not offer invalid restore');
  console.log('✓ Actual occurrence Skip/Restore protects targeted exception/timing/recurrence, preserves other dates/records, ignores consumed callbacks and uses overnight engine rules');
}
void verify().catch(e=>{console.error(e);process.exitCode=1});
