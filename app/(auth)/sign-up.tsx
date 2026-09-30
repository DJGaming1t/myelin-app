import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthField } from '@/src/components/auth/AuthField';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { KeepSignedInRow } from '@/src/components/auth/KeepSignedInRow';
import { PasswordChecklist } from '@/src/components/auth/PasswordChecklist';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { passwordIsReady } from '@/src/features/auth/password';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function SignUpScreen() {
  const { signUpEmail } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');

    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }

    if (!passwordIsReady(password)) {
      setError('Finish the password requirements first.');
      return;
    }

    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await signUpEmail(name, email, password, keepSignedIn);
      router.replace('/');
    } catch (err) {
      setError(authErrorMessage(err, 'signup'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScaffold
      compact
      eyebrow="CREATE YOUR SPACE"
      title="One account. Your pace."
      description="We only ask for what authentication needs. A display name is optional.">
      <AuthField
        label="Display name (optional)"
        value={name}
        onChangeText={setName}
        placeholder="What should MYELIN call you?"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />

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
        placeholder="Create a password"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <PasswordChecklist password={password} />

      <AuthField
        label="Confirm password"
        password
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Type it again"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
        returnKeyType="go"
      />

      <KeepSignedInRow value={keepSignedIn} onChange={setKeepSignedIn} />

      <View style={styles.privacyNote}>
        <Text style={styles.privacyTitle}>Less data by default</Text>
        <Text style={styles.privacyText}>
          Creating an account does not automatically turn on cloud storage for study answers or
          progress. Sync will be a separate, explicit feature.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AuthButton label="Create account" loading={busy} onPress={submit} />

      <View style={styles.bottomRow}>
        <Text style={styles.muted}>Already have an account?</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  privacyNote: {
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: 'rgba(180,216,174,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.14)',
    marginBottom: spacing.md,
  },
  privacyTitle: { color: colors.success, fontSize: 10.5, fontWeight: '800' },
  privacyText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  muted: { color: colors.muted, fontSize: 12 },
  link: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  back: { alignSelf: 'center', marginTop: spacing.lg, padding: 6 },
  backText: { color: colors.subtle, fontSize: 11, fontWeight: '600' },
});
