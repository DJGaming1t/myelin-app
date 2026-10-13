import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { ProgressGuideState, progressGuideSteps } from './guide-registry';
import { useScreenGuide } from './useScreenGuide';

export function useProgressGuide(ready: boolean, ownerKey: string | null, state: ProgressGuideState) {
  const map = useRef<View>(null);
  const practice = useRef<View>(null);
  const evidence = useRef<View>(null);
  const anchors = useMemo(() => ({ 'progress.map': map, 'progress.practice': practice, 'progress.evidence': evidence }), []);
  const steps = useMemo(() => progressGuideSteps(state), [state.hasTopics, state.practice, state.expanded, state.enoughConfidence]);
  return useScreenGuide(ready, ownerKey, 'progress', anchors, steps);
}
