// Optional completion, achievement and persistence recovery flows; external browser only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_COMPLETION_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-completion-ui-'));
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const modes=['today','scheduled','inbox','form','notes','reopen','successive','save-error','undo-save-error','focus','review'];
(async()=>{let browser;try{for(const [mode,reduced] of modes.flatMap(m=>[false,true].map(r=>[m,r])).filter(([m])=>!process.env.MYELIN_COMPLETION_CASES||process.env.MYELIN_COMPLETION_CASES.split(',').includes(m))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'today',dueAt:now+6*3600000,now});task.id='t1';task.notes='Existing notes';
 if(mode==='scheduled'){task.planState='scheduled';task.scheduledStart=now+3600000;task.scheduledEnd=task.scheduledStart+25*60000;}
 const other=createStudyTask({title:'Maths worksheet',subject:'Maths',priority:1,estimatedMinutes:25,planState:'today',now});other.id='t2';w.tasks=[task,other];
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'t1',topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review'){const t=createTopic({name:'Cells',subject:'Biology',priority:2,status:'review',estimate:25,notes:''},now,'topic1');t.cards=[createQuestion({prompt:'Mitosis?',answer:'Division',hint:''},now,'c1')];w.topics=[t];seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});}
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,wk})=>{if(!localStorage.getItem('completion-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('completion-seeded','1');}
  window.__failWorkspace=false;window.__primaryWrites=0;const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(window.__failWorkspace&&key.startsWith('@myelin/native/workspace/local%3Adevice/'))throw Error('Synthetic workspace save failure');if(key===wk)window.__primaryWrites++;return set.call(this,key,value)};
 },{seed,wk});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk),records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const complete=()=>page.getByRole('button',{name:'Complete Biology notebook',exact:true});
 const undo=()=>page.getByRole('button',{name:'Undo task completion',exact:true});
 const retry=()=>page.getByRole('button',{name:'Retry saving your changes',exact:true});
 async function tasks(){await page.getByRole('button',{name:'Show study tasks',exact:true}).click();await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).waitFor();}
 async function savedStatus(status){await page.waitForFunction(({wk,status})=>JSON.parse(localStorage.getItem(wk)).tasks.find(t=>t.id==='t1').status===status,{wk,status});}
 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);const before=await read(),protectedBefore=await records();
  if(['inbox','form','notes','reopen','focus','review'].includes(mode))await tasks();
  if(['form','notes','reopen'].includes(mode)){await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).click();await page.waitForURL(/\/today\/task\/t1$/);}
  if(mode==='save-error')await page.evaluate(()=>{window.__failWorkspace=true});
  if(mode==='form')await page.getByRole('button',{name:'Mark complete',exact:true}).click();
  else await complete().first().evaluate(e=>{e.click();e.click()});
  await undo().waitFor();await page.waitForTimeout(300);
  if(mode==='save-error'){
   await retry().waitFor();await page.screenshot({path:dir+`/recovery-${mode}-${reduced}.png`,fullPage:true});assert.deepEqual(await read(),before,'Failed save retains prior durable snapshot');
   const writes=await page.evaluate(()=>window.__primaryWrites);await page.evaluate(()=>{window.__failWorkspace=false});await retry().evaluate(e=>{e.click();e.click()});await savedStatus('completed');await retry().waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.__primaryWrites),writes+1,'Retry is single-flight');
  }else await savedStatus('completed');
  let completed=await read();assert.equal(completed.revision,before.revision+1,'One completion transaction for double taps');assert.equal(completed.tasks[0].actualMinutes,before.tasks[0].actualMinutes);assert.deepEqual(completed.history,before.history);assert.deepEqual(await records(),protectedBefore);
  if(mode==='successive'){
   await page.getByRole('button',{name:'Complete Maths worksheet',exact:true}).first().click();await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).tasks.every(t=>t.status==='completed'),wk);
   await undo().click();await page.getByText('Task reopened',{exact:true}).waitFor();const after=await read();assert.equal(after.tasks[0].status,'completed');assert.equal(after.tasks[1].status,'open');assert.equal(after.revision,before.revision+3);
  }else{
   if(mode==='notes'){await page.getByPlaceholder('Question numbers, pages, what counts as done…',{exact:true}).fill('Later notes');await page.getByRole('button',{name:/^Save task/}).click();await page.waitForURL(/\/today$/);await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).tasks[0].notes==='Later notes',wk);}
   if(mode==='reopen'){await page.getByRole('button',{name:'Reopen task',exact:true}).click();await page.waitForURL(/\/today$/);await savedStatus('open');}
   const latest=await read();
   if(mode==='undo-save-error')await page.evaluate(()=>{window.__failWorkspace=true});
   await undo().evaluate(e=>{e.click();e.click()});
   if(mode==='reopen'){
    await page.getByText('Your latest changes were kept',{exact:true}).waitFor();assert.deepEqual(await read(),latest,'Newer reopen is not overwritten or saved again');
   }else{
    await page.getByText('Task reopened',{exact:true}).waitFor();
    if(mode==='undo-save-error'){await retry().waitFor();await page.screenshot({path:dir+`/recovery-${mode}-${reduced}.png`,fullPage:true});assert.deepEqual(await read(),latest);await page.evaluate(()=>{window.__failWorkspace=false});await retry().click();await retry().waitFor({state:'detached'});}
    await savedStatus('open');const after=await read();assert.equal(after.revision,latest.revision+1);
    const restored=after.tasks[0],original=before.tasks[0];
    assert.equal(restored.planState,original.planState);assert.equal(restored.scheduledStart,original.scheduledStart);assert.equal(restored.scheduledEnd,original.scheduledEnd);assert.equal(restored.completedAt,original.completedAt);assert.equal(restored.actualMinutes,original.actualMinutes);
    if(mode==='notes'){assert.equal(restored.notes,'Later notes');assert.equal(restored.dueAt,latest.tasks[0].dueAt);}else assert.deepEqual(restored,{...original,updatedAt:restored.updatedAt});
    assert.deepEqual(after.history,before.history);assert.deepEqual(after.tasks[1],before.tasks[1]);
   }
  }
  assert.deepEqual(await records(),protectedBefore);assert.equal(await undo().count(),0);
  await page.screenshot({path:dir+`/completion-${mode}-${reduced}.png`,fullPage:true});const final=await read();await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),final);assert.equal(await undo().count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log(`✓ Completion ${mode}, reduced=${reduced}: guarded actions, live Undo, recovery, exact records and reload`);
 }catch(e){await page.screenshot({path:dir+'/completion-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
