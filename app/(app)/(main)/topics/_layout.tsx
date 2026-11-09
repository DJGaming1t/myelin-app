import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { detailTransition } from '@/src/features/navigation/transition';
import { Stack } from 'expo-router';


export default function TopicsLayout() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...detailTransition(reduceMotion),
      }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
    </Stack>
  );
}
