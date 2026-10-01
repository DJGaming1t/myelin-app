import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout, radius, space } from '@/src/theme/tokens';

type Props = {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'google';
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
  const darkText = variant === 'primary' || variant === 'google';
  const spinnerColor = variant === 'primary'
    ? '#25140e'
    : variant === 'google'
      ? '#202124'
      : colors.text;

  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!unavailable, busy: !!loading }}
      disabled={unavailable}
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        variant === 'google' && styles.google,
        unavailable && styles.disabled,
      ]}>
      <View style={styles.row}>
        {icon ? (
          <View
            style={[
              styles.iconWrap,
              variant === 'primary' && styles.iconWrapPrimary,
              variant === 'google' && styles.iconWrapGoogle,
            ]}>
            <Text
              style={[
                styles.icon,
                variant === 'primary' && styles.primaryText,
                variant === 'google' && styles.googleText,
              ]}>
              {icon}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={spinnerColor} size="small" />
        ) : (
          <Text
            style={[
              styles.label,
              darkText && styles.darkLabel,
              variant === 'google' && styles.googleText,
            ]}>
            {label}
          </Text>
        )}

        {variant === 'primary' && !loading ? (
          <Text accessible={false} style={styles.arrow}>→</Text>
        ) : null}
      </View>
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.panelRaised,
    borderColor: colors.lineStrong,
  },
  quiet: {
    backgroundColor: 'transparent',
    borderColor: colors.line,
  },
  google: {
    backgroundColor: '#F4F2EF',
    borderColor: '#F4F2EF',
  },
  disabled: { opacity: 0.46 },
  row: {
    width: '100%',
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  darkLabel: { color: '#25140e' },
  googleText: { color: '#202124' },
  primaryText: { color: '#25140e' },
  arrow: {
    position: 'absolute',
    right: 0,
    color: '#25140e',
    fontSize: 19,
    fontWeight: '800',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised,
  },
  iconWrapPrimary: {
    backgroundColor: 'rgba(37,20,14,0.08)',
  },
  iconWrapGoogle: {
    backgroundColor: 'rgba(32,33,36,0.06)',
  },
  icon: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
});
