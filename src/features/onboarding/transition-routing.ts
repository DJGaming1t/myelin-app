export type TransitionDestination =
  | '/(onboarding)'
  | '/(app)/today'
  | '/(verification)/verify-email';

export type TransitionGroup = '(onboarding)' | '(app)' | '(verification)';

export type TransitionRoutingState = {
  authReady: boolean;
  userUid: string | null;
  emailVerified: boolean;
  localMode: boolean;
  workspaceOwnerKey: string | null;
  workspaceStatus: 'idle' | 'loading' | 'ready' | 'error';
  onboardingReady: boolean;
  shouldShowOnboarding: boolean;
};

function expectedWorkspaceOwnerKey(state: TransitionRoutingState) {
  if (state.userUid) return `user:${state.userUid}`;
  if (state.localMode) return 'local:device';
  return null;
}

export function resolveEntryTransitionDestination(
  state: TransitionRoutingState,
): TransitionDestination | null {
  if (!state.authReady) return null;

  if (state.userUid && !state.emailVerified) {
    return '/(verification)/verify-email';
  }

  const expectedOwnerKey = expectedWorkspaceOwnerKey(state);
  if (!expectedOwnerKey) return null;

  // Do not route using stale workspace/onboarding state from a previous owner.
  if (state.workspaceOwnerKey !== expectedOwnerKey) return null;

  if (state.workspaceStatus === 'error') {
    return '/(app)/today';
  }

  if (state.workspaceStatus !== 'ready' || !state.onboardingReady) {
    return null;
  }

  return state.shouldShowOnboarding ? '/(onboarding)' : '/(app)/today';
}

export function transitionGroupForDestination(
  destination: TransitionDestination,
): TransitionGroup {
  if (destination.startsWith('/(onboarding)')) return '(onboarding)';
  if (destination.startsWith('/(verification)')) return '(verification)';
  return '(app)';
}
