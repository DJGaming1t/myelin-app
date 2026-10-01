import { Redirect, Stack } from 'expo-router';

import { ScreenState } from '@/src/components/app/ScreenState';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';

export default function AppLayout() {
  const { ready: authReady, user, localMode } = useAuth();
  const { status, saveError, retryWorkspace } = useWorkspace();
  const { ready: onboardingReady, shouldShow } = useOnboarding();

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

  if (shouldShow) return <Redirect href="/(onboarding)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    />
  );
}
