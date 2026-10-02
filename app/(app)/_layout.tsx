import { Redirect, Stack } from 'expo-router';

import { ScreenState } from '@/src/components/app/ScreenState';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { useEntryDestination } from '@/src/features/onboarding/use-entry-destination';

export default function AppLayout() {
  const destination = useEntryDestination();
  const { status, saveError, retryWorkspace } = useWorkspace();
  const reduceMotion = useReducedMotion();

  if (!destination) {
    return (
      <ScreenState
        kind="loading"
        title="Opening MYELIN"
        message="Preparing your workspace…"
        fill
      />
    );
  }

  if (destination !== '/(app)/today') {
    return <Redirect href={destination} />;
  }

  if (status === 'error') {
    return (
      <ScreenState
        kind="error"
        title="Your workspace did not open"
        message={
          saveError ||
          'MYELIN could not read the local workspace on this device.'
        }
        actionLabel="Try again"
        onAction={() => void retryWorkspace()}
        fill
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'fade_from_bottom',
      }}>
      <Stack.Screen name="today/index" options={{ animation: 'none' }} />
      <Stack.Screen name="topics" options={{ animation: 'none' }} />
      <Stack.Screen name="review/index" options={{ animation: 'none' }} />
      <Stack.Screen name="progress/index" options={{ animation: 'none' }} />
    </Stack>
  );
}
