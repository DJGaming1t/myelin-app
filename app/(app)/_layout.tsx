import { Redirect, Stack } from 'expo-router';

import { ScreenState } from '@/src/components/app/ScreenState';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { chalkTheme, motion } from '@/src/theme/tokens';

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
        contentStyle: { backgroundColor: chalkTheme.hero },
        // Peer screens crossfade in place, keeping their floating docks aligned.
        // Detail screens retain the directional navigation cue.
        animation: reduceMotion
          ? 'none'
          : PEER_ROUTE_NAMES.has(route.name)
            ? 'fade'
            : 'slide_from_right',
        animationDuration: reduceMotion
          ? 0
          : PEER_ROUTE_NAMES.has(route.name)
            ? 180
            : motion.enterMs,
      })}>
      <Stack.Screen name="today/index" />
      <Stack.Screen name="topics" />
      <Stack.Screen name="review/index" />
      <Stack.Screen name="progress/index" />
    </Stack>
  );
}
