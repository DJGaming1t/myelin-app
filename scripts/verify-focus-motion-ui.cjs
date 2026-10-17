// Optional rendered Focus/motion regression. Requires Expo web and external Playwright/Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createEmptyWorkspace } = require(process.cwd() + '/src/data/schema.ts');
const { createStudyTask } = require(process.cwd() + '/src/features/planning/task-engine.ts');
const { colors } = require(process.cwd() + '/src/theme/tokens.ts');
const base = process.env.MYELIN_TEST_BASE_URL || 'http://localhost:8081';
const dir = process.env.MYELIN_FOCUS_MOTION_SCREENSHOTS || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'myelin-focus-motion-'));
const wk = '@myelin/native/workspace/local%3Adevice/primary';
const fk = '@myelin/native/focus/local%3Adevice';

async function inside(child, parent, message) {
  const a = await child.boundingBox(), b = await parent.boundingBox();
  assert.ok(a && b && a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1, message + ': ' + JSON.stringify({ a, b }));
}

(async () => {
  for (const width of [320, 390]) for (const reduced of [false, true]) {
    const browser = await chromium.launch({ headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: process.env.MYELIN_CHROMIUM_ARGS ? JSON.parse(process.env.MYELIN_CHROMIUM_ARGS) : ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width, height: 740 }, reducedMotion: reduced ? 'reduce' : 'no-preference', timezoneId: 'Asia/Kolkata' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const now = new Date('2026-10-18T12:00:00+05:30').getTime();
    await page.clock.setFixedTime(now);
    const workspace = createEmptyWorkspace(now);
    workspace.settings.reduceMotion = reduced; workspace.settings.sleepEnabled = false;
    const task = createStudyTask({ title: 'Biology practice', subject: 'Biology', estimatedMinutes: 35, planState: 'today', now });
    task.postponements = 2; task.steps = ['Read one question']; workspace.tasks = [task];
    const seed = { 'myelin.auth.local-mode': '1', [wk]: JSON.stringify(workspace),
      '@myelin/onboarding/local%3Adevice': JSON.stringify({ version: 1, outcome: 'completed', finishedAt: now }),
      '@myelin/guide-offers/v1/local%3Adevice/focus': JSON.stringify({ version: 1, choice: 'later', at: now }) };
    await page.addInitScript(seed => { if (!localStorage.getItem('focus-motion-seeded')) { Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('focus-motion-seeded', '1'); } }, seed);
    try {
      await page.goto(base + '/focus?taskId=' + task.id + '&minutes=35', { waitUntil: 'networkidle' });
      const preset = page.getByRole('button', { name: 'Focus for 35 minutes', exact: true });
      await preset.waitFor(); await page.getByText('Start 35-minute focus', { exact: true }).waitFor();
      for (const minutes of [10, 25, 35, 45]) {
        const chip = page.getByRole('button', { name: `Focus for ${minutes} minutes`, exact: true });
        assert.ok((await chip.boundingBox()).height >= 44, 'Duration touch target');
      }
      await page.getByRole('button', { name: 'Focus for 25 minutes', exact: true }).click();
      await page.getByText('Start 25-minute focus', { exact: true }).waitFor();
      await preset.click(); await page.getByText('Start 35-minute focus', { exact: true }).waitFor();
      for (const label of ['Hide first steps', 'Set up distraction blocking · optional']) {
        const text = page.getByText(label, { exact: true }); await text.scrollIntoViewIfNeeded();
        await inside(text, text.locator('..'), 'Disclosure label stays inside its row');
        const mark = text.locator('..').getByText(label.startsWith('Hide') ? '−' : '+', { exact: true });
        await inside(mark, text.locator('..'), 'Disclosure mark stays inside its row');
        const textBox = await text.boundingBox(), markBox = await mark.boundingBox();
        assert.ok(textBox.x + textBox.width <= markBox.x, 'Disclosure label does not overlap its mark');
      }
      await page.screenshot({ path: path.join(dir, `focus-setup-${width}-${reduced}.png`), fullPage: true });
      const before = await page.evaluate(k => localStorage.getItem(k), wk);
      const launch = page.getByRole('button', { name: /Five-minute launch/ });
      await launch.scrollIntoViewIfNeeded(); await launch.click();
      await page.getByText('5m launch · 35m target', { exact: true }).waitFor();
      await page.waitForTimeout(700); // Let the existing Reveal entrance settle before measuring motion.
      const dial = page.getByText('05:00', { exact: true }); await dial.scrollIntoViewIfNeeded();
      assert.ok(await dial.evaluate(el => { for (let node = el; node; node = node.parentElement) if (Number(getComputedStyle(node).opacity) === 0) return false; return true; }), 'Dial remains visible after entrance');
      const pause = page.getByRole('button', { name: 'Pause', exact: true }); await pause.click();
      await page.getByText('PAUSED', { exact: true }).waitFor();
      await page.waitForTimeout(600);
      const pauseScale = await dial.locator('../..').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
      assert.ok(Math.abs(pauseScale - (reduced ? 1 : 0.988)) < 0.002, 'Pause settle respects reduced motion');
      const paused = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), fk); assert.equal(paused.runningSince, null);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.getByRole('button', { name: 'Distraction parking', exact: true }).click();
      await page.getByRole('textbox', { name: 'Park a distraction', exact: true }).fill('Check the diagram later');
      await page.getByRole('button', { name: '+', exact: true }).click();
      const parking = page.getByRole('button', { name: 'Distraction parking', exact: true });
      await parking.getByText('1', { exact: true }).waitFor();
      await page.clock.setFixedTime(now + 6 * 60_000);
      await page.getByRole('button', { name: 'Finish after five minutes', exact: true }).click();
      await page.getByText('1 · Light', { exact: true }).waitFor();
      await page.waitForTimeout(600);
      const completeScale = await page.getByText('00:00', { exact: true }).locator('../..').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
      assert.ok(Math.abs(completeScale - (reduced ? 1 : 1.015)) < 0.002, 'Completion settle respects reduced motion');
      const fillColor = await page.getByLabel('Focus progress: 100%', { exact: true }).locator(':scope > div').first().evaluate(el => getComputedStyle(el).backgroundColor);
      const successRgb = colors.success.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16));
      assert.equal(fillColor, `rgb(${successRgb.join(', ')})`, 'Completed progress uses the success tone');
      await page.getByText('5 · Very demanding', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Effort 4 out of 5', exact: true }).click();
      await page.screenshot({ path: path.join(dir, `focus-finish-${width}-${reduced}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Complete focus', exact: true }).click();
      await page.getByText('Leave the work alone.', { exact: true }).waitFor();
      await page.getByText('10m recovery', { exact: true }).waitFor();
      const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), wk);
      assert.equal(saved.focusOutcomes.filter(item => item.status === 'finished').length, 1);
      assert.equal(saved.tasks[0].actualMinutes, 5); assert.equal(saved.focusOutcomes[0].plannedMinutes, 5);
      assert.notEqual(JSON.stringify(saved), before);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      console.log(`PASS Focus motion ${width}px reduced=${reduced}: presets, disclosure bounds, visible dial, pause/resume, parking badge, effort and single completion`);
    } catch (error) {
      await page.screenshot({ path: path.join(dir, `focus-motion-failure-${width}-${reduced}.png`), fullPage: true }); throw error;
    } finally { await page.close(); await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
