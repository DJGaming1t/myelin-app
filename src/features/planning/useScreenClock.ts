import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

// Re-evaluate due dates, capacity and greetings on return and across midnight.
// Only the visible screen ticks, and background ticks do not trigger renders.
export function useScreenClock() {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, 30_000);
    return () => { clearInterval(timer); subscription.remove(); };
  }, []));
  return now;
}
