import fs from 'node:fs';
import path from 'node:path';

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}
function json(relative: string) {
  return JSON.parse(read(relative)) as Record<string, any>;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const eas = json('eas.json');
const app = json('app.json');
const pkg = json('package.json');
const release = read('RELEASE.md');
const gitignore = read('.gitignore');
const previewWorkflow = read('.github/workflows/publish-preview.yml');
const previewBaseline = read('.eas/preview-native-baseline.txt').trim();

assert(eas.build?.development?.developmentClient === true, 'Development client profile is missing.');
assert(eas.build?.development?.distribution === 'internal', 'Development build is not internal.');
assert(eas.build?.preview?.distribution === 'internal', 'Preview build is not internal distribution.');
assert(eas.build?.preview?.android?.buildType === 'apk', 'Android preview does not explicitly build an APK.');
assert(eas.build?.preview?.channel === 'preview', 'Preview channel is missing.');
assert(eas.build?.production?.channel === 'production', 'Production channel is missing.');
assert(eas.build?.production?.autoIncrement === true, 'Production build numbers are not auto-incremented.');
assert(eas.cli?.appVersionSource === 'remote', 'EAS version source should be remote.');
assert(app.expo?.runtimeVersion?.policy === 'appVersion', 'Runtime version policy must protect native compatibility.');
assert(app.expo?.android?.package === 'com.djgaming1t.myelin', 'Android application ID changed unexpectedly.');
assert(pkg.dependencies?.['expo-updates'], 'expo-updates is not installed.');
assert(pkg.scripts?.['eas:preview'], 'Preview build script is missing.');
assert(pkg.scripts?.['eas:update:preview'], 'Preview update script is missing.');
assert(gitignore.includes('*.jks') && gitignore.includes('*.key'), 'Signing/private key ignore rules are missing.');
assert(release.includes('Google sign-in verification'), 'Release runbook is missing native auth verification.');
assert(release.includes('Preview APK installs on a real Android device'), 'Release runbook lacks an on-device preview gate.');
assert(/^[0-9a-f]{40}$/.test(previewBaseline), 'Preview native baseline must be a full Git commit SHA.');
assert(
  previewWorkflow.includes('git diff --name-only "$BASELINE" HEAD'),
  'Preview updater must compare native changes against the installed-build baseline.',
);
assert(
  previewWorkflow.includes('fetch-depth: 0'),
  'Preview updater needs full history to validate the native baseline.',
);

const projectId = app.expo?.extra?.eas?.projectId;
const updateUrl = app.expo?.updates?.url;

if (projectId || updateUrl) {
  assert(
    typeof projectId === 'string' && projectId.length > 10,
    'EAS project metadata is only partially configured.',
  );
  assert(
    updateUrl === `https://u.expo.dev/${projectId}`,
    'EAS Update URL does not match the configured EAS project ID.',
  );
  console.log('EAS project link detected; release configuration is internally consistent.');
} else {
  console.log('Release scaffold passed. EAS project link/update URL still require Expo-account setup.');
}
