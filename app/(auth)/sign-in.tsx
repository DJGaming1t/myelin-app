import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthField } from '@/src/components/auth/AuthField';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { KeepSignedInRow } from '@/src/components/auth/KeepSignedInRow';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, layout, space } from '@/src/theme/tokens';

export default function SignInScreen() {
  const { signInEmail, signInGoogle, keepSignedIn: defaultKeepSignedIn } = useAuth();
  const { runEntryTransition } = useOnboardingTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(defaultKeepSignedIn);
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
      await runEntryTransition(
        () => signInEmail(email, password, keepSignedIn),
        () => router.replace('/'),
      );
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
      await runEntryTransition(
        () => signInGoogle(keepSignedIn),
        () => router.replace('/'),
      );
    } catch (err) {
      setError(authErrorMessage(err, 'google'));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthScaffold
      compact
      eyebrow="WELCOME BACK"
      title="Pick up where you left off."
      description="Use Google for the fastest return, or sign in with your MYELIN email.">
      <AuthButton
        label="Continue with Google"
        icon="G"
        variant="google"
        loading={googleBusy}
        onPress={google}
      />

      <View style={styles.divider} accessible={false}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or sign in with email</Text>
        <View style={styles.dividerLine} />
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

      <View style={styles.utilityRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(auth)/forgot-password')}
          style={styles.inlineLink}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      </View>

      <KeepSignedInRow value={keepSignedIn} onChange={setKeepSignedIn} />

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <AuthButton label="Sign in to MYELIN" loading={busy} onPress={submit} />

      <View style={styles.bottomRow}>
        <Text style={styles.muted}>New to MYELIN?</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(auth)/sign-up')}
          style={styles.inlineLink}>
          <Text style={styles.link}>Create an account</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginVertical: space.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  dividerText: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  utilityRow: {
    alignItems: 'flex-end',
    marginTop: -8,
    marginBottom: space.sm,
  },
  inlineLink: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.26)',
    backgroundColor: 'rgba(255,165,150,0.06)',
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
  error: {
    color: colors.danger,
    fontSize: 12.5,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: space.lg,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  back: {
    alignSelf: 'center',
    minHeight: layout.minTouch,
    marginTop: space.sm,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  backText: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
});
