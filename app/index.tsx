import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { colors } from '@/src/theme/tokens';

export default function IndexScreen() {
  const { ready: authReady, user, localMode } = useAuth();
  const { status: workspaceStatus } = useWorkspace();
  const { ready: onboardingReady, shouldShow } = useOnboarding();

  if (!authReady) return <Loading />;

  const hasWorkspaceAccess = localMode || Boolean(user?.emailVerified);
  if (
    hasWorkspaceAccess &&
    workspaceStatus !== 'ready' &&
    workspaceStatus !== 'error'
  ) {
    return <Loading />;
  }

  if (hasWorkspaceAccess && !onboardingReady) return <Loading />;

  if (localMode) {
    return <Redirect href={shouldShow ? '/(onboarding)' : '/(app)'} />;
  }

  if (user && !user.emailVerified) {
    return <Redirect href="/(verification)/verify-email" />;
  }

  if (user) {
    return <Redirect href={shouldShow ? '/(onboarding)' : '/(app)'} />;
  }

  return <Redirect href="/(auth)" />;
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
