import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/src/theme/tokens';

const ITEMS = [
  { key: 'today', label: 'Today', glyph: '◉', path: '/(app)/today' as const },
  { key: 'review', label: 'Review', glyph: '↻', path: '/(app)/review' as const },
  { key: 'mistakes', label: 'Mistakes', glyph: '!', path: '/(app)/mistakes' as const },
  { key: 'topics', label: 'Topics', glyph: '▦', path: '/(app)/topics' as const },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const active = pathname.includes(`/${item.key}`);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => router.replace(item.path)}
            style={({ pressed }) => [
              styles.item,
              active && styles.itemActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.glyph, active && styles.activeText]}>{item.glyph}</Text>
            <Text style={[styles.label, active && styles.activeText]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 64,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(7,7,7,0.98)',
    paddingHorizontal: spacing.lg,
    paddingTop: 7,
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemActive: { backgroundColor: 'rgba(255,128,91,0.035)' },
  glyph: { color: colors.subtle, fontSize: 15 },
  label: { color: colors.subtle, fontSize: 9.5, fontWeight: '700' },
  activeText: { color: colors.accent },
  pressed: { opacity: 0.6 },
});
