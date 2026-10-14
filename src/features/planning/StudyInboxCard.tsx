import { TaskUnstuck, TaskScheduleRequest } from '@/src/features/today/TaskUnstuck';
import { TaskQuickActions, TaskDueLabel } from '@/src/features/planning/TaskQuickActions';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MotionItem } from '@/src/components/motion/MotionItem';
import { useTaskPlanning } from './useTaskPlanning';
import { planningFailureMessage, taskPlanningConflict, taskPlanningSnapshot, ScheduleChoice, TaskPlanningSnapshot } from './task-planning';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { suggestTaskSlots } from '@/src/features/planning/day-engine';
import {
  taskRemainingMinutes,
} from '@/src/features/planning/task-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
}

function dueLabel(dueAt: number) {
  if (!dueAt) return 'No due date';
  const due = new Date(dueAt);
  const today = new Date();
  if (dayKey(dueAt) === dayKey(today.getTime())) return 'Due today';
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (dayKey(dueAt) === dayKey(tomorrow.getTime())) return 'Due tomorrow';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(due);
}

function dateInputText(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function timeInputText(timestamp: number) {
  const date = new Date(timestamp);
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join(':');
}

function parseLocalDateTime(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return 0;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }

  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    return 0;
  }
  return result.getTime();
}

function slotDayLabel(start: number) {
  const today = Date.now();
  if (dayKey(start) === dayKey(today)) return 'Today';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dayKey(start) === dayKey(tomorrow.getTime())) return 'Tomorrow';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(start));
}

function slotTimeLabel(start: number, end: number) {
  const format = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}

