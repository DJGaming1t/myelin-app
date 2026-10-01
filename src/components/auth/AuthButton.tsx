import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Props = {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: string;
};

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
}: Props) {
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!unavailable, busy: !!loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabled,
      ]}>
      <View style={styles.row}>
        {icon ? (
          <View style={[styles.iconWrap, variant === 'primary' && styles.iconWrapPrimary]}>
            <Text style={[styles.icon, variant === 'primary' && styles.primaryText]}>{icon}</Text>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? '#25140e' : colors.text} size="small" />
        ) : (
          <Text style={[styles.label, variant === 'primary' && styles.primaryText]}>{label}</Text>
        )}
        {variant === 'primary' && !loading ? (
          <Text accessible={false} style={styles.arrow}>→</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    backgroundColor: 'rgba(16,16,19,0.68)',
    borderColor: colors.lineStrong,
  },
  quiet: {
    backgroundColor: 'transparent',
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabled: { opacity: 0.46 },
  row: {
    width: '100%',
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  label: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '800',
  },
  primaryText: { color: '#25140e' },
  arrow: {
    position: 'absolute',
    right: 0,
    color: '#25140e',
    fontSize: 18,
    fontWeight: '800',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
  },
  iconWrapPrimary: {
    backgroundColor: 'rgba(37,20,14,0.08)',
  },
  icon: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
});
