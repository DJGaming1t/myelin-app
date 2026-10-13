import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { ReviewGuideState, reviewGuideSteps } from './guide-registry';
import { useScreenGuide } from './useScreenGuide';

export function useReviewGuide(ready: boolean, ownerKey: string | null, state: ReviewGuideState) {
  const primary = useRef<View>(null);
  const secondary = useRef<View>(null);
  const support = useRef<View>(null);
  const anchors = useMemo(() => ({ 'review.primary': primary, 'review.secondary': secondary, 'review.support': support }), []);
  const steps = useMemo(() => reviewGuideSteps(state), [state]);
  return useScreenGuide(ready, ownerKey, 'review', anchors, steps);
}
