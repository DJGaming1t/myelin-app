import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { useNavigation, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { NavigationProp } from 'expo-router/react-navigation';
import { GuideStep, TutorialAnchor, TutorialId } from './guide-registry';
import { measureGuideView } from './measure-guide-view';

/** A virtualized list can provide the same measured viewport/offset behavior. */
export type GuideScrollAdapter = {
  measureNode: () => Pick<View, 'measureInWindow'> | null;
  scrollTo: (y: number) => void;
};

/** Shared presentation state only: never starts, pauses or completes study sessions. */
export function useScreenGuide<A extends TutorialAnchor>(ready: boolean, ownerKey: string | null,
  tutorialId: TutorialId, anchors: Record<A, RefObject<View | null>>, steps: readonly GuideStep<A>[],
  scrollAdapter?: GuideScrollAdapter) {
  const navigation = useNavigation<NavigationProp<Record<string, { guide?: string | string[] }>>>();
  const { guide: guideParam } = useLocalSearchParams<{ guide?: string | string[] }>();
  const guide = Array.isArray(guideParam) ? guideParam[0] : guideParam;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const originalOffset = useRef(0);
  const start = useCallback(() => {
    if (openRef.current || !ready) return;
    Keyboard.dismiss();
    originalOffset.current = offset.current;
    openRef.current = true;
    setOpen(true);
  }, [ready]);
  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    if (scrollAdapter) scrollAdapter.scrollTo(originalOffset.current);
    else scroll.current?.scrollTo({ y: originalOffset.current, animated: false });
  }, [scrollAdapter]);
  useFocusEffect(useCallback(() => () => close(), [close]));
  useEffect(() => { close(); }, [ownerKey, close]);
  useEffect(() => {
    if (!ready) { close(); return; }
    if (guide === tutorialId) {
      // Consume on this screen, including inside a nested Library stack.
      navigation.setParams({ guide: undefined });
      start();
    }
  }, [guide, ready, close, start, tutorialId, navigation]);

  const revealAnchor = useCallback(async (anchor: A, shouldContinue: () => boolean = () => true) => {
    const [target, viewport] = await Promise.all([
      measureGuideView(anchors[anchor].current), measureGuideView(scrollAdapter ? scrollAdapter.measureNode() : scroll.current?.getNativeScrollRef() ?? null),
    ]);
    if (!openRef.current || !shouldContinue() || !target || !viewport) return;
    // Scrolling is immediate even when motion is enabled: the spotlight never chases a moving target.
    const y = Math.max(0, offset.current + target.y - viewport.y - 16);
    if (scrollAdapter) scrollAdapter.scrollTo(y);
    else scroll.current?.scrollTo({ y, animated: false });
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }, [anchors, scrollAdapter]);

  return { open, start, close, anchors, steps, scroll, offset, revealAnchor };
}
