// Optional first-open Progress offer checks; external Playwright/browser and Expo web only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {guideOfferStorageKey}=require(process.cwd()+'/src/features/guides/guide-offer-state.ts');
const fs=require('node:fs');
const dir=process.env.MYELIN_PROGRESS_OFFER_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-progress-offer-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice',ok='@myelin/onboarding/local%3Adevice',gk=guideOfferStorageKey('local:device','progress'),tk=guideOfferStorageKey('local:device','today'),pk=guideOfferStorageKey('local:device','focus'),vk=guideOfferStorageKey('local:device','review');
const cases=[['later',false],['later',true],['show',false],['show',true],['empty',true],['expanded',false],['expanded',true],['map-page',true],['map-selection',true],['stored-later',true],['stored-shown',true],['focus',true],['review',true],['manual',true],['read-error',true],['write-error',true],['other-owner',true],['help-first',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases.filter(([mode])=>!process.env.MYELIN_PROGRESS_OFFER_CASES||process.env.MYELIN_PROGRESS_OFFER_CASES.split(',').includes(mode))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime(),DAY=86400000;await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:'Think about daughter cells'},now,'c1')];
 if(mode!=='empty'){
  w.topics=[topic];topic.cards[0].reps=1;topic.cards[0].dueAt=now+5*DAY;
  const recall=(id,at,input={})=>({id,topicId:'t1',at,kind:'review',minutes:1,grade:3,effort:3,prompt:'What is mitosis?',response:'Saved answer',confidence:'sure',reviewAttemptId:id,cardId:'c1',hintUsed:false,...input});
  w.history=[recall('h1',now-DAY),recall('h2',now-DAY+60000),recall('h3',now-2*DAY),recall('hinted',now-3*DAY,{hintUsed:true}),recall('mismatch',now-3600000,{grade:1})];
 }
 if(mode==='map-page'||mode==='map-selection')for(let i=2;i<=(mode==='map-page'?10:2);i++)w.topics.push(createTopic({name:'Topic '+i,subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now+i,'t'+i));
 const seed={'myelin.auth.local-mode':'1',[ok]:JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[tk]:JSON.stringify({version:1,choice:'later',at:now}),[pk]:JSON.stringify({version:1,choice:'shown',at:now}),[vk]:JSON.stringify({version:1,choice:'later',at:now})};
 if(mode.startsWith('stored-'))seed[gk]=JSON.stringify({version:1,choice:mode==='stored-later'?'later':'shown',at:now});
 if(mode==='other-owner')seed[guideOfferStorageKey('user:other','progress')]=JSON.stringify({version:1,choice:'later',at:now});
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({topicId:'t1',topicName:topic.name,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Saved tiny step',now}));
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'reference',answerDraft:'Saved draft',confidence:'partial',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0});
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(({seed,mode,gk})=>{
  if(!localStorage.getItem('progress-offer-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('progress-offer-seeded','1');}
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(mode==='read-error')Storage.prototype.getItem=function(key){if(key===gk)throw new Error('Synthetic preference read failure');return get.call(this,key);};
  if(mode==='write-error'){let failed=false;Storage.prototype.setItem=function(key,value){if(key===gk&&!failed){failed=true;throw new Error('Synthetic preference write failure');}return set.call(this,key,value);};}
 },{seed,mode,gk});
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk,ok,tk,pk,vk]);
 const preference=()=>page.evaluate(k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;},gk);
 const offer=()=>page.getByTestId('progress-guide-offer');
 const header=()=>page.getByRole('button',{name:'Teach me this screen',exact:true});
 async function skipTour(){await page.getByTestId('guide-spotlight').waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});}
 async function replay(){await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('neural map');await page.getByRole('button',{name:'Show me Progress and Neural Map',exact:true}).click();await skipTour();}
 try{
  await page.goto(baseUrl+'/progress',{waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(500);
  if(mode==='expanded'){await page.getByRole('button',{name:'See deeper evidence',exact:true}).click();await page.getByText('Confidence calibration',{exact:true}).waitFor();await page.waitForTimeout(350);}
  if(mode==='map-page'){await page.getByRole('button',{name:'Next map topics',exact:true}).click();await page.getByRole('button',{name:'Open Topic 10',exact:true}).waitFor();}
  if(mode==='map-selection'){await page.getByRole('button',{name:'Topic 2, 0 earned recalls',exact:true}).click();await page.getByRole('button',{name:'Open Topic 2',exact:true}).waitFor();}
  let before=await snapshot();assert.equal(await page.getByTestId('guide-card').count(),0,'Progress never forces a tutorial or practice');
  if(mode!=='empty'&&!mode.startsWith('map-'))await page.getByTestId('guide-progress-map').getByText('Biology · 2 earned recalls',{exact:true}).waitFor();
  if(mode==='focus'||mode==='review'){
   assert.equal(await offer().count(),0);assert.equal(await preference(),null);await header().click();await skipTour();assert.equal(await preference(),null,'Active-session guidance does not consume the introductory offer');assert.equal(await page.getByTestId('progress-guide-choice-error').count(),0);
  }else if(mode==='read-error'||mode.startsWith('stored-')){
   assert.equal(await offer().count(),0);await header().click();await skipTour();
  }else if(mode==='help-first'){
   await offer().waitFor();await replay();assert.equal((await preference()).choice,'shown');assert.equal(await offer().count(),0);await page.reload({waitUntil:'networkidle'});await header().waitFor();assert.equal(await offer().count(),0);
  }else{
   await offer().waitFor();const summary=await page.getByText('DUE CORRECTIONS',{exact:true}).boundingBox(),box=await offer().boundingBox();assert.ok(summary&&box&&box.y>=summary.y+summary.height,'Primary recorded evidence precedes the optional offer');
   await offer().scrollIntoViewIfNeeded();await page.screenshot({path:dir+`/progress-offer-${mode}-${reduced}.png`,fullPage:true});
   if(mode==='show'||mode==='expanded'||mode.startsWith('map-')){
    await page.getByRole('button',{name:'Show me Progress’s tutorial',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByRole('button',{name:'Finish tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});assert.equal((await preference()).choice,'shown');
   }else if(mode==='manual'){
    await header().click();await skipTour();assert.equal((await preference()).choice,'shown');
   }else{
    await page.getByRole('button',{name:'Maybe later for Progress’s tutorial',exact:true}).click();await offer().waitFor({state:'detached'});
    if(mode==='write-error'){
     await page.getByTestId('progress-guide-choice-error').waitFor();assert.equal(await preference(),null);await page.getByRole('button',{name:'Retry saving tutorial choice',exact:true}).click();await page.getByTestId('progress-guide-choice-error').waitFor({state:'detached'});
    }
    assert.equal((await preference()).choice,'later');await header().click();await skipTour();
   }
   assert.deepEqual(await snapshot(),before,'Choice/tour preserves evidence, experiments, sessions and other tutorial preferences');assert.equal(await offer().count(),0);
   assert.equal(await page.getByText('Confidence calibration',{exact:true}).count(),mode==='expanded'?1:0,'Disclosure stays as found');
   if(mode==='map-page')await page.getByRole('button',{name:'Open Topic 10',exact:true}).waitFor();
   if(mode==='map-selection')await page.getByRole('button',{name:'Open Topic 2',exact:true}).waitFor();
   if(mode==='show'&&!reduced){
    await page.getByTestId('guide-progress-practice').click();await page.waitForURL(/\/review$/);await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();
    const session=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk);assert.equal(session.queue.length,1);assert.equal(session.queue[0].cardId,'c1');assert.equal(session.stage,'attempt');assert.equal(session.currentIndex,0);assert.equal(await page.evaluate(k=>localStorage.getItem(k),wk),before[0]);before=await snapshot();
    await page.goto(baseUrl+'/progress',{waitUntil:'networkidle'});await header().waitFor();assert.equal(await offer().count(),0);
   }
   if(mode==='empty'){await page.getByRole('button',{name:'Add your first topic',exact:true}).click();await page.waitForURL(/\/topics\/new$/);assert.deepEqual(await snapshot(),before);await page.goto(baseUrl+'/progress',{waitUntil:'networkidle'});await header().waitFor();}
   await page.reload({waitUntil:'networkidle'});await header().waitFor();await page.waitForTimeout(300);assert.equal(await offer().count(),0);assert.equal(await page.getByTestId('guide-card').count(),0);
   if(mode==='other-owner'){const other=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),guideOfferStorageKey('user:other','progress'));assert.equal(other.choice,'later');assert.equal(other.at,now);}
   await replay();assert.equal(await offer().count(),0);
  }
  assert.deepEqual(await snapshot(),before,'Data changes only after explicit existing actions');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Progress offer ${mode}, reduced=${reduced}: optional choice, preserved evidence/map/disclosure and independent preferences`);
 }catch(e){console.error({map:await page.getByTestId('guide-progress-map').boundingBox(),scroll:await page.getByTestId('progress-scroll').evaluate(e=>({top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight,y:e.getBoundingClientRect().y}))});await page.screenshot({path:dir+'/progress-offer-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
