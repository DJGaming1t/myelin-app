import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useEntryDestination } from '@/src/features/onboarding/use-entry-destination';
import { colors } from '@/src/theme/tokens';

export default function IndexScreen() {
  const destination = useEntryDestination();

  if (!destination) return <Loading />;
  return <Redirect href={destination} />;
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
