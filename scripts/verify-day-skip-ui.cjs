// Optional Day Map Skip/Restore flows; external browser dependencies only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {addLocalDays}=require(process.cwd()+'/src/features/planning/day-engine.ts');
const {localDateKey}=require(process.cwd()+'/src/features/planning/commitment-dates.ts');
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081',dir=process.env.MYELIN_SKIP_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-day-skip-'));
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const modes=['task','occurrence','carry','both','cycle','nextday_task','nextday_occurrence','focus','review','save_error_task','save_error_occurrence','long_title','oneoff','limit'];
(async()=>{let browser;try{for(const [mode,reduced] of modes.flatMap(m=>[false,true].map(r=>[m,r])).filter(([m])=>!process.env.MYELIN_SKIP_CASES||process.env.MYELIN_SKIP_CASES.split(',').includes(m))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const taskMode=['task','nextday_task','focus','review','save_error_task'].includes(mode),carry=['carry','both'].includes(mode);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'scheduled',dueAt:now+6*3600000,now});task.id='t1';task.notes='Saved notes';task.actualMinutes=3;task.postponements=2;task.lastPostponedAt=now-86400000;task.dueAt+=12345;task.scheduledStart=now-3600000;task.scheduledEnd=task.scheduledStart+25*60000;
 const other=createStudyTask({title:'Maths worksheet',estimatedMinutes:25,planState:'inbox',now});other.id='t2';w.tasks=[task,other];
 const day=new Date(now).getDay(),startDate=carry?new Date('2026-10-13T23:00:00+05:30').getTime():new Date('2026-10-14T17:00:00+05:30').getTime();
 const item={id:'fixed',title:mode==='long_title'?'Tuition '+('long saved title ').repeat(16):'Tuition',kind:'tuition',startAt:startDate,endAt:startDate+3600000*(carry?2:1),startMinutes:carry?23*60:17*60,endMinutes:carry?60:18*60,recurrenceDays:mode==='oneoff'?[]:mode==='both'?[(day+6)%7,day]:[carry?(day+6)%7:day],skippedDates:['2026-10-01'],createdAt:now,updatedAt:now};
 if(mode==='limit')item.skippedDates=Array.from({length:366},(_,i)=>localDateKey(new Date(2010,0,6+i*7,12).getTime()));
 if(!taskMode)w.commitments=[item];if(mode==='oneoff')item.skippedDates.push(localDateKey(now));
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'t1',topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review'){const topic=createTopic({name:'Cells',subject:'Biology',priority:2,status:'review',estimate:25,notes:''},now,'topic1');topic.cards=[createQuestion({prompt:'Mitosis?',answer:'Division',hint:''},now,'c1')];w.topics=[topic];seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});}
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,wk})=>{if(!localStorage.getItem('skip-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('skip-seeded','1');}window.__failWorkspace=false;window.__primaryWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.__failWorkspace&&key.startsWith('@myelin/native/workspace/local%3Adevice/'))throw Error('Synthetic Skip save failure');if(key===wk)window.__primaryWrites++;return original.call(this,key,value)};},{seed,wk});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk),records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const skip=()=>page.getByRole('button',{name:taskMode?'Skip':'Skip this occurrence',exact:true}),restore=()=>page.getByRole('button',{name:'Restore occurrence',exact:true}),retry=()=>page.getByRole('button',{name:'Retry saving your changes',exact:true});
 async function double(button){await button.evaluate(el=>{el.click();el.click()});}
 async function settledRevision(revision){await page.waitForFunction(({wk,revision})=>JSON.parse(localStorage.getItem(wk)).revision===revision,{wk,revision});}
 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);const before=await read(),protectedBefore=await records();await page.getByRole('button',{name:'Open Day Map',exact:true}).click();await page.waitForURL(/\/today\/day-map$/);assert.deepEqual(await read(),before,'Opening Day Map never writes a skip');
  let expected=before;
  if(mode==='oneoff'){
   assert.equal(await skip().count(),0);assert.equal(await restore().count(),0);assert.deepEqual(await read(),before);
  }else if(mode==='limit'){
   const writes=await page.evaluate(()=>window.__primaryWrites);await double(skip().first());await page.getByText('Remove an older skipped date in Edit fixed block before skipping another. Your current plan was kept.',{exact:true}).waitFor();await page.getByText('Remove an older skipped date in Edit fixed block before skipping another. Your current plan was kept.',{exact:true}).scrollIntoViewIfNeeded();assert.deepEqual(await read(),before);assert.equal(await page.evaluate(()=>window.__primaryWrites),writes);
  }else if(mode.startsWith('nextday_')){
   await skip().first().waitFor();const old=await skip().first().elementHandle(),writes=await page.evaluate(()=>window.__primaryWrites);await page.clock.setFixedTime(now+86400000);await old.evaluate(el=>el.click());await page.getByText('These controls are from an earlier day. Your current plan was kept. Use the current Day Map controls.',{exact:true}).waitFor();await skip().first().waitFor({state:'detached'});await page.getByText('These controls are from an earlier day. Your current plan was kept. Use the current Day Map controls.',{exact:true}).scrollIntoViewIfNeeded();assert.deepEqual(await read(),before);assert.equal(await page.evaluate(()=>window.__primaryWrites),writes);
  }else{
   await skip().first().waitFor();const writes=await page.evaluate(()=>window.__primaryWrites);if(mode.startsWith('save_error'))await page.evaluate(()=>{window.__failWorkspace=true});
   const date=localDateKey(carry?addLocalDays(now,-1):now);
   await double(skip().first());const notice=page.getByText(taskMode?'Task skipped until tomorrow · Deadline unchanged.':'Occurrence skipped · Future repeats unchanged.',{exact:true});await notice.waitFor();
   if(mode.startsWith('save_error')){await retry().waitFor();assert.deepEqual(await read(),before);await page.screenshot({path:dir+`/save-error-${mode}-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failWorkspace=false});await double(retry());await retry().waitFor({state:'detached'});}
   await settledRevision(before.revision+1);assert.equal(await page.evaluate(()=>window.__primaryWrites),writes+1);const skipped=await read();
   if(taskMode){assert.deepEqual(skipped.tasks[0],{...before.tasks[0],planState:'postponed',scheduledStart:0,scheduledEnd:0,postponedUntil:new Date('2026-10-15T00:00:00+05:30').getTime(),postponements:3,lastPostponedAt:now,updatedAt:now});expected={...before,tasks:skipped.tasks,revision:before.revision+1,updatedAt:now};await skip().first().waitFor({state:'detached'});assert.equal(await skip().count(),0);}
   else{
    assert.deepEqual(skipped.commitments[0],{...before.commitments[0],skippedDates:[...before.commitments[0].skippedDates,date],updatedAt:now});expected={...before,commitments:skipped.commitments,revision:before.revision+1,updatedAt:now};assert.deepEqual(skipped,expected);
    await restore().waitFor();await restore().scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/skipped-${mode}-${reduced}.png`,fullPage:true});
    // Visible restoration targets the start-date exception only; the other
    // overnight occurrence and unrelated historical exceptions stay intact.
    const restoreWrites=await page.evaluate(()=>window.__primaryWrites);await double(restore());await settledRevision(skipped.revision+1);assert.equal(await page.evaluate(()=>window.__primaryWrites),restoreWrites+1);await page.getByText('Occurrence restored · Future repeats unchanged.',{exact:true}).waitFor();const restored=await read();expected={...before,commitments:[{...before.commitments[0],updatedAt:now}],revision:skipped.revision+1,updatedAt:now};assert.deepEqual(restored,expected);
    // Host timezone need not match the browser; use the explicit India day.
    await skip().nth(mode==='both'?1:0).waitFor();await restore().waitFor({state:'detached'});assert.equal(await skip().count(),mode==='both'?2:1);assert.equal(await restore().count(),0);
    if(mode==='cycle'){await double(skip().first());await settledRevision(restored.revision+1);await double(restore());await settledRevision(restored.revision+2);expected={...expected,revision:restored.revision+2};assert.deepEqual(await read(),expected);}
   }
   assert.deepEqual(await read(),expected);
  }
  assert.deepEqual(await records(),protectedBefore);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:dir+`/skip-${mode}-${reduced}.png`,fullPage:true});const final=await read();await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),final);assert.deepEqual(await records(),protectedBefore);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log(`✓ Day Map Skip/Restore ${mode}, reduced=${reduced}: one targeted action, exact records, recovery and reload`);
 }catch(e){await page.screenshot({path:dir+'/skip-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
