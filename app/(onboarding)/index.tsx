import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  OnboardingPrimaryButton,
  OnboardingShell,
} from '@/src/components/onboarding/OnboardingShell';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  DAILY_CAPACITY_OPTIONS,
  applyOnboardingSetup,
  normalizeDailyCapacity,
} from '@/src/features/onboarding/onboarding-engine';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';

const CAPACITY_COPY: Record<number, string> = {
  45: 'Light',
  60: 'Steady',
  90: 'Balanced',
  120: 'Deep',
};

export default function OnboardingScreen() {
  const { workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const { finish } = useOnboarding();
  const { runTransition, notifyTransitionReady } = useOnboardingTransition();

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

  const [capacity, setCapacity] = useState(
    normalizeDailyCapacity(workspace?.settings.dailyMinutes ?? 90),
  );
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  async function skip() {
    if (finishing) return;
    setFinishing(true);
    setError('');

    try {
      await runTransition(async () => {
        await finish('skipped');
        router.replace('/(app)/today');
      });
    } catch {
      setError('Could not save this choice. Try again.');
      setFinishing(false);
    }
  }

  async function complete() {
    if (finishing || !workspace) return;

    setFinishing(true);
    setError('');

    const next = updateWorkspace((draft) => {
      applyOnboardingSetup(draft, capacity);
    });

    if (!next) {
      setError('The workspace is not ready yet.');
      setFinishing(false);
      return;
    }

    try {
      await waitForSaves();
      await runTransition(async () => {
        await finish('completed');
        router.replace('/(app)/today');
      });
    } catch {
      setError('Setup could not be finished on this device.');
      setFinishing(false);
    }
  }

  return (
    <OnboardingShell
      topActionLabel="Skip"
      onTopAction={() => void skip()}
      title="How much focus fits in a normal day?"
      description="Pick a realistic default. MYELIN can adjust around the day you actually have.">
      <View style={styles.options}>
        {DAILY_CAPACITY_OPTIONS.map((minutes) => {
          const active = capacity === minutes;
          return (
            <SpringPressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCapacity(minutes)}
              scaleTo={0.992}
              lift={0}
              style={[
                styles.option,
                active && styles.optionActive,
              ]}>
              <View>
                <Text style={[styles.minutes, active && styles.minutesActive]}>
                  {minutes} min
                </Text>
                <Text style={styles.label}>{CAPACITY_COPY[minutes]}</Text>
              </View>

              <View style={[styles.marker, active && styles.markerActive]}>
                {active ? <View style={styles.markerDot} /> : null}
              </View>
            </SpringPressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.primaryWrap}>
        <OnboardingPrimaryButton
          label={finishing ? 'Opening…' : 'Enter MYELIN'}
          disabled={finishing}
          onPress={() => void complete()}
        />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 8,
    marginTop: spacing.md,
  },
  option: {
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  minutes: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  minutesActive: { color: colors.accentBright },
  label: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerActive: { borderColor: colors.accent },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  error: {
    color: colors.danger,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 12,
  },
  primaryWrap: { marginTop: spacing.lg },
});
