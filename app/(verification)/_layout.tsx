import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors } from '@/src/theme/tokens';

export default function VerificationLayout() {
  const { ready, user, localMode } = useAuth();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (localMode) return <Redirect href="/(app)" />;
  if (!user) return <Redirect href="/(auth)" />;
  if (user.emailVerified) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
