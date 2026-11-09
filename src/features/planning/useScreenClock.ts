import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { screenClockLifecycle } from './screenClockLifecycle';

// Refresh on return and across midnight; stop the timer when not visible or active.
export function useScreenClock() {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    const clock = screenClockLifecycle(() => setNow(Date.now()));
    clock.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => {
      clock.setActive(state === 'active');
    });
    return () => { clock.dispose(); subscription.remove(); };
  }, []));
  return now;
}
