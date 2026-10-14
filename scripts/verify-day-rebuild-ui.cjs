// Optional guarded Rebuild my evening preview/apply flows; external browser only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_REBUILD_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-day-rebuild-ui-'));
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const modes=['apply','cancel','expired','next_day','empty','future_day','long_titles','single','mixed','changed','changed_notes','focus','review','save_error'];
(async()=>{let browser;try{for(const [mode,reduced] of modes.flatMap(m=>[false,true].map(r=>[m,r])).filter(([m])=>!process.env.MYELIN_REBUILD_CASES||process.env.MYELIN_REBUILD_CASES.split(',').includes(m))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'today',dueAt:now+6*3600000,now});task.id='t1';task.notes='Existing notes';task.actualMinutes=3;task.dueAt+=12345;
 task.planState='today';task.postponements=2;task.lastPostponedAt=now-86400000;
 const other=createStudyTask({title:'Maths worksheet',subject:'Maths',priority:1,estimatedMinutes:25,planState:'today',now});other.id='t2';w.tasks=[task,other];
 if(mode==='single')w.tasks=[task];
 if(mode==='empty'){task.status='completed';task.completedAt=now;other.planState='postponed';other.postponedUntil=now+86400000;}
 if(mode==='future_day')w.focusOutcomes=[{id:'spent',startedAt:now-2*3600000,endedAt:now-60000,status:'finished',plannedMinutes:90,minutes:90,launchMode:'full',taskOnly:true,overdue:false}];
 if(mode==='long_titles'){task.title='Biology notebook '+('long saved title ').repeat(24);other.title='Maths worksheet '+('long saved title ').repeat(24);}
 if(mode==='mixed'){other.planState='postponed';other.postponedUntil=now+86400000;const completed=createStudyTask({title:'Finished work',estimatedMinutes:25,planState:'today',now});completed.id='done';completed.status='completed';completed.completedAt=now;w.tasks.push(completed);}
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'t1',topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review'){const t=createTopic({name:'Cells',subject:'Biology',priority:2,status:'review',estimate:25,notes:''},now,'topic1');t.cards=[createQuestion({prompt:'Mitosis?',answer:'Division',hint:''},now,'c1')];w.topics=[t];seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});}
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,wk})=>{if(!localStorage.getItem('planning-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('planning-seeded','1');}
  window.__failWorkspace=false;window.__primaryWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.__failWorkspace&&key.startsWith('@myelin/native/workspace/local%3Adevice/'))throw Error('Synthetic scheduling save failure');if(key===wk)window.__primaryWrites++;return original.call(this,key,value)};
 },{seed,wk});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk),records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const retry=()=>page.getByRole('button',{name:'Retry saving your changes',exact:true});
 const build=()=>page.getByRole('button',{name:/^Rebuild my evening/}),apply=()=>page.getByRole('button',{name:'Apply plan',exact:true}),refresh=()=>page.getByRole('button',{name:'Refresh preview',exact:true}),cancel=()=>page.getByRole('button',{name:'Cancel',exact:true});
 let clock=now;
 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);const original=await read(),protectedBefore=await records();
  await page.getByRole('button',{name:'Open Day Map',exact:true}).click();await page.waitForURL(/\/today\/day-map$/);await page.getByRole('button',{name:/Planning options/}).click();await build().click();
  await page.getByText('REBUILD EVENING · PREVIEW',{exact:true}).waitFor();assert.deepEqual(await read(),original,'Building a preview must not save or move work');assert.deepEqual(await records(),protectedBefore);
  let baseline=original;
  if(mode==='cancel'){
   await cancel().evaluate(e=>{e.click();e.click()});await apply().waitFor({state:'detached'});assert.deepEqual(await read(),original);
  }else if(mode==='empty'){
   await page.getByText('No available moves were found. Your current plan stays as it is.',{exact:true}).waitFor();assert.equal(await apply().count(),0);await refresh().click();assert.deepEqual(await read(),original);await cancel().click();
  }else{
   await apply().waitFor();
   if(mode==='future_day')await page.getByText('Tomorrow',{exact:true}).first().waitFor();
   if(mode==='expired'||mode==='next_day'){
    const old=await apply().elementHandle();clock=mode==='expired'?now+61000:now+86400000;await page.clock.setFixedTime(clock);await old.evaluate(e=>e.click());
    await page.getByText(/preview’s timing is out of date/).waitFor();assert.deepEqual(await read(),original);assert.equal(await apply().count(),0);await page.waitForTimeout(450);await page.screenshot({path:dir+`/expired-${mode}-${reduced}.png`,fullPage:true});await refresh().click();await apply().waitFor();assert.deepEqual(await read(),original);
   }
   if(mode==='changed'){
    await page.getByRole('button',{name:'Complete Maths worksheet',exact:true}).click();await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).tasks[1].status==='completed',wk);
    await page.getByRole('button',{name:'Dismiss achievement',exact:true}).click();baseline=await read();await page.getByText(/workspace changed after this preview/).waitFor();assert.equal(await apply().count(),0);await refresh().click();await apply().waitFor();
   }
   if(mode==='changed_notes'){
    await page.getByRole('button',{name:/^Biology notebook/}).click();await page.waitForURL(/\/today\/task\/t1$/);await page.getByPlaceholder('Question numbers, pages, what counts as done…',{exact:true}).fill('New notes after preview');await page.getByRole('button',{name:/^Save task/}).click();await page.waitForURL(/\/today\/day-map$/);
    baseline=await read();await page.getByText(/workspace changed after this preview/).waitFor();assert.equal(await apply().count(),0);await refresh().click();await apply().waitFor();
   }
   // Assert the proposed count and real row bounds before any application.
   const expectedCount=mode==='single'||mode==='mixed'||mode==='changed'?1:2;
   await page.getByText(new RegExp(`^${expectedCount} activit(?:y|ies) proposed`)).waitFor();
   const preview=page.getByTestId('day-rebuild-preview'),rows=preview.locator('[data-testid^="day-rebuild-row-"]');assert.equal(await rows.count(),expectedCount);
   for(const row of await rows.all()){const boxes=await row.evaluate(el=>{const root=el.getBoundingClientRect();return Array.from(el.children).map(child=>{const rect=child.getBoundingClientRect();return{left:rect.left,right:rect.right,parentLeft:root.left,parentRight:root.right}})});for(const box of boxes)assert.ok(box.left>=box.parentLeft-1&&box.right<=box.parentRight+1,JSON.stringify(box));for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].left>=boxes[i-1].right-1,'Preview columns overlap');}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await preview.scrollIntoViewIfNeeded();await page.waitForTimeout(450);await page.screenshot({path:dir+`/preview-${mode}-${reduced}.png`,fullPage:true});
   if(mode==='save_error')await page.evaluate(()=>{window.__failWorkspace=true});
   await apply().evaluate(e=>{e.click();e.click()});await apply().waitFor({state:'detached'});await page.getByText('Rebuilt plan applied · Deadlines unchanged.',{exact:true}).waitFor();
   if(mode==='save_error'){
    await retry().waitFor();assert.deepEqual(await read(),baseline);const writes=await page.evaluate(()=>window.__primaryWrites);await page.screenshot({path:dir+`/rebuild-save-error-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failWorkspace=false});await retry().evaluate(e=>{e.click();e.click()});await retry().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__primaryWrites),writes+1);
   }
   await page.waitForFunction(({wk,revision})=>JSON.parse(localStorage.getItem(wk)).revision===revision,{wk,revision:baseline.revision+1});const after=await read();assert.equal(after.revision,baseline.revision+1);
   const horizon=Math.floor(clock/60000)*60000+60000;
   const eligible=baseline.tasks.filter(t=>t.status==='open'&&t.postponedUntil<=clock&&t.planState==='today');
   let start=mode==='future_day'?new Date('2026-10-15T06:00:00+05:30').getTime():horizon;
   for(const task of baseline.tasks){const saved=after.tasks.find(t=>t.id===task.id);if(eligible.some(t=>t.id===task.id)){const minutes=task.estimatedMinutes-task.actualMinutes;assert.deepEqual(saved,{...task,planState:'scheduled',scheduledStart:start,scheduledEnd:start+minutes*60000,postponedUntil:0,updatedAt:saved.updatedAt});start+=minutes*60000;}else assert.deepEqual(saved,task);}
   assert.deepEqual(after,{...baseline,tasks:after.tasks,revision:baseline.revision+1,updatedAt:after.updatedAt});
  }
  const final=await read();assert.deepEqual(await records(),protectedBefore);await page.waitForTimeout(450);await page.screenshot({path:dir+`/rebuild-${mode}-${reduced}.png`,fullPage:true});await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),final);assert.deepEqual(await records(),protectedBefore);assert.equal(await apply().count(),0);assert.equal(await refresh().count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log(`✓ Rebuild ${mode}, reduced=${reduced}: read-only preview, guarded batch, exact records and reload`);
 }catch(e){await page.screenshot({path:dir+'/rebuild-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
