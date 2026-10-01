import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Reveal } from '@/src/components/motion/Reveal';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

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
              styles.backButton,
              pressed && styles.pressed,
              pressed && !reduceMotion && styles.pressedMotion,
            ]}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.brandRow} accessible accessibilityLabel="MYELIN">
            <View style={styles.brandMark}>
              <View style={styles.brandCore} />
            </View>
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
              styles.actionButton,
              pressed && styles.pressed,
              pressed && !reduceMotion && styles.pressedMotion,
            ]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Text style={styles.actionArrow}>↗</Text>
          </Pressable>
        ) : null}
      </View>

      <Reveal delay={30} distance={10}>
        <View style={styles.copy}>
          {eyebrow ? (
            <View style={styles.eyebrowPill}>
              <View style={styles.eyebrowDot} />
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
    paddingTop: spacing.sm,
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
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  brand: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.7,
  },
  backButton: {
    minHeight: layout.minTouch,
    minWidth: 74,
    paddingHorizontal: 9,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  backArrow: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  backText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  actionButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
  actionArrow: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  copy: {
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.45,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1.15,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: layout.readingMax,
  },
  pressed: { opacity: 0.72 },
  pressedMotion: { transform: [{ scale: 0.965 }, { translateY: 1 }] },
});
