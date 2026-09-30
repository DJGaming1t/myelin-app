import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/src/theme/tokens';

import { ReviewChoice, ReviewSchedule } from './review-engine';

const LABEL: Record<ReviewChoice, string> = {
  again: 'Again',
  practising: 'Practising',
  good: 'Good',
};

const HELP: Record<ReviewChoice, string> = {
  again: 'I could not retrieve it reliably.',
  practising: 'I got some of it, but it still needs work.',
  good: 'I retrieved it well enough to space it out.',
};

export function ReviewChoiceButton({
  choice,
  schedule,
  onPress,
}: {
  choice: ReviewChoice;
  schedule: ReviewSchedule;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${LABEL[choice]}. ${schedule.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        choice === 'again' && styles.again,
        choice === 'good' && styles.good,
        pressed && styles.pressed,
      ]}>
      <View style={styles.top}>
        <Text style={styles.label}>{LABEL[choice]}</Text>
        <Text style={styles.when}>{schedule.label}</Text>
      </View>
      <Text style={styles.help}>{HELP[choice]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 70,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    padding: 12,
    justifyContent: 'center',
  },
  again: {
    borderColor: 'rgba(255,161,145,0.25)',
    backgroundColor: 'rgba(255,161,145,0.045)',
  },
  good: {
    borderColor: 'rgba(180,216,174,0.22)',
    backgroundColor: 'rgba(180,216,174,0.045)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  when: { color: colors.accent, fontSize: 9.5, fontWeight: '700' },
  help: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.995 }] },
});
