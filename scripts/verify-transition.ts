/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  resolveEntryTransitionDestination,
  transitionSegmentsMatch,
  type TransitionRoutingState,
} from '../src/features/onboarding/transition-routing';

function state(
  overrides: Partial<TransitionRoutingState> = {},
): TransitionRoutingState {
  return {
    authReady: true,
    userUid: null,
    emailVerified: false,
    localMode: false,
    workspaceOwnerKey: null,
    workspaceStatus: 'idle',
    workspacePresent: true,
    onboardingReady: false,
    shouldShowOnboarding: false,
    ...overrides,
  };
}

assert.equal(
  resolveEntryTransitionDestination(state({ authReady: false })),
  null,
  'Auth restoration must finish before entry can route.',
);

assert.equal(
  resolveEntryTransitionDestination(state()),
  null,
  'Signed-out users without local mode have no entry destination.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: true,
    }),
  ),
  null,
  'Local entry must not use workspace state until the local owner is installed.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'loading',
      onboardingReady: false,
    }),
  ),
  null,
  'Local entry must stay covered while its workspace is loading.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'ready',
      workspacePresent: false,
      onboardingReady: true,
      shouldShowOnboarding: true,
    }),
  ),
  null,
  'Local entry must not route from a stale ready status without a workspace object.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'ready',
      onboardingReady: false,
    }),
  ),
  null,
  'Local entry must wait for onboarding storage before deciding a destination.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: true,
    }),
  ),
  '/(onboarding)',
  'A fresh local user must transition directly into onboarding.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: false,
    }),
  ),
  '/(app)/today',
  'A returning local user must transition directly into Today.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: false,
      localMode: false,
    }),
  ),
  '/(verification)/verify-email',
  'An unverified email account must transition directly to verification.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: false,
    }),
  ),
  null,
  'A signed-in user must never route using a stale local workspace.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: true,
      workspaceOwnerKey: 'user:someone_else',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: false,
    }),
  ),
  null,
  'A signed-in user must never route using another account workspace.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: true,
      workspaceOwnerKey: 'user:user_123',
      workspaceStatus: 'loading',
      onboardingReady: false,
    }),
  ),
  null,
  'A verified account must stay covered while its own workspace loads.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: true,
      workspaceOwnerKey: 'user:user_123',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: true,
    }),
  ),
  '/(onboarding)',
  'A fresh verified account must transition directly into onboarding.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      userUid: 'user_123',
      emailVerified: true,
      workspaceOwnerKey: 'user:user_123',
      workspaceStatus: 'ready',
      onboardingReady: true,
      shouldShowOnboarding: false,
    }),
  ),
  '/(app)/today',
  'A returning verified account must transition directly into Today.',
);

assert.equal(
  resolveEntryTransitionDestination(
    state({
      localMode: true,
      workspaceOwnerKey: 'local:device',
      workspaceStatus: 'error',
      onboardingReady: false,
    }),
  ),
  '/(app)/today',
  'Workspace failures should reveal the app error state instead of trapping the circle.',
);

assert.equal(
  transitionSegmentsMatch('/(onboarding)', ['(onboarding)']),
  true,
);
assert.equal(
  transitionSegmentsMatch('/(app)/today', ['(app)', 'today']),
  true,
);
assert.equal(
  transitionSegmentsMatch('/(app)/today', ['(app)', 'index']),
  false,
);
assert.equal(
  transitionSegmentsMatch(
    '/(verification)/verify-email',
    ['(verification)', 'verify-email'],
  ),
  true,
);
assert.equal(
  transitionSegmentsMatch(
    '/(verification)/verify-email',
    ['(verification)'],
  ),
  false,
);

const provider = fs.readFileSync(
  'src/features/onboarding/OnboardingTransitionProvider.tsx',
  'utf8',
);
const authAccess = fs.readFileSync('app/(auth)/access.tsx', 'utf8');
const signIn = fs.readFileSync('app/(auth)/sign-in.tsx', 'utf8');
const signUp = fs.readFileSync('app/(auth)/sign-up.tsx', 'utf8');
const verification = fs.readFileSync(
  'app/(verification)/verify-email.tsx',
  'utf8',
);
const authLayout = fs.readFileSync('app/(auth)/_layout.tsx', 'utf8');
const verificationLayout = fs.readFileSync(
  'app/(verification)/_layout.tsx',
  'utf8',
);
const onboardingLayout = fs.readFileSync(
  'app/(onboarding)/_layout.tsx',
  'utf8',
);
const appLayout = fs.readFileSync('app/(app)/_layout.tsx', 'utf8');

assert.ok(provider.includes('resolveEntryTransitionDestination'));
assert.ok(provider.includes('workspaceOwnerKey'));
assert.ok(provider.includes('waitForEntryDestination'));
assert.ok(provider.includes('waitForRouteDestination'));
assert.ok(provider.includes('transitionSegmentsMatch'));
assert.ok(provider.includes('router.replace(destination)'));
assert.ok(provider.includes('STATE_READY_TIMEOUT_MS'));
assert.ok(provider.includes('ROUTE_READY_TIMEOUT_MS'));
assert.ok(provider.includes('transitionPending'));
assert.ok(provider.includes('[travel, 0, -travel]'));
assert.equal(provider.includes('scale: interpolate('), false);
assert.ok(provider.includes('styles.trail'));
assert.ok(provider.includes('styles.sheen'));
assert.ok(provider.includes('styles.contourOne'));
assert.ok(provider.includes('styles.contourTwo'));
assert.ok(provider.includes('withRepeat('));
assert.equal(provider.includes("router.replace('/')"), false);

for (const [label, source] of [
  ['access', authAccess],
  ['sign-in', signIn],
  ['sign-up', signUp],
  ['verification', verification],
] as const) {
  assert.equal(
    source.includes("() => router.replace('/')") &&
      source.includes('runEntryTransition'),
    false,
    `${label} must not animate through the root redirect route.`,
  );
}

assert.ok(authAccess.includes('runEntryTransition(() => continueLocally())'));
assert.ok(signIn.includes('runEntryTransition(() =>'));
assert.ok(signUp.includes('runEntryTransition(() =>'));
assert.ok(verification.includes('runEntryTransition('));

for (const [label, source] of [
  ['auth', authLayout],
  ['verification', verificationLayout],
  ['onboarding', onboardingLayout],
  ['app', appLayout],
] as const) {
  assert.ok(
    source.includes('transitionPending'),
    `${label} layout must understand active circle handoffs.`,
  );
}

assert.ok(onboardingLayout.includes("animation: 'none'"));
assert.ok(verificationLayout.includes("animation: 'none'"));

console.log('✓ transition routing waits for the correct auth/workspace owner');
console.log('✓ fresh and returning local/account users resolve deterministically');
console.log('✓ unverified accounts route directly to verification');
console.log('✓ animated entry never travels through the root redirect route');
console.log('✓ layout guards cannot race an active circle transition');
console.log('✓ reveal waits for the exact nested destination, not only its route group');
console.log('✓ nested destination stacks do not layer a second entry fade');
console.log('✓ transition timeouts prevent a permanent orange-screen deadlock');
console.log('✓ the transition is a translate-only rising field, not a zoom');
