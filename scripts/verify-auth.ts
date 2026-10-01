import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const google = JSON.parse(
  fs.readFileSync(path.join(root, 'google-services.json'), 'utf8'),
);
const authProvider = fs.readFileSync(
  path.join(root, 'src/features/auth/AuthProvider.tsx'),
  'utf8',
);
const authIntro = fs.readFileSync(path.join(root, 'app/(auth)/index.tsx'), 'utf8');
const authAccess = fs.readFileSync(path.join(root, 'app/(auth)/access.tsx'), 'utf8');
const authScaffold = fs.readFileSync(
  path.join(root, 'src/components/auth/AuthScaffold.tsx'),
  'utf8',
);

const packageName = app.expo?.android?.package;
assert.equal(packageName, 'com.djgaming1t.myelin', 'Unexpected Android package.');

const clients = Array.isArray(google.client) ? google.client : [];
const androidClient = clients.find(
  (client: any) => client?.client_info?.android_client_info?.package_name === packageName,
);
assert.ok(androidClient, 'google-services.json does not contain the MYELIN Android package.');

const oauthClients = Array.isArray(androidClient.oauth_client)
  ? androidClient.oauth_client
  : [];
assert.ok(
  oauthClients.some((client: any) => client.client_type === 3),
  'google-services.json is missing a web OAuth client required for Firebase Google credential exchange.',
);
assert.ok(
  oauthClients.some((client: any) => client.client_type === 1),
  [
    'google-services.json is missing an Android OAuth client.',
    'Register the EAS APK signing SHA-1/SHA-256 in Firebase for com.djgaming1t.myelin,',
    'download the refreshed google-services.json, then rebuild the native APK.',
  ].join(' '),
);

assert.ok(
  authProvider.includes('GoogleOneTapSignIn.createAccount()'),
  'Google button should start an explicit interactive account selection flow.',
);
assert.ok(
  authProvider.includes('auth.authStateReady()'),
  'Auth routing must wait for Firebase persistence restoration.',
);
assert.ok(
  authProvider.includes('sendEmailVerification(credential.user).catch'),
  'A verification-email delivery failure must not masquerade as account-creation failure.',
);

assert.ok(
  authIntro.includes('Know what to study. Then do it.'),
  'The first unauthenticated screen should explain MYELIN before asking for an account.',
);
assert.ok(
  authIntro.includes("router.push('/(auth)/access')"),
  'The product story should lead into a separate authentication choice screen.',
);
assert.ok(
  authIntro.includes('TOPICS') &&
    authIntro.includes('EXAMS') &&
    authIntro.includes('TIME') &&
    authIntro.includes('NEXT'),
  'The opening screen should show the MYELIN decision loop.',
);
assert.ok(
  authAccess.includes('Choose how MYELIN remembers you.'),
  'Authentication choices should carry the MYELIN personality.',
);
assert.ok(
  authAccess.includes('NEXT') &&
    authAccess.includes('FOCUS') &&
    authAccess.includes('RECALL') &&
    authAccess.includes('ADAPT'),
  'The authentication screen should express the core MYELIN study loop.',
);
assert.ok(
  authAccess.includes('Use MYELIN without an account'),
  'Local-only access must remain explicit and available.',
);
assert.ok(
  authScaffold.includes('<AmbientBackdrop />') && authScaffold.includes('<Reveal'),
  'Auth forms should use the same visual and motion language as the main app.',
);

console.log('Authentication configuration and experience verification passed.');
