import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius } from '@/src/theme/tokens';

type Achievement = { title: string; detail: string; undo?: () => boolean | void };
type OwnedAchievement = Achievement & { id: number; ownerKey: string };
const Context = createContext<(achievement: Achievement) => void>(() => undefined);

export function AchievementProvider({ children }: PropsWithChildren) {
  const { ownerKey, status, saveError, retrySaves } = useWorkspace();
  const [notice, setNotice] = useState<OwnedAchievement | null>(null);
  const sequence = useRef(0);
  const ownerRef = useRef(ownerKey); ownerRef.current = ownerKey;
  const readyRef = useRef(status === 'ready'); readyRef.current = status === 'ready';
  const noticeRef = useRef<OwnedAchievement | null>(null);
  const retryRef = useRef<object | null>(null);
  const [retrying, setRetrying] = useState(false);
  const insets = useSafeAreaInsets();
  const celebrate = useCallback((value: Achievement) => {
    if (!readyRef.current || !ownerKey || ownerRef.current !== ownerKey) return;
    const next = { ...value, id: ++sequence.current, ownerKey };
    noticeRef.current = next; setNotice(next);
    AccessibilityInfo.announceForAccessibility(`${value.title}. ${value.detail}${value.undo ? '. Undo is available.' : ''}`);
  }, [ownerKey]);
  const dismiss = useCallback((current: OwnedAchievement) => {
    if (!readyRef.current || noticeRef.current !== current || ownerRef.current !== current.ownerKey) return;
    noticeRef.current = null; setNotice(null);
  }, []);
  const undo = useCallback((current: OwnedAchievement) => {
    if (!readyRef.current || noticeRef.current !== current || ownerRef.current !== current.ownerKey) return;
    // Consume before calling into the workspace so rapid/stale taps cannot replay.
    noticeRef.current = null; setNotice(null);
    const restored = current.undo?.();
    if (ownerRef.current !== current.ownerKey) return;
    if (restored === false) celebrate({ title: 'Your latest changes were kept', detail: 'This task changed after completion. Undo was not applied.' });
    else if (restored === true) celebrate({ title: 'Task reopened', detail: current.detail });
  }, [celebrate]);
  const retry = useCallback(async (current: OwnedAchievement) => {
    if (!readyRef.current || noticeRef.current !== current || ownerRef.current !== current.ownerKey || retryRef.current) return;
    const ticket = {}; retryRef.current = ticket; setRetrying(true);
    try { await retrySaves(current.ownerKey); }
    finally { if (retryRef.current === ticket) { retryRef.current = null; setRetrying(false); } }
  }, [retrySaves]);
  useEffect(() => { noticeRef.current = null; retryRef.current = null; setNotice(null); setRetrying(false); }, [ownerKey, status]);
  useEffect(() => {
    if (status === 'ready' && ownerKey && saveError && !noticeRef.current) celebrate({ title: 'Changes need saving', detail: 'Retry to save the latest changes on this device.' });
  }, [ownerKey, status, saveError, celebrate]);
  useEffect(() => {
    if (!notice) return;
    // Undo stays until dismissed, so it is usable with screen readers too.
    if (notice.undo || saveError) return;
    const timer = setTimeout(() => dismiss(notice), 5500);
    return () => clearTimeout(timer);
  }, [notice, saveError, dismiss]);

  return <Context.Provider value={celebrate}>
    {children}
    {status === 'ready' && notice && notice.ownerKey === ownerKey ? <View pointerEvents="box-none" style={[styles.overlay, { bottom: Math.max(16, insets.bottom) + 72 }]}>
      <AchievementToast key={notice.id} notice={notice} dismiss={() => dismiss(notice)} undo={() => undo(notice)} saveError={saveError} retrying={retrying} retry={() => { void retry(notice); }} />
    </View> : null}
  </Context.Provider>;
}

function AchievementToast({ notice, dismiss, undo, saveError, retrying, retry }: { notice: Achievement; dismiss: () => void; undo: () => void; saveError: string; retrying: boolean; retry: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const burst = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(pop); cancelAnimation(burst);
    if (reduced) { pop.set(1); burst.set(1); return; }
    pop.set(0); burst.set(0);
    pop.set(withSpring(1, { damping: 13, stiffness: 200, mass: 0.7 }));
    burst.set(withTiming(1, { duration: 700 }));
    return () => { cancelAnimation(pop); cancelAnimation(burst); };
  }, [reduced, pop, burst]);
  const enter = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.get()), transform: [{ translateY: (1 - pop.get()) * 16 }] }));
  const check = useAnimatedStyle(() => ({ transform: [{ scale: 0.5 + pop.get() * 0.5 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 1 - burst.get(), transform: [{ scale: 1 + burst.get() * 1.1 }] }));
  return <Animated.View style={[styles.toast, enter]}>
    <View style={styles.message}>
      <View accessible={false} style={styles.medal}>
        <Animated.View style={[styles.halo, halo]} />
        <Animated.View style={[styles.check, check]}><Text style={styles.checkText}>✓</Text></Animated.View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{notice.title}</Text>
        <Text numberOfLines={2} style={styles.detail}>{notice.detail}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss achievement" onPress={dismiss} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
    {saveError ? <View style={styles.saveIssue}>
      <Text accessibilityLiveRegion="polite" style={styles.saveError}>Could not save changes. They are still here on this screen.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry saving your changes" disabled={retrying} onPress={retry} style={styles.undo}>
        <Text style={styles.undoText}>{retrying ? 'Saving…' : 'Retry save'}</Text>
      </Pressable>
    </View> : null}
    {notice.undo ? <Pressable accessibilityRole="button" accessibilityLabel="Undo task completion" style={styles.undo} onPress={undo}>
      <Text style={styles.undoText}>Undo completion</Text>
    </Pressable> : null}
  </Animated.View>;
}

export const useAchievement = () => useContext(Context);
const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: { width: '100%', maxWidth: layout.readingMax, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.panelRaised, padding: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, elevation: 12 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  medal: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  check: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: colors.bg, fontSize: 24, fontWeight: '800' },
  halo: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.success },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.success, fontSize: 15, fontWeight: '800' },
  detail: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 3 },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.muted, fontSize: 22 },
  saveIssue: { marginTop: 8 },
  saveError: { color: colors.accent, fontSize: 12, lineHeight: 17 },
  undo: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  undoText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
