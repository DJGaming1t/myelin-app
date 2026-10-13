// Optional end-to-end tour check against a running Expo web server.
// Uses an external Playwright/browser installation; no app dependency is added.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createStudyTask}=require(process.cwd()+'/src/features/planning/task-engine.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_GUIDE_SCREENSHOTS || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-guides-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wsKey='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
(async()=>{let browser;
try{
 for(const [mode,width,height,reduced] of ['ready','empty','rest','focus','review'].flatMap(mode=>[false,true].map(reduced=>[mode,320,568,reduced]))) {
  browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true});
  const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const now=new Date('2026-10-04T12:00:00+05:30').getTime(),w=createEmptyWorkspace(now);await page.clock.setFixedTime(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
  const task=createStudyTask({title:'Prepare a biology outline',estimatedMinutes:25,planState:'today',now});
  if(mode!=='empty')w.tasks=[task];
  if(mode==='rest'){w.settings.sleepEnabled=true;w.settings.sleepStartMinutes=0;w.settings.wakeMinutes=1439;}
  const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now})};
  if(mode==='focus')seed[fk]=JSON.stringify({...createFocusSession({taskId:task.id,topicName:task.title,subject:'Task',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notes',now}),runningSince:null});
  if(mode==='review'){
    const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Cell division',hint:''},now,'c1')];w.topics=[topic];
    seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'review1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:'attempt',answerDraft:'Saved draft',confidence:'unsure',hintUsed:false,cardStartedAt:now,attemptId:'a1',completedCards:0});
  }
  seed[wsKey]=JSON.stringify(w);
  await page.addInitScript(seed=>{if(!localStorage.getItem('guide-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('guide-seeded','1');}},seed);
  const snapshot=()=>page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),[wsKey,fk,rk]);
  async function spotlight(id){
    const ring=page.getByTestId('guide-spotlight');await ring.waitFor();
    await page.waitForTimeout(250);
    const a=await page.getByTestId(id).boundingBox(),r=await ring.boundingBox(),c=await page.getByTestId('guide-card').boundingBox();
    assert.ok(a&&r&&c,'Measured target, spotlight and card');
    assert.ok(Math.abs(r.x-(a.x-5))<2&&Math.abs(r.y-(a.y-5))<2,JSON.stringify({id,a,r}));
    assert.ok(Math.abs(r.width-a.width-10)<2&&Math.abs(r.height-a.height-10)<2);
    assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=width+1&&c.y+c.height<=height+1,'Card in viewport');
    assert.ok(c.y>=r.y+r.height||c.y+c.height<=r.y,'Card does not cover highlighted control');
  }
  try{
   await page.goto(baseUrl+'/today',{waitUntil:'networkidle'});
   await page.getByRole('button',{name:'Teach me this screen',exact:true}).waitFor();await page.waitForTimeout(500);
   const before=await snapshot();
   const original=await page.getByTestId('today-scroll').evaluate(e=>{e.scrollTop=45;return e.scrollTop});await page.waitForTimeout(150);
   await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();
   const title={ready:'Start with this one action',empty:'Give Today something to work with',rest:'Leave room for rest',focus:'Return to your focus session',review:'Continue your recall queue'}[mode];
   await page.getByText(title,{exact:true}).waitFor();await spotlight('guide-today-next');
   assert.equal(await page.getByRole('button',{name:'Previous tutorial step',exact:true}).isDisabled(),true);
   await page.screenshot({path:dir+`/guide-${mode}-${width}-${reduced}.png`,fullPage:true});
   await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await spotlight('guide-today-adjust');
   await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await spotlight('guide-today-day-map');
   if(mode==='ready'){
     await page.getByRole('button',{name:'Previous tutorial step',exact:true}).click();await spotlight('guide-today-adjust');
     await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await spotlight('guide-today-day-map');
   }
   await page.getByRole('button',{name:'Finish tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});await page.waitForTimeout(200);
   assert.ok(Math.abs(await page.getByTestId('today-scroll').evaluate(e=>e.scrollTop)-original)<2,'Original scroll restored');
   assert.deepEqual(await snapshot(),before,'Tour leaves workspace and active sessions unchanged');
   await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await spotlight('guide-today-next');await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});
   if(mode==='ready'){
     await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Help & tutorial',exact:true}).click();await page.getByRole('button',{name:'View MYELIN tutorial again',exact:true}).click();
     await page.getByText('Choose one useful next move.',{exact:true}).waitFor();
     await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByText('Work, then try to remember.',{exact:true}).waitFor();
     await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await page.getByText('Let evidence shape what comes next.',{exact:true}).waitFor();
     await page.getByRole('button',{name:'Show me Today',exact:true}).click();await spotlight('guide-today-next');
     assert.ok(!page.url().includes('guide='),'Replay request consumed');
     await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();
     await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0,'Tour does not reopen on reload');
     assert.deepEqual(await snapshot(),before);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   console.log(`✓ Today guide ${mode}, ${width}x${height}, reduced=${reduced}: real anchors, placement, Back/Next/Skip/Done, restoration, data preservation`);
  }catch(e){await page.screenshot({path:dir+'/guide-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
 }
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
