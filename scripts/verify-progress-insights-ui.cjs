const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createFocusSession}=require(process.cwd()+'/src/features/focus/focus-engine.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_PROGRESS_GUIDE_SCREENSHOTS||fs.mkdtempSync('/tmp/myelin-progress-insights-');
const wk='@myelin/native/workspace/local%3Adevice/primary',rk='@myelin/native/review/local%3Adevice',fk='@myelin/native/focus/local%3Adevice';
(async()=>{for(const mode of (process.env.MYELIN_INSIGHT_CASES||'mismatch,underconfident,fading,cap,failure,focus,review,tie,wrong-topic').split(','))for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const now=new Date('2026-10-15T12:00:00+05:30').getTime(),DAY=86400000;await page.clock.setFixedTime(now);
 const w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const t=createTopic({name:'Cells',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'topic');
 t.cards=Array.from({length:mode==='cap'?12:1},(_,i)=>createQuestion({prompt:'Question '+String(i).padStart(2,'0'),answer:'Saved reference '+i,hint:''},now,'c'+i));
 t.cards.forEach(c=>{c.reps=1;c.dueAt=now+5*DAY;});w.topics=[t];w.history=t.cards.map((c,i)=>({id:'h'+i,topicId:'topic',cardId:c.id,at:now-3600000,kind:'review',minutes:1,grade:mode==='underconfident'?3:1,effort:3,prompt:c.prompt,response:'Original answer',confidence:mode==='underconfident'?'unsure':'sure',hintUsed:false}));
 if(mode==='fading'){w.history=[];Object.assign(t.cards[0],{lastReviewed:now-10*DAY,memory:{version:1,stability:0.1,difficulty:5,lapses:0}});}
 if(mode==='tie')w.history.push({...w.history[0],id:'latest-success',grade:3});
 if(mode==='wrong-topic'){w.topics.push(createTopic({name:'Other',subject:'Physics',status:'review',priority:2,estimate:25,notes:''},now,'other'));w.history[0].topicId='other';}
 const extra=createQuestion({prompt:'Unrelated question',answer:'Unrelated reference',hint:''},now,'unrelated');t.cards.push(extra);
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w)};
 if(mode==='focus')seed[fk]=JSON.stringify(createFocusSession({topicId:'topic',topicName:t.name,subject:'Biology',plannedMinutes:25,breakMinutes:5,launchMode:'full',tinyStep:'Open notebook',now}));
 if(mode==='review')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'existing',createdAt:now,topicId:'topic',mixed:false,queue:buildReviewQueue(w,{now,includeNotDue:true,cardIds:['c0']}),currentIndex:0,stage:'reference',answerDraft:'Saved draft',confidence:'partial',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0});
 await page.addInitScript(seed=>{if(!localStorage.getItem('progress-insight-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('progress-insight-seeded','1');}window.__failInsight=false;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='@myelin/native/review/local%3Adevice'&&window.__failInsight)throw Error('Synthetic insight Review save failure');return set.call(this,k,v)};},seed);
 await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/progress',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Teach me this screen',exact:true}).waitFor();
 const read=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,rk,fk]);const before=await read();
 if(['tie','wrong-topic'].includes(mode)){assert.equal(await page.getByText('Check confident mistakes',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Practise these questions →',exact:true}).count(),0);assert.deepEqual(await read(),before);}
 else{
  if(mode==='cap')await page.getByText('This practice round includes up to 10 of these 12 questions.',{exact:true}).waitFor();
  if(mode==='fading')await page.getByText(/not a measured test result/).waitFor();else await page.getByText(/latest self-reported review per question/).waitFor();
  const action=page.getByTestId('guide-progress-practice');
  if(mode==='failure'){await page.evaluate(()=>{window.__failInsight=true});await action.click();await page.getByText('Review could not start. Your questions and progress were kept. Try again.',{exact:true}).waitFor();assert.ok(page.url().endsWith('/progress'));assert.deepEqual(await read(),before);await page.getByText('Review could not start. Your questions and progress were kept. Try again.',{exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.screenshot({path:dir+`/insight-failure-${reduced}.png`,fullPage:true});await page.getByRole('button',{name:'Refresh Progress suggestions',exact:true}).click();await page.evaluate(()=>{window.__failInsight=false});}
  await action.click();await page.waitForURL(mode==='focus'?/\/focus$/:/\/review$/);
  if(mode==='focus'||mode==='review')assert.deepEqual(await read(),before,'Resume never replaces the saved session/draft');
  else{await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();const session=JSON.parse((await read())[1]);assert.equal(session.queue.length,mode==='cap'?10:1);assert.ok(session.queue.every(q=>q.cardId!=='unrelated'));assert.equal((await read())[0],before[0],'Practice starts without grading or changing history');
   if(mode==='mismatch'&&!reduced){await page.getByRole('textbox',{name:'Your recall answer',exact:true}).fill('Kept review draft');await page.waitForTimeout(650);const saved=await read();await page.goBack({waitUntil:'networkidle'});await page.getByTestId('guide-progress-practice').getByText('Resume active session first',{exact:true}).waitFor();await page.getByTestId('guide-progress-practice').click();await page.waitForURL(/\/review$/);assert.deepEqual(await read(),saved,'Returning to Progress resets navigation lock and resumes the existing draft');}
  }
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`✓ Progress insight ${mode}, reduced=${reduced}: honest evidence, targeted practice and safe navigation`);
 }catch(e){await page.screenshot({path:dir+'/insight-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-2500));throw e;}finally{await page.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
