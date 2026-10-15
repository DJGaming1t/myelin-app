const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {createTopic,createQuestion}=require(process.cwd()+'/src/features/topics/topic-operations.ts');
const {createMistake}=require(process.cwd()+'/src/features/mistakes/mistake-engine.ts');
const dir=process.env.MYELIN_REVIEW_GUIDE_SCREENSHOTS||fs.mkdtempSync('/tmp/myelin-notebook-');
const wk='@myelin/native/workspace/local%3Adevice/primary';
(async()=>{for(const mode of (process.env.MYELIN_NOTEBOOK_CASES||'create,create-fail,edit,edit-fail,delete,delete-fail,reopen,reopen-fail,cancel-delete,detail-only,no-topic').split(','))for(const reduced of [false,true]){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:JSON.parse(process.env.MYELIN_CHROMIUM_ARGS||'["--no-sandbox"]'),headless:true});const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const now=Date.now(),w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const topic=createTopic({name:'Cells',subject:'Biology',status:'review',priority:2,estimate:25,notes:''},now,'topic');topic.cards=[createQuestion({prompt:'Saved question',answer:'Saved reference',hint:''},now,'card')];w.topics=mode==='no-topic'?[]:[topic];
 const create=mode.startsWith('create')||mode==='no-topic',reopen=mode.startsWith('reopen');
 if(!create){const m=createMistake({topicId:'topic',cardId:'card',prompt:'Original prompt',correction:'Original correction',detail:'Original detail',reason:'concept'},now,'m1');m.wins=1;m.lastWinDay='2026-10-10';if(reopen){m.resolvedAt=now-1000;m.wins=2;}w.mistakes=[m];w.history=[{id:'old',topicId:'topic',mistakeId:'m1',at:now,kind:'review',minutes:0,grade:3,effort:3,prompt:'History prompt',response:'History response',confidence:'sure'}];}
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[wk]:JSON.stringify(w)};
 await page.addInitScript(seed=>{if(!localStorage.getItem('notebook-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('notebook-seeded','1');}window.__failNotebook=false;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('@myelin/native/workspace/local%3Adevice/')&&window.__failNotebook)throw Error('Synthetic notebook save failure');return set.call(this,k,v)};},seed);
 const base=process.env.MYELIN_TEST_BASE_URL||'http://localhost:8081';await page.goto(base+'/mistakes',{waitUntil:'networkidle'});
 const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),wk);
 if(create)await page.getByRole('button',{name:'Add',exact:true}).click();
 else{if(reopen){await page.getByRole('button',{name:/^Browse corrections/}).click();await page.getByRole('button',{name:'Resolved 1',exact:true}).click();}await page.getByRole('button',{name:/^Original prompt\./}).click();}
 if(mode==='no-topic'){await page.getByText(/Create a topic first/).waitFor();assert.deepEqual(await read(),w);}
 else{
  const failed=mode.endsWith('-fail');let action;
  if(create){await page.getByRole('textbox',{name:'Mistake prompt',exact:true}).fill('Typed prompt');await page.getByRole('textbox',{name:'Correct answer',exact:true}).fill('Typed correction');await page.getByRole('textbox',{name:'What happened',exact:true}).fill('Typed detail');action=page.getByRole('button',{name:'Save mistake',exact:true});}
  else if(mode.startsWith('edit')||mode==='detail-only'){await page.getByRole('textbox',{name:'What happened',exact:true}).fill('Typed detail');if(mode!=='detail-only')await page.getByRole('textbox',{name:'Correct answer',exact:true}).fill('Typed correction');action=page.getByRole('button',{name:'Save changes',exact:true});}
  else if(reopen)action=page.getByRole('button',{name:'Reopen mistake',exact:true});
  else{await page.getByRole('button',{name:'Delete mistake',exact:true}).click();await page.getByText('Delete this mistake?',{exact:true}).waitFor();const b=await page.getByRole('button',{name:'Delete mistake permanently',exact:true}).boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=321&&b.y+b.height<=569);if(mode==='cancel-delete'){await page.getByRole('button',{name:'Keep mistake',exact:true}).click();assert.deepEqual(await read(),w);assert.equal(await page.getByRole('textbox',{name:'Correct answer',exact:true}).inputValue(),'Original correction');}else action=page.getByRole('button',{name:'Delete mistake permanently',exact:true});}
  if(mode!=='cancel-delete'){
   if(failed)await page.evaluate(()=>{window.__failNotebook=true});await action.evaluate(el=>{el.click();el.click()});
   if(failed){await page.getByRole('button',{name:'Retry saving change',exact:true}).waitFor();assert.ok(page.url().includes(create?'/new':'/m1'),'Failure retains the current screen');if(!reopen){assert.equal(await page.getByRole('textbox',{name:'Correct answer',exact:true}).inputValue(),mode.startsWith('delete')?'Original correction':'Typed correction');assert.equal(await page.getByRole('textbox',{name:'Correct answer',exact:true}).isEditable(),false);}else assert.equal(await page.getByRole('button',{name:'Reopen mistake',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'Dismiss achievement',exact:true}).click();await page.getByRole('button',{name:'Retry saving change',exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(400);await page.screenshot({path:dir+`/notebook-${mode}-${reduced}.png`,fullPage:true});await page.evaluate(()=>{window.__failNotebook=false});await page.getByRole('button',{name:'Retry saving change',exact:true}).click();
   }
   if(create){await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Correct answer',exact:true}).inputValue(),'Typed correction');}
   else if(reopen){await page.getByRole('textbox',{name:'Correct answer',exact:true}).waitFor();await page.getByText(/0\/2 spaced retest wins/).waitFor();}
   else await page.getByRole('button',{name:'Add',exact:true}).waitFor();
   const saved=await read();assert.equal(saved.revision,w.revision+1,'Retry persists rather than replaying the mutation');assert.equal(saved.history.length,w.history.length);if(mode.startsWith('delete')){assert.equal(saved.mistakes.length,0);assert.equal(saved.history[0].mistakeId,undefined);assert.equal(saved.history[0].response,'History response');}else{assert.equal(saved.mistakes.length,1);assert.equal(saved.mistakes[0].wins,mode==='detail-only'?1:0);if(mode.startsWith('edit')||create)assert.equal(saved.mistakes[0].correction,'Typed correction');if(reopen)assert.equal(saved.mistakes[0].resolvedAt,0);}
   await page.reload({waitUntil:'networkidle'});assert.equal((await read()).revision,w.revision+1);assert.equal((await read()).mistakes.length,saved.mistakes.length);
  }
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`✓ Notebook ${mode}, reduced=${reduced}: guarded action, durable navigation and one result`);
 }catch(e){await page.screenshot({path:dir+'/notebook-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-2500));throw e;}finally{await page.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
