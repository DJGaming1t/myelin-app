/* Offline behavioral tests for MYELIN's local preview fallback.
 * Runs with Node only. Every child process and EAS response is mocked:
 * no network, installs, Git mutation, login, billing, or publication.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publisherPath = path.join(__dirname, 'publish-verified-preview-local.cjs');
const publisherSource = fs.readFileSync(publisherPath, 'utf8');
new vm.Script(publisherSource, { filename: publisherPath });

const HEAD = 'ab'.repeat(20);
const OTHER_HEAD = 'cd'.repeat(20);
const GOOD_RECEIPT = [{
  id: 'update-verified',
  group: 'group-verified',
  platform: 'android',
  branch: 'preview',
  runtimeVersion: '0.2.13',
  gitCommitHash: HEAD,
}];

function simulate({
  mode = '--check',
  platform = 'linux',
  failStep = '',
  dirty = '',
  changeHead = false,
  receipt = GOOD_RECEIPT,
} = {}) {
  const calls = [];
  const messages = [];
  const exitCodes = [];
  let headReads = 0;

  const fakeSpawn = (bin, args, options = {}) => {
    const argv = [...args];
    const name = [bin, ...argv].join(' ');
    calls.push({ bin, args: argv, shell: options.shell });
    if (failStep && name.includes(failStep)) {
      return { status: 1, stderr: 'Simulated command failure', stdout: '' };
    }
    if (bin === 'git' && argv[0] === 'rev-parse') {
      headReads += 1;
      return { status: 0, stdout: (changeHead && headReads > 1 ? OTHER_HEAD : HEAD) + '\n', stderr: '' };
    }
    if (bin === 'git' && argv[0] === 'status') {
      return { status: 0, stdout: dirty, stderr: '' };
    }
    if (argv.includes('eas-cli@latest') && argv.includes('update')) {
      return { status: 0, stdout: JSON.stringify(receipt), stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  const fakeProcess = {
    argv: ['node', publisherPath, mode],
    execPath: '/usr/local/bin/node',
    platform,
    env: {},
    exit(code) {
      exitCodes.push(code);
      throw new Error('Simulated process.exit(' + code + ')');
    },
  };
  try {
    vm.runInNewContext(publisherSource, {
      require(name) {
        if (name === 'node:child_process') return { spawnSync: fakeSpawn };
        if (name === 'node:path') return path;
        throw new Error('Unexpected require: ' + name);
      },
      __dirname,
      process: fakeProcess,
      console: {
        log: (...args) => messages.push(args.join(' ')),
        error: (...args) => messages.push(args.join(' ')),
      },
    }, { filename: publisherPath, timeout: 1500 });
  } catch (error) {
    if (!String(error.message).startsWith('Simulated process.exit(')) throw error;
  }
  const published = calls.filter(({ args }) => args.includes('eas-cli@latest') && args.includes('update'));
  const verified = calls.filter(({ args }) => args.includes('verify-reminder-preview-local.cjs'));
  return { calls, messages, exitCodes, published, verified };
}

// Check mode cannot call EAS even after all verifications succeed.
const check = simulate();
assert.deepEqual(check.exitCodes, []);
assert.equal(check.verified.length, 1);
assert.deepEqual(check.verified[0].args.slice(-2), ['scripts/verify-reminder-preview-local.cjs', '--full']);
assert.equal(check.published.length, 0);
assert.match(check.messages.join('\n'), /CHECK ONLY: no Android update was published/);

// Successful publisher must run npm ci and full verification before EAS.
const ok = simulate({ mode: '--publish' });
assert.deepEqual(ok.exitCodes, []);
assert.equal(ok.published.length, 1);
const names = ok.calls.map(({ args }) => args.join(' '));
assert.ok(names.indexOf('ci --no-audit --no-fund') < names.indexOf('scripts/verify-reminder-preview-local.cjs --full'));
assert.ok(names.indexOf('scripts/verify-reminder-preview-local.cjs --full') <
  names.findIndex((value) => value.includes('eas-cli@latest update')));
assert.ok(ok.published[0].args.includes('--platform') && ok.published[0].args.includes('android'));
assert.ok(ok.published[0].args.includes('--channel') && ok.published[0].args.includes('preview'));
assert.match(ok.messages.join('\n'), /Expo Android preview publish command succeeded/);

// Source code may never publish if install, tests, Git state or login fails.
for (const failStep of [
  'ci --no-audit --no-fund',
  'scripts/verify-reminder-preview-local.cjs --full',
  'eas-cli@latest whoami',
]) {
  const failed = simulate({ mode: '--publish', failStep });
  assert.deepEqual(failed.exitCodes, [1], failStep);
  assert.equal(failed.published.length, 0, failStep + ' must block publication');
}
for (const opts of [{ dirty: ' M app/(app)/focus/index.tsx\n' }, { changeHead: true }]) {
  const failed = simulate({ mode: '--publish', ...opts });
  assert.deepEqual(failed.exitCodes, [1]);
  assert.equal(failed.published.length, 0, 'Changed source must block publication');
}

// A mismatching receipt means the update may have been sent; never say it
// is verified and never trigger a second automatic publish attempt.
for (const receipt of [
  [],
  [{ ...GOOD_RECEIPT[0], gitCommitHash: OTHER_HEAD }],
  [{ ...GOOD_RECEIPT[0], runtimeVersion: '0.3.0' }],
  [{ ...GOOD_RECEIPT[0], platform: 'ios' }],
  [{ ...GOOD_RECEIPT[0], branch: 'production' }],
]) {
  const failed = simulate({ mode: '--publish', receipt });
  assert.deepEqual(failed.exitCodes, [1]);
  assert.equal(failed.published.length, 1);
  assert.match(failed.messages.join('\n'), /Check Expo updates BEFORE retrying/);
}

// Windows requires cmd wrappers, selected only after evaluating platform.
const windows = simulate({ mode: '--publish', platform: 'win32' });
assert.deepEqual(windows.exitCodes, []);
assert.ok(windows.calls.some((call) => call.bin === 'npm.cmd' && call.shell));
assert.ok(windows.calls.some((call) => call.bin === 'npx.cmd' && call.shell));

console.log('✓ Local Android preview publisher check/publish, Windows, failure gates and receipt tests passed');
