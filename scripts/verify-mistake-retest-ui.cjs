// Real Mistakes retest: queue identity, original evidence and retry-only persistence.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createTopic}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createMistake,localDayKey}=require(process.cwd()+'/src/features/mistakes/mistake-engine.ts');
const dir=process.env.MYELIN_REVIEW_GUIDE_SCREENSHOTS||fs.mkdtempSync('/tmp/myelin-mistake-');
const wk='@myelin/native/workspace/local%3Adevice/primary';
(async()=>{for(const mode of (process.env.MYELIN_MISTAKE_CASES||'win,miss,resolve,same-day,failed-win,failed-miss,failed-resolve,missing,mental,long,empty').split(','))for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const now=Date.now(),w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const topic=createTopic({name:'Cells',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'topic');w.topics=[topic];
 const m=createMistake({topicId:'topic',cardId:null,prompt:'A first mistake',detail:'Original wrong answer',correction:mode==='missing'?'':mode==='long'?'Saved correction details. '.repeat(100):'Saved correction',reason:'concept'},now-1000,'m1');
 if(['miss','resolve','same-day','failed-miss','failed-resolve'].includes(mode)){m.wins=1;m.lastWinDay=localDayKey(now-(mode==='same-day'?0:3*86400000));}
 const second=createMistake({topicId:'topic',cardId:null,prompt:'B second mistake',detail:'Other error',correction:'Different correction',reason:'concept'},now,'m2');w.mistakes=mode==='empty'?[]:['resolve','failed-resolve'].includes(mode)?[m]:[m,second];
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w)};
 await page.addInitScript(seed=>{if(!localStorage.getItem('mistake-retest-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('mistake-retest-seeded','1');}window.__failRetest=false;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('@myelin/native/workspace/local%3Adevice/')&&window.__failRetest)throw Error('Synthetic retest save failure');return set.call(this,k,v)};},seed);
 await page.goto((process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081')+'/mistakes/retest',{waitUntil:'networkidle'});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);
 if(mode==='empty'){await page.getByText('No mistakes are due right now.',{exact:true}).waitFor();assert.deepEqual(await read(),w);}
 else{
  const input=page.getByRole('textbox',{name:'Your correction from memory',exact:true});await input.waitFor();assert.equal(await page.getByRole('button',{name:/^Show correction/}).isEnabled(),false);
  if(mode==='mental')await page.getByRole('button',{name:'I answered this in my head',exact:true}).click();
  else{await input.fill('Original retest response');await page.getByRole('button',{name:/^Show correction/}).click();}
  await page.getByText('Did you reproduce the correction correctly?',{exact:true}).waitFor();assert.deepEqual(await read(),w,'Reveal and typed/mental attempts do not record learning');
  if(mode==='missing'){assert.equal(await page.getByRole('button',{name:/^Got it right/}).isEnabled(),false);await page.getByText(/Add a saved correction/).waitFor();}
  else{
   const failed=mode.startsWith('failed-'),miss=mode.includes('miss');if(failed)await page.evaluate(()=>{window.__failRetest=true});
   const action=page.getByRole('button',{name:miss?/^Still wrong/:/^Got it right/});await action.evaluate(el=>{el.click();el.click()});
   if(failed){await page.getByRole('button',{name:'Retry saving result',exact:true}).waitFor();await page.getByText('A first mistake',{exact:true}).waitFor();assert.equal(await page.getByText('B second mistake',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/^Got it right/}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:/^Still wrong/}).isEnabled(),false);
    await page.getByRole('button',{name:'Refresh retest',exact:true}).click();await page.getByText('Retry saving this result before continuing. Your answer is still here.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'← End',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'Dismiss achievement',exact:true}).click();
    await page.getByRole('button',{name:'Retry saving result',exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(450);await page.screenshot({path:dir+`/mistake-${mode}-${reduced}.png`,fullPage:true});
    await page.evaluate(()=>{window.__failRetest=false});await page.getByRole('button',{name:'Retry saving result',exact:true}).click();
   }
   if(mode.includes('resolve'))await page.getByText('No mistakes are due right now.',{exact:true}).waitFor();
   else{await page.getByText('B second mistake',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Your correction from memory',exact:true}).inputValue(),'','Next mistake starts with an empty answer');assert.equal(await page.getByRole('button',{name:/^Show correction/}).isEnabled(),false);}
   const saved=await read();assert.equal(saved.history.filter(h=>h.mistakeId==='m1').length,1);assert.equal(saved.history[0].response,mode==='mental'?'— Recalled mentally —':'Original retest response');if(saved.mistakes[1])assert.equal(saved.mistakes[1].wins,0);assert.equal(saved.mistakes[0].wins,mode.includes('resolve')?2:miss?0:1);assert.equal(saved.mistakes[0].resolvedAt>0,mode.includes('resolve'));assert.equal(saved.revision,w.revision+1);
   if(mode==='same-day')await page.getByText(/One win per day/).waitFor();await page.reload({waitUntil:'networkidle'});assert.equal((await read()).history.filter(h=>h.mistakeId==='m1').length,1,'Reload cannot count the saved result again');
  }
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`✓ Mistake retest ${mode}, reduced=${reduced}: correct attempt, spacing, one result and explicit save recovery`);
 }catch(e){await page.screenshot({path:dir+'/mistake-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-2500));throw e;}finally{await page.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
