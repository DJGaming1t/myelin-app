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
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, layout, radius, space } from '@/src/theme/tokens';

export default function SignUpScreen() {
  const {
    signUpEmail,
    signInGoogle,
    keepSignedIn: defaultKeepSignedIn,
  } = useAuth();
  const { runEntryTransition } = useOnboardingTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(defaultKeepSignedIn);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');

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
      eyebrow="CREATE YOUR ACCOUNT"
      title="Make MYELIN yours."
      description="Google is the quickest setup. Email works too, with verification before account sync features.">
      <AuthButton
        label="Continue with Google"
        icon="G"
        variant="google"
        loading={googleBusy}
        onPress={google}
      />

      <View style={styles.divider} accessible={false}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or create with email</Text>
        <View style={styles.dividerLine} />
      </View>

      <AuthField
        label="Name (optional)"
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
        <View style={styles.privacyMark}>
          <View style={styles.privacyCore} />
        </View>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>Local by default</Text>
          <Text style={styles.privacyText}>
            Creating an account does not automatically upload your study answers or progress.
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <AuthButton label="Create account" loading={busy} onPress={submit} />

      <View style={styles.bottomRow}>
        <Text style={styles.muted}>Already use MYELIN?</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(auth)/sign-in')}
          style={styles.inlineLink}>
          <Text style={styles.link}>Sign in</Text>
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
  privacyNote: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
  },
  privacyMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentFaint,
    borderWidth: 1,
    borderColor: colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  privacyCopy: { flex: 1 },
  privacyTitle: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  privacyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
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
