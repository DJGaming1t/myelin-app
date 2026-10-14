// Optional task editor preservation and explicit edits flows; external browser only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_EDIT_SCREENSHOTS||fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-task-edit-ui-'));
const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk='@myelin/guide-offers/v1/local%3Adevice/today';
const modes=['notes_today','notes_tomorrow','notes_custom','notes_none','scheduled','postponed','zero','manual_time','today_choice','tomorrow_choice','choose_due','remove_due','add','complete','reopen','focus','review'];
(async()=>{let browser;try{for(const [mode,reduced] of modes.flatMap(m=>[false,true].map(r=>[m,r])).filter(([m])=>!process.env.MYELIN_EDIT_CASES||process.env.MYELIN_EDIT_CASES.split(',').includes(m))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Biology notebook',subject:'Biology',priority:3,estimatedMinutes:25,planState:'today',dueAt:now+6*3600000,now});task.id='t1';task.notes='Existing notes';task.actualMinutes=3;task.dueAt+=12345;
 if(mode==='notes_tomorrow')task.dueAt+=86400000;if(mode==='notes_custom')task.dueAt+=5*86400000;if(mode==='notes_none')task.dueAt=0;
 if(mode==='postponed'){task.planState='postponed';task.postponedUntil=now+86400000;task.postponements=2;}
 if(mode==='zero')task.estimatedMinutes=0;
 if(mode==='scheduled'){task.planState='scheduled';task.scheduledStart=now+3600000;task.scheduledEnd=task.scheduledStart+25*60000;}
 const other=createStudyTask({title:'Maths worksheet',subject:'Maths',priority:1,estimatedMinutes:25,planState:'today',now});other.id='t2';w.tasks=[task,other];
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[gk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:'t1',topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review'){const t=createTopic({name:'Cells',subject:'Biology',priority:2,status:'review',estimate:25,notes:''},now,'topic1');t.cards=[createQuestion({prompt:'Mitosis?',answer:'Division',hint:''},now,'c1')];w.topics=[t];seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});}
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(seed=>{if(!localStorage.getItem('task-edit-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('task-edit-seeded','1');}},seed);
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk),records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[fk,rk,ok,gk]);
 const undo=()=>page.getByRole('button',{name:'Undo task completion',exact:true});
 async function tasks(){await page.getByRole('button',{name:'Show study tasks',exact:true}).click();await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).waitFor();}

 try{
  await page.goto(base+'/today',{waitUntil:'networkidle'});await page.waitForTimeout(450);let before=await read();const protectedBefore=await records();
  if(mode==='add'){await tasks();await page.getByRole('button',{name:'Add study task',exact:true}).click();await page.getByPlaceholder('Finish Maths Exercise 5.2',{exact:true}).fill('New task');}
  else{await tasks();await page.getByRole('button',{name:'Edit Biology notebook',exact:true}).click();await page.waitForURL(/\/today\/task\/t1$/);}
  if(mode==='reopen'){await page.getByRole('button',{name:'Complete Biology notebook',exact:true}).click();await page.getByRole('button',{name:'Reopen task',exact:true}).waitFor();await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).tasks[0].status==='completed',wk);before=await read();}
  const notes=page.getByPlaceholder('Question numbers, pages, what counts as done…',{exact:true});await notes.fill('Updated notes');
  if(mode==='manual_time')await page.getByRole('textbox',{name:'Time already done in minutes',exact:true}).fill('7');
  if(mode==='choose_due'){
   await page.getByRole('button',{name:'Choose date',exact:true}).click();await page.getByRole('textbox',{name:'Due date',exact:true}).fill('2026-02-30');
   await page.getByRole('button',{name:/^Save task/}).click();await page.getByText(/Use a valid due date and time/).waitFor();assert.deepEqual(await read(),before);
   await page.getByRole('textbox',{name:'Due date',exact:true}).fill('2026-10-16');await page.getByRole('textbox',{name:'Due time',exact:true}).fill('17:45');
  }
  if(mode==='today_choice'||mode==='tomorrow_choice')await page.getByRole('button',{name:mode==='today_choice'?'Today':'Tomorrow',exact:true}).last().click();
  if(mode==='notes_today'){await page.getByText('Saved deadline:',{exact:false}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/deadline-${reduced}.png`,fullPage:true});}
  if(mode==='choose_due'){await page.getByRole('textbox',{name:'Due date',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/custom-date-${reduced}.png`,fullPage:true});}
  if(mode==='remove_due')await page.getByRole('button',{name:'No date',exact:true}).click();
  const label=mode==='add'?/^Add to Inbox/:mode==='complete'?'Mark complete':mode==='reopen'?'Reopen task':/^Save task/;
  await page.getByRole('button',{name:label}).evaluate(e=>{e.click();e.click()});await page.waitForURL(/\/today$/);
  await page.waitForFunction(({wk,revision})=>JSON.parse(localStorage.getItem(wk)).revision===revision,{wk,revision:before.revision+1});
  const after=await read();assert.equal(after.revision,before.revision+1);assert.deepEqual(after.history,before.history);assert.deepEqual(await records(),protectedBefore);
  if(mode==='add'){assert.equal(after.tasks.length,before.tasks.length+1);assert.equal(after.tasks.filter(t=>t.title==='New task').length,1);assert.equal(after.tasks.at(-1).notes,'Updated notes');assert.deepEqual(after.tasks.slice(0,-1),before.tasks);}
  else{
   const old=before.tasks[0],task=after.tasks[0];assert.deepEqual(after.tasks[1],before.tasks[1]);
   if(mode==='complete'||mode==='reopen'){
    assert.equal(task.status,mode==='complete'?'completed':'open');assert.equal(task.notes,old.notes);assert.equal(task.dueAt,old.dueAt);assert.equal(task.actualMinutes,old.actualMinutes);
    if(mode==='complete')await undo().waitFor();
   }else{
    const expected={...old,notes:'Updated notes',updatedAt:task.updatedAt};
    if(mode==='manual_time')expected.actualMinutes=7;
    if(mode==='choose_due')expected.dueAt=new Date('2026-10-16T17:45:00+05:30').getTime();
    if(mode==='remove_due')expected.dueAt=0;
    if(mode==='today_choice')expected.dueAt=new Date('2026-10-14T23:59:00+05:30').getTime();
    if(mode==='tomorrow_choice')expected.dueAt=new Date('2026-10-15T23:59:00+05:30').getTime();
    assert.deepEqual(task,expected,'Only explicitly edited fields change, including exact deadlines, schedule and study minutes');
   }
  }
  await page.waitForTimeout(450);await page.screenshot({path:dir+`/edit-${mode}-${reduced}.png`,fullPage:true});const final=await read();await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),final);assert.deepEqual(await records(),protectedBefore);assert.equal(await undo().count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  console.log(`✓ Task edit ${mode}, reduced=${reduced}: exact fields, guarded double taps, protected records and reload`);
 }catch(e){await page.screenshot({path:dir+'/edit-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
