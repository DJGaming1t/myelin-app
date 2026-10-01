import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthField } from '@/src/components/auth/AuthField';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { KeepSignedInRow } from '@/src/components/auth/KeepSignedInRow';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, layout, spacing } from '@/src/theme/tokens';

export default function SignInScreen() {
  const { signInEmail, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      await signInEmail(email, password, keepSignedIn);
      router.replace('/');
    } catch (err) {
      setError(authErrorMessage(err, 'signin'));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    setGoogleBusy(true);
    try {
      await signInGoogle(keepSignedIn);
      router.replace('/');
    } catch (err) {
      setError(authErrorMessage(err, 'google'));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthScaffold
      compact
      eyebrow="RETURN TO MYELIN"
      title="Back to the study system."
      description="Sign in to your account identity. Your study data still stays local unless you explicitly enable sync.">
      <View style={styles.identityCue}>
        <Text style={styles.identityLabel}>MYELIN REMEMBERS THE WORKFLOW</Text>
        <Text style={styles.identityText}>
          Today decides → you Focus or Recall → results shape the next recommendation.
        </Text>
      </View>

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
      />

      <AuthField
        label="Password"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        onSubmitEditing={submit}
        returnKeyType="go"
      />

      <View style={styles.forgotRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(auth)/forgot-password')}
          style={styles.inlineLink}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      </View>

      <KeepSignedInRow value={keepSignedIn} onChange={setKeepSignedIn} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.stack}>
        <AuthButton label="Sign in" loading={busy} onPress={submit} />
        <AuthButton
          label="Continue with Google"
          icon="G"
          variant="secondary"
          loading={googleBusy}
          onPress={google}
        />
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.muted}>New to MYELIN?</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/sign-up')} style={styles.inlineLink}>
          <Text style={styles.link}>Create account</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  identityCue: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  identityLabel: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  identityText: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 5,
  },
  forgotRow: { alignItems: 'flex-end', marginTop: -8, marginBottom: spacing.md },
  inlineLink: { minHeight: layout.minTouch, justifyContent: 'center' },
  link: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  stack: { gap: 10 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  muted: { color: colors.muted, fontSize: 12 },
  back: { alignSelf: 'center', minHeight: layout.minTouch, marginTop: spacing.lg, paddingHorizontal: 10, justifyContent: 'center' },
  backText: { color: colors.subtle, fontSize: 11, fontWeight: '600' },
});
