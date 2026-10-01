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
  authProvider.includes("const DEFAULT_KEEP_SIGNED_IN = Platform.OS !== 'web'"),
  'Mobile authentication should persist by default.',
);
assert.ok(
  authProvider.includes("keepValue === null ? DEFAULT_KEEP_SIGNED_IN : keepValue === '1'"),
  'A device without a saved persistence preference should use the mobile default.',
);
assert.ok(
  authProvider.includes('signInGoogle(keepSignedIn = DEFAULT_KEEP_SIGNED_IN)'),
  'Google sign-in should use the platform persistence default unless explicitly overridden.',
);
assert.ok(
  authProvider.includes('sendEmailVerification(credential.user).catch'),
  'A verification-email delivery failure must not masquerade as account-creation failure.',
);

assert.ok(
  authIntro.includes('Know what to study next.'),
  'The first unauthenticated screen should state the product value in one sentence.',
);
assert.ok(
  authIntro.includes("router.push('/(auth)/access')"),
  'The welcome screen should lead into a separate authentication choice screen.',
);
assert.equal(
  authIntro.includes('TOPICS') || authIntro.includes('EXAMS') || authIntro.includes('TIME'),
  false,
  'The welcome screen should not teach the whole product before access.',
);
assert.equal(
  authIntro.includes('<Signal') || authIntro.includes('<LoopStep'),
  false,
  'The welcome screen should avoid explanatory diagrams and multi-step study-loop UI.',
);
assert.ok(
  authAccess.includes('Continue to MYELIN'),
  'Authentication choices should have one clear heading.',
);
assert.equal(
  authAccess.includes('PersonalityStep') || authAccess.includes('YOUR STUDY SYSTEM'),
  false,
  'Authentication should not repeat the product tutorial.',
);
assert.ok(
  authAccess.includes('Use without an account'),
  'Local-only access must remain explicit and available.',
);
assert.ok(
  authScaffold.includes('<AmbientBackdrop />'),
  'Auth forms should keep the MYELIN visual shell.',
);
assert.equal(
  authScaffold.includes('<Reveal'),
  false,
  'High-frequency auth screens should not replay staged entrance motion.',
);

console.log('Authentication configuration and experience verification passed.');
