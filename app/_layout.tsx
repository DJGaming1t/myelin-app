import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AchievementProvider } from '@/src/features/achievement/AchievementProvider';
import { WorkspaceProvider } from '@/src/data/WorkspaceProvider';
import { LocalAiProvider } from '@/src/features/assistant/local-ai/LocalAiProvider';
import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { CloudSyncProvider } from '@/src/features/cloud-sync/CloudSyncProvider';
import { FocusProvider } from '@/src/features/focus/FocusProvider';
import { ReminderProvider } from '@/src/features/notifications/ReminderProvider';
import { OnboardingProvider } from '@/src/features/onboarding/OnboardingProvider';
import { OnboardingTransitionProvider } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { ReviewProvider, useReview } from '@/src/features/review/ReviewProvider';
import { StartupUpdateGate } from '@/src/features/updates/StartupUpdateGate';
import { chalkTheme, colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocalAiProvider>
          <StartupUpdateGate>
          <AuthProvider>
            <WorkspaceProvider>
              <AchievementProvider>
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
            </AchievementProvider>
            </WorkspaceProvider>
          </AuthProvider>
          </StartupUpdateGate>
        </LocalAiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const pathname = usePathname();
  const { session: reviewSession } = useReview();
  const darkStage = pathname === '/focus' || pathname.startsWith('/focus/') || pathname === '/today' || pathname === '/today/' || pathname === '/topics' || pathname === '/topics/new' || pathname === '/exams' || pathname === '/exams/new' || pathname === '/mistakes' || pathname === '/progress' || pathname === '/settings' || pathname === '/quick-add' || pathname === '/today/day-map' || pathname === '/today/task/new' || pathname === '/today/commitment/new' || (pathname === '/review' && !reviewSession);
  return (
    <>
      <StatusBar style={darkStage ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: darkStage ? chalkTheme.hero : colors.bg },
          animation: 'none',
        }}
      />
    </>
  );
}
