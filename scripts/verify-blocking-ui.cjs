// Web layout/interaction regression. Native blocking and authentication still require handset QA.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createEmptyWorkspace}=require(process.cwd()+'/src/data/schema.ts');
const {defaultFocusShieldConfig}=require(process.cwd()+'/src/features/focus/focus-shield.ts');
const output=process.env.MYELIN_UI_OUTPUT || '/tmp/myelin-blocking-ui';fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']});
try{for(const width of [320,390]){
 const page=await browser.newPage({viewport:{width,height:780},timezoneId:'Asia/Kolkata',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date('2026-10-21T12:00:00+05:30').getTime(),workspace=createEmptyWorkspace(now);workspace.settings.reduceMotion=true;
 const config=defaultFocusShieldConfig(now);config.mode='gentle';config.schedules=[];
 const key='@myelin/native/focus-shield/local%3Adevice';
 const seed={'myelin.auth.local-mode':'1','@myelin/onboarding/local%3Adevice':JSON.stringify({version:1,outcome:'completed',finishedAt:now}),'@myelin/native/workspace/local%3Adevice/primary':JSON.stringify(workspace),[key]:JSON.stringify(config)};
 await page.addInitScript(seed=>{if(!sessionStorage.getItem('blocking-test-seeded')){for(const[k,v]of Object.entries(seed))localStorage.setItem(k,v);sessionStorage.setItem('blocking-test-seeded','1');}},seed);
 await page.goto((process.env.MYELIN_TEST_BASE_URL || 'http://127.0.0.1:8081')+'/blocking',{waitUntil:'networkidle',timeout:180000});
 await page.getByText('Choose apps',{exact:true}).waitFor();
 for(const tab of ['Apps','Websites','When','Settings']){
  await page.getByRole('tab',{name:tab,exact:true}).click();await page.screenshot({path:`${output}/blocking-${tab.toLowerCase()}-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${tab}: no horizontal overflow at ${width}px`);
 }
 await page.getByRole('tab',{name:'When',exact:true}).click();await page.getByRole('switch',{name:'Block during Focus',exact:true}).click();
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).focusBlockingEnabled===false,key);
 const add=page.getByRole('button',{name:'+ Add schedule',exact:true});await add.scrollIntoViewIfNeeded();await add.click();
 await page.getByRole('textbox',{name:'Schedule name',exact:true}).fill('Evening revision');
 await page.getByRole('textbox',{name:'Schedule start time',exact:true}).fill('22:30');await page.getByRole('textbox',{name:'Schedule end time',exact:true}).fill('06:30');
 const save=page.getByRole('button',{name:'Save schedule',exact:true});await save.scrollIntoViewIfNeeded();const bounds=await save.boundingBox();assert.ok(bounds&&bounds.width>=44&&bounds.x>=0&&bounds.x+bounds.width<=width+1);await save.click();
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).schedules.some(s=>s.label==='Evening revision'),key);
 const actual=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(actual.focusBlockingEnabled,false);assert.equal(actual.sessionOnly,false);assert.equal(actual.schedules[0].startMinuteOfDay,1350);assert.equal(actual.schedules[0].endMinuteOfDay,390);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('tab',{name:'When',exact:true}).click();await page.getByText('Evening revision',{exact:true}).waitFor();assert.equal(await page.getByRole('switch',{name:'Block during Focus',exact:true}).isChecked(),false);
 assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${width}px tabs, no overflow, reachable controls, Focus opt-out, overnight schedule and durable reload`);
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
