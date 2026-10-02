import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, spacing } from '@/src/theme/tokens';
import { maskEmail } from '@/src/utils/maskEmail';

export default function VerifyEmailScreen() {
  const { user, resendVerification, refreshVerification, signOutUser } = useAuth();
  const { notifyTransitionReady, runEntryTransition } = useOnboardingTransition();
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldown, setCooldown] = useState(20);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => notifyTransitionReady());
      });

      return () => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame) cancelAnimationFrame(secondFrame);
      };
    }, [notifyTransitionReady]),
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function check() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await runEntryTransition(
        async () => {
          const verified = await refreshVerification();
          if (verified) return;

          const notVerified = new Error('Email is not verified yet') as Error & {
            code: string;
          };
          notVerified.code = 'auth/email-not-verified-yet';
          throw notVerified;
        },
        () => router.replace('/'),
      );
    } catch (err) {
      if (
        (err as { code?: string } | undefined)?.code ===
        'auth/email-not-verified-yet'
      ) {
        setMessage('Not verified yet. Open the email link, then check again.');
      } else {
        setError(authErrorMessage(err, 'signin'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError('');
    setMessage('');
    setResendBusy(true);
    try {
      await resendVerification();
      setCooldown(30);
      setMessage('A new verification email was requested.');
    } catch (err) {
      setError(authErrorMessage(err, 'reset'));
    } finally {
      setResendBusy(false);
    }
  }

  async function switchAccount() {
    await signOutUser();
    router.replace('/');
  }

  return (
    <AuthScaffold
      eyebrow="ONE QUICK CHECK"
      title="Confirm this account is yours."
      description="Verify the email once, then MYELIN can move you into the study system.">
      <View style={styles.mailCard}>
        <Text style={styles.mailLabel}>VERIFICATION SENT TO</Text>
        <Text style={styles.mailAddress}>{maskEmail(user?.email)}</Text>
      </View>

      <Text style={styles.instructions}>
        Open the verification email, tap the link, then return here and continue.
      </Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.stack}>
        <AuthButton label="I've verified my email" loading={busy} onPress={check} />
        <AuthButton
          label={cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
          variant="secondary"
          disabled={cooldown > 0}
          loading={resendBusy}
          onPress={resend}
        />
        <AuthButton label="Use a different account" variant="quiet" onPress={switchAccount} />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  mailCard: {
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  mailLabel: {
    color: colors.subtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  mailAddress: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  instructions: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  message: { color: colors.success, fontSize: 11.5, lineHeight: 17, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 11.5, lineHeight: 17, marginBottom: spacing.md },
  stack: { gap: 10 },
});
