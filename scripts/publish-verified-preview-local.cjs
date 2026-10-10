/* GitHub Actions fallback for a VERIFIED, owner-authorized Android Expo OTA.
 * This cannot create or install an APK. It never changes GitHub billing.
 *
 *   node scripts/publish-verified-preview-local.cjs --check
 *   node scripts/publish-verified-preview-local.cjs --publish
 *
 * Publishing requires the owner's local Expo/EAS login or EXPO_TOKEN.
 * NEVER paste EXPO_TOKEN into a conversation or commit it to Git.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';
const npx = windows ? 'npx.cmd' : 'npx';
const node = process.execPath;
const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--publish'].includes(args[0])) {
  console.error('Usage: node scripts/publish-verified-preview-local.cjs --check|--publish');
  process.exit(1);
}
const publishing = args[0] === '--publish';

function command(bin, argv, capture = false) {
  const result = spawnSync(bin, argv, {
    cwd: root,
    env: process.env,
    shell: windows && bin !== node && bin !== 'git',
    stdio: capture ? 'pipe' : 'inherit',
    encoding: capture ? 'utf8' : undefined,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    if (capture && result.stderr) console.error(String(result.stderr).slice(-800));
    throw new Error('Command failed: ' + bin + ' (status ' + result.status + ')');
  }
  return capture ? String(result.stdout).trim() : '';
}

try {
  const before = command('git', ['rev-parse', 'HEAD'], true);
  console.log('MYELIN local Android preview ' + (publishing ? 'PUBLISH' : 'CHECK ONLY'));
  console.log('Git commit: ' + before);
  // Reinstall exactly from package-lock before running checks, as GitHub CI does.
  command(npm, ['ci', '--no-audit', '--no-fund']);
  // The full mode mirrors the verification job of beta-assistant-preview.yml,
  // including all verify:* scripts, timezone scenarios and native APK compatibility.
  command(node, ['scripts/verify-reminder-preview-local.cjs', '--full']);
  const after = command('git', ['rev-parse', 'HEAD'], true);
  if (after !== before) throw new Error('Git HEAD moved during validation. No update was published.');
  const dirty = command('git', ['status', '--porcelain', '--untracked-files=no'], true);
  if (dirty) throw new Error('Tracked files changed during validation. No update was published.');

  if (!publishing) {
    console.log('Full verification passed. CHECK ONLY: no Android update was published.');
    process.exit(0);
  }

  // Validate the owner is authenticated before beginning a network publication.
  // Authentication is handled by EAS; this script never prints or stores tokens.
  console.log('Checking Expo account (local login or EXPO_TOKEN required)…');
  command(npx, ['--yes', 'eas-cli@latest', 'whoami']);
  console.log('Publishing verified commit ' + before + ' to Android preview only…');
  const stdout = command(npx, [
    '--yes', 'eas-cli@latest', 'update',
    '--channel', 'preview',
    '--environment', 'preview',
    '--platform', 'android',
    '--non-interactive',
    '--message', 'MYELIN locally verified Android preview ' + before,
    '--json',
  ], true);

  let receipt;
  try { receipt = JSON.parse(stdout); }
  catch { throw new Error('EAS returned a non-JSON receipt. Check the Expo dashboard BEFORE retrying: publication may have succeeded.'); }

  const items = Array.isArray(receipt) ? receipt :
    Array.isArray(receipt?.updates) ? receipt.updates : [receipt];
  const android = items.filter((item) => item &&
    String(item.platform || '').toLowerCase() === 'android' &&
    item.branch === 'preview' &&
    item.runtimeVersion === '0.2.13' &&
    item.gitCommitHash === before &&
    item.id && item.group);
  if (!android.length) {
    throw new Error('Receipt does not confirm Android preview runtime 0.2.13 for verified Git commit. Check Expo updates BEFORE retrying.');
  }
  for (const item of android) {
    console.log(JSON.stringify({
      platform: 'android',
      updateId: item.id || item.updateId || null,
      group: item.group || item.groupId || null,
      runtimeVersion: item.runtimeVersion || null,
    }));
  }
  console.log('Expo Android preview publish command succeeded for Git commit ' + before + '.');
  console.log('Phone-side OTA installation and actual notification delivery are NOT verified by this script.');
} catch (error) {
  console.error('Preview release stopped: ' + (error?.message || String(error)));
  process.exit(1);
}
