import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkspaceProvider } from '@/src/data/WorkspaceProvider';
import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { CloudSyncProvider } from '@/src/features/cloud-sync/CloudSyncProvider';
import { FocusProvider } from '@/src/features/focus/FocusProvider';
import { ReminderProvider } from '@/src/features/notifications/ReminderProvider';
import { OnboardingProvider } from '@/src/features/onboarding/OnboardingProvider';
import { OnboardingTransitionProvider } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { ReviewProvider } from '@/src/features/review/ReviewProvider';
import { StartupUpdateGate } from '@/src/features/updates/StartupUpdateGate';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StartupUpdateGate>
        <AuthProvider>
          <WorkspaceProvider>
            <OnboardingProvider>
              <OnboardingTransitionProvider>
              <FocusProvider>
                <ReviewProvider>
                  <ReminderProvider>
                    <CloudSyncProvider>
                      <RootNavigator />
                    </CloudSyncProvider>
                  </ReminderProvider>
                </ReviewProvider>
              </FocusProvider>
              </OnboardingTransitionProvider>
            </OnboardingProvider>
          </WorkspaceProvider>
        </AuthProvider>
        </StartupUpdateGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'none',
        }}
      />
    </>
  );
}
