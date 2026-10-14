import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { StudyTask } from '@/src/data/schema';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { taskRemainingMinutes } from './task-engine';
import { taskUrgency } from './task-urgency';
import { colors, radius } from '@/src/theme/tokens';

import { useQuickTaskCompletion } from './useTaskCompletion';
export { useQuickTaskCompletion as useTaskCompletion } from './useTaskCompletion';

export function TaskDueLabel({ task, now = Date.now() }: { task: StudyTask; now?: number }) {
  const urgency = taskUrgency(task, now);
  if (!urgency) return null;
  return <Text style={[styles.due, urgency.overdue && styles.overdue]}>{urgency.overdue ? '● ' : ''}{urgency.label}</Text>;
}

export function TaskQuickActions({ task }: { task: StudyTask }) {
  const complete = useQuickTaskCompletion();
  const { session } = useFocus();
  const { session: review } = useReview();
  function focus() {
    if (review) { router.push('/(app)/review'); return; }
    if (session) { router.push('/(app)/focus'); return; }
    router.push({ pathname: '/(app)/focus', params: {
      taskId: task.id, ...(task.topicId ? { topicId: task.topicId } : {}),
      minutes: String(Math.max(5, Math.min(240, taskRemainingMinutes(task) || 25))),
    } });
  }
  if (task.status !== 'open') return null;
  return <View style={styles.row}>
    <SpringPressable accessibilityRole="button" accessibilityLabel={`Focus on ${task.title}`} onPress={focus} style={[styles.action, styles.focus]}>
      <Text style={styles.focusText}>{session?.taskId === task.id ? 'Resume timer' : '▶ Focus'}</Text>
    </SpringPressable>
    <SpringPressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => complete(task.id)} style={styles.action}>
      <Text style={styles.completeText}>✓ Complete</Text>
    </SpringPressable>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  action: { flexGrow: 1, flexBasis: 100, minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  focus: { borderColor: colors.accentLine, backgroundColor: colors.accentFaint },
  focusText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  completeText: { color: colors.success, fontSize: 12, fontWeight: '800' },
  due: { color: colors.accent, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 6 },
  overdue: { color: colors.danger },
});
