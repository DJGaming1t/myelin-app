/* Read-only, Windows-compatible MYELIN preview preflight when Actions has no runner.
 * This NEVER publishes an APK or OTA update.
 * Usage: npm ci && node scripts/verify-reminder-preview-local.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';
const npx = windows ? 'npx.cmd' : 'npx';
const node = process.execPath;
const branch = 'codex/exam-autopilot-capacity-v1';

function run(command, args, { env = process.env, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    shell: windows && command !== node && command !== 'git',
    encoding: quiet ? 'utf8' : undefined,
    stdio: quiet ? 'pipe' : 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || (quiet ? String(result.stderr || '').trim() : '') ||
      ('Process exited with status ' + result.status));
  }
  return quiet ? String(result.stdout).trim() : '';
}

function check(label, command, args, options) {
  console.log(' + ' + label);
  try {
    return run(command, args, options);
  } catch (error) {
    console.error('\nPreflight FAILED: ' + label);
    console.error(error.message || String(error));
    process.exit(1);
  }
}

console.log('MYELIN Reminder Studio offline preflight (no publication)');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 24) {
  console.error('Node 24 required for CI parity; this machine has ' + process.versions.node);
  process.exit(1);
}

const isRepo = check('Validate Git checkout', 'git', ['rev-parse', '--is-inside-work-tree'], { quiet: true });
if (isRepo !== 'true') {
  console.error('Open the MYELIN repository folder before running this command.');
  process.exit(1);
}
const currentBranch = check('Validate feature branch', 'git', ['branch', '--show-current'], { quiet: true });
if (currentBranch !== branch) {
  console.error('Expected branch "' + branch + '", found "' + (currentBranch || '(detached)') + '".');
  console.error('Use: git switch ' + branch);
  process.exit(1);
}
const changes = check('Validate source matches a commit', 'git', ['status', '--porcelain', '--untracked-files=no'], { quiet: true });
if (changes) {
  console.error('Tracked files have local changes. Commit or stash them first so the checked source is reproducible.');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'node_modules', 'typescript'))) {
  console.error('Dependencies missing. Run "npm ci" first.');
  process.exit(1);
}

const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'beta-assistant-preview.yml'), 'utf8');
const expectedBuild = /^\s*BETA_BUILD_SHA:\s*([0-9a-f]{40})\s*$/m.exec(workflow)?.[1];
if (!expectedBuild) {
  console.error('The release workflow is missing its exact installed Android preview APK commit.');
  process.exit(1);
}
check('Preview APK baseline is in Git history', 'git', ['cat-file', '-e', expectedBuild + '^{commit}'], { quiet: true });
const env = { ...process.env, BETA_BUILD_SHA: expectedBuild };

const tasks = [
  ['Android OTA compatibility self-test', node, ['scripts/check-beta-ota-compatibility.cjs', '--self-test']],
  ['Check installed Android APK matches this source', node, ['scripts/check-beta-ota-compatibility.cjs'], { env }],
  ['TypeScript', npx, ['tsc', '--noEmit']],
  ['Hosted conversation Worker protocol/security tests', node, ['--test', 'workers/assistant/test/conversation.test.mjs']],
  ['Notification and Reminder Studio regressions', npm, ['run', 'verify:notifications']],
  ['Visual and accessibility source regressions', npm, ['run', 'verify:visual']],
  ['UI polish and screen integration regressions', npm, ['run', 'verify:polish']],
];

for (const [label, command, args, options] of tasks) {
  console.log('\n== ' + label + ' ==');
  check(label, command, args, options);
}

console.log('\nLocal Reminder Studio checks PASSED. This is not full GitHub CI, a device test, or an Expo publication.');
