import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const ITEMS = [
  { key: 'today', label: 'Today', path: '/(app)/today' as const },
  { key: 'topics', label: 'Topics', path: '/(app)/topics' as const },
  { key: 'review', label: 'Review', path: '/(app)/review' as const },
  { key: 'exams', label: 'Exams', path: '/(app)/exams' as const },
  { key: 'progress', label: 'Progress', path: '/(app)/progress' as const },
];

export function AppNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <View style={styles.shell}>
      <View style={styles.wrap}>
        {ITEMS.map((item) => {
          const active = pathname.includes(`/${item.key}`);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={active ? 'Current section' : `Open ${item.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(item.path)}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && styles.pressed,
                pressed && !reduceMotion && styles.pressedMotion,
              ]}>
              <View style={[styles.activeIndicator, active && styles.activeIndicatorVisible]} />
              <Text accessible={false} style={[styles.label, active && styles.activeText]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    minHeight: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 5,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(13,13,16,0.96)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 16,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  activeIndicator: {
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  activeIndicatorVisible: {
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  activeText: {
    color: colors.text,
  },
  pressed: {
    opacity: 0.74,
  },
  pressedMotion: {
    transform: [{ scale: 0.98 }],
  },
});
