import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { GuideStep, TutorialAnchor, TutorialId } from './guide-registry';
import { measureGuideView } from './measure-guide-view';

/** Shared presentation state only: never starts, pauses or completes study sessions. */
export function useScreenGuide<A extends TutorialAnchor>(ready: boolean, ownerKey: string | null,
  tutorialId: TutorialId, anchors: Record<A, RefObject<View | null>>, steps: readonly GuideStep<A>[]) {
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
    scroll.current?.scrollTo({ y: originalOffset.current, animated: false });
  }, []);
  useFocusEffect(useCallback(() => () => close(), [close]));
  useEffect(() => { close(); }, [ownerKey, close]);
  useEffect(() => {
    if (!ready) { close(); return; }
    if (guide === tutorialId) {
      router.setParams({ guide: undefined });
      start();
    }
  }, [guide, ready, close, start, tutorialId]);

  const revealAnchor = useCallback(async (anchor: A, shouldContinue: () => boolean = () => true) => {
    const [target, viewport] = await Promise.all([
      measureGuideView(anchors[anchor].current), measureGuideView(scroll.current?.getNativeScrollRef() ?? null),
    ]);
    if (!openRef.current || !shouldContinue() || !target || !viewport) return;
    // Scrolling is immediate even when motion is enabled: the spotlight never chases a moving target.
    scroll.current?.scrollTo({ y: Math.max(0, offset.current + target.y - viewport.y - 16), animated: false });
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }, [anchors]);

  return { open, start, close, anchors, steps, scroll, offset, revealAnchor };
}
