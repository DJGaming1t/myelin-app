import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TodayGuideState, todayGuideSteps, TutorialAnchor } from './guide-registry';
import { measureGuideView } from './measure-guide-view';

export function useTodayGuide(ready: boolean, ownerKey: string | null, state: TodayGuideState) {
  const { guide: guideParam } = useLocalSearchParams<{ guide?: string | string[] }>();
  const guide = Array.isArray(guideParam) ? guideParam[0] : guideParam;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const next = useRef<View>(null);
  const adjust = useRef<View>(null);
  const dayMap = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const originalOffset = useRef(0);
  const anchors = useMemo(() => ({ 'today.next': next, 'today.adjust': adjust, 'today.day-map': dayMap }), []);
  const steps = useMemo(() => todayGuideSteps(state), [state]);

  const start = useCallback(() => {
    if (openRef.current || !ready) return;
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
    if (guide === 'today') {
      router.setParams({ guide: undefined });
      start();
    }
  }, [guide, ready, close, start]);

  const revealAnchor = useCallback(async (anchor: TutorialAnchor) => {
    const [target, viewport] = await Promise.all([
      measureGuideView(anchors[anchor].current), measureGuideView(scroll.current?.getNativeScrollRef() ?? null),
    ]);
    if (!openRef.current || !target || !viewport) return;
    // Scrolling is immediate even when motion is enabled: the spotlight never chases a moving target.
    scroll.current?.scrollTo({ y: Math.max(0, offset.current + target.y - viewport.y - 16), animated: false });
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }, [anchors]);

  return { open, start, close, anchors, steps, scroll, offset, revealAnchor };
}
