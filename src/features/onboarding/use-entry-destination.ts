import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';

import { resolveEntryDestination } from './entry-destination';

export function useEntryDestination() {
  const { ready: authReady, user, localMode } = useAuth();
  const { status: workspaceStatus } = useWorkspace();
  const {
    ready: onboardingReady,
    shouldShow: shouldShowOnboarding,
  } = useOnboarding();

  return resolveEntryDestination({
    authReady,
    localMode,
    userPresent: Boolean(user),
    emailVerified: Boolean(user?.emailVerified),
    workspaceStatus,
    onboardingReady,
    shouldShowOnboarding,
  });
}
