import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, spacing } from '@/src/theme/tokens';

const ITEMS = [
  { key: 'today', label: 'Today', glyph: '◉', path: '/(app)/today' as const },
  { key: 'review', label: 'Review', glyph: '↻', path: '/(app)/review' as const },
  { key: 'mistakes', label: 'Mistakes', glyph: '!', path: '/(app)/mistakes' as const },
  { key: 'exams', label: 'Exams', glyph: '◇', path: '/(app)/exams' as const },
  { key: 'progress', label: 'Progress', glyph: '▥', path: '/(app)/progress' as const },
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
              {active ? <View style={styles.activeRail} /> : null}
              <View style={[styles.glyphWrap, active && styles.glyphWrapActive]}>
                <Text accessible={false} style={[styles.glyph, active && styles.activeText]}>
                  {item.glyph}
                </Text>
              </View>
              <Text accessible={false} style={[styles.label, active && styles.activeText]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(11,11,12,0.985)',
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -7 },
    elevation: 14,
  },
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    minHeight: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingTop: 7,
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 14,
    position: 'relative',
  },
  itemActive: { backgroundColor: colors.accentFaint },
  activeRail: {
    position: 'absolute',
    top: 0,
    width: 22,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  glyphWrap: {
    width: 28,
    height: 26,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphWrapActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
  glyph: { color: colors.subtle, fontSize: 14 },
  label: { color: colors.subtle, fontSize: 9.2, fontWeight: '700' },
  activeText: { color: colors.accent },
  pressed: { opacity: 0.66 },
  pressedMotion: { transform: [{ scale: 0.97 }] },
});
