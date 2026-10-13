import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { TodayGuideState, todayGuideSteps } from './guide-registry';
import { useScreenGuide } from './useScreenGuide';

export function useTodayGuide(ready: boolean, ownerKey: string | null, state: TodayGuideState) {
  const next = useRef<View>(null);
  const adjust = useRef<View>(null);
  const dayMap = useRef<View>(null);
  const anchors = useMemo(() => ({ 'today.next': next, 'today.adjust': adjust, 'today.day-map': dayMap }), []);
  const steps = useMemo(() => todayGuideSteps(state), [state]);
  return useScreenGuide(ready, ownerKey, 'today', anchors, steps);
}
