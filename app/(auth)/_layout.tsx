import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useEntryDestination } from '@/src/features/onboarding/use-entry-destination';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors } from '@/src/theme/tokens';

export default function AuthLayout() {
  const destination = useEntryDestination();
  const { transitionPending } = useOnboardingTransition();

  if (!transitionPending && !destination) {
    return <Loading />;
  }

  if (
    !transitionPending &&
    destination &&
    destination !== '/(auth)'
  ) {
    return <Redirect href={destination} />;
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
