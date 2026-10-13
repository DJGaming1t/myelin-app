// Optional real Review tutorial flow check; needs external Playwright/browser and Expo web.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {reviewGuideSteps}=require(process.cwd()+'/src/features/guides/guide-registry.ts');
const fs=require('node:fs');
const dir=process.env.MYELIN_REVIEW_GUIDE_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-review-guide-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
const cases=[['ready',false],['empty',true],['empty-topic',true],['waiting',true],['topic-ready',true],['practice',true],['blocked',true],['blocked-saved',true],['attempt',false],['attempt',true],['attempt-blank',true],['attempt-hinted',true],['reference',false],['reference',true],['reference-long',true],['replay-auto-start',true],['normal-auto-start',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-05T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:mode==='reference-long'?'An explanation of cell division. '.repeat(120):'Cell division',hint:'Think about daughter cells'},now,'c1'),createQuestion({prompt:'What is meiosis?',answer:'Division that produces gametes',hint:''},now,'c2')];
 if(['waiting','practice'].includes(mode))topic.cards.forEach(c=>{c.reps=1;c.dueAt=now+86400000;});
 if(mode==='empty-topic')topic.cards=[];
 if(mode!=='empty')w.topics=[topic];
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now})};
 const active=mode.startsWith('attempt')||mode.startsWith('reference')||mode==='blocked-saved';
 if(active)seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:mode.startsWith('reference')?'reference':'attempt',answerDraft:mode==='attempt-blank'?'':'Saved answer',confidence:'partial',hintUsed:mode==='attempt-hinted',cardStartedAt:now,attemptId:'a1',completedCards:0});
 if(mode.startsWith('blocked'))seed[fk]=JSON.stringify(createFocusSession({topicId:'t1',topicName:topic.name,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open the question',now}));
 seed[wk]=JSON.stringify(w);
 await page.addInitScript(seed=>{if(!localStorage.getItem('review-guide-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('review-guide-seeded','1');}},seed);
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk]);
 const state=mode==='blocked-saved'?'blocked':mode==='replay-auto-start'?'topic-ready':mode==='normal-auto-start'?'attempt':mode.startsWith('attempt')?'attempt':mode.startsWith('reference')?'reference':mode;
 async function highlight(anchor){
  await page.getByTestId('guide-spotlight').waitFor();await page.waitForTimeout(250);
  const a=await page.getByTestId('guide-'+anchor.replace('.','-')).boundingBox();
  const r=await page.getByTestId('guide-spotlight').boundingBox(),c=await page.getByTestId('guide-card').boundingBox();
  assert.ok(a&&r&&c);assert.ok(Math.abs(r.x-a.x+5)<2&&Math.abs(r.y-a.y+5)<2,JSON.stringify({a,r}));
  assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=321&&c.y+c.height<=569,'Card stays in viewport');
  assert.ok(c.y>=r.y+r.height-1||c.y+c.height<=r.y+1,'Card leaves highlighted control visible');
 }
 try{
  const query=mode==='normal-auto-start'?'?topicId=t1&autoStart=1&source=focus':mode==='replay-auto-start'?'?topicId=t1&autoStart=1&source=focus&guide=review':['topic-ready','empty-topic','practice'].includes(mode)?'?topicId=t1':'';
  await page.goto(baseUrl+'/review'+query,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).waitFor();await page.waitForTimeout(500);
  if(mode==='attempt'&&!reduced){await page.getByRole('textbox',{name:'Your recall answer',exact:true}).fill('A live answer draft');await page.waitForTimeout(600);}
  const before=await snapshot();
  if(mode==='replay-auto-start')assert.equal(before[2],null,'Replay must not create a Review session before showing its tour');
  if(mode==='normal-auto-start'){const restored=JSON.parse(before[2]);assert.equal(restored.currentIndex,0);assert.equal(restored.stage,'attempt');assert.equal(restored.queue.length,2,'Regular post-Focus recall still starts its capped queue');}
  if(mode!=='replay-auto-start')await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();
  const steps=reviewGuideSteps(state);
  for(let i=0;i<steps.length;i++){
   await page.getByText(steps[i].title,{exact:true}).waitFor();await highlight(steps[i].anchor);
   await page.screenshot({path:dir+`/review-guide-${mode}-${reduced}-${i}.png`,fullPage:true});
   if(i===1){await page.getByRole('button',{name:'Previous tutorial step',exact:true}).click();await highlight(steps[0].anchor);await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await highlight(steps[1].anchor);}
   await page.getByRole('button',{name:i===steps.length-1?'Finish tutorial':'Next tutorial step',exact:true}).click();
  }
  await page.getByTestId('guide-card').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before,'Tour preserves workspace, Focus, queue, draft, confidence, hint state, stage and schedule');
  if(mode==='attempt-blank')assert.equal(await page.getByRole('button',{name:'Show reference answer',exact:true}).isEnabled(),false,'Tour never unlocks blank-answer reveal');
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before);
  if(['empty','attempt-hinted'].includes(mode)){
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('review');
   await page.getByRole('button',{name:'Show me Review',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();assert.ok(!page.url().includes('guide='));
   await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0);assert.deepEqual(await snapshot(),before);
  }
  if(mode==='replay-auto-start'){
   assert.ok(!page.url().includes('autoStart=1')&&!page.url().includes('guide='));await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0);assert.deepEqual(await snapshot(),before,'Conflicting replay request never starts recall, even after reload');
  }
  if(mode==='attempt'&&!reduced){
   await page.getByRole('button',{name:'Show reference answer',exact:true}).click();await page.getByText('COMPARE, THEN GRADE',{exact:true}).waitFor();
   await page.getByRole('button',{name:/^Good\./}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();await page.waitForTimeout(400);
   const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);assert.equal(saved.history.filter(h=>h.reviewAttemptId==='a1').length,1,'Explicit grading records exactly once');
   const session=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk);assert.equal(session.currentIndex,1);assert.equal(session.stage,'attempt');assert.equal(session.answerDraft,'');
   await page.reload({waitUntil:'networkidle'});const recovered=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);assert.equal(recovered.history.filter(h=>h.reviewAttemptId==='a1').length,1);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Review guide ${mode}, reduced=${reduced}: actual anchors, compact placement, tutorial navigation and data preservation`);
 }catch(e){await page.screenshot({path:dir+'/review-guide-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
