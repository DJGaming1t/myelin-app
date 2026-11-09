import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const main = readFileSync('app/(app)/settings/index.tsx', 'utf8');
assert.ok(main.includes('backgroundColor: chalkTheme.paper'));
assert.ok(main.includes('<PaperGrain />'));
for (const name of ['help', 'reminders', 'tutorial', 'cloud-sync', 'data-transfer', 'ai-assistant', 'ai-models', 'ai-syllabus']) {
  const source = readFileSync(`app/(app)/settings/${name}.tsx`, 'utf8');
  assert.ok(source.includes('SettingsHeader as ScreenHeader'), `${name} uses the shared graphite header`);
  assert.ok(source.includes('<AmbientBackdrop darkTop warmPaper />'), `${name} uses the warm paper backdrop`);
}
console.log('Settings shell consistency checks passed');
