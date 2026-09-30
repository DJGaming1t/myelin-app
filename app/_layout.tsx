import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkspaceProvider } from '@/src/data/WorkspaceProvider';
import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { CloudSyncProvider } from '@/src/features/cloud-sync/CloudSyncProvider';
import { FocusProvider } from '@/src/features/focus/FocusProvider';
import { ReviewProvider } from '@/src/features/review/ReviewProvider';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <FocusProvider>
              <ReviewProvider>
                <CloudSyncProvider>
                  <StatusBar style="light" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                      animation: 'fade',
                    }}
                  />
                </CloudSyncProvider>
              </ReviewProvider>
            </FocusProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
