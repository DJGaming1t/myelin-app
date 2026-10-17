// Real Expo web rendering; pure regressions cover boundary/timezone permutations.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const wk='@myelin/native/workspace/local%3Adevice/primary';
(async()=>{for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const now=new Date('2026-10-17T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
  const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
  for(let i=0;i<3;i++){const t=createTopic({name:'Topic '+i,subject:'Science',status:'review',priority:2,estimate:25,notes:''},now,'t'+i);t.cards=[createQuestion({prompt:'Question',answer:'Answer',hint:''},now,i<2?'shared':'c2')];w.topics.push(t);}
  const study=(id,extra={})=>({id,topicId:'t0',at:now,kind:'study',minutes:10,grade:0,effort:3,prompt:'',response:'',confidence:'sure',plannedMinutes:10,...extra});
  const review=(id,extra={})=>study(id,{kind:'review',grade:3,cardId:'shared',minutes:1,plannedMinutes:undefined,reviewAttemptId:id,elapsedDays:2,...extra});
  const outcome=(id,extra={})=>({id,startedAt:now-600000,endedAt:now,status:'finished',plannedMinutes:10,minutes:10,launchMode:'full',taskOnly:true,overdue:false,...extra});
  w.history=[study('session_focus',{startedAt:now-600000,endedAt:now,launchMode:'full'}),study('future-study',{at:now+1,minutes:99}),review('valid-a'),review('valid-b',{topicId:'t1'}),review('legacy',{cardId:undefined}),review('wrong-owner',{topicId:'t2'}),review('future-review',{at:now+1})];
  w.focusOutcomes=[outcome('focus'),outcome('zero',{minutes:0,plannedMinutes:45}),outcome('short',{minutes:1,plannedMinutes:45}),outcome('standalone',{minutes:5,plannedMinutes:5})];
  const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(validateWorkspaceV2(w))};
  await page.addInitScript(seed=>{if(!localStorage.getItem('integrity-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('integrity-seeded','1');}},seed);
  await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/progress',{waitUntil:'networkidle'});await page.getByRole('button',{name:'See deeper evidence',exact:true}).waitFor();
  const before=await page.evaluate(k=>localStorage.getItem(k),wk);
  await page.getByTestId('guide-progress-practice').getByText('19m',{exact:true}).waitFor();
  await page.getByRole('button',{name:'See deeper evidence',exact:true}).click();
  await page.getByText('2/2 delayed, unassisted reviews recalled (Practising or Good).',{exact:true}).waitFor();
  await page.getByText('4 focus starts · 2 reached the planned duration · 4 saved blocks, including early finishes.',{exact:true}).waitFor();
  await page.getByText(/^3 graded recall attempts/).waitFor();
  await page.getByText('Zero-minute completions are excluded from this comparison. Shorter blocks with recorded work stay included.',{exact:true}).scrollIntoViewIfNeeded();
  await page.getByText('100%',{exact:true}).waitFor();
  await page.getByText(/Retention uses the first eligible review per topic\/question\/local day/).waitFor();
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),wk),before);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.MYELIN_INTEGRITY_SCREENSHOTS){fs.mkdirSync(process.env.MYELIN_INTEGRITY_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.MYELIN_INTEGRITY_SCREENSHOTS+'/timing-'+reduced+'.png',fullPage:true});}
  console.log(`✓ Global Progress integrity reduced=${reduced}: bounded/attributed totals, verified Focus dedup, zero-minute timing, first-eligible copy and unchanged data`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
