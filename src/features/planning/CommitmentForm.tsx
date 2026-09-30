
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
import { CommitmentKind } from '@/src/data/schema';
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

function atTime(text: string, fallbackHour: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  const hour = match ? Number(match[1]) : fallbackHour;
  const minute = match ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0;
  const d = new Date();
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
  const [error, setError] = useState('');

  if (!workspace) return null;

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function save() {
    const clean = title.trim();
    const startMinutes = minutesFromText(start);
    const endMinutes = minutesFromText(end);
    const startAt = atTime(start, 16);
    let endAt = atTime(end, 18);
    if (!clean) {
      setError('Add a short name.');
      return;
    }
    if (!startAt || !endAt || startMinutes < 0 || endMinutes < 0) {
      setError('Use 24-hour time such as 16:00.');
      return;
    }
    if (endAt <= startAt) endAt += 24 * 60 * 60 * 1000;
    const now = Date.now();

    updateWorkspace((draft) => {
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
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    router.back();
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
            updateWorkspace((draft) => {
              draft.commitments = draft.commitments.filter((item) => item.id !== existing.id);
            });
            router.back();
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        eyebrow="DAY MAP"
        title={existing ? 'Edit fixed block' : 'Add fixed time'}
        subtitle="Fixed blocks tell MYELIN when study time is not actually available."
        onBack={() => router.back()}
      />

      <Text style={styles.label}>Name</Text>
      <TextInput
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
          value={start}
          onChangeText={setStart}
          placeholder="16:00"
          placeholderTextColor={colors.subtle}
          style={styles.timeInput}
        />
        <Text style={styles.to}>to</Text>
        <TextInput
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
          : 'No days selected: this block applies today only.'}
      </Text>

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
    fontSize: 11,
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
    fontSize: 13,
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
  chipText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
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
  to: { color: colors.subtle, fontSize: 10 },
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
  dayText: { color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  helper: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 7 },
  error: { color: colors.danger, fontSize: 10, marginTop: spacing.md },
  primary: {
    minHeight: 56,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#25140e', fontSize: 12, fontWeight: '900' },
  delete: {
    minHeight: layout.minTouch,
    marginTop: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  pressed: { opacity: 0.67 },
});
