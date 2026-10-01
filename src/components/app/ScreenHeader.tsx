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
    width: 25,
    height: 25,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },
  brandCore: {
    width: 7,
    height: 7,
    borderRadius: 7,
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
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: { color: colors.accentBright, fontSize: 11, fontWeight: '800' },
  actionArrow: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  copy: {
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    minHeight: 25,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelGlass,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    color: colors.accentBright,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1.35,
  },
  title: {
    color: colors.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '650',
    letterSpacing: -1.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 9,
    maxWidth: layout.readingMax,
  },
  pressed: { opacity: 0.72 },
  pressedMotion: { transform: [{ scale: 0.965 }, { translateY: 1 }] },
});
