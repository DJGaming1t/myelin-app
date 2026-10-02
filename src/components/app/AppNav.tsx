import { router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, AppIconName } from '@/src/components/app/AppIcon';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout, space, type } from '@/src/theme/tokens';

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

export function AppNav() {
  const pathname = usePathname();

  return (
    <View style={styles.shell}>
      <View style={styles.wrap}>
        {ITEMS.slice(0, 2).map((item) => (
          <NavItem key={item.key} item={item} active={pathname.includes(`/${item.key}`)} />
        ))}

        <View style={styles.addSlot}>
          <View style={styles.addButtonFrame}>
            <SpringPressable
              accessibilityRole="button"
              accessibilityLabel="Add to MYELIN"
              accessibilityHint="Add a topic, task, exam or fixed time"
              onPress={() => router.push('/(app)/quick-add')}
              scaleTo={0.96}
              lift={1}
              style={styles.addButton}>
              <AppIcon name="add" size={24} color="#27130D" />
            </SpringPressable>
          </View>
          <Text accessible={false} style={styles.addLabel}>Add</Text>
        </View>

        {ITEMS.slice(2).map((item) => (
          <NavItem key={item.key} item={item} active={pathname.includes(`/${item.key}`)} />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  item,
  active,
}: {
  item: (typeof ITEMS)[number];
  active: boolean;
}) {
  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={active ? 'Current section' : `Open ${item.label}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (active) return;
        router.replace(item.path);
      }}
      scaleTo={active ? 1 : 0.965}
      lift={0}
      style={styles.item}>
      <View style={styles.iconBox}>
        <AppIcon name={item.icon} size={20} color={active ? colors.accent : colors.subtle} />
      </View>
      <Text accessible={false} style={[styles.label, active && styles.activeText]}>{item.label}</Text>
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(8,8,10,0.97)',
  },
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    minHeight: 58,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconBox: {
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.subtle,
    ...type.label,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  activeText: { color: colors.text },
  addSlot: {
    width: 64,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  addButtonFrame: {
    width: 50,
    height: 50,
    alignSelf: 'center',
    marginTop: -18,
    marginBottom: 1,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
  },
  addLabel: {
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});
