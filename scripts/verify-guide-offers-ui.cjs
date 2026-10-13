// Optional first-open Today offer checks; external Playwright/browser and Expo web only.
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
const dir=process.env.MYELIN_OFFER_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-offer-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk=guideOfferStorageKey('local:device','today');
const cases=[['later',false],['later',true],['show',false],['show',true],['stored-later',true],['stored-shown',true],['focus',true],['review',true],['manual',true],['read-error',true],['write-error',true],['other-owner',true],['corrupt',true],['onboarding',false],['onboarding',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const task=createStudyTask({title:'Prepare a biology outline',estimatedMinutes:25,planState:'today',now});
 if(mode!=='onboarding')w.tasks=[task];
 const seed={'myelin.auth.local-mode':'1'};
 if(mode!=='onboarding')seed[ok]=JSON.stringify({version:1,outcome:'completed',finishedAt:now});
 if(mode.startsWith('stored-'))seed[gk]=JSON.stringify({version:1,choice:mode==='stored-later'?'later':'shown',at:now});
 if(mode==='other-owner')seed[guideOfferStorageKey('user:other','today')]=JSON.stringify({version:1,choice:'later',at:now});
 if(mode==='corrupt')seed[gk]='{invalid json';
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({taskId:task.id,topicName:task.title,subject:'Task',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notes',now}));
 if(mode==='review'){
  const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];
  seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'partial',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});
 }
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,mode,gk})=>{
  if(!localStorage.getItem('offer-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('offer-seeded','1');}
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(mode==='read-error')Storage.prototype.getItem=function(key){if(key===gk)throw new Error('Synthetic preference read failure');return get.call(this,key);};
  if(mode==='write-error'){let failed=false;Storage.prototype.setItem=function(key,value){if(key===gk&&!failed){failed=true;throw new Error('Synthetic preference write failure');}return set.call(this,key,value);};}
 },{seed,mode,gk});
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk,ok]);
 const preference=()=>page.evaluate(k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;},gk);
 const offer=()=>page.getByTestId('today-guide-offer');
 const header=()=>page.getByRole('button',{name:'Teach me this screen',exact:true});
 const later=()=>page.getByRole('button',{name:'Maybe later for Today’s tutorial',exact:true});
 async function skipTour(){await page.getByTestId('guide-spotlight').waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});}
 try{
  await page.goto(baseUrl+'/today',{waitUntil:'networkidle'});
  if(mode==='onboarding'){
   await page.getByRole('button',{name:'Skip',exact:true}).waitFor();assert.equal(await offer().count(),0);assert.equal(await page.getByTestId('guide-card').count(),0);
   const original=await page.evaluate(k=>localStorage.getItem(k),wk);await page.getByRole('button',{name:'Skip',exact:true}).click();await header().waitFor();await offer().waitFor();
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),wk),original,'Skipping setup only records onboarding');
  }
  await header().waitFor();await page.waitForTimeout(500);const before=await snapshot();
  assert.equal(await page.getByTestId('guide-card').count(),0,'Opening Today never forces a tutorial');
  if(['stored-later','stored-shown','focus','review','read-error'].includes(mode)){
   assert.equal(await offer().count(),0,'Restored preferences and active sessions suppress the offer');
   if(mode==='focus'||mode==='review'){assert.equal(await preference(),null,'Suppression never dismisses an unseen guide');await page.reload({waitUntil:'networkidle'});await header().waitFor();assert.equal(await offer().count(),0);}
   else {await header().click();await skipTour();}
  }else{
   await offer().waitFor();const a=await page.getByTestId('guide-today-next').boundingBox(),b=await offer().boundingBox();assert.ok(a&&b&&b.y>=a.y+a.height,'Main action comes before the optional tour');
   await offer().scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/offer-${mode}-${reduced}.png`,fullPage:true});
   if(mode==='show'){
    await page.getByRole('button',{name:'Show me Today’s tutorial',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();assert.equal(await offer().count(),0);
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByRole('button',{name:'Finish tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});
    assert.equal((await preference()).choice,'shown');
   }else if(mode==='manual'){
    await header().click();await skipTour();assert.equal((await preference()).choice,'shown');assert.equal(await offer().count(),0);
   }else{
    await later().click();await offer().waitFor({state:'detached'});
    if(mode==='write-error'){
     await page.getByTestId('today-guide-choice-error').waitFor();assert.equal(await preference(),null);assert.equal(await page.getByTestId('guide-card').count(),0);
     await page.getByRole('button',{name:'Retry saving tutorial choice',exact:true}).click();await page.getByTestId('today-guide-choice-error').waitFor({state:'detached'});
    }
    assert.equal((await preference()).choice,'later');assert.equal(await page.getByTestId('guide-card').count(),0);
    await header().click();await skipTour();
   }
   await page.reload({waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(300);assert.equal(await offer().count(),0);assert.equal(await page.getByTestId('guide-card').count(),0);
   if(mode==='other-owner'){const other=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),guideOfferStorageKey('user:other','today'));assert.equal(other.choice,'later');assert.equal(other.at,now);}
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('today');await page.getByRole('button',{name:'Show me Today',exact:true}).click();await skipTour();assert.equal(await offer().count(),0);
  }
  assert.deepEqual(await snapshot(),before,'Offer, dismissal, replay and retry preserve workspace, sessions and onboarding');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Today offer ${mode}, reduced=${reduced}: optional placement, remembered choice, replay and data preservation`);
 }catch(e){await page.screenshot({path:dir+'/offer-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
