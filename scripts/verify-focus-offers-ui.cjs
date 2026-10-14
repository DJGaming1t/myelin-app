// Optional Focus setup offer check; external Playwright/browser and Expo web only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {guideOfferStorageKey}=require(process.cwd()+'/src/features/guides/guide-offer-state.ts');
const fs=require('node:fs');
const dir=process.env.MYELIN_FOCUS_OFFER_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-focus-offer-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk=guideOfferStorageKey('local:device','focus'),tk=guideOfferStorageKey('local:device','today');
const cases=[['later',false],['later',true],['show',false],['show',true],['topic',true],['stored-later',true],['stored-shown',true],['no-target',true],['completed',true],['active',true],['break',true],['review',true],['manual',true],['empty-replay',true],['read-error',true],['write-error',true],['other-owner',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Solve a biology question',estimatedMinutes:25,planState:'today',now});w.tasks=[task];
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];
 if(mode==='completed'){task.status='completed';task.completedAt=now;}
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[tk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode.startsWith('stored-'))seed[gk]=JSON.stringify({version:1,choice:mode==='stored-later'?'later':'shown',at:now});
 if(mode==='other-owner')seed[guideOfferStorageKey('user:other','focus')]=JSON.stringify({version:1,choice:'later',at:now});
 if(mode==='active'||mode==='break'){
  const session=createFocusSession({taskId:task.id,topicName:task.title,subject:'Task',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Saved tiny step',now});
  if(mode==='break'){session.phase='break';session.focusLogged=true;session.focusActualMinutes=25;}
  seed[fk]=JSON.stringify(session);
 }
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:'attempt',answerDraft:'Saved answer',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,mode,gk})=>{
  if(!localStorage.getItem('focus-offer-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('focus-offer-seeded','1');}
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(mode==='read-error')Storage.prototype.getItem=function(key){if(key===gk)throw new Error('Synthetic preference read failure');return get.call(this,key);};
  if(mode==='write-error'){let failed=false;Storage.prototype.setItem=function(key,value){if(key===gk&&!failed){failed=true;throw new Error('Synthetic preference write failure');}return set.call(this,key,value);};}
 },{seed,mode,gk});
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk,ok,tk]);
 const preference=()=>page.evaluate(k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;},gk);
 const offer=()=>page.getByTestId('focus-guide-offer');
 const header=()=>page.getByRole('button',{name:'Teach me this screen',exact:true});
 async function skipTour(){await page.getByTestId('guide-spotlight').waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});}
 try{
  const query=['no-target','empty-replay'].includes(mode)?'':mode==='topic'?'?topicId=t1':'?taskId='+task.id;
  await page.goto(baseUrl+'/focus'+query,{waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(400);
  let before=await snapshot();assert.equal(await page.getByTestId('guide-card').count(),0,'Opening Focus never forces a guide or timer');
  if(['no-target','completed','active','break','review','empty-replay'].includes(mode)){
   assert.equal(await offer().count(),0);assert.equal(await preference(),null,'Suppression never consumes setup guidance');
   await header().click();await skipTour();assert.equal(await preference(),null,'Non-setup tours do not consume the setup offer');
   if(mode==='empty-replay'){
    await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('focus');await page.getByRole('button',{name:'Show me Focus',exact:true}).click();await skipTour();assert.equal(await preference(),null);
    await page.goto(baseUrl+'/focus?taskId='+task.id,{waitUntil:'networkidle'});await offer().waitFor();await page.getByRole('button',{name:'Maybe later for Focus’s tutorial',exact:true}).click();await offer().waitFor({state:'detached'});assert.equal((await preference()).choice,'later');
   }
  }else if(mode==='read-error'){
   assert.equal(await offer().count(),0);await header().click();await skipTour();
  }else if(mode.startsWith('stored-')){
   assert.equal(await offer().count(),0);await header().click();await skipTour();
  }else{
   await offer().waitFor();await page.getByRole('button',{name:'Focus for 25 minutes',exact:true}).click();await page.getByRole('textbox',{name:'First tiny step',exact:true}).fill('Read the question carefully');
   before=await snapshot();const launch=await page.getByTestId('guide-focus-support').boundingBox(),box=await offer().boundingBox();assert.ok(launch&&box&&box.y>=launch.y+launch.height,'Start controls precede the optional offer');
   await offer().scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/focus-offer-${mode}-${reduced}.png`,fullPage:true});
   if(mode==='show'){
    await page.getByRole('button',{name:'Show me Focus’s tutorial',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByRole('button',{name:'Finish tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});assert.equal((await preference()).choice,'shown');
   }else if(mode==='manual'){
    await header().click();await skipTour();assert.equal((await preference()).choice,'shown');
   }else{
    await page.getByRole('button',{name:'Maybe later for Focus’s tutorial',exact:true}).click();await offer().waitFor({state:'detached'});
    if(mode==='write-error'){
     await page.getByTestId('focus-guide-choice-error').waitFor();assert.equal(await preference(),null);await page.getByRole('button',{name:'Retry saving tutorial choice',exact:true}).click();await page.getByTestId('focus-guide-choice-error').waitFor({state:'detached'});
    }
    assert.equal((await preference()).choice,'later');await header().click();await skipTour();
   }
   assert.equal(await offer().count(),0);assert.deepEqual(await snapshot(),before,'Choice and tour do not start timers or change study/onboarding/Today preference');
   assert.equal(await page.getByRole('textbox',{name:'First tiny step',exact:true}).inputValue(),'Read the question carefully');await page.getByRole('button',{name:/^Start 25-minute focus/}).waitFor();
   if(mode==='show'&&!reduced){
    await page.getByRole('button',{name:/^Start 25-minute focus/}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
    const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),fk);assert.equal(saved.taskId,task.id);assert.equal(saved.plannedFocusMinutes,25);assert.equal(saved.tinyStep,'Read the question carefully');
    const work=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);assert.equal(work.focusOutcomes.filter(o=>o.status==='started').length,1);assert.equal(work.tasks[0].actualMinutes,0);
    before=await snapshot();
   }
   await page.reload({waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(300);assert.equal(await offer().count(),0);assert.equal(await page.getByTestId('guide-card').count(),0);
   await page.goto(baseUrl+'/focus?topicId=t1',{waitUntil:'networkidle'});await header().waitFor();assert.equal(await offer().count(),0,'Choice is per screen/owner, not per task or topic');
   if(mode==='other-owner'){const other=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),guideOfferStorageKey('user:other','focus'));assert.equal(other.choice,'later');assert.equal(other.at,now);}
  }
  assert.deepEqual(await snapshot(),before,'Offer, replay and retry preserve domain data and Today preference');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Focus offer ${mode}, reduced=${reduced}: setup-only choice, preserved inputs/sessions and independent preferences`);
 }catch(e){await page.screenshot({path:dir+'/focus-offer-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
