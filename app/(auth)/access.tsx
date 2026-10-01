import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { AuthScaffold } from '@/src/components/auth/AuthScaffold';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, layout, spacing } from '@/src/theme/tokens';

export default function AccessScreen() {
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
      eyebrow="YOUR STUDY SYSTEM"
      title="Choose how MYELIN remembers you."
      description="The account is not the product. It simply gives your study system an identity.">
      <View style={styles.personality}>
        <PersonalityStep label="NEXT" text="One useful action" accent />
        <View style={styles.personalityDivider} />
        <PersonalityStep label="FOCUS" text="Do the work" />
        <View style={styles.personalityDivider} />
        <PersonalityStep label="RECALL" text="Test memory" />
        <View style={styles.personalityDivider} />
        <PersonalityStep label="ADAPT" text="Improve tomorrow" />
      </View>

      <View style={styles.authSection}>
        <Text style={styles.sectionLabel}>FASTEST</Text>
        <AuthButton
          label="Continue with Google"
          icon="G"
          loading={googleBusy}
          onPress={handleGoogle}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>OR USE EMAIL</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.stack}>
          <AuthButton
            label="Create an account"
            variant="secondary"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <AuthButton
            label="Sign in"
            variant="quiet"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={localBusy}
        onPress={handleLocal}
        style={({ pressed }) => [styles.local, pressed && styles.pressed]}>
        <View style={styles.localCopy}>
          <Text style={styles.localLabel}>DEVICE ONLY</Text>
          <Text style={styles.localTitle}>
            {localBusy ? 'Opening local workspace…' : 'Use MYELIN without an account'}
          </Text>
          <Text style={styles.localText}>Study data stays on this device.</Text>
        </View>
        <Text style={styles.localArrow}>→</Text>
      </Pressable>

      <View style={styles.privacy}>
        <Text style={styles.privacyTitle}>Account ≠ automatic cloud storage</Text>
        <Text style={styles.privacyText}>
          Signing in identifies you. Study answers, corrections and progress are not silently
          uploaded just because you created an account.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={styles.backText}>← What is MYELIN?</Text>
      </Pressable>
    </AuthScaffold>
  );
}

function PersonalityStep({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.personalityStep}>
      <Text style={[styles.personalityLabel, accent && styles.personalityLabelAccent]}>{label}</Text>
      <Text style={styles.personalityText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  personality: {
    minHeight: 72,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.lg,
  },
  personalityStep: { flex: 1, justifyContent: 'center', paddingVertical: 9 },
  personalityDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 12 },
  personalityLabel: {
    color: colors.textDim,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  personalityLabelAccent: { color: colors.accent },
  personalityText: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  authSection: { gap: 0 },
  sectionLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.15,
    marginBottom: 8,
  },
  error: { color: colors.danger, fontSize: 11.5, lineHeight: 17, marginTop: 9 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 15 },
  line: { height: 1, backgroundColor: colors.line, flex: 1 },
  dividerText: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  stack: { gap: 9 },
  local: {
    minHeight: 76,
    marginTop: spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  localCopy: { flex: 1 },
  localLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.15 },
  localTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  localText: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  localArrow: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  privacy: { marginTop: spacing.lg },
  privacyTitle: { color: colors.textDim, fontSize: 10.5, lineHeight: 15, fontWeight: '700' },
  privacyText: { color: colors.subtle, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  back: {
    alignSelf: 'center',
    minHeight: layout.minTouch,
    paddingHorizontal: 10,
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  backText: { color: colors.subtle, fontSize: 10.5, fontWeight: '700' },
  pressed: { opacity: 0.68 },
});
