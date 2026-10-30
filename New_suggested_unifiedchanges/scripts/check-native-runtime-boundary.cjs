const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const baseSha = String(process.env.BASE_SHA || '').trim();

if (!baseSha || /^0+$/.test(baseSha)) {
  console.log('Native runtime boundary check skipped: no usable base SHA.');
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function readJsonAt(ref, path) {
  return JSON.parse(git(['show', `${ref}:${path}`]));
}

const changed = git(['diff', '--name-only', baseSha, 'HEAD'])
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const nativeSensitive = changed.filter((file) =>
  file === 'app.json' ||
  file === 'package.json' ||
  file === 'package-lock.json' ||
  file === 'google-services.json' ||
  file === 'app.config.js' ||
  file === 'app.config.ts' ||
  file.startsWith('plugins/') ||
  file.startsWith('android/') ||
  file.startsWith('ios/')
);

if (!nativeSensitive.length) {
  console.log('Native runtime boundary check passed: no native-sensitive files changed.');
  process.exit(0);
}

const current = JSON.parse(fs.readFileSync('app.json', 'utf8'));
let previous;
try {
  previous = readJsonAt(baseSha, 'app.json');
} catch (error) {
  console.error('Could not read app.json from the base commit.');
  throw error;
}

const currentVersion = current?.expo?.version;
const previousVersion = previous?.expo?.version;

if (!currentVersion || !previousVersion) {
  throw new Error('app.json must contain expo.version on both sides of a native-sensitive change.');
}

if (currentVersion === previousVersion) {
  console.error('Native-sensitive files changed without a new app/runtime version:');
  for (const file of nativeSensitive) console.error(`- ${file}`);
  console.error(
    `Bump app.json expo.version from ${currentVersion} before merging, then create a new preview APK.`,
  );
  process.exit(1);
}

console.log(
  `Native runtime boundary advanced from ${previousVersion} to ${currentVersion}; native-sensitive changes are allowed.`,
);
