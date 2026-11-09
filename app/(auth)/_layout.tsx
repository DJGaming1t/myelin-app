import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { detailTransition } from '@/src/features/navigation/transition';
import { MyelinArrival } from '@/src/components/app/MyelinArrival';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors } from '@/src/theme/tokens';

export default function AuthLayout() {
  const reduceMotion = useReducedMotion();
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
        ...detailTransition(reduceMotion),
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

