import { StyleSheet, Text, View } from 'react-native';

import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  onHelp?: () => void;
  variant?: 'hero' | 'standard' | 'compact';
};

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  backLabel = 'Back',
  onBack,
  actionLabel,
  onAction,
  onHelp,
  variant = 'standard',
}: Props) {
  return (
    <View style={[styles.wrap, variant === 'compact' && styles.wrapCompact]}>
      <View style={styles.topRow}>
        {onBack ? (
          <SpringPressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            accessibilityHint="Go to the previous screen"
            onPress={onBack}
            hitSlop={8}
            scaleTo={0.985}
            lift={0}
            style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>{backLabel}</Text>
          </SpringPressable>
        ) : (
          <View style={styles.brandRow} accessible accessibilityLabel="MYELIN">
            <View style={styles.brandMark}><View style={styles.brandCore} /></View>
            <Text style={styles.brand}>MYELIN</Text>
          </View>
        )}

        <View style={styles.topActions}>
        {onHelp ? <SpringPressable accessibilityRole="button" accessibilityLabel="Teach me this screen"
          onPress={onHelp} lift={0} style={styles.helpButton}>
          <Text style={styles.helpText}>?</Text>
        </SpringPressable> : null}
        {actionLabel && onAction ? (
          <SpringPressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={8}
            scaleTo={0.985}
            lift={0}
            style={styles.actionButton}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </SpringPressable>
        ) : null}
        </View>
      </View>

      <View style={[styles.copy, variant === 'compact' && styles.copyCompact]}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            variant === 'hero' && styles.titleHero,
            variant === 'compact' && styles.titleCompact,
          ]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  wrapCompact: { paddingBottom: space.sm },
  topRow: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  brandRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.accent, fontSize: 18, fontWeight: '600' },
  brandMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.accent },
  brand: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  backButton: {
    minHeight: layout.minTouch,
    minWidth: 72,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  backArrow: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  backText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  actionButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  copy: { marginTop: space.md },
  copyCompact: { marginTop: space.xs },
  eyebrow: {
    color: colors.accent,
    ...type.label,
    marginBottom: space.xs,
  },
  title: { color: colors.text, ...type.pageTitle },
  titleHero: { ...type.display },
  titleCompact: { ...type.hero },
  subtitle: {
    color: colors.muted,
    ...type.body,
    marginTop: space.xs,
    maxWidth: layout.readingMax,
  },

});
