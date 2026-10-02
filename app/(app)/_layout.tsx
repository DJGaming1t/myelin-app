import { Redirect, Stack } from 'expo-router';

import { ScreenState } from '@/src/components/app/ScreenState';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';

const PEER_ROUTE_NAMES = new Set([
  'today',
  'today/index',
  'topics',
  'topics/index',
  'review',
  'review/index',
  'progress',
  'progress/index',
]);

export default function AppLayout() {
  const { ready: authReady, user, localMode } = useAuth();
  const { status, saveError, retryWorkspace } = useWorkspace();
  const { ready: onboardingReady, shouldShow } = useOnboarding();
  const { transitionPending } = useOnboardingTransition();
  const reduceMotion = useReducedMotion();

  if (!authReady) {
    return <ScreenState kind="loading" title="Opening MYELIN" message="Checking your session…" fill />;
  }

  if (!localMode && !user) return <Redirect href="/(auth)" />;
  if (user && !user.emailVerified) {
    return <Redirect href="/(verification)/verify-email" />;
  }

  if (status === 'error') {
    return (
      <ScreenState
        kind="error"
        title="Your workspace did not open"
        message={saveError || 'MYELIN could not read the local workspace on this device.'}
        actionLabel="Try again"
        onAction={() => void retryWorkspace()}
        fill
      />
    );
  }

  if (status !== 'ready') {
    return <ScreenState kind="loading" title="Opening workspace" message="Loading local study data…" fill />;
  }

  if (!onboardingReady) {
    return <ScreenState kind="loading" title="Finishing setup" message="Restoring your first-run state…" fill />;
  }

  if (!transitionPending && shouldShow) {
    return <Redirect href="/(onboarding)" />;
  }

  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        // The four bottom-nav destinations are peers. They must never inherit
        // a positional stack transition, including during router.replace().
        // Deeper routes keep the hierarchy cue.
        animation:
          reduceMotion || PEER_ROUTE_NAMES.has(route.name)
            ? 'none'
            : 'fade_from_bottom',
      })}>
      <Stack.Screen name="today/index" />
      <Stack.Screen name="topics" />
      <Stack.Screen name="review/index" />
      <Stack.Screen name="progress/index" />
    </Stack>
  );
}
