import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { detailTransition } from '@/src/features/navigation/transition';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors } from '@/src/theme/tokens';

export default function VerificationLayout() {
  const reduceMotion = useReducedMotion();
  const { ready, user, localMode } = useAuth();
  const { transitionPending } = useOnboardingTransition();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!transitionPending && localMode) return <Redirect href="/(app)" />;
  if (!transitionPending && !user) return <Redirect href="/(auth)" />;
  if (!transitionPending && user?.emailVerified) {
    return <Redirect href="/(app)" />;
  }

  return <Stack screenOptions={{ headerShown: false, ...detailTransition(reduceMotion) }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
