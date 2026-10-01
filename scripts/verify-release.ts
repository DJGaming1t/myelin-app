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
const verifyWorkflow = read('.github/workflows/verify.yml');
const nativeGuard = read('scripts/check-native-runtime-boundary.cjs');
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

assert(verifyWorkflow.includes('publish_preview:'), 'Preview publishing must live in the verified workflow so it works on expo-migration.');
assert(verifyWorkflow.includes('needs: verify'), 'Preview publisher must wait for successful verification.');
assert(
  verifyWorkflow.includes("github.event_name == 'push' && github.ref == 'refs/heads/expo-migration'"),
  'Preview publisher must run only after pushes to expo-migration.',
);
assert(verifyWorkflow.includes('EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}'), 'Preview publisher must use the Expo CI token secret.');
assert(verifyWorkflow.includes('EXPO_TOKEN is not configured'), 'Missing Expo token must skip with an explicit notice.');
assert(verifyWorkflow.includes('npx eas-cli@latest update'), 'Preview publisher must use EAS Update.');
assert(verifyWorkflow.includes('--channel preview'), 'Preview publisher must target the preview channel.');
assert(verifyWorkflow.includes('--environment preview'), 'Preview publisher must use preview environment variables.');
assert(verifyWorkflow.includes('--platform android'), 'Preview publisher must target Android.');
assert(verifyWorkflow.includes('--non-interactive'), 'Preview publisher must be CI-safe.');

assert(verifyWorkflow.includes('fetch-depth: 0'), 'Verification checkout must expose history for runtime-boundary checks.');
assert(
  verifyWorkflow.includes('node scripts/check-native-runtime-boundary.cjs'),
  'Verification must run the native runtime boundary guard.',
);
assert(nativeGuard.includes("file === 'app.json'"), 'Runtime guard must treat Expo app config as native-sensitive.');
assert(nativeGuard.includes("file === 'package.json'"), 'Runtime guard must treat dependency changes as native-sensitive.');
assert(nativeGuard.includes("file.startsWith('android/')"), 'Runtime guard must detect committed Android changes.');
assert(nativeGuard.includes("file.startsWith('ios/')"), 'Runtime guard must detect committed iOS changes.');
assert(nativeGuard.includes('currentVersion === previousVersion'), 'Runtime guard must require a version boundary for native-sensitive changes.');

assert(
  !fs.existsSync(path.join(process.cwd(), '.github/workflows/publish-preview.yml')),
  'Preview publishing should be inline with verification instead of relying on workflow_run/default-branch behavior.',
);
assert(
  !fs.existsSync(path.join(process.cwd(), '.eas/workflows/publish-preview-update.yml')),
  'Automatic preview publishing should not depend on the stalled EAS Workflow worker.',
);
assert(
  !fs.existsSync(path.join(process.cwd(), '.eas/preview-native-baseline.txt')),
  'Manual preview native baseline should not be required.',
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
