import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { colors } from '@/src/theme/tokens';

export default function OnboardingLayout() {
  const { ready: authReady, user, localMode } = useAuth();
  const { status } = useWorkspace();
  const { ready: onboardingReady, shouldShow } = useOnboarding();

  if (!authReady) return <Loading />;

  if (!localMode && !user) return <Redirect href="/(auth)" />;
  if (user && !user.emailVerified) {
    return <Redirect href="/(verification)/verify-email" />;
  }

  if (status !== 'ready' && status !== 'error') return <Loading />;
  if (status === 'error') return <Redirect href="/(app)" />;
  if (!onboardingReady) return <Loading />;
  if (!shouldShow) return <Redirect href="/(app)" />;

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

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
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
