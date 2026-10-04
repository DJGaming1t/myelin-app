import { RefObject, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { Reveal } from '@/src/components/motion/Reveal';
import { colors, radius } from '@/src/theme/tokens';
import { GuideStep, TutorialAnchor } from './guide-registry';
import { GuideRect, guideCardMaxHeight, guideCardTop, spotlightRect } from './guide-geometry';
import { measureGuideView } from './measure-guide-view';

type Props = {
  steps: readonly GuideStep[];
  anchors: Record<TutorialAnchor, RefObject<View | null>>;
  revealAnchor: (anchor: TutorialAnchor) => Promise<void>;
  onClose: () => void;
};

export function ScreenGuide({ steps, anchors, revealAnchor, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [target, setTarget] = useState<GuideRect | null>(null);
  const [measuring, setMeasuring] = useState(true);
  const [retry, setRetry] = useState(0);
  const [cardHeight, setCardHeight] = useState(240);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const hostRef = useRef<View>(null);
  const reduced = useReducedMotion();
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const step = steps[Math.min(index, steps.length - 1)];
  const width = hostSize.width || dimensions.width;
  const height = hostSize.height || dimensions.height;

  useEffect(() => {
    if (!shown || !step) return;
    let cancelled = false;
    setMeasuring(true); setTarget(null);
    void (async () => {
      try {
        await revealAnchor(step.anchor);
        if (cancelled) return;
        const [anchor, host] = await Promise.all([measureGuideView(anchors[step.anchor].current), measureGuideView(hostRef.current)]);
        if (cancelled) return;
        setTarget(anchor && host ? spotlightRect(anchor, host) : null);
        AccessibilityInfo.announceForAccessibility(`Step ${index + 1} of ${steps.length}. ${step.title}. ${step.explanation}`);
      } catch {
        if (!cancelled) setTarget(null);
      } finally { if (!cancelled) setMeasuring(false); }
    })();
    return () => { cancelled = true; };
  }, [shown, step, index, steps.length, anchors, revealAnchor, dimensions.width, dimensions.height, dimensions.fontScale, retry, hostSize.width, hostSize.height]);

  if (!step) return null;
  const maxHeight = guideCardMaxHeight(target, height, insets.top, insets.bottom);
  const top = guideCardTop(target, height, Math.min(cardHeight, maxHeight), insets.top, insets.bottom);
  return <Modal transparent visible animationType={reduced ? 'none' : 'fade'} statusBarTranslucent onShow={() => setShown(true)} onRequestClose={onClose}>
    <View ref={hostRef} collapsable={false} style={styles.overlay} onLayout={event => setHostSize(event.nativeEvent.layout)}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no-hide-descendants">
        {target ? <>
          <View style={[styles.shade, { top: 0, left: 0, right: 0, height: target.y }]} />
          <View style={[styles.shade, { top: target.y, left: 0, width: target.x, height: target.height }]} />
          <View style={[styles.shade, { top: target.y, left: target.x + target.width, right: 0, height: target.height }]} />
          <View style={[styles.shade, { top: target.y + target.height, left: 0, right: 0, bottom: 0 }]} />
          <View testID="guide-spotlight" style={[styles.ring, { left: target.x, top: target.y, width: target.width, height: target.height }]} />
        </> : <View style={[styles.shade, StyleSheet.absoluteFill]} />}
      </View>
      <View testID="guide-card" accessibilityViewIsModal style={[styles.card, { top, left: Math.max(12, (width - 420) / 2), width: Math.min(width - 24, 420), maxHeight }]} onLayout={event => setCardHeight(event.nativeEvent.layout.height)}>
        <View style={styles.heading}>
          <Text style={styles.step}>TODAY · {index + 1}/{steps.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip tutorial" onPress={onClose} style={styles.skip}><Text style={styles.secondaryText}>Skip</Text></Pressable>
        </View>
        <ScrollView style={styles.copyScroll} contentContainerStyle={styles.copy}>
          <Reveal key={step.anchor} distance={4} duration={160}>
            <Text accessibilityRole="header" style={styles.title}>{step.title}</Text>
            <Text style={styles.explanation}>{step.explanation}</Text>
            {!measuring && !target ? <Text accessibilityLiveRegion="polite" style={styles.fallback}>This control is not visible right now. Retry its highlight, or continue the explanation.</Text> : null}
          </Reveal>
        </ScrollView>
        {!measuring && !target ? <Pressable accessibilityRole="button" onPress={() => setRetry(v => v + 1)} style={styles.retry}><Text style={styles.secondaryText}>Retry highlight</Text></Pressable> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous tutorial step" disabled={index === 0} onPress={() => setIndex(i => Math.max(0, i - 1))} style={[styles.back, index === 0 && styles.disabled]}><Text style={styles.secondaryText}>Back</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={index === steps.length - 1 ? 'Finish tutorial' : 'Next tutorial step'} onPress={() => index === steps.length - 1 ? onClose() : setIndex(i => i + 1)} style={styles.next}><Text style={styles.nextText}>{index === steps.length - 1 ? 'Done' : 'Next'}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1 }, shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.78)' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.accent, borderRadius: radius.md },
  card: { position: 'absolute', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.accentLine, borderRadius: radius.lg, paddingHorizontal: 16, paddingBottom: 14, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  step: { color: colors.accent, fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  skip: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  copyScroll: { flexShrink: 1 }, copy: { paddingBottom: 14 },
  title: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  explanation: { color: colors.textDim, fontSize: 14, lineHeight: 21, marginTop: 8 },
  fallback: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 2 },
  back: { minHeight: 48, flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  next: { minHeight: 48, flex: 1, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: colors.bg, fontSize: 14, fontWeight: '800' }, secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.35 }, retry: { minHeight: 48, justifyContent: 'center' },
});