export function StudyInboxCard({ overdueOnly = false, scheduleRequest, onScheduleRequestHandled }: { overdueOnly?: boolean; scheduleRequest?: TaskScheduleRequest | null; onScheduleRequestHandled?: (request: TaskScheduleRequest) => void }) {
  const { workspace, ownerKey, status, readWorkspace } = useWorkspace();
  const planning = useTaskPlanning();
  const ownerRef = useRef(ownerKey); ownerRef.current = ownerKey;
  const [visibleCount, setVisibleCount] = useState(4);
  type Scheduling = { ownerKey: string; expected: TaskPlanningSnapshot };
  const [scheduler, setScheduler] = useState<Scheduling | null>(null);
  const schedulerRef = useRef<Scheduling | null>(null);
  const [notice, setNotice] = useState<{ ownerKey: string; text: string } | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => { schedulerRef.current = null; setScheduler(null); setScheduleError(''); setNotice(null); }, [ownerKey, status]);
  const handledRequest = useRef<TaskScheduleRequest | null>(null);
  useEffect(() => {
    if (!scheduleRequest || handledRequest.current === scheduleRequest) return;
    handledRequest.current = scheduleRequest;
    onScheduleRequestHandled?.(scheduleRequest);
    if (ownerKey !== scheduleRequest.ownerKey) return;
    const latest = readWorkspace(scheduleRequest.ownerKey)?.tasks.find(item => item.id === scheduleRequest.task.id);
    if (!latest || taskPlanningConflict(latest, taskPlanningSnapshot(scheduleRequest.task))) return;
    openScheduler(latest.id);
  }, [scheduleRequest, ownerKey, readWorkspace]);

  if (!workspace) return null;
  const currentWorkspace = workspace;

  const tasks = currentWorkspace.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        (!overdueOnly || (task.dueAt > 0 && task.dueAt < Date.now())),
    )
    .sort((a, b) => {
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

  const schedulerTask = status === 'ready' && scheduler?.ownerKey === ownerKey
    ? currentWorkspace.tasks.find(item => item.id === scheduler.expected.id) ?? null : null;
  const offeredAt = Date.now();
  const suggestedSlots = schedulerTask?.status === 'open'
    ? suggestTaskSlots(currentWorkspace, schedulerTask, offeredAt, 4) : [];

  function moveToday(taskId: string) {
    if (!ownerKey || ownerRef.current !== ownerKey) return;
    const task = currentWorkspace.tasks.find(item => item.id === taskId);
    if (!task) return;
    const result = planning.moveToday(task);
    if (!result.ok && result.reason === 'consumed') return;
    setNotice({ ownerKey, text: result.ok ? 'Moved to Today · Deadline unchanged.' : planningFailureMessage(result.reason, 'move') });
  }

  function openScheduler(taskId: string, preserveCustom = false) {
    if (!ownerKey || ownerRef.current !== ownerKey) return;
    const latest = readWorkspace(ownerKey);
    const task = latest?.tasks.find(item => item.id === taskId);
    if (!latest || !task || task.status !== 'open') return;
    const firstSuggestion = suggestTaskSlots(latest, task, Date.now(), 1)[0];
    const fallback = new Date(); fallback.setDate(fallback.getDate() + 1); fallback.setHours(18, 0, 0, 0);
    const seed = Math.max(Math.ceil((firstSuggestion?.start ?? fallback.getTime()) / 60000) * 60000, Math.floor(Date.now() / 60000) * 60000 + 60000);
    const next = { ownerKey, expected: taskPlanningSnapshot(task) };
    schedulerRef.current = next; setScheduler(next);
    if (!preserveCustom) { setCustomDate(dateInputText(seed)); setCustomTime(timeInputText(seed)); }
    setScheduleError(''); setNotice(null);
  }

  function closeScheduler(current = scheduler) {
    if (!current || ownerRef.current !== current.ownerKey || schedulerRef.current !== current) return;
    schedulerRef.current = null; setScheduler(null); setScheduleError('');
  }

  function applySchedule(choice: ScheduleChoice) {
    if (!scheduler || schedulerRef.current !== scheduler || ownerRef.current !== scheduler.ownerKey) return;
    const result = planning.schedule(scheduler.expected, choice);
    if (!result.ok) { setScheduleError(planningFailureMessage(result.reason)); return; }
    setNotice({ ownerKey: scheduler.ownerKey, text: 'Task scheduled · Deadline unchanged.' });
    closeScheduler(scheduler);
  }

  function scheduleCustom() {
    if (!schedulerTask) return;
    const start = parseLocalDateTime(customDate, customTime);
    if (!start) {
      setScheduleError('Use a valid date and time, such as 2026-10-05 and 18:30.');
      return;
    }

    const minutes =
      taskRemainingMinutes(schedulerTask) ||
      schedulerTask.estimatedMinutes ||
      25;
    applySchedule({ kind: 'custom', start, end: start + Math.max(5, minutes) * 60000 });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{overdueOnly ? 'OVERDUE WORK' : 'STUDY TASKS'}</Text>
          <Text style={styles.title}>
            {tasks.length
              ? String(tasks.length) + ' ' + (tasks.length === 1 ? 'open task' : 'open tasks')
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

      {notice?.ownerKey === ownerKey ? <Text accessibilityLiveRegion="polite" style={styles.scheduleIntro}>{notice.text}</Text> : null}

      {tasks.length ? (
        tasks.slice(0, visibleCount).map((task, index) => (
          <MotionItem key={task.id} delay={Math.min(index * 35, 105)} style={styles.task}>
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
              <Text style={styles.taskTitle} numberOfLines={2}>
                {task.title}
              </Text>
              <Text style={styles.taskMeta}>
                {[
                  task.subject || task.type,
                  dueLabel(task.dueAt),
                  task.planState === 'postponed' ? 'Deferred' : task.planState === 'scheduled' ? 'Scheduled' : task.planState === 'today' ? 'Today' : 'Inbox',
                  task.estimatedMinutes ? String(task.estimatedMinutes) + 'm' : 'No estimate',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
            <TaskDueLabel task={task} />
            <TaskQuickActions task={task} />
            <View style={styles.actions}>
              <Mini label="Today" onPress={() => moveToday(task.id)} />
              <Mini label="Schedule" onPress={() => openScheduler(task.id)} accent />
            </View>
            <TaskUnstuck task={task} onSchedule={request => { if (request.ownerKey === ownerKey) openScheduler(request.task.id); }} />
          </MotionItem>
        ))
      ) : (
        <Text style={styles.empty}>
          Drop homework or study work here without deciding an exact time.
        </Text>
      )}

      {tasks.length > visibleCount ? (
<Pressable accessibilityRole="button" onPress={() => setVisibleCount(value => value + 10)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.more}>{`Show ${Math.min(10, tasks.length - visibleCount)} more tasks`}</Text></Pressable>
      ) : null}

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(schedulerTask)}
        onRequestClose={() => closeScheduler()}
        statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close scheduling sheet"
            style={StyleSheet.absoluteFill}
            onPress={() => closeScheduler()}
          />
          <View style={styles.scheduleSheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scheduleContent}>
              <Text style={styles.scheduleEyebrow}>SCHEDULE</Text>
              <Text style={styles.scheduleTitle} numberOfLines={2}>
                {schedulerTask?.title ?? 'Study task'}
              </Text>
              <Text style={styles.scheduleIntro}>
                {schedulerTask?.status === 'open' ? 'Pick an actual time. Scheduling no longer sends this task to Today automatically.' : 'This task is already complete. Close this sheet to return to your current plan.'}
              </Text>

              {suggestedSlots.length ? (
                <View style={styles.suggestionList}>
                  {suggestedSlots.map((slot) => (
                    <Pressable
                      key={String(slot.start)}
                      accessibilityRole="button"
                      accessibilityLabel={`Schedule for ${slotDayLabel(slot.start)} at ${slotTimeLabel(slot.start, slot.end)}`}
                      onPress={() =>
                        schedulerTask
                          ? applySchedule({ kind: 'suggested', start: slot.start, end: slot.end, offeredAt })
                          : undefined
                      }
                      style={({ pressed }) => [
                        styles.slotChoice,
                        pressed && styles.pressed,
                      ]}>
                      <View style={styles.slotCopy}>
                        <Text style={styles.slotDay}>{slotDayLabel(slot.start)}</Text>
                        <Text style={styles.slotTime}>
                          {slotTimeLabel(slot.start, slot.end)}
                        </Text>
                      </View>
                      <Text style={styles.slotAction}>Choose</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.noSuggestions}>
                  {schedulerTask?.status === 'open' ? 'No open suggestion was found in the next few days. You can still pick a time below.' : 'Your current plan was kept.'}
                </Text>
              )}

              <View style={styles.customDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR PICK A TIME</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.customRow}>
                <TextInput
                  accessibilityLabel="Schedule date"
                  value={customDate}
                  onChangeText={(value) => {
                    if (!scheduler || schedulerRef.current !== scheduler || ownerRef.current !== scheduler.ownerKey) return;
                    setCustomDate(value);
                    setScheduleError('');
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="none"
                  style={styles.dateInput}
                />
                <TextInput
                  accessibilityLabel="Schedule time"
                  value={customTime}
                  onChangeText={(value) => {
                    if (!scheduler || schedulerRef.current !== scheduler || ownerRef.current !== scheduler.ownerKey) return;
                    setCustomTime(value);
                    setScheduleError('');
                  }}
                  placeholder="18:30"
                  placeholderTextColor={colors.subtle}
                  keyboardType="numbers-and-punctuation"
                  style={styles.timeInput}
                />
              </View>

              {scheduleError ? (
                <Text accessibilityLiveRegion="polite" style={styles.scheduleError}>{scheduleError}</Text>
              ) : null}

              {scheduleError && schedulerTask?.status === 'open' ? <Pressable accessibilityRole="button" onPress={() => openScheduler(schedulerTask.id, true)} style={styles.cancelSchedule}>
                <Text style={styles.cancelScheduleText}>Refresh scheduling options</Text>
              </Pressable> : null}
              <Pressable
                accessibilityRole="button"
                disabled={schedulerTask?.status !== 'open'}
                onPress={scheduleCustom}
                style={({ pressed }) => [
                  styles.schedulePrimary,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.schedulePrimaryText}>Schedule this task</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => closeScheduler()}
                style={({ pressed }) => [
                  styles.cancelSchedule,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.cancelScheduleText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Mini({
  label,
  onPress,
  accent = false,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mini,
        accent && styles.miniAccent,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.miniText, accent && styles.miniTextAccent]}>{label}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 4,
  },
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
  task: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 11,
    marginTop: 11,
  },
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
  miniAccent: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  miniText: { color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  miniTextAccent: { color: colors.accent },
  empty: { color: colors.subtle, fontSize: 10, lineHeight: 15, marginTop: 12 },
  more: { color: colors.subtle, fontSize: 9, marginTop: 10 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  scheduleSheet: {
    width: '100%',
    maxWidth: layout.readingMax,
    maxHeight: '86%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
  },
  scheduleContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scheduleEyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  scheduleTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    marginTop: 6,
  },
  scheduleIntro: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  suggestionList: { gap: 8, marginTop: spacing.md },
  slotChoice: {
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  slotCopy: { flex: 1, minWidth: 0 },
  slotDay: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
  slotTime: { color: colors.muted, fontSize: 11, marginTop: 3 },
  slotAction: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  noSuggestions: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: spacing.md,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
  },
  customDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.lg,
    marginBottom: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: {
    color: colors.subtle,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  customRow: { flexDirection: 'row', gap: 8 },
  dateInput: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  timeInput: {
    width: 96,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  scheduleError: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  schedulePrimary: {
    minHeight: 52,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  schedulePrimaryText: {
    color: '#25140e',
    fontSize: 13,
    fontWeight: '900',
  },
  cancelSchedule: {
    minHeight: layout.minTouch,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelScheduleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: { opacity: 0.66 },
});
