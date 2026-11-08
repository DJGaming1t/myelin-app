import { MyelinArrival } from '@/src/components/app/MyelinArrival';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors } from '@/src/theme/tokens';

export default function AuthLayout() {
  const { ready, user, localMode } = useAuth();
  const { transitionPending } = useOnboardingTransition();

  if (!ready) {
    return (
      <MyelinArrival loading />
    );
  }

  if (!transitionPending && (localMode || user?.emailVerified)) {
    return <Redirect href="/(app)" />;
  }
  if (!transitionPending && user) {
    return <Redirect href="/(verification)/verify-email" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

