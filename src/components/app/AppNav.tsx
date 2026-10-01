import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const ITEMS = [
  { key: 'today', label: 'Today', glyph: '●', path: '/(app)/today' as const },
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
              <View style={[styles.glyphWrap, active && styles.glyphWrapActive]}>
                {active ? <View style={styles.activeGlow} /> : null}
                <Text accessible={false} style={[styles.glyph, active && styles.activeText]}>
                  {item.glyph}
                </Text>
              </View>
              <Text accessible={false} style={[styles.label, active && styles.activeText]}>
                {item.label}
              </Text>
              {active ? <View style={styles.activeDot} /> : null}
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
    paddingTop: 5,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    minHeight: 68,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(16,16,19,0.97)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  item: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 18,
    position: 'relative',
  },
  itemActive: {
    backgroundColor: colors.accentFaint,
  },
  glyphWrap: {
    width: 32,
    height: 28,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyphWrapActive: {
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  activeGlow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 28,
    backgroundColor: colors.accentGlow,
    opacity: 0.42,
  },
  glyph: {
    color: colors.subtle,
    fontSize: 14,
    fontWeight: '800',
  },
  label: {
    color: colors.subtle,
    fontSize: 9.2,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  activeText: { color: colors.accentBright },
  activeDot: {
    position: 'absolute',
    bottom: 3,
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  pressed: { opacity: 0.72 },
  pressedMotion: { transform: [{ scale: 0.955 }, { translateY: 1 }] },
});
