import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { FocusGuideState, focusGuideSteps } from './guide-registry';
import { useScreenGuide } from './useScreenGuide';

export function useFocusGuide(ready: boolean, ownerKey: string | null, state: FocusGuideState) {
  const primary = useRef<View>(null);
  const secondary = useRef<View>(null);
  const support = useRef<View>(null);
  const anchors = useMemo(() => ({ 'focus.primary': primary, 'focus.secondary': secondary, 'focus.support': support }), []);
  const steps = useMemo(() => focusGuideSteps(state), [state]);
  return useScreenGuide(ready, ownerKey, 'focus', anchors, steps);
}
