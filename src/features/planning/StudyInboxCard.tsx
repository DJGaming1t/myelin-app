
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { completeTask, scheduleTask } from '@/src/features/planning/task-engine';
import { suggestTaskSlots } from '@/src/features/planning/day-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function dueLabel(dueAt: number) {
  if (!dueAt) return 'No due date';
  const due = new Date(dueAt);
  const today = new Date();
  const key = (d: Date) => [d.getFullYear(), d.getMonth(), d.getDate()].join('-');
  if (key(due) === key(today)) return 'Due today';
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (key(due) === key(tomorrow)) return 'Due tomorrow';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(due);
}

export function StudyInboxCard() {
  const { workspace, updateWorkspace } = useWorkspace();
  if (!workspace) return null;
  const currentWorkspace = workspace;

  const tasks = currentWorkspace.tasks
    .filter((task) => task.status === 'open' && task.planState === 'inbox' && task.postponedUntil <= Date.now())
    .sort((a, b) => {
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

  function moveToday(taskId: string) {
    updateWorkspace((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (!task) return;
      task.planState = 'today';
      task.scheduledStart = 0;
      task.scheduledEnd = 0;
      task.updatedAt = Date.now();
    });
  }

  function scheduleNext(taskId: string) {
    const task = currentWorkspace.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const slot = suggestTaskSlots(currentWorkspace, task, Date.now(), 1)[0];
    if (!slot) {
      moveToday(taskId);
      return;
    }
    updateWorkspace((draft) => {
      const target = draft.tasks.find((item) => item.id === taskId);
      if (target) scheduleTask(target, slot.start, slot.end);
    });
  }

  function done(taskId: string) {
    updateWorkspace((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (task) completeTask(task);
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STUDY INBOX</Text>
          <Text style={styles.title}>
            {tasks.length
              ? String(tasks.length) + ' unscheduled ' + (tasks.length === 1 ? 'task' : 'tasks')
              : 'Capture first. Plan later.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add study task"
          onPress={() => router.push('/(app)/today/task/new')}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
          <Text style={styles.addText}>+ Add</Text>
        </Pressable>
      </View>

      {tasks.length ? (
        tasks.slice(0, 4).map((task) => (
          <View key={task.id} style={styles.task}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Edit ' + task.title}
              onPress={() =>
                router.push({
                  pathname: '/(app)/today/task/[taskId]',
                  params: { taskId: task.id },
                })
              }
              style={({ pressed }) => [styles.taskCopy, pressed && styles.pressed]}>
              <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
              <Text style={styles.taskMeta}>
                {[
                  task.subject || task.type,
                  dueLabel(task.dueAt),
                  task.estimatedMinutes ? String(task.estimatedMinutes) + 'm' : 'No estimate',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Mini label="Today" onPress={() => moveToday(task.id)} />
              <Mini label="Plan" onPress={() => scheduleNext(task.id)} />
              <Mini label="Done" onPress={() => done(task.id)} />
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>
          Drop homework or study work here without deciding an exact time.
        </Text>
      )}

      {tasks.length > 4 ? (
        <Text style={styles.more}>+ {tasks.length - 4} more in Inbox</Text>
      ) : null}
    </View>
  );
}

function Mini({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
      <Text style={styles.miniText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  add: {
    minHeight: layout.minTouch,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
  addText: { color: colors.accent, fontSize: 10.5, fontWeight: '800' },
  task: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11, marginTop: 11 },
  taskCopy: { minHeight: layout.minTouch, justifyContent: 'center' },
  taskTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  taskMeta: { color: colors.subtle, fontSize: 9, lineHeight: 14, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 7 },
  mini: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniText: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  empty: { color: colors.subtle, fontSize: 10, lineHeight: 15, marginTop: 12 },
  more: { color: colors.subtle, fontSize: 9, marginTop: 10 },
  pressed: { opacity: 0.66 },
});
