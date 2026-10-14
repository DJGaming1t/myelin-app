// Optional Today recovery flows. External Playwright/browser and Expo web only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_DEFER_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-defer-ui-'));
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const cases=['task','scheduled','topic','last-task','rescheduled','completed','expired','focus','review'].flatMap(mode=>[false,true].map(reduced=>[mode,reduced]));
(async()=>{let browser;try{for(const [mode,reduced] of cases.filter(([mode])=>!process.env.MYELIN_DEFER_CASES||process.env.MYELIN_DEFER_CASES.split(',').includes(mode))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime(),midnight=new Date('2026-10-15T00:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;w.settings.dailyMinutes=120;
 const first=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'today',dueAt:now+6*3600000,now});first.id='task1';first.postponements=2;first.lastPostponedAt=now-86400000;
 const second=createStudyTask({title:'Maths worksheet',subject:'Maths',priority:1,estimatedMinutes:25,planState:'today',dueAt:now+2*86400000,now});second.id='task2';
 if(mode==='scheduled'||mode==='rescheduled'){first.planState='scheduled';first.scheduledStart=now+3600000;first.scheduledEnd=first.scheduledStart+25*60000;}
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'learning',priority:3,estimate:25,notes:'Saved notes'},now,'t1');topic.postponements=2;
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:'Daughter cells'},now,'c1')];
 if(mode==='topic')w.topics=[topic];else w.tasks=mode==='last-task'?[first]:[first,second];
 if(mode==='review')w.topics=[topic];
 const initial=validateWorkspaceV2(w),seed={'myelin.auth.local-mode':'1',[wk]:JSON.stringify(initial),[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'task1',topicName:first.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(initial,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});
 await page.addInitScript(seed=>{if(!localStorage.getItem('defer-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('defer-seeded','1');}},seed);
 const workspace=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);
 const protectedRecords=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const readTask=async()=> (await workspace()).tasks.find(t=>t.id==='task1');
 const source=mode==='topic'?'topic':'task',name=source==='topic'?topic.name:first.title;
 const undo=()=>page.getByRole('button',{name:'Undo moving '+name+' out of today',exact:true});
 async function openTasks(){await page.getByRole('button',{name:'Show study tasks',exact:true}).click();await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).waitFor();}
 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);
  const before=await workspace(),records=await protectedRecords();
  if(mode==='focus'||mode==='review'){
   assert.equal(await page.getByRole('button',{name:/Show the next recommendation instead of/}).count(),0);
   await page.getByRole('button',{name:mode==='focus'?'Resume focus':'Resume review',exact:true}).waitFor();assert.deepEqual(await workspace(),before);assert.deepEqual(await protectedRecords(),records);
  }else{
   const defer=page.getByRole('button',{name:'Show the next recommendation instead of '+name,exact:true});await defer.waitFor();
   // Same-render double presses exercise animation locking and live-record eligibility in reduced motion.
   await defer.evaluate(e=>{e.click();e.click();});await undo().waitFor();await page.waitForTimeout(600);
   const deferred=await workspace();assert.equal(deferred.revision,before.revision+1,'Duplicate taps create one workspace update');
   const changed=source==='topic'?deferred.topics[0]:deferred.tasks.find(t=>t.id==='task1');assert.equal(changed.postponements,3);assert.equal(source==='topic'?changed.snoozeUntil:changed.postponedUntil,midnight);
   if(source==='task'){assert.equal(changed.dueAt,first.dueAt);assert.equal(changed.scheduledStart,0);assert.equal(changed.scheduledEnd,0);}
   else assert.deepEqual(changed.cards,before.topics[0].cards);
   assert.deepEqual(await protectedRecords(),records);assert.deepEqual(deferred.history,before.history);
   await page.getByText(source==='task'?'Until tomorrow. Deadline unchanged.':'Until tomorrow. Recall dates unchanged.',{exact:true}).waitFor();
   if(mode==='last-task')await page.getByText('Nothing urgent right now.',{exact:true}).waitFor();
   if(mode==='rescheduled'){
    await openTasks();const row=page.getByRole('button',{name:'Edit Biology notebook',exact:true}).locator('..');await row.getByRole('button',{name:'Schedule',exact:true}).click();
    await page.getByRole('button',{name:'Close scheduling sheet',exact:true}).click({position:{x:10,y:10}});await page.getByRole('textbox',{name:'Schedule date',exact:true}).waitFor({state:'detached'});
    await row.getByRole('button',{name:'Schedule',exact:true}).click();
    await page.getByRole('textbox',{name:'Schedule date',exact:true}).fill('2026-10-15');await page.getByRole('textbox',{name:'Schedule time',exact:true}).fill('16:30');await page.getByRole('button',{name:'Schedule this task',exact:true}).click();await page.getByRole('textbox',{name:'Schedule date',exact:true}).waitFor({state:'detached'});
   }
   if(mode==='completed'){await openTasks();await page.getByRole('button',{name:'Complete Biology notebook',exact:true}).click();await page.waitForTimeout(300);}
   if(mode==='expired')await page.clock.setFixedTime(midnight+60000);
   const latest=await workspace();
   await undo().click();await page.getByTestId('today-defer-notice').waitFor();await page.waitForTimeout(650);
   const after=await workspace();
   if(['rescheduled','completed','expired'].includes(mode)){
    assert.deepEqual(after,latest,'Rejected Undo creates no revision/save and preserves the whole latest workspace');
    await page.getByText(mode==='expired'?'That deferral has ended. Your current plan was kept.':'This item changed after Not now. Your latest changes were kept.',{exact:true}).waitFor();
   }else{
    await page.getByText('Previous plan restored.',{exact:true}).waitFor();assert.equal(after.revision,before.revision+2);
    if(source==='topic')assert.deepEqual(after.topics,before.topics);else{
     const restored=after.tasks.find(t=>t.id==='task1'),original=before.tasks.find(t=>t.id==='task1');
     assert.deepEqual(restored,{...original,updatedAt:restored.updatedAt});assert.deepEqual(after.tasks.filter(t=>t.id!=='task1'),before.tasks.filter(t=>t.id!=='task1'));
    }
    assert.deepEqual(after.history,before.history);assert.deepEqual(after.settings,before.settings);
   }
   assert.deepEqual(await protectedRecords(),records);assert.equal(await undo().count(),0);
   await page.screenshot({path:dir+`/today-defer-${mode}-${reduced}.png`,fullPage:true});
   await page.reload({waitUntil:'networkidle'});assert.deepEqual(await workspace(),after,'Outcome survives reload');assert.equal(await undo().count(),0,'Undo receipt is ephemeral, not replayed after reload');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[],'No React/browser errors, including nested interactive controls');
  console.log(`✓ Today deferral ${mode}, reduced=${reduced}: one update, guarded Undo, real actions, preserved records and reload`);
 }catch(e){await page.screenshot({path:dir+'/today-defer-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
