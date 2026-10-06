
import { localDateKey, parseLocalDate } from './commitment-dates';
import { addLocalDays } from './day-engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { CommitmentKind, WorkspaceState } from '@/src/data/schema';
import {
  buildAutopilotReflowSummary,
  serializeAutopilotReflow,
} from '@/src/features/exams/autopilot-reflow';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const DAYS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

const KINDS: Array<{ value: CommitmentKind; label: string }> = [
  { value: 'school', label: 'School' },
  { value: 'tuition', label: 'Tuition' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'commute', label: 'Commute' },
  { value: 'meal', label: 'Meal' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'other', label: 'Other' },
];

function makeId(now: number) {
  return 'commit_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function timeTextFromMinutes(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

function timeText(timestamp: number) {
  const d = new Date(timestamp);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function minutesFromText(text: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return -1;
  return hour * 60 + minute;
}

function atTime(text: string, fallbackHour: number, day: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  const hour = match ? Number(match[1]) : fallbackHour;
  const minute = match ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0;
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0).getTime();
}

export function CommitmentForm({ commitmentId }: { commitmentId?: string }) {
  const { workspace, updateWorkspace } = useWorkspace();
  const existing = useMemo(
    () => workspace?.commitments.find((item) => item.id === commitmentId) ?? null,
    [commitmentId, workspace],
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<CommitmentKind>(existing?.kind ?? 'school');
  const [start, setStart] = useState(
    existing
      ? timeTextFromMinutes(existing.startMinutes ?? new Date(existing.startAt).getHours() * 60 + new Date(existing.startAt).getMinutes())
      : '16:00',
  );
  const [end, setEnd] = useState(
    existing
      ? timeTextFromMinutes(existing.endMinutes ?? new Date(existing.endAt).getHours() * 60 + new Date(existing.endAt).getMinutes())
      : '18:00',
  );
  const [days, setDays] = useState<number[]>(existing?.recurrenceDays ?? []);
  const [date, setDate] = useState(localDateKey(existing?.startAt ?? Date.now()));
  const [skippedDates, setSkippedDates] = useState<string[]>(existing?.skippedDates ?? []);
  const [skipDate, setSkipDate] = useState('');
  const [error, setError] = useState('');

  if (!workspace) return null;

  function returnToDayMapWithReflow(nextWorkspace: WorkspaceState) {
    const summary = buildAutopilotReflowSummary(
      workspace,
      nextWorkspace,
      Date.now(),
    );
    const serialized = serializeAutopilotReflow(summary);
    router.replace({
      pathname: '/(app)/today/day-map',
      params: serialized ? { reflow: serialized } : {},
    });
  }

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function toggleSkip(value: string) {
    const parsed = parseLocalDate(value);
    if (parsed === null || !days.includes(new Date(parsed).getDay())) {
      setError('Choose a valid date on one of the repeating weekdays.'); return;
    }
    if (!skippedDates.includes(value) && skippedDates.length >= 366) {
      setError('Remove an older skipped date before adding another.'); return;
    }
    setSkippedDates(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value].sort());
    setSkipDate(''); setError('');
  }

  function save() {
    const clean = title.trim();
    const startMinutes = minutesFromText(start);
    const endMinutes = minutesFromText(end);
    const day = parseLocalDate(date);
    if (day === null) { setError('Use a valid date: YYYY-MM-DD.'); return; }
    const startAt = atTime(start, 16, day);
    let endAt = atTime(end, 18, day);
    if (!clean) {
      setError('Add a short name.');
      return;
    }
    if (!startAt || !endAt || startMinutes < 0 || endMinutes < 0) {
      setError('Use 24-hour time such as 16:00.');
      return;
    }
    if (startMinutes === endMinutes) { setError('End time must differ from start time.'); return; }
    if (endAt <= startAt) endAt = atTime(end, 18, addLocalDays(day, 1));
    const now = Date.now();

    const nextWorkspace = updateWorkspace((draft) => {
      if (existing) {
        const target = draft.commitments.find((item) => item.id === existing.id);
        if (!target) return;
        target.title = clean;
        target.kind = kind;
        target.startAt = startAt;
        target.endAt = endAt;
        target.startMinutes = startMinutes;
        target.endMinutes = endMinutes;
        target.recurrenceDays = days;
        target.skippedDates = days.length ? skippedDates : [];
        target.updatedAt = now;
      } else {
        draft.commitments.push({
          id: makeId(now),
          title: clean,
          kind,
          startAt,
          endAt,
          startMinutes,
          endMinutes,
          recurrenceDays: days,
          skippedDates: days.length ? skippedDates : [],
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    if (nextWorkspace) returnToDayMapWithReflow(nextWorkspace);
  }

  function remove() {
    if (!existing) return;
    Alert.alert(
      'Delete this fixed commitment?',
      'Its recurring blocks will disappear from Day Map.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextWorkspace = updateWorkspace((draft) => {
              draft.commitments = draft.commitments.filter((item) => item.id !== existing.id);
            });
            if (nextWorkspace) returnToDayMapWithReflow(nextWorkspace);
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        variant="compact"
        eyebrow="DAY MAP"
        title={existing ? 'Edit fixed block' : 'Add fixed time'}
        subtitle="Block time that is genuinely unavailable for study."
        onBack={() => router.back()}
      />

      <Text style={styles.label}>Name</Text>
      <TextInput
        accessibilityLabel="Fixed block name"
        maxLength={300}
        value={title}
        onChangeText={setTitle}
        placeholder="Tuition"
        placeholderTextColor={colors.subtle}
        style={styles.input}
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.wrap}>
        {KINDS.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            active={kind === item.value}
            onPress={() => setKind(item.value)}
          />
        ))}
      </View>

      <Text style={styles.label}>Time · 24-hour</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Fixed block start time"
          value={start}
          onChangeText={setStart}
          placeholder="16:00"
          placeholderTextColor={colors.subtle}
          style={styles.timeInput}
        />
        <Text style={styles.to}>to</Text>
        <TextInput
          accessibilityLabel="Fixed block end time"
          value={end}
          onChangeText={setEnd}
          placeholder="18:00"
          placeholderTextColor={colors.subtle}
          style={styles.timeInput}
        />
      </View>

      <Text style={styles.label}>Repeat · optional</Text>
      <View style={styles.days}>
        {DAYS.map((day, index) => (
          <Pressable
            key={String(day.value) + ':' + String(index)}
            accessibilityRole="button"
            accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.value]}
            accessibilityState={{ selected: days.includes(day.value) }}
            onPress={() => toggleDay(day.value)}
            style={({ pressed }) => [
              styles.day,
              days.includes(day.value) && styles.active,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.dayText, days.includes(day.value) && styles.activeText]}>
              {day.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.helper}>
        {days.length
          ? 'Repeats on the selected weekdays.'
          : 'No days selected: this block applies once on the date below.'}
      </Text>

      {!days.length ? <>
        <Text style={styles.label}>Date · YYYY-MM-DD</Text>
        <TextInput accessibilityLabel="Fixed block date" value={date} onChangeText={setDate} style={styles.input} />
      </> : <>
        <Text style={styles.label}>Skip specific dates</Text>
        <Text style={styles.helper}>Cancelled class or a day off? Skip that occurrence. Your weekly schedule stays the same. For overnight blocks, choose the date they start.</Text>
        <View style={[styles.wrap, { marginTop: 10 }]}>
          {Array.from({ length: 14 }, (_, i) => addLocalDays(Date.now(), i))
            .filter(day => days.includes(new Date(day).getDay()))
            .map(day => <Chip key={day} label={`${skippedDates.includes(localDateKey(day)) ? 'Skipped · ' : ''}${new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
              active={skippedDates.includes(localDateKey(day))} onPress={() => toggleSkip(localDateKey(day))} />)}
        </View>
        <Text style={styles.label}>Or choose a date · YYYY-MM-DD</Text>
        <TextInput accessibilityLabel="Date to skip" placeholder="YYYY-MM-DD" placeholderTextColor={colors.subtle} value={skipDate} onChangeText={setSkipDate} style={styles.input} />
        <Chip label="Skip this date" active={false} onPress={() => toggleSkip(skipDate.trim())} />
        {skippedDates.length ? <>
          <Text style={styles.label}>Skipped dates · tap to restore</Text>
          <View style={styles.wrap}>{skippedDates.map(value => <Chip key={value} label={`${value} ×`} active onPress={() => setSkippedDates(current => current.filter(item => item !== value))} />)}</View>
        </> : null}
      </>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={save}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>
          {existing ? 'Save fixed block' : 'Add to Day Map'}
        </Text>
      </Pressable>

      {existing ? (
        <Pressable
          accessibilityRole="button"
          onPress={remove}
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete fixed block</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.active,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 56,
  },
  label: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 14,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: layout.minTouch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  active: { borderColor: colors.accentLine, backgroundColor: colors.accentSoft },
  activeText: { color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: '700',
  },
  to: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 7 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: spacing.md },
  primary: {
    minHeight: 56,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#25140e', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  delete: {
    minHeight: layout.minTouch,
    marginTop: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: colors.danger, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.67 },
});
