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

console.log('Authentication configuration verification passed.');
