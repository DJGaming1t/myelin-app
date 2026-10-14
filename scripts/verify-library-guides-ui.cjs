// Optional real Library flow check; external Playwright/browser and Expo web only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const {libraryGuideSteps}=require(process.cwd()+'/src/features/guides/guide-registry.ts');
const dir=process.env.MYELIN_LIBRARY_GUIDE_SCREENSHOTS || fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-library-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const wk='@myelin/native/workspace/local%3Adevice/primary',fk='@myelin/native/focus/local%3Adevice',rk='@myelin/native/review/local%3Adevice';
const cases=[['empty',false],['empty',true],['populated',false],['populated',true],['filtered',false],['filtered',true],['no-match',false],['no-match',true],['expanded',true],['long-subject',true],['scrolled',true],['focus',true],['review',true],['help',true],['empty-query',true],['search-material',true],['direct-replay',true]];
(async()=>{let browser;
try{for(const [mode,reduced] of cases.filter(([mode])=>!process.env.MYELIN_LIBRARY_GUIDE_CASES||process.env.MYELIN_LIBRARY_GUIDE_CASES.split(',').includes(mode))){
 browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:process.env.MYELIN_CHROMIUM_ARGS?JSON.parse(process.env.MYELIN_CHROMIUM_ARGS):['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const now=new Date('2026-10-14T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;w.settings.sleepEnabled=false;
 const long='Biology with a deliberately long subject name for small screens';
 const topic=createTopic({name:'Cell division',subject:mode==='long-subject'?long:'Biology',status:'review',priority:3,estimate:25,notes:'chromosome checkpoint'},now,'t1');
 topic.cards=[createQuestion({prompt:'What is mitosis?',answer:'Two daughter cells',hint:'Spindle fibres'},now,'c1')];
 const empty=mode==='empty'||mode==='empty-query';
 if(!empty){w.topics=[topic,createTopic({name:'Refraction',subject:'Physics',status:'learning',priority:2,estimate:25,notes:''},now,'t2'),createTopic({name:'Metals',subject:'Chemistry',status:'new',priority:1,estimate:25,notes:''},now,'t3')];for(let i=4;i<=18;i++)w.topics.push(createTopic({name:'Topic '+i,subject:'Other',status:'new',priority:1,estimate:25,notes:''},now,'t'+i));}
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(validateWorkspaceV2(w))};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({topicId:'t1',topicName:topic.name,subject:topic.subject,plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notes',now}));
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true}),currentIndex:0,stage:'attempt',answerDraft:'Saved answer',confidence:'partial',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0});
 const preferenceKeys=['today','focus','review','progress'].map(id=>'@myelin/guide-offers/v1/local%3Adevice/'+id);
 preferenceKeys.forEach(key=>seed[key]=JSON.stringify({version:1,choice:'later',at:now}));
 await page.addInitScript(seed=>{if(!localStorage.getItem('library-guide-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('library-guide-seeded','1');}},seed);
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,fk,rk,'@myelin/onboarding/local%3Adevice',...preferenceKeys]);
 const search=()=>page.getByRole('textbox',{name:'Search Library',exact:true});
 const toggle=()=>page.getByRole('button',{name:'Library filters',exact:true});
 const count=n=>page.getByText(`${n} of 18 topics`,{exact:true});
 async function highlight(anchor){
  await page.getByTestId('guide-spotlight').waitFor();await page.waitForTimeout(250);
  const a=await page.getByTestId('guide-'+anchor.replace('.','-')).boundingBox(),r=await page.getByTestId('guide-spotlight').boundingBox(),c=await page.getByTestId('guide-card').boundingBox();
  assert.ok(a&&r&&c);assert.ok(Math.abs(r.x-Math.max(4,a.x-5))<2&&Math.abs(r.y-Math.max(4,a.y-5))<2,JSON.stringify({a,r}));
  assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=321&&c.y+c.height<=569,'Card fits compact viewport');
  assert.ok(c.y>=r.y+r.height-1||c.y+c.height<=r.y+1,'Card leaves actual highlighted control visible');
 }
 try{
  await page.goto(baseUrl+'/topics',{waitUntil:'networkidle'});await search().waitFor();await page.waitForTimeout(350);
  assert.equal(await page.getByTestId('guide-card').count(),0,'No automatic tutorial');
  if(['filtered','no-match','expanded','long-subject'].includes(mode)){
   await toggle().click();await page.getByTestId('guide-library-filters').getByRole('radio',{name:'Review',exact:true}).click();await page.getByTestId('guide-library-filters').getByRole('radio',{name:topic.subject,exact:true}).click();await count(1).waitFor();
   if(mode==='filtered'||mode==='no-match'){await toggle().click();await page.waitForTimeout(350);}
   if(mode==='no-match'){await search().fill('nonexistent chapter');await count(0).waitFor();await page.getByText('Nothing matches those filters.',{exact:true}).waitFor();}
   await page.getByTestId('guide-library-results').getByText(new RegExp(topic.subject)).waitFor();
  }
  if(mode==='empty-query'){await search().fill('nonexistent');await page.getByText('Start with one real topic.',{exact:true}).waitFor();assert.equal(await page.getByText('Nothing matches those filters.',{exact:true}).count(),0,'Empty Library is distinguished from filtered saved topics');}
  if(mode==='search-material'){
   for(const query of ['chromosome checkpoint','mitosis','daughter cells','spindle fibres']){await search().fill(query);await count(1).waitFor();await page.getByRole('button',{name:/^Cell division,/}).waitFor();}
   await page.getByRole('button',{name:'Clear search',exact:true}).click();await count(18).waitFor();
  }
  const expanded=await toggle().getAttribute('aria-expanded')==='true',query=await search().inputValue();
  const filtered=['filtered','no-match','expanded','long-subject','empty-query'].includes(mode);
  const state={hasTopics:!empty,hasResults:!empty&&mode!=='no-match',filtered,expanded};
  const selection=()=>page.getByTestId('guide-library-filters').getByRole('radio',{checked:true}).allTextContents();
  const selected=await selection();
  if(expanded)assert.deepEqual(selected,['Review',topic.subject],'Selected status and subject are exposed to assistive technology');
  const original=await page.getByTestId('library-list').evaluate((e,mode)=>{e.scrollTop=mode==='scrolled'?760:40;return e.scrollTop},mode);await page.waitForTimeout(200);
  const before=await snapshot();
  await page.screenshot({path:dir+`/library-${mode}-${reduced}-screen.png`,fullPage:true});
  if(mode==='direct-replay')await page.goto(baseUrl+'/topics?guide=library',{waitUntil:'networkidle'});
  else if(mode==='help'){
   await page.goto(baseUrl+'/settings/help',{waitUntil:'networkidle'});await page.getByRole('textbox',{name:'Search MYELIN help',exact:true}).fill('library');
   await page.getByRole('button',{name:'Show me Library',exact:true}).click();
  }else await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();
  const steps=libraryGuideSteps(state);
  for(let i=0;i<steps.length;i++){
   await page.getByText(steps[i].title,{exact:true}).waitFor();await highlight(steps[i].anchor);
   await page.screenshot({path:dir+`/library-${mode}-${reduced}-${i}.png`,fullPage:true});
   if(i===1){await page.getByRole('button',{name:'Previous tutorial step',exact:true}).click();await highlight(steps[0].anchor);await page.getByRole('button',{name:'Next tutorial step',exact:true}).click();await highlight(steps[1].anchor);}
   await page.getByRole('button',{name:i===2?'Finish tutorial':'Next tutorial step',exact:true}).click();
  }
  await page.getByTestId('guide-card').waitFor({state:'detached'});
  assert.deepEqual(await snapshot(),before,'Guide preserves workspace, sessions, onboarding and all core tutorial choices');
  assert.equal(await search().inputValue(),query);assert.equal(await toggle().getAttribute('aria-expanded')==='true',expanded);assert.deepEqual(await selection(),selected);
  if(mode!=='help'&&mode!=='direct-replay')assert.ok(Math.abs(await page.getByTestId('library-list').evaluate(e=>e.scrollTop)-original)<2,'Original list offset restored');
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();assert.deepEqual(await snapshot(),before);
  if(mode==='help'||mode==='direct-replay'){assert.ok(!page.url().includes('guide='),page.url());await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByTestId('guide-card').count(),0,'Replay request consumed');}
  if(filtered&&!empty){await page.getByRole('button',{name:'Clear all Library filters',exact:true}).click();await count(18).waitFor();assert.equal(await search().inputValue(),'');assert.equal(await toggle().getAttribute('aria-expanded')==='true',expanded,'Reset leaves filter disclosure as found');assert.deepEqual(await snapshot(),before,'Reset narrows presentation only');}
  if(empty){await page.getByRole('button',{name:'Add your first topic',exact:true}).click();await page.waitForURL(/\/topics\/new$/);assert.deepEqual(await snapshot(),before,'Opening blank form does not create a topic');}
  if(mode==='populated'||mode==='search-material'){await page.getByRole('button',{name:/^Cell division,/}).click();await page.waitForURL(/\/topics\/t1$/);assert.deepEqual(await snapshot(),before,'Explicit real topic navigation does not start study');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Library ${mode}, reduced=${reduced}: live search/filter/reset, real anchors, preserved state/data and explicit navigation`);
 }catch(error){await page.screenshot({path:dir+'/library-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));throw error;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
