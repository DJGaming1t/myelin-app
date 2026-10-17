// Actual Expo web integration. Owner races are covered by the component/provider VM.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {validateWorkspaceV2}=require(process.cwd()+'/src/data/validation.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const wk='@myelin/native/workspace/local%3Adevice/primary';
(async()=>{
 for(const reduced of [false,true])for(const mode of ['earned','integrity']){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});
  try{
   const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const now=new Date('2026-10-17T12:00:00+05:30').getTime();await page.clock.setFixedTime(now);
   const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
   for(let i=0;i<10;i++){const t=createTopic({name:'Topic '+i,subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now+i,'t'+i);t.cards=[createQuestion({prompt:'Question',answer:'Answer',hint:''},now,'c'+i)];w.topics.push(t);}
   const review=(id,at,extra={})=>({id,at,kind:'review',topicId:'t0',cardId:'c0',grade:3,minutes:0,effort:3,confidence:'sure',prompt:'Question',response:'Answer',...extra});
   w.history=Array.from({length:10},(_,i)=>review('earned-'+i,now-(i+1)*86400000));
   w.history.push(review('again',now-86400000-60000,{grade:1}),review('repeat',now-86400000+60000),review('hint',now-11*86400000,{hintUsed:true}));
   if(mode==='integrity'){
    w.history.push(review('future',now+1),review('wrong-topic',now-13*86400000,{topicId:'t2'}));
    w.topics[1].cards[0].id='c0';w.history.push(review('disambiguated',now-86400000,{topicId:'t1'}));
   }
   const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),'@myelin/guides/local%3Adevice':JSON.stringify({}),[wk]:JSON.stringify(validateWorkspaceV2(w))};
   await page.addInitScript(seed=>{if(!localStorage.getItem('map-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('map-seeded','1');}},seed);
   await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/progress',{waitUntil:'networkidle'});
   await page.getByRole('button',{name:'Open Topic 0',exact:true}).waitFor();
   const dismiss=page.getByRole('button',{name:'Maybe later',exact:true});if(await dismiss.count())await dismiss.click();
   await page.getByLabel((mode==='integrity'?11:10)+' earned recall connections',{exact:true}).waitFor();
   await page.getByText('10-recall milestone earned · next at 25',{exact:true}).waitFor();
   const before=await page.evaluate(k=>localStorage.getItem(k),wk);
   await page.getByRole('button',{name:'Next map topics',exact:true}).click();await page.getByRole('button',{name:'Open Topic 9',exact:true}).waitFor();
   await page.getByRole('button',{name:'Previous map topics',exact:true}).click();
   await page.getByRole('button',{name:'Topic 1, '+(mode==='integrity'?1:0)+' earned recalls',exact:true}).click();
   await page.getByTestId('guide-progress-map').getByText('Topic 1 →',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Open Topic 1',exact:true}).click();await page.waitForURL(/\/topics\/t1$/);
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),wk),before);assert.deepEqual(errors,[]);
   console.log(`✓ Neural Map ${mode}, reduced=${reduced}: retry/milestone evidence, identity corrections, pagination, selection and real topic route preserve data`);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
