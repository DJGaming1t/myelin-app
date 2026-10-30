// Web interaction checks; phone rendering remains a separate test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createEmptyWorkspace } = require(process.cwd() + '/src/data/schema.ts');
const { validateWorkspaceV2 } = require(process.cwd() + '/src/data/validation.ts');
const output = process.env.MYELIN_UI_OUTPUT || '/tmp/myelin-setup-ui';
const base = process.env.MYELIN_TEST_BASE_URL || 'http://127.0.0.1:8081';
const wk = '@myelin/native/workspace/local%3Adevice/primary';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 780 }, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const now = new Date('2026-10-30T12:00:00+05:30').getTime(); await page.clock.setFixedTime(now);
      const workspace = createEmptyWorkspace(now); workspace.settings.reduceMotion = true; workspace.settings.sleepEnabled = false;
      const seed = { 'myelin.auth.local-mode': '1', '@myelin/onboarding/local%3Adevice': JSON.stringify({ version: 1, outcome: 'completed', finishedAt: now }), '@myelin/guide-offers/v1/local%3Adevice/today': JSON.stringify({ version: 1, choice: 'later', at: now }), [wk]: JSON.stringify(validateWorkspaceV2(workspace)) };
      await page.addInitScript(values => { if (!sessionStorage.getItem('setup-test-seeded')) { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); sessionStorage.setItem('setup-test-seeded', '1'); } }, seed);
      await page.goto(base + '/today', { waitUntil: 'networkidle', timeout: 180000 });
      await page.getByRole('button', { name: 'Set up my plan' }).click();
      await page.getByRole('heading', { name: 'Set up one step at a time' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${output}/setup-${width}.png`, fullPage: true });
      await page.getByText('Add a task', { exact: true }).click();
      await page.getByPlaceholder('Finish Maths Exercise 5.2').fill('Finish history notes');
      await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
      await page.getByRole('button', { name: 'Add to Inbox' }).click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).tasks.length === 1, wk);
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), wk);
      assert.equal(after.tasks[0].title, 'Finish history notes'); assert.ok(after.tasks[0].dueAt > now);
      await page.goto(base + '/today', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Review deadline for Finish history notes' }).waitFor();
      await page.goto(base + '/settings/plan-setup', { waitUntil: 'networkidle' });
      await page.getByText('Keep building your plan.').waitFor();
      await page.getByText('Add a task', { exact: true }).click();
      await page.getByPlaceholder('Finish Maths Exercise 5.2').fill('Second task');
      await page.getByRole('button', { name: 'Add to Inbox' }).click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).tasks.length === 2, wk);
      const afterSecond = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), wk);
      assert.deepEqual(afterSecond.tasks[0], after.tasks[0]);
      assert.deepEqual(errors, []); await page.close();
      console.log(`Guided setup ${width}px: empty state, task creation and real deadline passed.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
