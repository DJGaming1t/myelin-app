// Optional browser regression: start Expo web, then run node --import tsx scripts/verify-focus-ui.cjs.
// Requires an external Playwright installation/browser; no app dependency is added.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const dir=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-focus-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
(async()=>{let browser;
try{for(const reduced of [false,true])for(const mode of ['checkpoint','continue','paused','break','retrieve','skip-recall']){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-07T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];
 const task=createStudyTask({title:'Solve a biology question',estimatedMinutes:25,planState:'today',now});w.tasks=[task];
 const withTopic=['break','retrieve','skip-recall'].includes(mode);
 const s=createFocusSession({...(withTopic?{topicId:topic.id}:{taskId:task.id}),topicName:withTopic?topic.name:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:['checkpoint','continue'].includes(mode)?'five-minute':'full',tinyStep:'Open the question',now});
 if(['checkpoint','continue'].includes(mode)){s.runningSince=null;s.elapsedMs=5*60000;}
 if(mode==='paused'){s.runningSince=null;s.elapsedMs=2*60000;}
 if(withTopic){s.phase='break';s.focusLogged=true;s.focusActualMinutes=25;s.distractions=Array.from({length:8},(_,i)=>({id:'d'+i,text:'Check saved thought number '+i,createdAt:now}));if(mode!=='break'){s.runningSince=null;s.elapsedMs=5*60000;}}
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w),[fk]:JSON.stringify(s)};
 await page.addInitScript(seed=>{if(!localStorage.getItem('current-focus-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('current-focus-seeded','1');}},seed);
 const stored=k=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),k);
 async function reachable(name){const button=page.getByRole('button',{name:name.startsWith('Continue to')?new RegExp('^'+name):name,exact:true});await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=321&&b.y+b.height<=569,'Reachable button: '+name);return button;}
 try{
  await page.goto(baseUrl+'/focus',{waitUntil:'networkidle'});
  if(mode==='checkpoint'){
   await (await reachable('Finish after five minutes')).click();await page.getByRole('button',{name:'Complete focus',exact:true}).waitFor();
   await page.getByRole('button',{name:'Effort 4 out of 5',exact:true}).click();await (await reachable('Complete focus')).click();
   await page.getByText('Leave the work alone.',{exact:true}).waitFor();
   let saved=await stored(wk);assert.equal(saved.tasks[0].actualMinutes,5);assert.equal(saved.focusOutcomes.filter(x=>x.status==='finished').length,1);assert.equal((await stored(fk)).phase,'break');
   await page.reload({waitUntil:'networkidle'});saved=await stored(wk);assert.equal(saved.tasks[0].actualMinutes,5);assert.equal(saved.focusOutcomes.filter(x=>x.status==='finished').length,1);
  }else if(mode==='continue'){
   await (await reachable('Continue to 25 minutes')).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();const saved=await stored(fk);assert.equal(saved.plannedFocusMinutes,25);assert.equal(saved.elapsedMs,5*60000);assert.equal((await stored(wk)).tasks[0].actualMinutes,0);
  }else if(mode==='paused'){
   await page.getByText('Timer paused',{exact:true}).waitFor();await (await reachable('Resume')).click();await page.getByText('Timer stays active',{exact:true}).waitFor();await (await reachable('Pause')).click();await page.getByText('Timer paused',{exact:true}).waitFor();
  }else if(mode==='break'){
   await (await reachable('Pause')).click();await page.getByText('Timer paused',{exact:true}).waitFor();await (await reachable('Resume')).click();await page.getByText('Timer stays active',{exact:true}).waitFor();await (await reachable('End break')).click();await page.waitForURL('**/today');assert.equal(await stored(fk),null);
  }else{
   await page.getByText('Timer complete',{exact:true}).waitFor();const btn=await reachable(mode==='retrieve'?'Finish break and retrieve 1 recall prompts':'Finish break without recall');await page.screenshot({path:dir+'/current-focus-'+mode+'-'+reduced+'.png'});await btn.click();
   await page.waitForURL(mode==='retrieve'?'**/review**':'**/today');assert.equal(await stored(fk),null);
   if(mode==='retrieve'){await page.getByText('What is mitosis?',{exact:true}).waitFor();const review=await stored(rk);assert.equal(review.queue.length,1);assert.equal(review.queue[0].topicId,topic.id);}else assert.equal(await stored(rk),null);
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS',mode,'reduced='+reduced);
 }catch(e){await page.screenshot({path:dir+'/current-focus-failure.png'});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
