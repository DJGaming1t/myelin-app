import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Props = {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  fill?: boolean;
};

export function ScreenState({
  kind,
  title,
  message,
  actionLabel,
  onAction,
  fill = false,
}: Props) {
  const loading = kind === 'loading';
  const error = kind === 'error';

  return (
    <View
      accessible
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion={loading ? 'polite' : error ? 'assertive' : 'polite'}
      style={[styles.wrap, fill && styles.fill]}>
      <View style={[styles.card, error && styles.errorCard]}>
        <View style={[styles.mark, error && styles.errorMark]}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.markText, error && styles.errorMarkText]}>
              {error ? '!' : '·'}
            </Text>
          )}
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  fill: {
    flex: 1,
    maxWidth: undefined,
    backgroundColor: colors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.xl,
  },
  errorCard: { borderColor: 'rgba(255,161,145,0.24)' },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: spacing.md,
  },
  errorMark: { backgroundColor: 'rgba(255,161,145,0.1)' },
  markText: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  errorMarkText: { color: colors.danger },
  title: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    maxWidth: 360,
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
  },
  action: {
    minHeight: layout.minTouch,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
