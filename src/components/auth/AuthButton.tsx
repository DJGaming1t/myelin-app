import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/src/theme/tokens';

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
        {icon ? <Text style={[styles.icon, variant === 'primary' && styles.primaryText]}>{icon}</Text> : null}
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? '#25140e' : colors.text} size="small" />
        ) : (
          <Text style={[styles.label, variant === 'primary' && styles.primaryText]}>{label}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.panelRaised, borderColor: colors.lineStrong },
  quiet: { backgroundColor: 'transparent', borderColor: colors.line },
  pressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  disabled: { opacity: 0.48 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  primaryText: { color: '#25140e' },
  icon: { color: colors.text, fontSize: 15, fontWeight: '800' },
});
