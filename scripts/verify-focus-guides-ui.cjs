// Optional Focus tutorial flow check; needs external Playwright/browser and Expo web.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {focusGuideSteps}=require(process.cwd()+'/src/features/guides/guide-registry.ts');
const dir=process.env.MYELIN_FOCUS_GUIDE_SCREENSHOTS || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-focus-guide-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
(async()=>{let browser;
try{for(const [mode,reduced] of [['setup',false],['setup',true],['active',false],['paused',true],['checkpoint',true],['finish',true],['break',true],['break-done',true],['empty',true],['review',true],['break-recall',true]]){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-05T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Solve a biology question',estimatedMinutes:25,planState:'today',now});w.tasks=[task];
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now})};
 if(mode==='break-recall'){const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];task.topicId=topic.id;}
 if(!['setup','empty','review'].includes(mode)){
  const s=createFocusSession({taskId:task.id,...(mode==='break-recall'?{topicId:'t1'}:{}),topicName:task.title,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:mode==='checkpoint'?'five-minute':'full',tinyStep:'Open the question',now});
  if(mode==='paused')s.runningSince=null;
  if(mode==='checkpoint'){s.runningSince=null;s.elapsedMs=5*60000;}
  if(mode==='finish'){s.runningSince=null;s.elapsedMs=25*60000;}
  if(mode.startsWith('break')){s.phase='break';s.focusLogged=true;s.focusActualMinutes=25;s.distractions=[{id:'d1',text:'Check the example later',createdAt:now}];if(mode==='break-done'||mode==='break-recall'){s.runningSince=null;s.elapsedMs=5*60000;}}
  seed[fk]=JSON.stringify(s);
 }
 if(mode==='review'){
  const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];
  seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:'attempt',answerDraft:'Saved answer',confidence:'unsure',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});
 }
 seed[wk]=JSON.stringify(w);
 await page.addInitScript(seed=>{if(!localStorage.getItem('focus-guide-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('focus-guide-seeded','1');}},seed);
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk]);
 async function highlight(anchor){
  await page.getByTestId('guide-spotlight').waitFor();await page.waitForTimeout(250);
  const a=await page.getByTestId(anchor.replace('.','-').replace('focus-','guide-focus-')).boundingBox();
  const r=await page.getByTestId('guide-spotlight').boundingBox(),c=await page.getByTestId('guide-card').boundingBox();
  assert.ok(a&&r&&c);assert.ok(Math.abs(r.x-a.x+5)<2&&Math.abs(r.y-a.y+5)<2,JSON.stringify({a,r}));
  assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=321&&c.y+c.height<=569,'Card stays in viewport');
  assert.ok(c.y>=r.y+r.height-1||c.y+c.height<=r.y+1,'Card leaves control visible');
 }
 try{
  await page.goto(baseUrl+'/focus'+(mode==='setup'?'?taskId='+task.id:''),{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).waitFor();await page.waitForTimeout(400);
  if(mode==='setup')await page.getByRole('textbox',{name:'First tiny step',exact:true}).fill('Read the question carefully');
  const before=await snapshot();
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();
  const steps=focusGuideSteps(mode==='paused'?'active':mode==='break-recall'?'break-done':mode);
  for(let i=0;i<steps.length;i++){
   await page.getByText(steps[i].title,{exact:true}).waitFor();await highlight(steps[i].anchor);
   if(i===0)await page.screenshot({path:dir+`/focus-guide-${mode}-${reduced}.png`,fullPage:true});
   if(i===1){await page.getByRole('button',{name:'Previous tutorial step',exact:true}).click();await highlight(steps[0].anchor);await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await highlight(steps[1].anchor);}
   await page.getByRole('button',{name:i===steps.length-1?'Finish tutorial':'Next tutorial step',exact:true}).click();
  }
  await page.getByTestId('guide-card').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before,'Tour preserves workspace, session, phase, runningSince, distractions and Review draft');
  if(mode==='setup')assert.equal(await page.getByRole('textbox',{name:'First tiny step',exact:true}).inputValue(),'Read the question carefully');
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});
  if(mode==='checkpoint'){
   await page.getByRole('button',{name:'Finish after five minutes',exact:true}).click();await page.getByRole('button',{name:'Complete focus',exact:true}).waitFor();
   await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByText('Rate the demand, not yourself',{exact:true}).waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();
   await page.getByRole('button',{name:'Complete focus',exact:true}).click();await page.getByText('Leave the work alone.',{exact:true}).waitFor();
   const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);assert.equal(saved.focusOutcomes.filter(h=>h.status==='finished').length,1,'Five-minute finish records once');assert.equal(saved.tasks[0].actualMinutes,5);await page.reload({waitUntil:'networkidle'});const recovered=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);assert.equal(recovered.tasks[0].actualMinutes,5,'Reload does not double-count launch');
  }
  if(mode==='active'){
   // Time advances naturally without the tour pausing or restarting the session.
   await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.clock.setFixedTime(now+26*60000);
   await page.getByText('Rate the demand, not yourself',{exact:true}).waitFor();await highlight('focus.primary');await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();
   assert.deepEqual(await snapshot(),before,'Timer expiry inside the tour does not auto-save');
  }
  if(mode==='empty'||mode==='paused'){
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('focus');
   await page.getByRole('button',{name:'Show me Focus',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();
   assert.ok(!page.url().includes('guide='));await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();
   await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0);assert.deepEqual(await snapshot(),before);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Focus guide ${mode}, reduced=${reduced}: actual anchors, Back/Next/Done/Skip, compact placement and data preservation`);
 }catch(e){await page.screenshot({path:dir+'/focus-guide-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
