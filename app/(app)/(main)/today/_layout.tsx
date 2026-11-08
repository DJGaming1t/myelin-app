import { Stack } from 'expo-router';
import { chalkTheme } from '@/src/theme/tokens';

export default function TodayLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: chalkTheme.hero }, animation: 'slide_from_right' }}>
    <Stack.Screen name="index" options={{ animation: 'none' }} />
  </Stack>;
}
