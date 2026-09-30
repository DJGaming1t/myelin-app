import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, spacing } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  const { signInGoogle, continueLocally } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setGoogleBusy(true);
    try {
      await signInGoogle(false);
      router.replace('/');
    } catch (err) {
      setError(authErrorMessage(err, 'google'));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleLocal() {
    setLocalBusy(true);
    try {
      await continueLocally();
      router.replace('/');
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="WELCOME TO MYELIN"
      title="Study without the noise."
      description="Sign in for an account identity, or keep a separate workspace only on this device.">
      <View style={styles.stack}>
        <AuthButton
          label="Continue with Google"
          icon="G"
          variant="secondary"
          loading={googleBusy}
          onPress={handleGoogle}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.or}>OR</Text>
          <View style={styles.line} />
        </View>

        <AuthButton
          label="Create an account"
          onPress={() => router.push('/(auth)/sign-up')}
        />
        <AuthButton
          label="Sign in with email"
          variant="secondary"
          onPress={() => router.push('/(auth)/sign-in')}
        />

        <Pressable
          accessibilityRole="button"
          disabled={localBusy}
          onPress={handleLocal}
          style={({ pressed }) => [styles.local, pressed && styles.localPressed]}>
          <Text style={styles.localTitle}>
            {localBusy ? 'Opening local workspace…' : 'Continue without an account'}
          </Text>
          <Text style={styles.localText}>
            Nothing is uploaded. This workspace stays on this device.
          </Text>
        </Pressable>
      </View>

      <View style={styles.safety}>
        <Text style={styles.safetyTitle}>Built with a privacy-first default</Text>
        <Text style={styles.safetyText}>
          Authentication identifies the account. Study answers, mistakes and progress are not
          silently uploaded just because you sign in.
        </Text>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: -2 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  line: { height: 1, backgroundColor: colors.line, flex: 1 },
  or: { color: colors.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  local: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    marginTop: 3,
  },
  localPressed: { opacity: 0.65 },
  localTitle: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  localText: { color: colors.subtle, fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 3 },
  safety: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  safetyTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  safetyText: { color: colors.subtle, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
});
