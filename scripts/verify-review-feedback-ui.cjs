// Actual Review UI: temporary retries preserve the first attempt and scheduler evidence.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_REVIEW_GUIDE_SCREENSHOTS || fs.mkdtempSync('/tmp/myelin-feedback-');
const wk='@myelin/native/workspace/local%3Adevice/primary',rk='@myelin/native/review/local%3Adevice';
(async()=>{for(const mode of ['saved','missing','long','mental'])for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const now=Date.now(),w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const topic=createTopic({name:'Cell division',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'t1');
 const answer=mode==='missing'?'   ':mode==='long'?'Saved reference detail. '.repeat(150).trim():'Two genetically identical daughter cells';
 topic.cards=[createQuestion({prompt:'What does mitosis produce?',answer,hint:'Daughter cells'},now,'c1'),createQuestion({prompt:'Z next question',answer:'Next reference',hint:''},now,'c2')];w.topics=[topic];
 const first=mode==='mental'?'— Answered mentally —':'My first incomplete answer';
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w),[rk]:JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'t1',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:'reference',answerDraft:first,confidence:'sure',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0})};
 await page.addInitScript(seed=>{if(!localStorage.getItem('feedback-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('feedback-seeded','1');}},seed);
 await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/review',{waitUntil:'networkidle'});
 await page.getByText('COMPARE, THEN GRADE',{exact:true}).waitFor();
 const snapshot=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[wk,rk]);const before=await snapshot();
 if(mode==='missing'){
  await page.getByText(/No reference answer was saved/).waitFor();assert.equal(await page.getByRole('button',{name:'Cover reference and retry',exact:true}).count(),0);
 }else{
  await page.getByRole('button',{name:'Cover reference and retry',exact:true}).click();
  assert.equal(await page.getByText(answer,{exact:true}).count(),0,'Saved reference is removed while practising');
  assert.equal(await page.getByRole('button',{name:'Compare retry with reference',exact:true}).isEnabled(),false);
  await page.getByRole('textbox',{name:'Your correction retry'}).fill('   ');assert.equal(await page.getByRole('button',{name:'Compare retry with reference',exact:true}).isEnabled(),false);
  await page.getByRole('textbox',{name:'Your correction retry'}).fill('My retried answer');
  await page.getByRole('button',{name:'Teach me this screen',exact:true}).click();await page.getByTestId('guide-card').waitFor();
  await page.waitForTimeout(250);assert.ok((await page.getByTestId('guide-review-primary').textContent()).includes(answer),'Reference guide retains its real reference anchor');
  await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();await page.getByTestId('guide-card').waitFor({state:'detached'});
  assert.equal(await page.getByText(answer,{exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'Your correction retry'}).inputValue(),'My retried answer');
  await page.getByRole('button',{name:'Compare retry with reference',exact:true}).click();await page.getByText(answer,{exact:true}).waitFor();
  await page.getByText('My retried answer',{exact:true}).waitFor();await page.getByText(/MYELIN has not marked it correct/).waitFor();
  assert.deepEqual(await snapshot(),before,'Retry/tour/compare do not write review or workspace');
  await page.getByRole('button',{name:'Cover reference and retry again',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Your correction retry'}).inputValue(),'');
  await page.getByRole('button',{name:'Cancel retry',exact:true}).click();assert.deepEqual(await snapshot(),before);
  await page.getByRole('button',{name:'Cover reference and retry',exact:true}).click();await page.getByRole('textbox',{name:'Your correction retry'}).fill('Temporary answer');
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Cover reference and retry',exact:true}).waitFor();assert.deepEqual(await snapshot(),before,'Reload preserves original attempt and discards only temporary practice');
  await page.getByRole('button',{name:'Cover reference and retry',exact:true}).click();await page.getByRole('textbox',{name:'Your correction retry'}).fill('A correct-looking retry');
  await page.getByRole('button',{name:'Compare retry with reference',exact:true}).click();
 }
 await page.screenshot({path:dir+`/feedback-${mode}-${reduced}.png`,fullPage:true});
 await page.getByRole('button',{name:/^Again\./}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();await page.waitForTimeout(450);
 const [saved,session]=(await snapshot()).map(JSON.parse);assert.equal(session.currentIndex,1);assert.equal(session.answerDraft,'');assert.equal(await page.getByText('My retried answer',{exact:true}).count(),0);
 const history=saved.history.filter(h=>h.reviewAttemptId==='a1');assert.equal(history.length,1);assert.equal(saved.topics[0].cards[0].reps,1);assert.equal(saved.topics[0].cards[0].lastGrade,1);
 assert.equal(saved.mistakes.length,mode==='missing'?0:1);
 if(mode!=='missing'){assert.equal(saved.mistakes[0].detail,first);assert.equal(saved.mistakes[0].correction,answer);assert.equal(saved.mistakes[0].wins,0);}
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log(`✓ Feedback ${mode}, reduced=${reduced}: read-only retry, guide, reload, original evidence and one explicit grade`);
 }finally{await page.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
