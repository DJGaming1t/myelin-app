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
const authButton = fs.readFileSync(
  path.join(root, 'src/components/auth/AuthButton.tsx'),
  'utf8',
);
const signInSource = fs.readFileSync(path.join(root, 'app/(auth)/sign-in.tsx'), 'utf8');
const signUpSource = fs.readFileSync(path.join(root, 'app/(auth)/sign-up.tsx'), 'utf8');
const authLayoutSource = fs.readFileSync(path.join(root, 'app/(auth)/_layout.tsx'), 'utf8');
const rootLayoutSource = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
const entryTransitionSource = fs.readFileSync(
  path.join(root, 'src/features/onboarding/OnboardingTransitionProvider.tsx'),
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
  authIntro.includes('Know what to study') && authIntro.includes('next.'),
  'The first unauthenticated screen should keep one clear value proposition.',
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
assert.ok(
  authScaffold.includes('bodyCard') && authScaffold.includes('backgroundColor: colors.panelGlass'),
  'Auth forms should live in a clear raised surface instead of floating directly on the background.',
);
assert.ok(
  authButton.includes("variant?: 'primary' | 'secondary' | 'quiet' | 'google'"),
  'Shared auth actions need a dedicated Google treatment.',
);
assert.ok(
  signInSource.includes('variant="google"') &&
    signInSource.includes('or sign in with email') &&
    signInSource.includes('runEntryTransition(') &&
    signInSource.includes('() => signInGoogle(keepSignedIn)') &&
    signInSource.includes("() => router.replace('/')"),
  'Sign-in should lead with Google, separate email clearly, and cover the route handoff.',
);
assert.ok(
  signUpSource.includes('variant="google"') &&
    signUpSource.includes('or create with email') &&
    signUpSource.includes('runEntryTransition(') &&
    signUpSource.includes('() => signInGoogle(keepSignedIn)'),
  'Account creation should offer the same polished Google-first entry path.',
);
assert.equal(
  signInSource.includes('MYELIN REMEMBERS THE WORKFLOW') ||
    signUpSource.includes('THE ACCOUNT IS SECONDARY'),
  false,
  'Auth screens should not use tiny explanatory developer-copy panels.',
);
assert.ok(
  authLayoutSource.includes('contentStyle: { backgroundColor: colors.bg }'),
  'The auth native stack must keep a dark surface during route changes.',
);
assert.ok(
  authLayoutSource.includes('entryPending') &&
    authLayoutSource.includes('!entryPending && (localMode || user?.emailVerified)'),
  'Firebase auth changes must not auto-redirect while the branded entry handoff is pending.',
);
assert.ok(
  authButton.includes('backgroundColor: colors.panelRaised') &&
    authButton.includes('borderColor: colors.accentLine') &&
    !authButton.includes("backgroundColor: '#F4F2EF'"),
  'The Google action must stay inside the dark MYELIN visual system.',
);
assert.ok(
  entryTransitionSource.includes('runEntryTransition') &&
    entryTransitionSource.includes('setEntryPending(true)') &&
    entryTransitionSource.includes('await task()') &&
    entryTransitionSource.includes('await nextFrame()') &&
    entryTransitionSource.includes('await commit()'),
  'Auth entry must hold routing, wait for authentication, then commit navigation once.',
);
assert.equal(
  entryTransitionSource.includes('setActive(true)') ||
    entryTransitionSource.includes('TransitionOverlay') ||
    entryTransitionSource.includes('react-native-reanimated'),
  false,
  'Auth entry should not layer a custom visual overlay on top of native stack motion.',
);
const entryTransitionStart = entryTransitionSource.indexOf(
  'const runEntryTransition = useCallback',
);
assert.ok(entryTransitionStart >= 0, 'Entry transition implementation is missing.');
const taskIndex = entryTransitionSource.indexOf('await task()', entryTransitionStart);
const frameIndex = entryTransitionSource.indexOf('await nextFrame()', taskIndex);
const commitIndex = entryTransitionSource.indexOf('await commit()', frameIndex);
assert.ok(
  taskIndex >= 0 && frameIndex > taskIndex && commitIndex > frameIndex,
  'The Google picker must finish before the protected frame and navigation commit.',
);
assert.ok(
  rootLayoutSource.includes("animation: reduceMotion ? 'none' : 'fade'"),
  'Visible auth/onboarding route motion should be owned by the native root stack.',
);

console.log('Authentication configuration and experience verification passed.');
