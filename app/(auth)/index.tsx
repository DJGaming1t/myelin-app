import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  OnboardingPrimaryButton,
  OnboardingShell,
  StudyPathVisual,
} from '@/src/components/onboarding/OnboardingShell';
import { colors, layout } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  return (
    <OnboardingShell
      title={
        <Text>
          Know what to study{'\n'}
          <Text style={styles.titleAccent}>next.</Text>
        </Text>
      }
      description="MYELIN turns everything competing for your attention into one clear next move."
      visual={<StudyPathVisual />}>
      <OnboardingPrimaryButton
        label="Continue"
        onPress={() => router.push('/(auth)/access')}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(auth)/sign-in')}
        style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}>
        <Text style={styles.signInText}>I already use MYELIN</Text>
      </Pressable>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  titleAccent: {
    color: colors.text,
    textDecorationLine: 'underline',
    textDecorationColor: colors.accent,
  },
  signIn: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  pressed: { opacity: 0.68 },
});
