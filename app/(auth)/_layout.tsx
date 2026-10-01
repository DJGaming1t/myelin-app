import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors } from '@/src/theme/tokens';

export default function AuthLayout() {
  const { ready, user, localMode } = useAuth();
  const { entryPending } = useOnboardingTransition();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!entryPending && (localMode || user?.emailVerified)) {
    return <Redirect href="/(app)" />;
  }
  if (!entryPending && user) {
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
