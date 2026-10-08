const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

function isNativeInput(file) {
  return /^(app\.json|app\.config\.[jt]s|package-lock\.json|google-services\.json|scripts\/generate-icon\.cjs)$/.test(file) ||
    /^(android|ios|plugins|modules|assets)\//.test(file);
}

// npm scripts do not alter the native binary. Everything else must match.
function packageRuntime(pkg) {
  const { scripts, ...runtime } = pkg;
  return runtime;
}

if (process.argv.includes('--self-test')) {
  for (const file of ['app.json', 'app.config.js', 'package-lock.json', 'google-services.json', 'scripts/generate-icon.cjs', 'plugins/local.js', 'modules/test/x', 'android/gradle.properties', 'ios/Podfile', 'assets/icon.png']) {
    assert.equal(isNativeInput(file), true, file);
  }
  assert.equal(isNativeInput('src/features/assistant/myelin-mini.ts'), false);
  assert.deepEqual(packageRuntime({ dependencies: { expo: '57' }, scripts: { a: 'old' } }), packageRuntime({ dependencies: { expo: '57' }, scripts: { a: 'new' } }));
  assert.notDeepEqual(packageRuntime({ dependencies: { expo: '57' } }), packageRuntime({ dependencies: { expo: '58' } }));
  console.log('Beta OTA compatibility regressions passed.');
} else {
  const base = process.env.BETA_BUILD_SHA;
  assert.match(base ?? '', /^[a-f0-9]{40}$/, 'An exact installed preview APK commit is required.');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const changed = git(['diff', '--name-only', base, 'HEAD']).split('\n').filter(Boolean);
  const sensitive = changed.filter(isNativeInput);
  assert.deepEqual(sensitive, [], 'Native inputs differ from the preview APK; create a new APK instead of publishing an OTA.');
  const pkg = (ref) => JSON.parse(git(['show', `${ref}:package.json`]));
  assert.deepEqual(packageRuntime(pkg('HEAD')), packageRuntime(pkg(base)), 'Dependencies or other runtime package metadata changed.');
  const app = JSON.parse(git(['show', 'HEAD:app.json'])).expo;
  assert.equal(app.version, '0.2.13');
  assert.equal(app.runtimeVersion.policy, 'appVersion');
  assert.equal(app.extra.eas.projectId, '2171936c-83f9-459f-9bb6-dddc4768484e');
  console.log(`Android preview OTA matches APK commit ${base}, runtime ${app.version}.`);
}
