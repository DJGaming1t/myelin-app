import { StyleSheet, Text, ViewStyle } from 'react-native';

import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  style,
}: Props) {
  const textStyle =
    variant === 'primary'
      ? styles.primaryText
      : variant === 'secondary'
        ? styles.secondaryText
        : variant === 'danger'
          ? styles.dangerText
          : styles.quietText;

  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.985}
      lift={0}
      style={[
        styles.base,
        styles[variant],
        style,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.lineStrong },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'rgba(255,165,150,0.10)', borderWidth: 1, borderColor: 'rgba(255,165,150,0.24)' },
  label: { ...type.bodyStrong },
  primaryText: { color: '#27130D' },
  secondaryText: { color: colors.text },
  quietText: { color: colors.textDim },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
});
