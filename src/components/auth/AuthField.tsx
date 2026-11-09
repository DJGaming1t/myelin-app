import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, layout, radius, space } from '@/src/theme/tokens';

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
          cursorColor={colors.accent}
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
            hitSlop={8}
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
  wrap: { marginBottom: space.md },
  label: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: space.xs,
  },
  inputWrap: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFocused: {
    borderColor: colors.accentLine,
    backgroundColor: colors.panel,
  },
  inputError: { borderColor: 'rgba(255,161,145,0.62)' },
  input: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  passwordInput: { paddingRight: 70 },
  reveal: {
    position: 'absolute',
    right: 8,
    minWidth: layout.minTouch,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
});
