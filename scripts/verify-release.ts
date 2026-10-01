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
const previewWorkflow = read('.eas/workflows/publish-preview-update.yml');
const googleServices = json('google-services.json');

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
assert(
  pkg.scripts['eas:update:preview'].includes('--environment preview'),
  'Preview updates must explicitly use the preview EAS environment on SDK 55+.',
);
assert(
  pkg.scripts['eas:update:production'].includes('--environment production'),
  'Production updates must explicitly use the production EAS environment on SDK 55+.',
);
assert(gitignore.includes('*.jks') && gitignore.includes('*.key'), 'Signing/private key ignore rules are missing.');
assert(release.includes('Google sign-in verification'), 'Release runbook is missing native auth verification.');
assert(release.includes('Preview APK installs on a real Android device'), 'Release runbook lacks an on-device preview gate.');

assert(previewWorkflow.includes("branches: ['expo-migration']"), 'Preview EAS workflow must trigger on expo-migration.');
assert(previewWorkflow.includes('name: Verify source and calculate native fingerprint'), 'Preview EAS workflow must verify source inside the fingerprint job.');
assert(previewWorkflow.includes('after_install_node_modules:'), 'Preview EAS fingerprint job must run verification after dependency install.');
assert(previewWorkflow.includes('npm run verify:release'), 'Preview EAS workflow must include release verification.');
assert(previewWorkflow.includes('type: fingerprint'), 'Preview EAS workflow must fingerprint native compatibility.');
assert(previewWorkflow.includes('type: get-build'), 'Preview EAS workflow must look up a compatible preview build.');
assert(previewWorkflow.includes('profile: preview'), 'Preview EAS workflow must match the preview build profile.');
assert(previewWorkflow.includes('channel: preview'), 'Compatible build lookup must target the preview channel.');
assert(previewWorkflow.includes('distribution: internal'), 'Compatible build lookup must target internal preview builds.');
assert(previewWorkflow.includes('type: update'), 'Preview EAS workflow must publish through EAS Update.');
assert(previewWorkflow.includes('branch: preview'), 'Preview EAS workflow must target the preview update branch.');
assert(previewWorkflow.includes('platform: android'), 'Preview EAS workflow must publish the Android preview update.');
assert(previewWorkflow.includes('environment: preview'), 'Preview EAS workflow must use preview environment variables.');
assert(
  previewWorkflow.includes('if: ${{ needs.get_android_build.outputs.build_id }}'),
  'Preview EAS workflow must skip OTA when no native-compatible build exists.',
);
assert(
  !fs.existsSync(path.join(process.cwd(), '.github/workflows/publish-preview.yml')),
  'Legacy GitHub-token preview updater should be removed.',
);
assert(
  !fs.existsSync(path.join(process.cwd(), '.eas/preview-native-baseline.txt')),
  'Manual preview native baseline should not be required after fingerprint gating.',
);
assert(
  !fs.existsSync(path.join(process.cwd(), 'scripts/check-native-package-change.cjs')),
  'Legacy manual native-package diff helper should be removed.',
);

const androidGoogleClient = (googleServices.client ?? []).some((client: any) =>
  (client.oauth_client ?? []).some((oauth: any) => oauth.client_type === 1),
);
assert(
  androidGoogleClient,
  'google-services.json must contain the Android OAuth client for the EAS preview signing certificate.',
);

assert(
  fs.existsSync(path.join(process.cwd(), 'package-lock.json')),
  'package-lock.json must be committed for reproducible CI/EAS installs.',
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
