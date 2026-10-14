// Optional guarded scheduling and task moves flows; external browser only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_PLANNING_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-task-planning-ui-'));
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const modes=['custom','custom_seed','suggested','future_suggested','expired_suggestion','invalid_date','past_custom','today_postponed','today_scheduled','today_unchanged','daymap_flexible','daymap_missed','focus','review','save_error'];
(async()=>{let browser;try{for(const [mode,reduced] of modes.flatMap(m=>[false,true].map(r=>[m,r])).filter(([m])=>!process.env.MYELIN_PLANNING_CASES||process.env.MYELIN_PLANNING_CASES.split(',').includes(m))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'today',dueAt:now+6*3600000,now});task.id='t1';task.notes='Existing notes';task.actualMinutes=3;task.dueAt+=12345;
 task.planState='inbox';task.postponements=2;task.lastPostponedAt=now-86400000;
 if(mode==='today_postponed'){task.planState='postponed';task.postponedUntil=now+86400000;}
 if(mode==='today_unchanged'||mode==='daymap_flexible')task.planState='today';
 if(mode==='today_scheduled'||mode==='daymap_missed'){task.planState='scheduled';task.scheduledStart=now+(mode==='daymap_missed'?-3600000:3600000);task.scheduledEnd=task.scheduledStart+25*60000;}
 const other=createStudyTask({title:'Maths worksheet',subject:'Maths',priority:1,estimatedMinutes:25,planState:'inbox',now});other.id='t2';w.tasks=[task,other];
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'t1',topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review'){const t=createTopic({name:'Cells',subject:'Biology',priority:2,status:'review',estimate:25,notes:''},now,'topic1');t.cards=[createQuestion({prompt:'Mitosis?',answer:'Division',hint:''},now,'c1')];w.topics=[t];seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});}
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,wk})=>{if(!localStorage.getItem('planning-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('planning-seeded','1');}
  window.__failWorkspace=false;window.__primaryWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.__failWorkspace&&key.startsWith('@myelin/native/workspace/local%3Adevice/'))throw Error('Synthetic scheduling save failure');if(key===wk)window.__primaryWrites++;return original.call(this,key,value)};
 },{seed,wk});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk),records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const retry=()=>page.getByRole('button',{name:'Retry saving your changes',exact:true});
 async function tasks(){await page.getByRole('button',{name:'Show study tasks',exact:true}).click();await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).waitFor();}

 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);const before=await read(),protectedBefore=await records();
  let expectedStart=0;
  if(mode.startsWith('daymap_')){
   await page.getByRole('button',{name:'Open Day Map',exact:true}).click();await page.waitForURL(/\/today\/day-map$/);
   if(mode==='daymap_flexible')await page.getByRole('button',{name:/Planning options/}).click();
   const action=page.getByRole('button',{name:mode==='daymap_missed'?'Move':'Plan next gap',exact:true});await action.evaluate(e=>{e.click();e.click()});expectedStart=now;
   await page.getByText('Task scheduled in the next available gap · Deadline unchanged.',{exact:true}).waitFor();
  }else{
   await tasks();const card=page.getByRole('button',{name:'Edit Biology notebook',exact:true}).locator('..');
   if(mode.startsWith('today_')){
    await card.getByRole('button',{name:'Today',exact:true}).evaluate(e=>{e.click();e.click()});
    await page.getByText(mode==='today_unchanged'?'This task is already in that plan.':'Moved to Today · Deadline unchanged.',{exact:true}).waitFor();
   }else{
    await card.getByRole('button',{name:'Schedule',exact:true}).click();const cancel=page.getByRole('button',{name:'Cancel',exact:true});await cancel.waitFor();
    // Outside close and reopening preserve records and do not apply an automatic plan.
    await page.getByRole('button',{name:'Close scheduling sheet',exact:true}).click({position:{x:4,y:4}});await cancel.waitFor({state:'detached'});assert.deepEqual(await read(),before);
    await card.getByRole('button',{name:'Schedule',exact:true}).click();await cancel.waitFor();
    const date=page.getByRole('textbox',{name:'Schedule date',exact:true}),time=page.getByRole('textbox',{name:'Schedule time',exact:true}),submit=page.getByRole('button',{name:'Schedule this task',exact:true});
    const choices=page.getByRole('button',{name:/^Schedule for /});
    for(const field of [date,time]){const bounds=await field.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return{left:a.left,right:a.right,parentLeft:b.left,parentRight:b.right}});assert.ok(bounds.left>=bounds.parentLeft-1&&bounds.right<=bounds.parentRight+1,JSON.stringify(bounds));}
    if(mode==='suggested'||mode==='future_suggested'||mode==='expired_suggestion'){
     if(mode==='expired_suggestion'){
      await date.fill('2026-10-15');await time.fill('18:30');const stale=await choices.first().elementHandle();await page.clock.setFixedTime(now+26*60000);await stale.evaluate(e=>e.click());
      await page.getByText(/That suggestion is no longer available/).waitFor();await page.waitForTimeout(450);await page.screenshot({path:dir+`/expired-suggestion-${reduced}.png`,fullPage:true});assert.deepEqual(await read(),before);
      await page.getByRole('button',{name:'Refresh scheduling options',exact:true}).click();assert.equal(await date.inputValue(),'2026-10-15');assert.equal(await time.inputValue(),'18:30');
      await choices.first().evaluate(e=>{e.click();e.click()});expectedStart=now+26*60000;
     }else{
      if(mode==='suggested')await page.clock.setFixedTime(now+1800);
      await choices.nth(mode==='future_suggested'?1:0).evaluate(e=>{e.click();e.click()});expectedStart=mode==='future_suggested'?new Date('2026-10-15T06:00:00+05:30').getTime():now+1800;
     }
    }else{
     if(mode==='custom_seed')expectedStart=Math.floor(now/60000)*60000+60000;
     else{
      if(mode==='invalid_date'){await date.fill('2026-02-30');await time.fill('18:30');await submit.click();await page.getByText(/Use a valid date and time/).waitFor();assert.deepEqual(await read(),before);}
      if(mode==='past_custom'){await date.fill('2026-10-14');await time.fill('11:00');await submit.click();await page.getByText('Choose a time that is still ahead.',{exact:true}).waitFor();assert.deepEqual(await read(),before);}
      await date.fill('2026-10-15');await time.fill('18:30');expectedStart=new Date('2026-10-15T18:30:00+05:30').getTime();
     }
     if(mode==='save_error')await page.evaluate(()=>{window.__failWorkspace=true});
     await submit.evaluate(e=>{e.click();e.click()});
    }
    await cancel.waitFor({state:'detached'});await page.getByText('Task scheduled · Deadline unchanged.',{exact:true}).waitFor();
    if(mode==='save_error'){
     await retry().waitFor();assert.deepEqual(await read(),before);await page.screenshot({path:dir+`/planning-save-error-${reduced}.png`,fullPage:true});const writes=await page.evaluate(()=>window.__primaryWrites);
     await page.evaluate(()=>{window.__failWorkspace=false});await retry().evaluate(e=>{e.click();e.click()});await retry().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__primaryWrites),writes+1);
    }
   }
  }
  const revision=before.revision+(mode==='today_unchanged'?0:1);await page.waitForFunction(({wk,revision})=>JSON.parse(localStorage.getItem(wk)).revision===revision,{wk,revision});
  const after=await read();assert.equal(after.revision,revision);assert.deepEqual(after.history,before.history);assert.deepEqual(after.tasks[1],before.tasks[1]);assert.deepEqual(await records(),protectedBefore);
  const task=after.tasks[0],expected={...before.tasks[0]};
  if(mode.startsWith('today_')&&mode!=='today_unchanged')Object.assign(expected,{planState:'today',scheduledStart:0,scheduledEnd:0,postponedUntil:0,updatedAt:task.updatedAt});
  else if(!mode.startsWith('today_'))Object.assign(expected,{planState:'scheduled',scheduledStart:expectedStart,scheduledEnd:expectedStart+22*60000,postponedUntil:0,updatedAt:task.updatedAt});
  // Custom times retain the existing remaining-duration behavior, as do planner suggestions in this fixture.
  assert.deepEqual(task,expected,'Only schedule/deferral-owned fields change; recorded time, deadlines and counters remain');
  assert.deepEqual(after,{...before,tasks:after.tasks,revision,updatedAt:after.updatedAt});
  await page.waitForTimeout(450);await page.screenshot({path:dir+`/planning-${mode}-${reduced}.png`,fullPage:true});await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),after);assert.deepEqual(await records(),protectedBefore);
  assert.equal(await page.getByRole('button',{name:'Schedule this task',exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log(`✓ Task planning ${mode}, reduced=${reduced}: one accepted action, exact records, recovery and reload`);
 }catch(e){await page.screenshot({path:dir+'/planning-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
