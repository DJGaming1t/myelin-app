import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TutorialId } from './guide-registry';
import { colors, radius, spacing } from '@/src/theme/tokens';

export function GuideOffer({
  tutorialId,
  screenName,
  description,
  visible,
  saveFailed,
  onShow,
  onLater,
  onRetry,
}: {
  tutorialId: TutorialId;
  screenName: string;
  description: string;
  visible: boolean;
  saveFailed?: boolean;
  onShow: () => void;
  onLater: () => void;
  onRetry?: () => void;
}) {
  if (!visible && !saveFailed) return null;

  return (
    <View style={styles.card} testID={`guide-offer-${tutorialId}`}>
      <Text style={styles.kicker}>QUICK TOUR · {screenName.toUpperCase()}</Text>
      <Text style={styles.title}>New to {screenName}?</Text>
      <Text style={styles.body}>{description}</Text>
      {saveFailed && onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Could not save preference · Tap to retry</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onShow} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Show me</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onLater} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginVertical: spacing.sm,
    gap: 6,
  },
  kicker: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  primaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  retryBtn: {
    paddingVertical: 4,
  },
  retryText: {
    color: colors.danger,
    fontSize: 11.5,
    fontWeight: '600',
  },
});
