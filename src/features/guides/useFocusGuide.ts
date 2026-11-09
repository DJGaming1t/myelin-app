import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FocusGuideAnchor, FocusGuideState, focusGuideSteps } from './guide-registry';
import { measureGuideView } from './measure-guide-view';

export function useFocusGuide(ready: boolean, ownerKey: string | null, state: FocusGuideState) {
  const { guide } = useLocalSearchParams<{ guide?: string }>();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const primary = useRef<View>(null);
  const secondary = useRef<View>(null);
  const support = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const originalOffset = useRef(0);
  const anchors = useMemo(
    () => ({
      'focus.primary': primary,
      'focus.secondary': secondary,
      'focus.support': support,
    }),
    [],
  );
  const steps = useMemo(() => focusGuideSteps(state), [state]);

  const start = useCallback(() => {
    if (openRef.current) return;
    originalOffset.current = offset.current;
    openRef.current = true;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    scroll.current?.scrollTo({ y: originalOffset.current, animated: false });
  }, []);

  useFocusEffect(useCallback(() => () => close(), [close]));
  useEffect(() => {
    close();
  }, [ownerKey, close]);

  useEffect(() => {
    if (!ready) {
      close();
      return;
    }
    if (guide === 'focus') {
      router.setParams({ guide: undefined });
      start();
    }
  }, [guide, ready, close, start]);

  const revealAnchor = useCallback(
    async (anchor: FocusGuideAnchor, shouldContinue?: () => boolean) => {
      const ref = anchors[anchor];
      if (!ref) return;
      const [target, viewport] = await Promise.all([
        measureGuideView(ref.current),
        measureGuideView(scroll.current?.getNativeScrollRef() ?? null),
      ]);
      if (!openRef.current || (shouldContinue && !shouldContinue()) || !target || !viewport) return;
      scroll.current?.scrollTo({
        y: Math.max(0, offset.current + target.y - viewport.y - 16),
        animated: false,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    },
    [anchors],
  );

  return { open, start, close, anchors, steps, scroll, offset, revealAnchor };
}
