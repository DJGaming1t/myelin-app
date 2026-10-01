import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const ITEMS = [
  { key: 'today', label: 'Today', glyph: '●', path: '/(app)/today' as const },
  { key: 'topics', label: 'Topics', glyph: '▦', path: '/(app)/topics' as const },
  { key: 'review', label: 'Review', glyph: '↻', path: '/(app)/review' as const },
  { key: 'exams', label: 'Exams', glyph: '◇', path: '/(app)/exams' as const },
  { key: 'progress', label: 'Progress', glyph: '⌁', path: '/(app)/progress' as const },
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
              <Text accessible={false} style={[styles.glyph, active && styles.activeGlyph]}>
                {item.glyph}
              </Text>
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
    minHeight: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(13,13,16,0.96)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 17,
  },
  itemActive: {
    backgroundColor: colors.panelHighlight,
  },
  glyph: {
    color: colors.subtle,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
  },
  activeGlyph: {
    color: colors.accent,
  },
  label: {
    color: colors.subtle,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  activeText: {
    color: colors.text,
  },
  pressed: {
    opacity: 0.74,
  },
  pressedMotion: {
    transform: [{ scale: 0.97 }],
  },
});
