// Storage fault injection in the actual Review screen; browser dependencies stay external.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {buildReviewQueue}=require(process.cwd()+'/src/features/review/review-engine.ts');
const dir=process.env.MYELIN_REVIEW_GUIDE_SCREENSHOTS||fs.mkdtempSync('/tmp/myelin-review-save-');
const wk='@myelin/native/workspace/local%3Adevice/primary',rk='@myelin/native/review/local%3Adevice';
(async()=>{for(const mode of (process.env.MYELIN_REVIEW_SAVE_CASES||'start,draft,reveal,workspace,advance,complete,restore').split(','))for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const now=Date.now(),w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const t=createTopic({name:'Cells',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'topic');t.cards=[createQuestion({prompt:'A first prompt',answer:'Saved reference',hint:'Saved hint'},now,'c1'),createQuestion({prompt:'B next prompt',answer:'Next reference',hint:''},now,'c2')];if(mode==='complete')t.cards.pop();w.topics=[t];
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w)};
 if(mode!=='start')seed[rk]=JSON.stringify({format:'myelin.native.review',version:1,id:'r1',createdAt:now,topicId:'topic',mixed:false,queue:buildReviewQueue(w,{now}),currentIndex:0,stage:['draft','reveal'].includes(mode)?'attempt':'reference',answerDraft:'Original answer',confidence:'sure',hintUsed:true,cardStartedAt:now,attemptId:'a1',completedCards:0});
 await page.addInitScript(({seed,rk,mode})=>{
  if(!localStorage.getItem('review-save-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('review-save-seeded','1');}
  window.__failReviewRead=mode==='restore';window.__failReviewWrite=false;window.__failWorkspace=false;window.__failClear=false;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  Storage.prototype.getItem=function(k){if(k===rk&&window.__failReviewRead)throw Error('Synthetic review read failure');return get.call(this,k)};
  Storage.prototype.setItem=function(k,v){if(k===rk&&window.__failReviewWrite)throw Error('Synthetic review write failure');if(k.startsWith('@myelin/native/workspace/local%3Adevice/')&&window.__failWorkspace)throw Error('Synthetic workspace write failure');return set.call(this,k,v)};
  Storage.prototype.removeItem=function(k){if(k===rk&&window.__failClear)throw Error('Synthetic review clear failure');return remove.call(this,k)};
 },{seed,rk,mode});
 await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/review',{waitUntil:'networkidle'});
 const session=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),rk),workspace=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);
 if(mode==='restore'){
  await page.getByRole('button',{name:'Retry restoring review',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/^Start mixed review/}).count(),0);
  await page.waitForTimeout(400);await page.screenshot({path:dir+`/restore-error-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failReviewRead=false});await page.getByRole('button',{name:'Retry restoring review',exact:true}).click();await page.getByText('Original answer',{exact:true}).waitFor();assert.equal((await session()).attemptId,'a1');assert.deepEqual(await workspace(),w);
 }else if(mode==='start'){
  await page.getByRole('button',{name:/^Start mixed review/}).waitFor();await page.evaluate(()=>{window.__failReviewWrite=true});await page.getByRole('button',{name:/^Start mixed review/}).click();await page.getByText(/Review changes could not be saved/).waitFor();assert.equal(await session(),null);assert.deepEqual(await workspace(),w);
  await page.waitForTimeout(400);await page.screenshot({path:dir+`/start-error-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failReviewWrite=false});await page.getByRole('button',{name:/^Start mixed review/}).click();await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();assert.equal((await session()).currentIndex,0);
 }else if(mode==='draft'||mode==='reveal'){
  const input=page.getByRole('textbox',{name:'Your recall answer',exact:true});await input.waitFor();const before=await session();await page.evaluate(()=>{window.__failReviewWrite=true});
  if(mode==='draft'){await input.fill('Kept typed draft');await page.getByText(/Review changes could not be saved/).waitFor();assert.equal(await input.inputValue(),'Kept typed draft');}
  else await page.getByRole('button',{name:'Show reference answer',exact:true}).click();
  await page.getByText(/Review changes could not be saved/).waitFor();assert.deepEqual(await session(),before);assert.equal(await page.getByText('COMPARE, THEN GRADE',{exact:true}).count(),0);assert.deepEqual(await workspace(),w);
  await page.evaluate(()=>{window.__failReviewWrite=false});await page.getByRole('button',{name:'Show reference answer',exact:true}).click();await page.getByText('COMPARE, THEN GRADE',{exact:true}).waitFor();assert.equal((await session()).answerDraft,mode==='draft'?'Kept typed draft':'Original answer');
 }else{
  await page.getByText('COMPARE, THEN GRADE',{exact:true}).waitFor();await page.evaluate(mode=>{window.__failReviewWrite=mode==='advance';window.__failWorkspace=mode==='workspace';window.__failClear=mode==='complete'},mode);
  const grade=page.getByRole('button',{name:mode==='complete'?/^Good\./:/^Again\./});await grade.click();
  await page.getByText(mode==='workspace'?/Your grade could not be saved/:/Your original grade is saved/).waitFor();assert.equal((await session()).attemptId,'a1');assert.equal((await session()).currentIndex,0);
  if(mode!=='workspace'){const saved=await workspace();assert.equal(saved.history.filter(h=>h.reviewAttemptId==='a1').length,1);assert.equal(saved.topics[0].cards[0].reps,1);}
  await page.waitForTimeout(400);await page.screenshot({path:dir+`/${mode}-error-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failReviewWrite=false;window.__failWorkspace=false;window.__failClear=false});
  await page.getByRole('button',{name:/^Good\./}).click();
  if(mode==='complete'){await page.getByText('Review queue complete.',{exact:true}).waitFor();assert.equal(await session(),null);}
  else{await page.getByRole('textbox',{name:'Your recall answer',exact:true}).waitFor();assert.equal((await session()).currentIndex,1);assert.equal((await session()).queue.length,3);}
  const saved=await workspace();assert.equal(saved.history.filter(h=>h.reviewAttemptId==='a1').length,1);assert.equal(saved.history.find(h=>h.reviewAttemptId==='a1').grade,mode==='complete'?3:1);assert.equal(saved.topics[0].cards[0].reps,1);assert.equal(saved.mistakes.length,mode==='complete'?0:1);if(mode!=='complete')assert.equal(saved.mistakes[0].detail,'Original answer');
  await page.reload({waitUntil:'networkidle'});assert.equal((await workspace()).history.filter(h=>h.reviewAttemptId==='a1').length,1);
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`✓ Review save ${mode}, reduced=${reduced}: visible storage error, explicit recovery and original evidence`);
 }catch(e){await page.waitForTimeout(400);await page.screenshot({path:dir+'/save-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-2000));throw e;}finally{await page.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
