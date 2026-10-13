// Optional Help end-to-end check against Expo web; uses external Playwright/browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const dir=process.env.MYELIN_HELP_SCREENSHOTS || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'myelin-help-ui-'));
const baseUrl=process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const key='@myelin/native/workspace/local%3Adevice/primary';
(async()=>{let browser;
try{for(const reduced of [false,true]){
 const options={...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}),args:process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'],headless:true};
 browser=await chromium.launch(options);
 const page=await browser.newPage({viewport:{width:320,height:568},timezoneId:'Asia/Kolkata',reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=Date.now(),w=createEmptyWorkspace(now);w.settings.reduceMotion=reduced;
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),[key]:JSON.stringify(w)};
 await page.addInitScript(seed=>{if(!localStorage.getItem('help-seeded')){Object.entries(seed).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('help-seeded','1');}},seed);
 const search=()=>page.getByRole('textbox',{name:'Search MYELIN help',exact:true});
 try{
  await page.goto(baseUrl+'/settings',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Help & tutorial',exact:true}).click();await page.getByRole('button',{name:'Search MYELIN help',exact:true}).click();
  await search().waitFor();const before=await page.evaluate(k=>localStorage.getItem(k),key);
  await page.screenshot({path:dir+`/help-home-${reduced}.png`,fullPage:true});
  await page.context().setOffline(true);
  for(const [q,id,name] of [['How do I move this to tomorrow?','tasks','Tasks and postponement'],['What does unsure mean?','confidence','Recall confidence'],['Where are my mistakes?','mistakes','Mistakes'],['How do I start focus?','focus','Focus']]){
   await search().fill(q);const result=page.getByTestId('help-result-'+id);await result.waitFor();
   assert.equal(await page.locator('[data-testid^="help-result-"]').first().getAttribute('data-testid'),'help-result-'+id);
   await result.getByRole('button',{name:'Explain '+name,exact:true}).click();
   await result.getByRole('button',{name:'Hide explanation for '+name,exact:true}).waitFor();
   assert.equal(await result.getByRole('button',{name:/Show me/}).count(),0,'These examples must not advertise unimplemented tours');
   if(id==='confidence') {await result.getByText(/Choose confidence before/).waitFor();await page.waitForTimeout(250);await page.screenshot({path:dir+`/help-explain-${reduced}.png`,fullPage:true});}
   if(id==='tasks')await result.getByText(/deadline, not the study schedule/).waitFor();
   await result.getByRole('button',{name:'Hide explanation for '+name,exact:true}).click();
  }
  await search().fill('foucs');await page.getByTestId('help-result-focus').waitFor();
  await search().fill('zzzzzzzz spaceship banana');await page.getByText('No matching guide yet',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Browse all guides',exact:true}).click();assert.equal(await page.locator('[data-testid^="help-result-"]').count(),10);
  await search().fill('unsure');await page.getByRole('button',{name:'Clear help search',exact:true}).click();await page.getByText('TRY A QUESTION',{exact:true}).waitFor();
  await page.getByRole('button',{name:'What does unsure mean?',exact:true}).click();await page.getByTestId('help-result-confidence').waitFor();
  await page.context().setOffline(false);
  await search().fill('mistakes');await page.getByRole('button',{name:'Go to Mistakes',exact:true}).click();await page.waitForURL(/\/mistakes$/);await page.getByText('Browse corrections',{exact:true}).waitFor();
  await page.goBack();await search().waitFor();assert.equal(await search().inputValue(),'mistakes','Back preserves help query');
  await search().fill('focus');await page.getByRole('button',{name:'Go to Focus',exact:true}).click();await page.getByText('Choose an open task or topic.',{exact:true}).waitFor();
  await page.goBack();await search().waitFor();
  await search().fill('today');await page.getByRole('button',{name:'Show me Today',exact:true}).click();await page.getByTestId('guide-spotlight').waitFor();
  await page.getByRole('button',{name:'Skip tutorial',exact:true}).click();
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),before,'Search, explain, navigation and tutorial preserve workspace');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('/focus/')||k.includes('/review/'))),false,'Help does not start study sessions');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`✓ Help 320×568 reduced=${reduced}: Settings entry, four offline questions, explanations, typo/no-match/browse/clear, Back, live navigation, Today tour, data preservation`);
 }catch(e){await page.screenshot({path:dir+'/help-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await page.close();await browser.close();browser=null;}
}}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
