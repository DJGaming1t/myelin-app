import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/src/theme/tokens';

type Props = TextInputProps & {
  label: string;
  error?: string;
  password?: boolean;
};

export function AuthField({ label, error, password, style, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputFocused,
          !!error && styles.inputError,
        ]}>
        <TextInput
          {...props}
          style={[styles.input, password && styles.passwordInput, style]}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          secureTextEntry={password && !visible}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setVisible((value) => !value)}
            style={styles.reveal}>
            <Text style={styles.revealText}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '650', marginBottom: 7 },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFocused: {
    borderColor: 'rgba(255,128,91,0.72)',
    shadowColor: colors.accent,
    shadowOpacity: 0.13,
    shadowRadius: 12,
  },
  inputError: { borderColor: 'rgba(255,161,145,0.6)' },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  passwordInput: { paddingRight: 62 },
  reveal: { position: 'absolute', right: 13, paddingVertical: 8, paddingHorizontal: 3 },
  revealText: { color: colors.accent, fontWeight: '700', fontSize: 11 },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 6 },
});
