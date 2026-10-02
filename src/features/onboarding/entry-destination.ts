export type WorkspaceGateStatus = 'idle' | 'loading' | 'ready' | 'error';

export type EntryDestination =
  | '/(auth)'
  | '/(verification)/verify-email'
  | '/(onboarding)'
  | '/(app)/today';

export type EntryStateSnapshot = {
  authReady: boolean;
  localMode: boolean;
  userPresent: boolean;
  emailVerified: boolean;
  workspaceStatus: WorkspaceGateStatus;
  onboardingReady: boolean;
  shouldShowOnboarding: boolean;
};

export function resolveEntryDestination(
  state: EntryStateSnapshot,
): EntryDestination | null {
  if (!state.authReady) return null;

  if (!state.localMode && !state.userPresent) {
    return '/(auth)';
  }

  if (state.userPresent && !state.emailVerified) {
    return '/(verification)/verify-email';
  }

  // A workspace error is itself a stable app destination because AppLayout
  // renders the recovery UI. Do not leave an entry transition waiting forever.
  if (state.workspaceStatus === 'error') {
    return '/(app)/today';
  }

  if (state.workspaceStatus !== 'ready' || !state.onboardingReady) {
    return null;
  }

  return state.shouldShowOnboarding ? '/(onboarding)' : '/(app)/today';
}

export function destinationSegments(
  destination: Exclude<EntryDestination, '/(auth)'>,
): readonly string[] {
  switch (destination) {
    case '/(verification)/verify-email':
      return ['(verification)', 'verify-email'];
    case '/(onboarding)':
      return ['(onboarding)'];
    case '/(app)/today':
      return ['(app)', 'today'];
  }
}
