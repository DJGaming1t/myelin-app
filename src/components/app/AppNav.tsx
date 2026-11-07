import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '@/src/components/app/AppIcon';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { chalkTheme, colors, layout, space, type } from '@/src/theme/tokens';

const ITEMS: {
  key: 'today' | 'topics' | 'review' | 'progress';
  label: string;
  path: '/(app)/today' | '/(app)/topics' | '/(app)/review' | '/(app)/progress';
  icon: AppIconName;
}[] = [
  { key: 'today', label: 'Today', path: '/(app)/today', icon: 'today' },
  { key: 'topics', label: 'Library', path: '/(app)/topics', icon: 'library' },
  { key: 'review', label: 'Review', path: '/(app)/review', icon: 'review' },
  { key: 'progress', label: 'Progress', path: '/(app)/progress', icon: 'progress' },
];

export function AppNav({
  paper = true,
  floating = true,
  compact = false,
}: {
  paper?: boolean;
  floating?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.shell,
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
        {ITEMS.slice(0, 2).map((item) => (
          <NavItem
            compact={compact}
            paper={paper}
            floating={floating}
            key={item.key}
            item={item}
            active={pathname.includes(`/${item.key}`)}
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
                style={styles.addButton}>
                <AppIcon name="add" size={22} color={chalkTheme.dock} />
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
            active={pathname.includes(`/${item.key}`)}
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
}: {
  paper: boolean;
  floating: boolean;
  item: (typeof ITEMS)[number];
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityHint={active ? 'Current section' : `Open ${item.label}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (active) return;
        router.replace(item.path);
      }}
      style={({ pressed }) => [
        styles.item,
        pressed && !active && styles.pressed,
      ]}>
      <View style={[styles.itemInner, active && styles.itemActivePill, compact && styles.compactItem, compact && active && styles.compactActive]}>
        <View style={styles.iconBox}>
          <AppIcon
            name={item.icon}
            size={20}
            color={active ? chalkTheme.dock : chalkTheme.dockInactiveText}
          />
        </View>
        <Text
          accessible={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[styles.label, active && styles.activeText]}>
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactDock: { minHeight: 64, borderRadius: 25, shadowOpacity: .18, elevation: 8, paddingHorizontal: 5 },
  compactItem: { minHeight: 48, borderRadius: 17, paddingVertical: 3 },
  compactActive: { backgroundColor: '#D9D1BE' },
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
  pressed: { opacity: 0.68 },
});
