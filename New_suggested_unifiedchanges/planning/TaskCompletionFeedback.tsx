import { StyleSheet, Text, View } from 'react-native';

import { MotionItem } from '@/src/components/motion/MotionItem';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export function TaskCompletionFeedback({
  name,
  onUndo,
}: {
  name: string;
  onUndo: () => void;
}) {
  return (
    <MotionItem style={styles.shell}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${name} completed`}
        style={styles.mark}>
        <Text style={styles.markText}>✓</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Done. Nice finish.</Text>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
      </View>
      <SpringPressable
        accessibilityRole="button"
        accessibilityLabel={`Undo completing ${name}`}
        onPress={onUndo}
        lift={0}
        style={styles.undo}>
        <Text style={styles.undoText}>Undo</Text>
      </SpringPressable>
    </MotionItem>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 62,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 12, fontWeight: '800' },
  name: { color: colors.muted, fontSize: 10.5, marginTop: 2 },
  undo: {
    minHeight: layout.minTouch,
    minWidth: 58,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
});
