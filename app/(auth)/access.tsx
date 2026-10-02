import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, layout, spacing } from '@/src/theme/tokens';

export default function AccessScreen() {
  const { signInGoogle, continueLocally } = useAuth();
  const { runEntryTransition } = useOnboardingTransition();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setGoogleBusy(true);
    try {
      await runEntryTransition(() => signInGoogle());
    } catch (err) {
      setError(authErrorMessage(err, 'google'));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleLocal() {
    setError('');
    setLocalBusy(true);
    try {
      await runEntryTransition(() => continueLocally());
    } catch {
      setError('Could not open the local workspace. Try again.');
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <AuthScaffold
      title="Continue to MYELIN"
      description="Use an account, or keep this workspace only on this device.">
      <View style={styles.stack}>
        <AuthButton
          label="Continue with Google"
          icon="G"
          variant="google"
          loading={googleBusy}
          onPress={handleGoogle}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AuthButton
          label="Create an account"
          variant="secondary"
          onPress={() => router.push('/(auth)/sign-up')}
        />
        <AuthButton
          label="Sign in with email"
          variant="quiet"
          onPress={() => router.push('/(auth)/sign-in')}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={localBusy}
        onPress={handleLocal}
        style={({ pressed }) => [
          styles.local,
          pressed && styles.pressed,
          localBusy && styles.disabled,
        ]}>
        <View style={styles.localCopy}>
          <Text style={styles.localTitle}>
            {localBusy ? 'Opening local workspace…' : 'Use without an account'}
          </Text>
          <Text style={styles.localText}>Keep study data on this device.</Text>
        </View>
        <Text style={styles.localArrow}>→</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  error: { color: colors.danger, fontSize: 12.5, lineHeight: 17 },
  local: {
    minHeight: 66,
    marginTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  localCopy: { flex: 1 },
  localTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  localText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  localArrow: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  back: {
    minHeight: layout.minTouch,
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.5 },
});
