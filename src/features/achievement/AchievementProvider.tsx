import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius } from '@/src/theme/tokens';

type Achievement = { title: string; detail: string; undo?: () => void };
const Context = createContext<(achievement: Achievement) => void>(() => undefined);

export function AchievementProvider({ children }: PropsWithChildren) {
  const { ownerKey } = useWorkspace();
  const [notice, setNotice] = useState<(Achievement & { id: number }) | null>(null);
  const sequence = useRef(0);
  const insets = useSafeAreaInsets();
  const celebrate = useCallback((value: Achievement) => {
    setNotice({ ...value, id: ++sequence.current });
    AccessibilityInfo.announceForAccessibility(`${value.title}. ${value.detail}${value.undo ? '. Undo is available.' : ''}`);
  }, []);
  useEffect(() => { setNotice(null); }, [ownerKey]);
  useEffect(() => {
    if (!notice) return;
    // Undo stays until dismissed, so it is usable with screen readers too.
    if (notice.undo) return;
    const timer = setTimeout(() => setNotice(null), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  return <Context.Provider value={celebrate}>
    {children}
    {notice ? <View pointerEvents="box-none" style={[styles.overlay, { bottom: Math.max(16, insets.bottom) + 72 }]}>
      <AchievementToast key={notice.id} notice={notice} dismiss={() => setNotice(null)} />
    </View> : null}
  </Context.Provider>;
}

function AchievementToast({ notice, dismiss }: { notice: Achievement; dismiss: () => void }) {
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
    {notice.undo ? <Pressable accessibilityRole="button" accessibilityLabel="Undo task completion" style={styles.undo} onPress={() => { dismiss(); notice.undo?.(); }}>
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
  undo: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  undoText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
