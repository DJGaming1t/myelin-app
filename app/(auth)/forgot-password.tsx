import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthField } from '@/src/components/auth/AuthField';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim()) {
      setError('Enter the email address you use for MYELIN.');
      return;
    }

    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      const message = authErrorMessage(err, 'reset');
      // Do not reveal whether the address is registered.
      if (message.includes('reach the sign-in service') || message.includes('Too many')) {
        setError(message);
      } else {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScaffold
      compact
      eyebrow="GET BACK IN"
      title="Reset access to MYELIN."
      description="Enter your email and we’ll request a reset link. For privacy, this screen never confirms whether an address has an account.">
      {sent ? (
        <View style={styles.success}>
          <Text style={styles.successMark}>✓</Text>
          <Text style={styles.successTitle}>Check your inbox</Text>
          <Text style={styles.successText}>
            If that address can receive an account reset, a link will be sent.
          </Text>
          <AuthButton label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      ) : (
        <>
          <AuthField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={submit}
            returnKeyType="send"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AuthButton label="Send reset link" loading={busy} onPress={submit} />

          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back to sign in</Text>
          </Pressable>
        </>
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  back: { alignSelf: 'center', minHeight: layout.minTouch, marginTop: spacing.lg, paddingHorizontal: 10, justifyContent: 'center' },
  backText: { color: colors.subtle, fontSize: 11, fontWeight: '600' },
  success: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  successMark: { color: colors.success, fontSize: 26, marginBottom: spacing.sm },
  successTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  successText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginVertical: spacing.md },
});
