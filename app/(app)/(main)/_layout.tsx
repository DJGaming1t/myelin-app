import { Tabs, usePathname } from 'expo-router';
import { AppNav } from '@/src/components/app/AppNav';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { chalkTheme } from '@/src/theme/tokens';

const ROOT_PATHS = new Set(['/today', '/topics', '/review', '/progress']);

export default function MainTabsLayout() {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const reduceMotion = useReducedMotion();
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        animation: reduceMotion ? 'none' : 'fade',
        sceneStyle: { backgroundColor: chalkTheme.hero },
      }}
      tabBar={({ navigation }) => ROOT_PATHS.has(pathname) ? (
        <AppNav overlay onNavigateTab={(tab) => {
          const route = tab === 'review' || tab === 'progress' ? `${tab}/index` : tab;
          navigation.navigate(route);
        }} />
      ) : null}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="topics" />
      <Tabs.Screen name="review/index" />
      <Tabs.Screen name="progress/index" />
    </Tabs>
  );
}
