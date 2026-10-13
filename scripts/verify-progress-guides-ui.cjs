// Optional Progress guide flow check; needs external Playwright/browser and Expo web.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {neuralEvidence}=require(process.cwd()+'/src/features/adaptive/insight-engine.ts');
const {progressGuideSteps}=require(process.cwd()+'/src/features/guides/guide-registry.ts');
const fs=require('node:fs');
const dir=process.env.MYELIN_PROGRESS_GUIDE_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-progress-guide-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
const cases=[['empty',false],['empty',true],['topics',false],['topics',true],['insight',false],['insight',true],['expanded-sparse',false],['expanded-sparse',true],['expanded-enough',false],['expanded-enough',true],['focus',true],['review',true],['map-page',true],['map-selection',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases.filter(([mode])=>!process.env.MYELIN_PROGRESS_GUIDE_CASES||process.env.MYELIN_PROGRESS_GUIDE_CASES.split(',').includes(mode))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime(),DAY=86400000;await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:'Think about daughter cells'},now,'c1')];
 const hasInsight=['insight','expanded-enough','focus','review'].includes(mode),expanded=mode.startsWith('expanded');
 if(mode!=='empty')w.topics=[topic];
 const review=(id,at,input={})=>({id,topicId:'t1',at,kind:'review',minutes:1,grade:3,effort:3,prompt:'What is mitosis?',response:'Saved answer',confidence:'sure',reviewAttemptId:id,cardId:'c1',hintUsed:false,...input});
 if(mode!=='empty')w.history=mode==='expanded-sparse'?[review('h1',now-DAY)]:[review('h1',now-DAY),review('h2',now-DAY+60000),review('h3',now-2*DAY),review('hinted',now-3*DAY,{hintUsed:true})];
 if(hasInsight){w.history.push(review('mismatch',now-3600000,{grade:1}));topic.cards[0].reps=1;topic.cards[0].dueAt=now+5*DAY;}
 if(mode==='map-page'||mode==='map-selection')for(let i=2;i<=(mode==='map-page'?10:2);i++)w.topics.push(createTopic({name:'Topic '+i,subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now+i,'t'+i));
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now})};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({topicId:'t1',topicName:topic.name,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open the question',now}));
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'reference',answerDraft:'Saved draft',confidence:'partial',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0});
 seed[wk]=JSON.stringify(validateWorkspaceV2(w));
 await page.addInitScript(seed=>{if(!localStorage.getItem('progress-guide-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('progress-guide-seeded','1');}},seed);
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk]);
 const state={hasTopics:mode!=='empty',practice:hasInsight?(mode==='focus'?'focus':mode==='review'?'review':'available'):'none',expanded,enoughConfidence:hasInsight};
 async function highlight(anchor){
  await page.getByTestId('guide-spotlight').waitFor();await page.waitForTimeout(250);
  const a=await page.getByTestId('guide-'+anchor.replace('.','-')).boundingBox();
  const r=await page.getByTestId('guide-spotlight').boundingBox(),c=await page.getByTestId('guide-card').boundingBox();
  assert.ok(a&&r&&c);assert.ok(Math.abs(r.x-a.x+5)<2&&Math.abs(r.y-a.y+5)<2,JSON.stringify({a,r}));
  assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=321&&c.y+c.height<=569,'Card stays in viewport');
  assert.ok(c.y>=r.y+r.height-1||c.y+c.height<=r.y+1,'Card leaves highlighted control visible');
 }
 try{
  await page.goto(baseUrl+'/progress',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Teach me this screen',exact:true}).waitFor();await page.waitForTimeout(500);
  if(expanded){await page.getByRole('button',{name:'See deeper evidence',exact:true}).click();await page.getByText('Confidence calibration',{exact:true}).waitFor();await page.waitForTimeout(350);}
  const disclosure=()=>page.getByRole('button',{name:expanded?'Hide deeper evidence':'See deeper evidence',exact:true});
  if(mode==='map-page'){await page.getByRole('button',{name:'Next map topics',exact:true}).click();await page.getByRole('button',{name:'Open Topic 10',exact:true}).waitFor();}
  if(mode==='map-selection'){await page.getByRole('button',{name:'Topic 2, 0 earned recalls',exact:true}).click();await page.getByRole('button',{name:'Open Topic 2',exact:true}).waitFor();}
  if(mode==='topics'){assert.equal(neuralEvidence(w).total,2,'Same-card same-day and hinted grades do not inflate map evidence');await page.getByTestId('guide-progress-map').getByText('Biology · 2 earned recalls',{exact:true}).waitFor();}
  const original=await page.getByTestId('progress-scroll').evaluate(e=>{e.scrollTop=45;return e.scrollTop});await page.waitForTimeout(150);
  const before=await snapshot();await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();const steps=progressGuideSteps(state);
  for(let i=0;i<steps.length;i++){
   await page.getByText(steps[i].title,{exact:true}).waitFor();await highlight(steps[i].anchor);
   await page.screenshot({path:dir+`/progress-guide-${mode}-${reduced}-${i}.png`,fullPage:true});
   if(i===1){await page.getByRole('button',{name:'Previous tutorial step',exact:true}).click();await highlight(steps[0].anchor);await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await highlight(steps[1].anchor);}
   await page.getByRole('button',{name:i===2?'Finish tutorial':'Next tutorial step',exact:true}).click();
  }
  await page.getByTestId('guide-card').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before,'Tour preserves workspace, sessions, evidence, schedules and settings');
  assert.ok(Math.abs(await page.getByTestId('progress-scroll').evaluate(e=>e.scrollTop)-original)<2,'Original scroll restored');
  assert.equal(await disclosure().count(),1,'Tour preserves disclosure action');
  assert.equal(await page.getByText('Confidence calibration',{exact:true}).count(),expanded?1:0,'Tour preserves deeper evidence visibility');
  if(mode==='map-page')await page.getByRole('button',{name:'Open Topic 10',exact:true}).waitFor();
  if(mode==='map-selection')await page.getByRole('button',{name:'Open Topic 2',exact:true}).waitFor();
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before);
  if(mode==='empty'||mode==='expanded-enough'){
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('neural map');
   await page.getByRole('button',{name:'Show me Progress and Neural Map',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();assert.ok(!page.url().includes('guide='));
   await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0);assert.deepEqual(await snapshot(),before);
  }
  if(mode==='empty'&&!reduced){await page.getByRole('button',{name:'Add your first topic',exact:true}).click();await page.waitForURL(/\/topics\/new$/);assert.deepEqual(await snapshot(),before);}
  if(mode==='insight'&&!reduced){
   await page.getByTestId('guide-progress-practice').click();await page.waitForURL(/\/review$/);await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();
   const active=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk);assert.equal(active.queue.length,1);assert.equal(active.queue[0].cardId,'c1');assert.equal(active.stage,'attempt');assert.equal(active.currentIndex,0);assert.equal(await page.evaluate(k=>localStorage.getItem(k),wk),before[0],'Explicit insight practice uses the real future card without grading');
  }
  if(mode==='focus'||mode==='review'){
   await page.getByTestId('guide-progress-practice').click();await page.waitForURL(mode==='focus'?/\/focus$/:/\/review$/);assert.deepEqual(await snapshot(),before,'Explicit guarded action resumes existing session without replacing it');
  }
  if(mode==='map-page'){
   await page.getByRole('button',{name:'Open Topic 10',exact:true}).click();await page.waitForURL(/\/topics\/t10$/);assert.deepEqual(await snapshot(),before);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Progress guide ${mode}, reduced=${reduced}: actual anchors, compact placement, preserved evidence/UI state and working explicit actions`);
 }catch(e){await page.screenshot({path:dir+'/progress-guide-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
