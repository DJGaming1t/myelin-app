import { useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '@/src/components/app/AppIcon';
import { appNavClearance } from '@/src/components/app/navLayout';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { chalkTheme, colors, layout, motion, space, type } from '@/src/theme/tokens';

type NavTab = 'today' | 'topics' | 'review' | 'progress';
type TabSlot = { x: number; y: number; width: number; height: number };

// The dock lives in each peer screen. Remember the last tab so the incoming
// dock can animate its indicator from the outgoing tab after a native crossfade.
let lastDockTab: NavTab | null = null;

const ITEMS: {
  key: NavTab;
  label: string;
  path: '/(app)/today' | '/(app)/topics' | '/(app)/review' | '/(app)/progress';
  icon: AppIconName;
}[] = [
  { key: 'today', label: 'Today', path: '/(app)/today', icon: 'today' },
  { key: 'topics', label: 'Library', path: '/(app)/topics', icon: 'library' },
  { key: 'review', label: 'Review', path: '/(app)/review', icon: 'review' },
  { key: 'progress', label: 'Progress', path: '/(app)/progress', icon: 'progress' },
];

export function useAppNavClearance() {
  const insets = useSafeAreaInsets();
  return appNavClearance(insets.bottom);
}

export function AppNav({
  paper = true,
  floating = true,
  compact = true,
  overlay = false,
}: {
  paper?: boolean;
  floating?: boolean;
  compact?: boolean;
  overlay?: boolean;
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const activeTab = ITEMS.find((item) => pathname.includes(`/${item.key}`))?.key ?? null;
  const [slots, setSlots] = useState<Partial<Record<NavTab, TabSlot>>>({});
  const selected = useRef<NavTab | null>(null);
  const highlightX = useSharedValue(0);
  const highlightY = useSharedValue(0);
  const highlightWidth = useSharedValue(0);
  const highlightHeight = useSharedValue(0);
  const highlightOpacity = useSharedValue(0);

  const animatedHighlight = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
    top: highlightY.value,
    width: highlightWidth.value,
    height: highlightHeight.value,
    transform: [{ translateX: highlightX.value }],
  }));

  useEffect(() => {
    if (!compact || !activeTab || !ITEMS.every((item) => slots[item.key])) return;
    const target = slots[activeTab]!;
    const targetGeometry = {
      x: target.x + 3,
      y: target.y + 5,
      width: Math.max(0, target.width - 6),
      height: Math.max(0, target.height - 10),
    };
    const firstLayout = selected.current === null;
    const previousKey = firstLayout ? lastDockTab : selected.current;
    const previous = previousKey ? slots[previousKey] : undefined;

    if (firstLayout) {
      highlightX.value = previous ? previous.x + 3 : targetGeometry.x;
      highlightY.value = previous ? previous.y + 5 : targetGeometry.y;
      highlightWidth.value = previous ? Math.max(0, previous.width - 6) : targetGeometry.width;
      highlightHeight.value = previous ? Math.max(0, previous.height - 10) : targetGeometry.height;
      highlightOpacity.value = previous && previousKey !== activeTab && !reduceMotion ? 0.72 : 1;
    }

    cancelAnimation(highlightX);
    cancelAnimation(highlightY);
    cancelAnimation(highlightWidth);
    cancelAnimation(highlightHeight);
    cancelAnimation(highlightOpacity);
    if (reduceMotion) {
      highlightX.value = targetGeometry.x;
      highlightY.value = targetGeometry.y;
      highlightWidth.value = targetGeometry.width;
      highlightHeight.value = targetGeometry.height;
      highlightOpacity.value = 1;
    } else {
      const spring = { ...motion.releaseSpring, damping: 25, stiffness: 255, overshootClamping: true };
      highlightX.value = withSpring(targetGeometry.x, spring);
      highlightY.value = withSpring(targetGeometry.y, spring);
      highlightWidth.value = withSpring(targetGeometry.width, spring);
      highlightHeight.value = withSpring(targetGeometry.height, spring);
      highlightOpacity.value = withTiming(1, { duration: motion.hierarchyMs });
    }
    selected.current = activeTab;
    lastDockTab = activeTab;
  }, [
    activeTab, compact, reduceMotion, slots,
    highlightX, highlightY, highlightWidth, highlightHeight, highlightOpacity,
  ]);

  function rememberSlot(key: NavTab, event: LayoutChangeEvent) {
    const { x, y, width, height } = event.nativeEvent.layout;
    setSlots((previous) => {
      const existing = previous[key];
      if (existing && existing.x === x && existing.y === y &&
          existing.width === width && existing.height === height) return previous;
      return { ...previous, [key]: { x, y, width, height } };
    });
  }

  function openTab(item: (typeof ITEMS)[number]) {
    if (activeTab === item.key) return;
    if (activeTab) lastDockTab = activeTab;
    router.replace(item.path);
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.shell,
        overlay && styles.overlay,
        floating
          ? {
              paddingBottom: Math.max(insets.bottom, 10),
              paddingHorizontal: 14,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
            }
          : paper && { backgroundColor: '#F2EFE6', borderTopColor: '#D7D4CA' },
      ]}>
      <View style={[styles.wrap, floating && styles.dockCapsule, compact && styles.compactDock]}>
        {compact ? (
          <Animated.View pointerEvents="none" style={[styles.activeTrack, animatedHighlight]} />
        ) : null}
        {ITEMS.slice(0, 2).map((item) => (
          <NavItem
            compact={compact}
            paper={paper}
            floating={floating}
            key={item.key}
            item={item}
            active={activeTab === item.key}
            onMeasure={(event) => rememberSlot(item.key, event)}
            onNavigate={() => openTab(item)}
          />
        ))}

        <View style={[styles.addSlot, compact && styles.compactAddSlot]}>
          <View style={[styles.addArchHousing, compact && styles.compactAddHousing]}>
            <View style={styles.addButtonFrame}>
              <SpringPressable
                accessibilityRole="button"
                accessibilityLabel="Add to MYELIN"
                accessibilityHint="Add a topic, task, exam or fixed time"
                onPress={() => router.push('/(app)/quick-add')}
                scaleTo={0.96}
                lift={1}
                style={[styles.addButton, compact && styles.compactAddButton]}>
                <AppIcon name="add" size={22} color={compact ? chalkTheme.onStage : chalkTheme.dock} />
              </SpringPressable>
            </View>
          </View>
          <Text accessible={false} style={[styles.addLabel, compact && { display: 'none' }]}>
            Add
          </Text>
        </View>

        {ITEMS.slice(2).map((item) => (
          <NavItem
            compact={compact}
            paper={paper}
            floating={floating}
            key={item.key}
            item={item}
            active={activeTab === item.key}
            onMeasure={(event) => rememberSlot(item.key, event)}
            onNavigate={() => openTab(item)}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  item,
  active,
  compact = false,
  onMeasure,
  onNavigate,
}: {
  paper: boolean;
  floating: boolean;
  item: (typeof ITEMS)[number];
  active: boolean;
  compact?: boolean;
  onMeasure: (event: LayoutChangeEvent) => void;
  onNavigate: () => void;
}) {
  return (
    <SpringPressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityHint={active ? 'Current section' : `Open ${item.label}`}
      accessibilityState={{ selected: active }}
      onLayout={onMeasure}
      onPress={onNavigate}
      scaleTo={0.94}
      lift={1}
      style={styles.item}>
      <View style={[styles.itemInner, !compact && active && styles.itemActivePill, compact && styles.compactItem, compact && active && styles.compactActive]}>
        <View style={styles.iconBox}>
          <AppIcon
            name={item.icon}
            size={20}
            color={compact && active ? chalkTheme.onStage : active ? chalkTheme.dock : chalkTheme.dockInactiveText}
          />
        </View>
        <Text
          accessible={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[styles.label, active && styles.activeText, compact && active && styles.compactActiveText]}>
          {item.label}
        </Text>
      </View>
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10 },
  compactDock: { minHeight: 66, borderRadius: 26, shadowOpacity: .22, elevation: 7, paddingHorizontal: 7 },
  compactItem: { minHeight: 48, borderRadius: 17, paddingVertical: 3 },
  compactActive: { borderRadius: 16 },
  activeTrack: {
    position: 'absolute',
    left: 0,
    zIndex: 0,
    borderRadius: 17,
    backgroundColor: 'rgba(242,231,208,.13)',
    borderWidth: 1,
    borderColor: 'rgba(242,231,208,.07)',
  },
  compactActiveText: { color: chalkTheme.onStage },
  compactAddButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#526B75' },
  compactAddSlot: { width: 56, paddingBottom: 0, justifyContent: 'center' },
  compactAddHousing: { width: 48, height: 48, marginTop: 0, marginBottom: 0, borderWidth: 0 },

  shell: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: 'transparent',
  },
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    minHeight: 74,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  dockCapsule: {
    backgroundColor: chalkTheme.dock,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: chalkTheme.dockBorder,
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  itemInner: {
    width: '100%',
    minWidth: 0,
    minHeight: 54,
    paddingHorizontal: 3,
    paddingVertical: 6,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemActivePill: {
    backgroundColor: chalkTheme.dockActivePill,
  },
  iconBox: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: chalkTheme.dockInactiveText,
    ...type.label,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  activeText: {
    color: chalkTheme.dock,
    fontWeight: '700',
  },
  addSlot: {
    width: 68,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 5,
  },
  addArchHousing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: chalkTheme.dock,
    borderWidth: 1,
    borderColor: chalkTheme.dockBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    marginBottom: 1,
  },
  addButtonFrame: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: chalkTheme.dockActivePill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    color: chalkTheme.dockInactiveText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});
