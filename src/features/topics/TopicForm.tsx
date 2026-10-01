import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton } from '@/src/components/app/AppButton';
import { Priority, TopicStatus } from '@/src/data/schema';
import { colors, layout, motion, radius, space, type } from '@/src/theme/tokens';

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
  { value: 'learning', label: 'Learning', helper: 'Already working on it' },
  { value: 'review', label: 'Review', helper: 'Mostly learned; needs recall' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'High' },
];

export function TopicForm({ initial, subjects = [], submitLabel, onCancel, onSubmit }: Props) {
  const editing = Boolean(initial?.name);
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [status, setStatus] = useState<TopicStatus>(initial?.status ?? 'new');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 2);
  const [estimateText, setEstimateText] = useState(String(initial?.estimate ?? 45));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(editing);
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
      setShowAdvanced(true);
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Topic name</Text>
        <TextInput
          accessibilityLabel="Topic name"
          value={name}
          onChangeText={setName}
          placeholder="Quadratic Equations"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          style={styles.input}
          maxLength={300}
          autoFocus={!initial?.name}
        />

        <Text style={styles.label}>Subject</Text>
        <TextInput
          accessibilityLabel="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="Mathematics"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          style={styles.input}
          maxLength={120}
        />

        {cleanSubjects.length ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {cleanSubjects.map((item) => (
              <ChoiceChip
                key={item}
                label={item}
                active={subject.trim() === item}
                onPress={() => setSubject(item)}
              />
            ))}
          </ScrollView>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced((current) => !current)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <View style={styles.moreCopy}>
            <Text style={styles.moreTitle}>{showAdvanced ? 'Fewer options' : 'More options'}</Text>
            {!showAdvanced ? (
              <Text style={styles.moreDetail}>Status, priority, study time and notes</Text>
            ) : null}
          </View>
          <Text style={styles.moreMark}>{showAdvanced ? '−' : '+'}</Text>
        </Pressable>

        {showAdvanced ? (
          <View style={styles.advanced}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusGrid}>
              {STATUS_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: status === option.value }}
                  onPress={() => setStatus(option.value)}
                  style={({ pressed }) => [
                    styles.statusRow,
                    status === option.value && styles.statusRowActive,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.statusCopy}>
                    <Text style={[styles.statusTitle, status === option.value && styles.activeText]}>
                      {option.label}
                    </Text>
                    <Text style={styles.statusHelper}>{option.helper}</Text>
                  </View>
                  <View style={[styles.radio, status === option.value && styles.radioActive]}>
                    {status === option.value ? <View style={styles.radioCore} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  active={priority === option.value}
                  onPress={() => setPriority(option.value)}
                />
              ))}
            </View>

            <Text style={styles.label}>Estimated focused study time</Text>
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

            <Text style={styles.label}>Notes</Text>
            <TextInput
              accessibilityLabel="Topic notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Weak areas, resources, chapter scope…"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.notes]}
              maxLength={20000}
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <AppButton label="Cancel" variant="quiet" onPress={onCancel} style={styles.action} />
          <AppButton label={submitLabel} onPress={submit} style={styles.action} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  content: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
  },
  label: {
    color: colors.textDim,
    ...type.meta,
    fontWeight: '600',
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: space.md,
    color: colors.text,
    ...type.body,
  },
  chips: { gap: space.xs, paddingTop: space.xs, paddingRight: space.lg },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  chipText: { color: colors.textDim, ...type.meta, fontWeight: '600' },
  activeText: { color: colors.accent },
  more: {
    minHeight: layout.minTouch,
    marginTop: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  moreCopy: { flex: 1 },
  moreTitle: { color: colors.text, ...type.bodyStrong },
  moreDetail: { color: colors.muted, ...type.meta, marginTop: 2 },
  moreMark: { color: colors.accent, fontSize: 24, lineHeight: 26, fontWeight: '400' },
  advanced: { paddingBottom: space.xs },
  statusGrid: { gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  statusRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  statusRowActive: { backgroundColor: colors.accentFaint },
  statusCopy: { flex: 1, paddingLeft: space.xs },
  statusTitle: { color: colors.text, ...type.bodyStrong },
  statusHelper: { color: colors.muted, ...type.meta, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xs,
  },
  radioActive: { borderColor: colors.accent },
  radioCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  estimateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  estimateInput: { width: 100 },
  minutes: { color: colors.muted, ...type.meta },
  notes: { minHeight: 116, paddingTop: space.md, paddingBottom: space.md },
  error: { color: colors.danger, ...type.meta, marginTop: space.md },
  actions: { flexDirection: 'row', gap: space.xs, marginTop: space.xl },
  action: { flex: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: motion.pressScale }] },
});
