import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors } from '@/src/theme/tokens';

export default function AppLayout() {
  const { ready, user, localMode } = useAuth();
  const { workspace } = useWorkspace();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!localMode && !user) return <Redirect href="/(auth)" />;
  if (user && !user.emailVerified) return <Redirect href="/(verification)/verify-email" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: workspace?.settings.reduceMotion ? 'none' : 'fade',
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
