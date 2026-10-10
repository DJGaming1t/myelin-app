/* Local, Windows-compatible Reminder Studio preflight when GitHub Actions cannot dispatch runners.
 * Does not build or publish an APK/OTA. Full release still requires the workflow.
 * Run after npm ci: node scripts/verify-reminder-preview-local.cjs
 */
'use strict';

const { spawnSync } = require('node:child_process');

const windows = process.platform === 'win32';
const executable = windows ? 'npm.cmd' : 'npm';
const tasks = [
  ['TypeScript', windows ? 'npx.cmd' : 'npx', ['tsc', '--noEmit']],
  ['Notification and Reminder Studio regressions', executable, ['run', 'verify:notifications']],
  ['Visual and accessibility source regressions', executable, ['run', 'verify:visual']],
  ['UI polish and screen integration regressions', executable, ['run', 'verify:polish']],
];

for (const [label, command, args] of tasks) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: windows,
  });
  if (result.error || result.status !== 0) {
    console.error(`\nPreflight FAILED: ${label}`);
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) {
  console.log('\nLocal Reminder Studio preflight passed. This is not full CI, device testing, or an Expo publication.');
}
