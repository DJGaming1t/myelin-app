import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/src/theme/tokens';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  backLabel = 'Back',
  onBack,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
            <Text style={styles.backText}>← {backLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.brandRow}>
            <View style={styles.dot} />
            <Text style={styles.brand}>MYELIN</Text>
          </View>
        )}

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            hitSlop={10}
            style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  topRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 2.8 },
  topButton: { paddingVertical: 5, paddingHorizontal: 2 },
  backText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  actionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  copy: { marginTop: spacing.lg },
  eyebrow: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 7,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 8, maxWidth: 560 },
  pressed: { opacity: 0.6 },
});
