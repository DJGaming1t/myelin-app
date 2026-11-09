import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { StudyTask } from '@/src/data/schema';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';

export type TaskScheduleRequest = {
  ownerKey: string | null;
  task: StudyTask;
  requestedAt: number;
};

export function TaskUnstuck({
  task,
  enabled = true,
  onSchedule,
}: {
  task: StudyTask | undefined | null;
  enabled?: boolean;
  onSchedule?: (request: TaskScheduleRequest) => void;
}) {
  const { ownerKey } = useWorkspace();
  const { session: focusSession } = useFocus();
  const { session: reviewSession } = useReview();
  const [open, setOpen] = useState(false);

  if (!task || task.status !== 'open') return null;
  const deferCount = task.postponements ?? 0;
  if (deferCount < 2 && task.estimatedMinutes < 60) return null;

  function launchFiveMinutes() {
    if (!enabled || !task) return;
    if (reviewSession) {
      router.push('/(app)/review');
      return;
    }
    if (focusSession) {
      router.push('/(app)/focus');
      return;
    }
    router.push({
      pathname: '/(app)/focus',
      params: {
        taskId: task.id,
        ...(task.topicId ? { topicId: task.topicId } : {}),
        minutes: '5',
      },
    });
  }

  return (
    <View style={styles.wrap} testID={`task-unstuck-${task.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !enabled }}
        disabled={!enabled}
        onPress={() => setOpen((current) => !current)}
        style={styles.trigger}>
        <Text style={styles.kicker}>STUCK ON THIS TASK?</Text>
        <Text style={styles.actionText}>{open ? 'Hide options' : 'Make it smaller →'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.copy}>
            Start with a 5-minute launch block or pick a realistic slot so the full task stops hanging over today.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={!enabled}
              onPress={launchFiveMinutes}
              style={styles.primaryBtn}>
              <Text style={styles.primaryText}>5-minute launch</Text>
            </Pressable>
            {onSchedule ? (
              <Pressable
                accessibilityRole="button"
                disabled={!enabled}
                onPress={() =>
                  onSchedule({
                    ownerKey,
                    task,
                    requestedAt: Date.now(),
                  })
                }
                style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Pick a slot</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 8,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  kicker: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    marginTop: 6,
    gap: 8,
  },
  copy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryBtn: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
