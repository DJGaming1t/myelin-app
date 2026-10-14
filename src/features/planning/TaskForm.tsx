import { TaskQuickActions, TaskDueLabel, useTaskCompletion } from '@/src/features/planning/TaskQuickActions';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { Priority, StudyTask, StudyTaskType } from '@/src/data/schema';
import {
  createStudyTask,
  reopenTask,
} from '@/src/features/planning/task-engine';
import { applyTaskEdit, taskEditConflict, RecordedTime, TaskEdit } from './task-edit';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const DURATIONS = [15, 25, 35, 45, 60];
const TYPES: Array<{ value: StudyTaskType; label: string }> = [
  { value: 'homework', label: 'Homework' },
  { value: 'revision', label: 'Revision' },
  { value: 'practice', label: 'Practice' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'personal', label: 'Personal study' },
];

function startOfDay(now: number) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

type DueChoice = 'none' | 'today' | 'tomorrow' | 'custom';

function dateText(timestamp: number) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function timeText(timestamp: number) {
  if (!timestamp) return '23:59';
  const d = new Date(timestamp);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function customDueTimestamp(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return 0;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
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

function dueTimestamp(
  choice: DueChoice,
  customDate: string,
  customTime: string,
) {
  if (choice === 'none') return 0;
  if (choice === 'custom') return customDueTimestamp(customDate, customTime);
  const d = new Date();
  const offset = choice === 'tomorrow' ? 1 : 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 23, 59, 0, 0).getTime();
}

function dueChoice(task: StudyTask | null): DueChoice {
  if (!task?.dueAt) return 'none';
  const today = startOfDay(Date.now());
  const due = startOfDay(task.dueAt);
  if (due === today) return 'today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due === startOfDay(tomorrow.getTime())) return 'tomorrow';
  return 'custom';
}

export function TaskForm({ taskId }: { taskId?: string }) {
  const { workspace, ownerKey, status } = useWorkspace();
  if (!workspace || !ownerKey || status !== 'ready') return null;
  if (taskId && !workspace.tasks.some(task => task.id === taskId)) return <View style={styles.content}>
    <ScreenHeader variant="compact" title="Task unavailable" subtitle="This task has been removed." onBack={() => router.back()} />
  </View>;
  return <TaskFormEditor key={`${ownerKey}:${taskId ?? 'new'}`} taskId={taskId} />;
}

function TaskFormEditor({ taskId }: { taskId?: string }) {
  const complete = useTaskCompletion();
  const { workspace, ownerKey, updateWorkspace } = useWorkspace();
  const existing = useMemo(
    () => workspace?.tasks.find((task) => task.id === taskId) ?? null,
    [taskId, workspace],
  );

  const [initial] = useState(existing);
  const submitted = useRef(false);
  const [deadlineBaseline, setDeadlineBaseline] = useState(existing?.dueAt ?? 0);
  const [dueEdited, setDueEdited] = useState(false);
  const [recordedBaseline, setRecordedBaseline] = useState<RecordedTime | null>(null);
  const [conflict, setConflict] = useState<'deadline' | 'time' | null>(null);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [topicId, setTopicId] = useState<string | null>(existing?.topicId ?? null);
  const [examId, setExamId] = useState<string | null>(existing?.examId ?? null);
  const [type, setType] = useState<StudyTaskType>(existing?.type ?? 'homework');
  const [planState, setPlanState] = useState<'inbox' | 'today'>(
    existing?.planState === 'today' ? 'today' : 'inbox',
  );
  const [due, setDue] = useState<DueChoice>(dueChoice(existing));
  const [customDate, setCustomDate] = useState(existing?.dueAt ? dateText(existing.dueAt) : '');
  const [customTime, setCustomTime] = useState(existing?.dueAt ? timeText(existing.dueAt) : '23:59');
  const [estimate, setEstimate] = useState(String(existing?.estimatedMinutes ?? 35));
  const [actual, setActual] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 2);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');

  if (!workspace) return null;

  const selectedTopic = topicId
    ? workspace.topics.find((topic) => topic.id === topicId) ?? null
    : null;

  function selectTopic(nextId: string | null) {
    setTopicId(nextId);
    if (nextId) {
      const topic = workspace!.topics.find((item) => item.id === nextId);
      if (topic) setSubject(topic.subject);
    }
  }

  function save() {
    if (submitted.current || !ownerKey) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Add a short task title.');
      return;
    }
    const resolvedDue = initial && !dueEdited ? deadlineBaseline : dueTimestamp(due, customDate, customTime);
    if ((!initial || dueEdited) && due === 'custom' && !resolvedDue) {
      setError('Use a valid due date and time, such as 2026-10-12 and 18:30.');
      return;
    }
    const minutes = Math.max(0, Math.min(720, Math.round(Number(estimate) || 0)));
    const actualMinutes = actual === null ? null : Number(actual);
    if (actualMinutes !== null && (!Number.isFinite(actualMinutes) || actualMinutes < 0)) {
      setError('Use a non-negative number for recorded minutes.'); return;
    }
    const now = Date.now();

    const patch: TaskEdit = {};
    if (initial) {
      const values = { title: cleanTitle, subject: subject.trim().slice(0, 120), topicId, examId, type,
        estimatedMinutes: minutes, priority, notes: notes.trim().slice(0, 12000) };
      for (const key of Object.keys(values) as (keyof typeof values)[]) {
        if (values[key] !== initial[key]) Object.assign(patch, { [key]: values[key] });
      }
      if (dueEdited) patch.dueAt = resolvedDue;
      if (actualMinutes !== null) patch.actualMinutes = Math.round(actualMinutes);
      const originalPlan = initial.planState === 'today' ? 'today' : 'inbox';
      if (planState !== originalPlan) patch.planState = planState;
    }
    let issue: ReturnType<typeof taskEditConflict> = null;
    submitted.current = true;
    const updated = updateWorkspace((draft) => {
      if (taskId) applyTaskEdit(draft.tasks.find(item => item.id === taskId)!, patch, now);
      else draft.tasks.push(createStudyTask({ title: cleanTitle, subject, topicId, examId, type, planState,
        dueAt: resolvedDue, estimatedMinutes: minutes, priority, notes, now }));
    }, { ownerKey, canApply: current => {
      if (!taskId) return true;
      issue = taskEditConflict(current.tasks.find(item => item.id === taskId), patch, deadlineBaseline, recordedBaseline);
      return !issue;
    } });
    if (!updated) {
      submitted.current = false;
      setConflict(issue === 'deadline' || issue === 'time' ? issue : null);
      setError(issue === 'time' ? 'Study time changed while you were editing. Use the latest recorded time before saving.'
        : issue === 'deadline' ? 'The deadline changed while you were editing. Use the latest deadline before saving.'
        : 'This task is no longer available. Your changes were not saved.');
      return;
    }
    router.back();
  }

  function toggleComplete() {
    if (!existing || submitted.current || !ownerKey) return;
    submitted.current = true;
    const accepted = existing.status === 'open' ? complete(existing.id) : !!updateWorkspace((draft) => {
      reopenTask(draft.tasks.find(item => item.id === existing.id)!);
    }, { ownerKey, canApply: current => current.tasks.some(item => item.id === existing.id && item.status === 'completed') });
    if (accepted) router.back();
    else submitted.current = false;
  }

  function remove() {
    if (!existing || !ownerKey || submitted.current) return;
    Alert.alert(
      'Delete this study task?',
      'The task will be removed. Existing Focus history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (submitted.current) return;
            submitted.current = true;
            const updated = updateWorkspace((draft) => {
              draft.tasks = draft.tasks.filter((item) => item.id !== existing.id);
            }, { ownerKey, canApply: current => current.tasks.some(item => item.id === existing.id) });
            if (updated) router.back(); else submitted.current = false;
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        variant="compact"
        eyebrow={existing ? 'STUDY TASK' : 'QUICK CAPTURE'}
        title={existing ? 'Edit task' : 'Add study work'}
        subtitle="Keep it concrete. Exact scheduling can come later."
        onBack={() => router.back()}
      />

      {existing ? <><TaskDueLabel task={existing} /><TaskQuickActions task={existing} /></> : null}
      <Label>What needs doing?</Label>
      <TextInput
        autoFocus={!existing}
        value={title}
        onChangeText={setTitle}
        placeholder="Finish Maths Exercise 5.2"
        placeholderTextColor={colors.subtle}
        selectionColor={colors.accent}
        maxLength={500}
        style={styles.input}
      />

      <Label>Estimated time</Label>
      <View style={styles.rowWrap}>
        {DURATIONS.map((minutes) => (
          <Chip
            key={minutes}
            label={`${minutes}m`}
            active={Number(estimate) === minutes}
            onPress={() => setEstimate(String(minutes))}
          />
        ))}
      </View>
      <TextInput
        value={estimate}
        onChangeText={setEstimate}
        keyboardType="number-pad"
        placeholder="Minutes"
        placeholderTextColor={colors.subtle}
        style={styles.smallInput}
      />

      <Label>Where should it live?</Label>
      <View style={styles.row}>
        <Chip label="Inbox" active={planState === 'inbox'} onPress={() => setPlanState('inbox')} flex />
        <Chip label="Today" active={planState === 'today'} onPress={() => setPlanState('today')} flex />
      </View>

      <Label>Due</Label>
      <View style={styles.rowWrap}>
        <Chip label="No date" active={due === 'none'} onPress={() => { setDue('none'); setDueEdited(true); }} />
        <Chip label="Today" active={due === 'today'} onPress={() => { setDue('today'); setDueEdited(true); }} />
        <Chip label="Tomorrow" active={due === 'tomorrow'} onPress={() => { setDue('tomorrow'); setDueEdited(true); }} />
        <Chip label="Choose date" active={due === 'custom'} onPress={() => { setDue('custom'); setDueEdited(true); }} />
      </View>

      {existing?.dueAt && !dueEdited ? <Text style={styles.helper}>Saved deadline: {new Date(existing.dueAt).toLocaleString()}</Text> : null}

      {due === 'custom' ? (
        <View style={styles.customDueRow}>
          <TextInput
            accessibilityLabel="Due date"
            value={customDate}
            onChangeText={value => { setCustomDate(value); setDueEdited(true); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            style={styles.customDueInput}
          />
          <TextInput
            accessibilityLabel="Due time"
            value={customTime}
            onChangeText={value => { setCustomTime(value); setDueEdited(true); }}
            placeholder="18:30"
            placeholderTextColor={colors.subtle}
            keyboardType="numbers-and-punctuation"
            style={styles.customTimeInput}
          />
        </View>
      ) : null}

      <Label>Type</Label>
      <View style={styles.rowWrap}>
        {TYPES.map((item) => (
          <Chip key={item.value} label={item.label} active={type === item.value} onPress={() => setType(item.value)} />
        ))}
      </View>

      {workspace.topics.length ? (
        <>
          <Label>Linked Topic · optional</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>
            <Chip label="None" active={!topicId} onPress={() => selectTopic(null)} />
            {workspace.topics.map((topic) => (
              <Chip key={topic.id} label={topic.name} active={topicId === topic.id} onPress={() => selectTopic(topic.id)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <Label>Subject · optional</Label>
      <TextInput
        value={subject}
        onChangeText={setSubject}
        editable={!selectedTopic}
        placeholder={selectedTopic ? selectedTopic.subject : 'Mathematics'}
        placeholderTextColor={colors.subtle}
        maxLength={120}
        style={[styles.input, selectedTopic && styles.disabledInput]}
      />

      {workspace.exams.length ? (
        <>
          <Label>Exam · optional</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>
            <Chip label="None" active={!examId} onPress={() => setExamId(null)} />
            {workspace.exams.map((exam) => (
              <Chip key={exam.id} label={exam.name} active={examId === exam.id} onPress={() => setExamId(exam.id)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <Label>Priority</Label>
      <View style={styles.row}>
        <Chip label="Normal" active={priority === 1} onPress={() => setPriority(1)} flex />
        <Chip label="Important" active={priority === 2} onPress={() => setPriority(2)} flex />
        <Chip label="High" active={priority === 3} onPress={() => setPriority(3)} flex />
      </View>

      {existing ? (
        <>
          <Label>Time already done</Label>
          <TextInput
            accessibilityLabel="Time already done in minutes"
            value={actual ?? String(existing.actualMinutes)}
            onChangeText={value => {
              if (actual === null) setRecordedBaseline({ actualMinutes: existing.actualMinutes, lastFocusSessionId: existing.lastFocusSessionId });
              setActual(value);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.subtle}
            style={styles.smallInput}
          />
          <Text style={styles.helper}>
            {existing.estimatedMinutes > 0
              ? `${existing.actualMinutes} / ${existing.estimatedMinutes} min recorded`
              : `${existing.actualMinutes} min recorded`}
          </Text>
        </>
      ) : null}

      <Label>Notes · optional</Label>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        multiline
        textAlignVertical="top"
        placeholder="Question numbers, pages, what counts as done…"
        placeholderTextColor={colors.subtle}
        maxLength={12000}
        style={[styles.input, styles.notes]}
      />

      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {conflict && existing ? <Pressable accessibilityRole="button" onPress={() => {
        if (conflict === 'time') { setActual(null); setRecordedBaseline(null); }
        else { setDeadlineBaseline(existing.dueAt); setDue(dueChoice(existing)); setCustomDate(dateText(existing.dueAt)); setCustomTime(timeText(existing.dueAt)); setDueEdited(false); }
        setConflict(null); setError('');
      }} style={styles.secondary}>
        <Text style={styles.secondaryText}>{conflict === 'time' ? 'Use latest recorded time' : 'Use latest deadline'}</Text>
      </Pressable> : null}

      <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>{existing ? 'Save task' : planState === 'today' ? 'Add to Today' : 'Add to Inbox'}</Text>
        <Text style={styles.primaryArrow}>→</Text>
      </Pressable>

      {existing ? (
        <>
          <Pressable accessibilityRole="button" onPress={toggleComplete} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>{existing.status === 'completed' ? 'Reopen task' : 'Mark complete'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
            <Text style={styles.deleteText}>Delete task</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Chip({ label, active, onPress, flex }: { label: string; active: boolean; onPress: () => void; flex?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, flex && styles.flex, active && styles.chipActive, pressed && styles.pressed]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 56 },
  label: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: spacing.md, marginBottom: 8 },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 14, paddingHorizontal: 13 },
  disabledInput: { opacity: 0.65 },
  smallInput: { minHeight: layout.minTouch, width: 110, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 13, paddingHorizontal: 13 },
  notes: { minHeight: 110, paddingTop: 13, paddingBottom: 13 },
  row: { flexDirection: 'row', gap: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horizontal: { gap: 8, paddingRight: spacing.lg },
  customDueRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customDueInput: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  customTimeInput: {
    width: 94,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 12,
  },
  chip: { minHeight: layout.minTouch, maxWidth: 220, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: colors.accentLine, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  chipTextActive: { color: colors.accent },
  flex: { flex: 1, maxWidth: undefined },
  helper: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 5 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: spacing.md },
  primary: { minHeight: 56, marginTop: spacing.xl, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { color: '#25140e', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  primaryArrow: { color: '#25140e', fontSize: 19 },
  secondary: { minHeight: layout.minTouch, marginTop: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  deleteButton: { minHeight: layout.minTouch, marginTop: 9, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.68 },
});
