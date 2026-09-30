import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Reveal } from '@/src/components/motion/Reveal';
import { PlanBlock } from './planner';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, radius, spacing } from '@/src/theme/tokens';

export function PlanBlockCard({
  block,
  index,
  onPress,
}: {
  block: PlanBlock;
  index: number;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Reveal delay={Math.min(index * 55, 220)} distance={8}>
      <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${block.topicName}, ${block.minutes} minutes`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        pressed && !reduceMotion && styles.pressedMotion,
      ]}>
      <View style={styles.indexWrap}>
        <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
      </View>

      <View style={styles.copy}>
        <View style={styles.kickerRow}>
          <Text style={styles.subject}>{block.subject}</Text>
          <View style={styles.dot} />
          <Text style={styles.mode}>
            {block.source === 'task' ? 'TASK' : block.mode === 'review' ? 'REVIEW' : 'STUDY'}
          </Text>
        </View>
        <Text style={styles.title}>{block.topicName}</Text>
        <Text style={styles.reason} numberOfLines={2}>
          {block.reasons.join(' · ')}
        </Text>
      </View>

      <View style={styles.time}>
        <Text style={styles.minutes}>{block.minutes}</Text>
        <Text style={styles.minLabel}>MIN</Text>
        <Text style={styles.arrow}>→</Text>
      </View>
      </Pressable>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 92,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    marginBottom: 9,
  },
  pressed: { opacity: 0.72 },
  pressedMotion: { transform: [{ scale: 0.995 }] },
  indexWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
  index: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  copy: { flex: 1 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  subject: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  dot: { width: 3, height: 3, borderRadius: 3, backgroundColor: colors.subtle },
  mode: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 5 },
  reason: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  time: { alignItems: 'flex-end', minWidth: 38 },
  minutes: { color: colors.text, fontSize: 20, lineHeight: 22, fontWeight: '700' },
  minLabel: { color: colors.subtle, fontSize: 7.5, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  arrow: { color: colors.accent, fontSize: 13, marginTop: 7 },
});
