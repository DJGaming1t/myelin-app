import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Reveal } from '@/src/components/motion/Reveal';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, spacing } from '@/src/theme/tokens';

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
  const reduceMotion = useReducedMotion();

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            accessibilityHint="Go to the previous screen"
            onPress={onBack}
            hitSlop={6}
            style={({ pressed }) => [
              styles.topButton,
              pressed && styles.pressed,
              pressed && !reduceMotion && styles.pressedMotion,
            ]}>
            <Text style={styles.backText}>← {backLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.brandRow} accessible accessibilityLabel="MYELIN">
            <View style={styles.dot} />
            <Text style={styles.brand}>MYELIN</Text>
          </View>
        )}

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={6}
            style={({ pressed }) => [
              styles.topButton,
              pressed && styles.pressed,
              pressed && !reduceMotion && styles.pressedMotion,
            ]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <Reveal delay={40} distance={8}>
        <View style={styles.copy}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowLine} />
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  topRow: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 7,
    elevation: 3,
  },
  brand: { color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 2.8 },
  topButton: {
    minHeight: layout.minTouch,
    minWidth: layout.minTouch,
    paddingVertical: 5,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  backText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  actionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  copy: {
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowLine: {
    width: 18,
    height: 1,
    backgroundColor: colors.accent,
  },
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
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 8, maxWidth: layout.readingMax },
  pressed: { opacity: 0.66 },
  pressedMotion: { transform: [{ scale: 0.98 }] },
});
