import { Stack } from 'expo-router';

import { colors } from '@/src/theme/tokens';

export default function TopicsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
    </Stack>
  );
}
