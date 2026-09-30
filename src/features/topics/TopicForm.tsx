import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Priority, TopicStatus } from '@/src/data/schema';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

import { TopicInput } from './topic-operations';

type Props = {
  initial?: Partial<TopicInput>;
  subjects?: string[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: TopicInput) => void;
};

const STATUS_OPTIONS: { value: TopicStatus; label: string; helper: string }[] = [
  { value: 'new', label: 'New', helper: 'Not started yet' },
  { value: 'learning', label: 'Learning', helper: 'Currently working on it' },
  { value: 'review', label: 'Review', helper: 'Mostly learned; needs recall' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'High' },
];

export function TopicForm({ initial, subjects = [], submitLabel, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [status, setStatus] = useState<TopicStatus>(initial?.status ?? 'new');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 2);
  const [estimateText, setEstimateText] = useState(String(initial?.estimate ?? 45));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const cleanSubjects = useMemo(
    () => [...new Set(subjects.filter(Boolean))].slice(0, 8),
    [subjects],
  );

  function submit() {
    const cleanName = name.trim();
    const cleanSubject = subject.trim();
    const estimate = Number(estimateText);

    if (!cleanName) {
      setError('Give the topic a name.');
      return;
    }

    if (!cleanSubject) {
      setError('Choose or enter a subject.');
      return;
    }

    if (!Number.isFinite(estimate) || estimate < 5 || estimate > 240) {
      setError('Estimated study time should be between 5 and 240 minutes.');
      return;
    }

    setError('');
    onSubmit({
      name: cleanName,
      subject: cleanSubject,
      status,
      priority,
      estimate: Math.round(estimate),
      notes,
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <FieldLabel>Name</FieldLabel>
        <TextInput
          accessibilityLabel="Topic name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Quadratic Equations"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          style={styles.input}
          maxLength={300}
          autoFocus={!initial?.name}
        />

        <FieldLabel>Subject</FieldLabel>
        <TextInput
          accessibilityLabel="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Mathematics"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          style={styles.input}
          maxLength={120}
        />

        {cleanSubjects.length ? (
          <View style={styles.chips}>
            {cleanSubjects.map((item) => (
              <ChoiceChip
                key={item}
                label={item}
                active={subject.trim() === item}
                onPress={() => setSubject(item)}
              />
            ))}
          </View>
        ) : null}

        <FieldLabel>Status</FieldLabel>
        <View style={styles.statusGrid}>
          {STATUS_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: status === option.value }}
              onPress={() => setStatus(option.value)}
              style={({ pressed }) => [
                styles.statusCard,
                status === option.value && styles.statusCardActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.statusTitle, status === option.value && styles.activeText]}>
                {option.label}
              </Text>
              <Text style={styles.statusHelper}>{option.helper}</Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel>Priority</FieldLabel>
        <View style={styles.chips}>
          {PRIORITIES.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              active={priority === option.value}
              onPress={() => setPriority(option.value)}
            />
          ))}
        </View>

        <FieldLabel>Estimated focused study time</FieldLabel>
        <View style={styles.estimateRow}>
          <TextInput
            accessibilityLabel="Estimated minutes"
            value={estimateText}
            onChangeText={(value) => setEstimateText(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="45"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.accent}
            style={[styles.input, styles.estimateInput]}
            maxLength={3}
          />
          <Text style={styles.minutes}>minutes</Text>
        </View>

        <FieldLabel>Notes</FieldLabel>
        <TextInput
          accessibilityLabel="Topic notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Key definitions, chapter scope, weak areas, resources…"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          multiline
          textAlignVertical="top"
          style={[styles.input, styles.notes]}
          maxLength={20000}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{submitLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function ChoiceChip({
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
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: spacing.md,
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  notes: { minHeight: 150, paddingTop: 14, paddingBottom: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  chipActive: { borderColor: 'rgba(255,128,91,0.45)', backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },
  activeText: { color: colors.accent },
  statusGrid: { gap: 8 },
  statusCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 13,
  },
  statusCardActive: {
    borderColor: 'rgba(255,128,91,0.45)',
    backgroundColor: colors.accentSoft,
  },
  statusTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  statusHelper: { color: colors.subtle, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  estimateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  estimateInput: { width: 92 },
  minutes: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 11.5, lineHeight: 17, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.xl },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
  },
  primaryText: { color: '#25140e', fontSize: 13, fontWeight: '800' },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.993 }] },
});
