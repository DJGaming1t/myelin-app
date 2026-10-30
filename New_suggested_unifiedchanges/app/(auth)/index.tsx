import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import {
  OnboardingPrimaryButton,
  OnboardingShell,
  StudyPathVisual,
} from '@/src/components/onboarding/OnboardingShell';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  return (
    <OnboardingShell
      scrollable={false}
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

      <SpringPressable
        accessibilityRole="button"
        onPress={() => router.push('/(auth)/sign-in')}
        scaleTo={0.99}
        lift={0}
        style={styles.signIn}>
        <Text style={styles.signInText}>I already use MYELIN</Text>
      </SpringPressable>
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
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(16,16,19,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
