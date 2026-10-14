// Optional Review attempt offer checks; external Playwright/browser and Expo web only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {guideOfferStorageKey}=require(process.cwd()+'/src/features/guides/guide-offer-state.ts');
const fs=require('node:fs');
const dir=process.env.MYELIN_REVIEW_OFFER_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-review-offer-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk=guideOfferStorageKey('local:device','review'),tk=guideOfferStorageKey('local:device','today'),pk=guideOfferStorageKey('local:device','focus');
const cases=[['later',false],['later',true],['show',false],['show',true],['blank',true],['hinted',true],['stored-later',true],['stored-shown',true],['focus-blocked',true],['idle',true],['reference',true],['manual',true],['idle-replay',true],['read-error',true],['write-error',true],['other-owner',true],['pending-draft',true],['reference-to-next',true],['auto-start',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:'Think about daughter cells'},now,'c1'),createQuestion({prompt:'What is meiosis?',answer:'Gamete formation',hint:'Think about gametes'},now,'c2')];w.topics=[topic];
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[tk]:JSON.stringify({version:1,choice:'later',at:now}),[pk]:JSON.stringify({version:1,choice:'shown',at:now})};
 if(mode.startsWith('stored-'))seed[gk]=JSON.stringify({version:1,choice:mode==='stored-later'?'later':'shown',at:now});
 if(mode==='other-owner')seed[guideOfferStorageKey('user:other','review')]=JSON.stringify({version:1,choice:'later',at:now});
 if(!['idle','idle-replay','auto-start'].includes(mode))seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:mode.startsWith('reference')?'reference':'attempt',answerDraft:mode==='blank'?'':'Saved answer',confidence:'partial',hintUsed:mode==='hinted',cardStartedAt:now,attemptId:'a1',completedCards:0});
 if(mode==='focus-blocked')seed[fk]=JSON.stringify(createFocusSession({topicId:'t1',topicName:topic.name,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Saved tiny step',now}));
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,mode,gk})=>{
  if(!localStorage.getItem('review-offer-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('review-offer-seeded','1');}
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(mode==='read-error')Storage.prototype.getItem=function(key){if(key===gk)throw new Error('Synthetic preference read failure');return get.call(this,key);};
  if(mode==='write-error'){let failed=false;Storage.prototype.setItem=function(key,value){if(key===gk&&!failed){failed=true;throw new Error('Synthetic preference write failure');}return set.call(this,key,value);};}
 },{seed,mode,gk});
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk,ok,tk,pk]);
 const preference=()=>page.evaluate(k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;},gk);
 const offer=()=>page.getByTestId('review-guide-offer');
 const header=()=>page.getByRole('button',{name:'Teach me this screen',exact:true});
 async function skipTour(){await page.getByTestId('guide-spotlight').waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});}
 async function later(){await page.getByRole('button',{name:'Maybe later for Review’s tutorial',exact:true}).click();await offer().waitFor({state:'detached'});}
 try{
  await page.goto(baseUrl+'/review'+(mode==='auto-start'?'?topicId=t1&autoStart=1&source=focus':''),{waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(500);
  let before=await snapshot();assert.equal(await page.getByTestId('guide-card').count(),0,'Opening Review never forces a tutorial');
  if(['focus-blocked','idle','reference','reference-to-next','idle-replay'].includes(mode)){
   assert.equal(await offer().count(),0);assert.equal(await preference(),null,'Suppressed stages do not consume attempt guidance');await header().click();await skipTour();assert.equal(await preference(),null,'Other Review tours do not consume the attempt offer');
   if(mode==='reference-to-next'){
    await page.getByRole('button',{name:/^Good\./}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();await offer().waitFor();await page.waitForTimeout(400);
    const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk);assert.equal(saved.currentIndex,1);assert.equal(saved.stage,'attempt');assert.equal(saved.answerDraft,'');before=await snapshot();await later();assert.equal((await preference()).choice,'later');
   }
   if(mode==='idle-replay'){
    await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('review');await page.getByRole('button',{name:'Show me Review',exact:true}).click();await skipTour();assert.equal(await preference(),null);assert.equal(await page.evaluate(k=>localStorage.getItem(k),rk),null);
    await page.getByRole('button',{name:/^Start mixed review/}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();await offer().waitFor();before=await snapshot();await later();assert.equal((await preference()).choice,'later');
   }
  }else if(mode==='read-error'||mode.startsWith('stored-')){
   assert.equal(await offer().count(),0);await header().click();await skipTour();
  }else{
   await offer().waitFor();const control=await page.getByTestId('guide-review-support').boundingBox(),box=await offer().boundingBox();assert.ok(control&&box&&box.y>=control.y+control.height,'Answer controls precede the optional offer');
   await offer().scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/review-offer-${mode}-${reduced}.png`,fullPage:true});
   if(mode==='show'||mode==='pending-draft'){
    if(mode==='pending-draft')await page.getByRole('textbox',{name:'Your recall answer',exact:true}).fill('A live draft kept during the tour');
    await page.getByRole('button',{name:'Show me Review’s tutorial',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByRole('button',{name:'Finish tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});assert.equal((await preference()).choice,'shown');
    if(mode==='pending-draft'){
     await page.waitForTimeout(500);const after=await snapshot(),expected=JSON.parse(before[2]);expected.answerDraft='A live draft kept during the tour';assert.deepEqual(JSON.parse(after[2]),expected,'Only the user-typed draft autosaves; stage/index/confidence/hint/timing stay intact');assert.deepEqual(after.filter((_,i)=>i!==2),before.filter((_,i)=>i!==2));before=after;
    }
   }else if(mode==='manual'){
    await header().click();await skipTour();assert.equal((await preference()).choice,'shown');
   }else{
    await later();
    if(mode==='write-error'){
     await page.getByTestId('review-guide-choice-error').waitFor();assert.equal(await preference(),null);await page.getByRole('button',{name:'Retry saving tutorial choice',exact:true}).click();await page.getByTestId('review-guide-choice-error').waitFor({state:'detached'});
    }
    assert.equal((await preference()).choice,'later');await header().click();await skipTour();
   }
   assert.equal(await offer().count(),0);assert.deepEqual(await snapshot(),before,'Choice and tour leave study data, sessions and other preferences intact');
   const current=JSON.parse(before[2]);assert.equal(await page.getByRole('textbox',{name:'Your recall answer',exact:true}).inputValue(),current.answerDraft);
   if(mode==='blank')assert.equal(await page.getByRole('button',{name:'Show reference answer',exact:true}).isEnabled(),false,'Tour never unlocks a blank attempt');
   if(mode==='show'&&!reduced){
    await page.getByRole('button',{name:'Show reference answer',exact:true}).click();await page.getByText('COMPARE, THEN GRADE',{exact:true}).waitFor();assert.equal(await offer().count(),0);
    await page.getByRole('button',{name:/^Good\./}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();await page.waitForTimeout(400);
    const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk),work=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);
    assert.equal(saved.currentIndex,1);assert.equal(saved.stage,'attempt');assert.equal(saved.answerDraft,'');assert.equal(work.history.filter(h=>h.reviewAttemptId==='a1').length,1);before=await snapshot();
   }
   await page.reload({waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(300);assert.equal(await offer().count(),0);assert.equal(await page.getByTestId('guide-card').count(),0);
   if(mode==='other-owner'){const other=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),guideOfferStorageKey('user:other','review'));assert.equal(other.choice,'later');assert.equal(other.at,now);}
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('review');await page.getByRole('button',{name:'Show me Review',exact:true}).click();await skipTour();assert.equal(await offer().count(),0);
  }
  assert.deepEqual(await snapshot(),before,'Offer, replay and retry preserve data outside explicit user actions');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Review offer ${mode}, reduced=${reduced}: attempt-only choice, preserved draft/queue and independent preferences`);
 }catch(e){await page.screenshot({path:dir+'/review-offer-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
