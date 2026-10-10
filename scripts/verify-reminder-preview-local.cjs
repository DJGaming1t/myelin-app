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

// --full mirrors the CI verify job before the owner performs an optional
// explicit local EAS publication. Default stays fast and read-only.
const full = process.argv.includes('--full');
if (process.argv.slice(2).some((arg) => arg !== '--full')) {
  console.error('Usage: node scripts/verify-reminder-preview-local.cjs [--full]');
  process.exit(1);
}
if (full) {
  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const javaVersion = (String(java.stdout || '') + String(java.stderr || ''))
    .match(/(?:version\s+"|openjdk\s+)(\d+)/i);
  if (java.error || java.status !== 0 || !javaVersion || Number(javaVersion[1]) < 21) {
    console.error('Full CI parity requires Java 21+ for Firestore emulator tests.');
    process.exit(1);
  }
}

const tasks = [
  ['Android OTA compatibility self-test', node, ['scripts/check-beta-ota-compatibility.cjs', '--self-test']],
  ['Check installed Android APK matches this source', node, ['scripts/check-beta-ota-compatibility.cjs'], { env }],
  ['TypeScript', npx, ['tsc', '--noEmit']],
  ['Hosted conversation Worker protocol/security tests', node, ['--test', 'workers/assistant/test/conversation.test.mjs']],
];

if (full) {
  const os = require('node:os');
  const fs = require('node:fs');
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myelin-verify-'));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  for (const name of Object.keys(scripts).filter((name) => name.startsWith('verify:'))) {
    tasks.push(['CI app regression ' + name, npm, ['run', name]]);
  }

  const scenario = (name, timezone, reportFile) => {
    const reportEnv = {
      ...process.env,
      TZ: timezone,
      ...(reportFile ? { MYELIN_ASSISTANT_SCENARIO_REPORT: path.join(reportDir, reportFile) } : {}),
    };
    tasks.push([name + ' in ' + timezone, npx, ['tsx', 'scripts/' + name + '.ts'], { env: reportEnv }]);
  };
  scenario('verify-assistant-planning-review', 'Asia/Kolkata');
  scenario('verify-assistant-planning-review', 'America/Los_Angeles');
  for (const name of [
    'verify-hybrid-assistant',
    'verify-assistant-clarification',
    'verify-assistant-grounding',
  ]) tasks.push([name, npx, ['tsx', 'scripts/' + name + '.ts']]);
  for (const timezone of ['Asia/Kolkata', 'America/Los_Angeles']) {
    scenario('verify-assistant-conversation', timezone);
    scenario('verify-assistant-schedules', timezone);
  }
  scenario('verify-assistant-app-scenarios', 'Asia/Kolkata', 'assistant-scenarios-india.json');
  scenario('verify-assistant-app-scenarios', 'America/Los_Angeles', 'assistant-scenarios-us.json');
  for (const name of ['verify-adaptive', 'verify-transition']) {
    tasks.push([name, npx, ['tsx', 'scripts/' + name + '.ts']]);
  }
  tasks.push(['Expo prebuild configuration', npx, ['expo', 'config', '--type', 'prebuild']]);
} else {
  tasks.push(
    ['Focus timer and foreground regressions', npm, ['run', 'verify:focus']],
    ['Notification and Reminder Studio regressions', npm, ['run', 'verify:notifications']],
    ['Visual and accessibility source regressions', npm, ['run', 'verify:visual']],
    ['UI polish and screen integration regressions', npm, ['run', 'verify:polish']],
  );
}

for (const [label, command, args, options] of tasks) {
  console.log('\n== ' + label + ' ==');
  check(label, command, args, options);
}

console.log('\n' + (full ? 'Full local release verification' : 'Local Focus/Reminder preflight') +
  ' PASSED. This is not an Android device test or an Expo publication.');
