// Web interaction checks; Android rendering and scheduling still need handset QA.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createEmptyWorkspace } = require(process.cwd() + '/src/data/schema.ts');
const { validateWorkspaceV2 } = require(process.cwd() + '/src/data/validation.ts');
const { createStudyTask } = require(process.cwd() + '/src/features/planning/task-engine.ts');
const output = process.env.MYELIN_UI_OUTPUT || '/tmp/myelin-project-ui';
const base = process.env.MYELIN_TEST_BASE_URL || 'http://127.0.0.1:8081';
const workspaceKey = '@myelin/native/workspace/local%3Adevice/primary';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 780 }, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const now = new Date('2026-10-30T12:00:00+05:30').getTime();
      await page.clock.setFixedTime(now);
      const workspace = createEmptyWorkspace(now);
      workspace.tasks.push(createStudyTask({ title: 'Existing work', estimatedMinutes: 25, now }));
      const seed = { 'myelin.auth.local-mode': '1', '@myelin/onboarding/local%3Adevice': JSON.stringify({ version: 1, outcome: 'completed', finishedAt: now }), [workspaceKey]: JSON.stringify(validateWorkspaceV2(workspace)) };
      await page.addInitScript(values => { if (!sessionStorage.getItem('project-test-seeded')) { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); sessionStorage.setItem('project-test-seeded', '1'); } }, seed);
      await page.goto(base + '/quick-add', { waitUntil: 'networkidle', timeout: 180000 });
      const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), workspaceKey);
      await page.getByText('Project in parts', { exact: true }).click();
      await page.getByRole('heading', { name: 'Make progress in parts' }).waitFor();
      await page.getByLabel('Project name').fill('History project');
      await page.getByLabel('Part 1 description').fill('Research');
      await page.getByLabel('Part 2 description').fill('Draft');
      await page.getByLabel('Part 2 day').fill('2026-02-30');
      await page.getByRole('button', { name: 'Add 2 parts' }).click();
      await page.getByText(/Choose a valid day/).waitFor();
      assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), workspaceKey)).tasks.length, 1);
      await page.getByLabel('Part 2 day').fill('2026-10-31');
      await page.getByLabel('Part 2 minutes').fill('45');
      await page.screenshot({ path: `${output}/project-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: 'Add 2 parts' }).click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).tasks.length === 3, workspaceKey);
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), workspaceKey);
      assert.deepEqual(after.tasks[0], before.tasks[0]);
      assert.deepEqual(after.tasks.slice(1).map(task => task.title), ['History project: Research', 'History project: Draft']);
      assert.equal(after.tasks[1].postponedUntil, 0);
      assert.equal(after.tasks[2].postponedUntil, new Date('2026-10-31T00:00:00+05:30').getTime());
      assert.equal(after.tasks[2].estimatedMinutes, 45);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Project form ${width}px: invalid date rejected, existing task preserved, parts saved.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
