import { router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  DAILY_CAPACITY_OPTIONS,
  applyOnboardingSetup,
  normalizeDailyCapacity,
} from '@/src/features/onboarding/onboarding-engine';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const CAPACITY_COPY: Record<number, string> = {
  45: 'Light',
  60: 'Steady',
  90: 'Balanced',
  120: 'Deep',
};

export default function OnboardingScreen() {
  const { workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const { finish } = useOnboarding();

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
      await finish('skipped');
      router.replace('/(app)/today');
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
      await finish('completed');
      router.replace('/(app)/today');
    } catch {
      setError('Setup could not be finished on this device.');
      setFinishing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>MYELIN</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={() => void skip()}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && styles.pressed,
            finishing && styles.disabled,
          ]}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>Set a realistic study day.</Text>
        <Text style={styles.lead}>
          This is only a default. You can change it anytime.
        </Text>

        <Text style={styles.question}>How much focused study usually fits?</Text>

        <View style={styles.capacityList}>
          {DAILY_CAPACITY_OPTIONS.map((minutes) => {
            const active = capacity === minutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCapacity(minutes)}
                style={({ pressed }) => [
                  styles.capacityRow,
                  active && styles.capacityRowActive,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.capacityCopy}>
                  <Text style={[styles.capacityMinutes, active && styles.activeText]}>
                    {minutes} min
                  </Text>
                  <Text style={styles.capacityLabel}>{CAPACITY_COPY[minutes]}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={finishing}
          onPress={() => void complete()}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.pressed,
            finishing && styles.disabled,
          ]}>
          <Text style={styles.primaryText}>{finishing ? 'Opening…' : 'Enter MYELIN'}</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent },
  brandName: { color: colors.textDim, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 1.9 },
  skipButton: {
    minHeight: layout.minTouch,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1.05,
  },
  lead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
  },
  question: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: 8,
  },
  capacityList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  capacityRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingHorizontal: 4,
  },
  capacityRowActive: { backgroundColor: colors.accentFaint },
  capacityCopy: { flex: 1 },
  capacityMinutes: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  capacityLabel: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  activeText: { color: colors.accent },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  error: { color: colors.danger, fontSize: 12.5, lineHeight: 17, marginTop: 12 },
  primary: {
    minHeight: 56,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryText: { color: '#25140e', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 20, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
});
