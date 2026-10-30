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

import { Topic } from '@/src/data/schema';
import { colors, radius, spacing } from '@/src/theme/tokens';

import {
  ExamInput,
  ExamScope,
  examSubjectsFromTopics,
  formatExamDateInput,
  parseExamDateInput,
  validateExamInput,
} from './exam-engine';

type Props = {
  topics: Topic[];
  initial?: Partial<ExamInput>;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: ExamInput) => void;
};

export function ExamForm({
  topics,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [dateText, setDateText] = useState(
    initial?.date ? formatExamDateInput(initial.date) : '',
  );
  const [scope, setScope] = useState<ExamScope>(initial?.scope ?? 'subjects');
  const [subjects, setSubjects] = useState<string[]>(initial?.subjects ?? []);
  const [topicIds, setTopicIds] = useState<string[]>(initial?.topicIds ?? []);
  const [error, setError] = useState('');

  const availableSubjects = useMemo(() => examSubjectsFromTopics(topics), [topics]);

  function toggleSubject(subject: string) {
    setSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    );
  }

  function toggleTopic(topicId: string) {
    setTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((item) => item !== topicId)
        : [...current, topicId],
    );
  }

  function submit() {
    const date = parseExamDateInput(dateText);
    if (!date) {
      setError('Use a real date in YYYY-MM-DD format.');
      return;
    }

    const input: ExamInput = {
      name,
      date,
      scope,
      subjects,
      topicIds,
    };

    const problem = validateExamInput(input, topics);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    onSubmit(input);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Label>Exam name</Label>
        <TextInput
          accessibilityLabel="Exam name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Maths Midterm"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          maxLength={200}
          style={styles.input}
          autoFocus={!initial?.name}
        />

        <Label>Date</Label>
        <TextInput
          accessibilityLabel="Exam date"
          value={dateText}
          onChangeText={setDateText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          style={styles.input}
        />
        <Text style={styles.dateHelp}>Example: 2026-10-18</Text>

        <Label>What is included?</Label>
        <View style={styles.scopeRow}>
          <ScopeButton
            label="Whole subjects"
            helper="Every MYELIN topic in selected subjects"
            active={scope === 'subjects'}
            onPress={() => setScope('subjects')}
          />
          <ScopeButton
            label="Specific topics"
            helper="Only the exact topics you choose"
            active={scope === 'topics'}
            onPress={() => setScope('topics')}
          />
        </View>

        {scope === 'subjects' ? (
          <>
            <Label>Subjects</Label>
            {availableSubjects.length ? (
              <View style={styles.selectionGrid}>
                {availableSubjects.map((subject) => (
                  <SelectionCard
                    key={subject}
                    title={subject}
                    subtitle={`${topics.filter((topic) => topic.subject === subject).length} topics`}
                    active={subjects.includes(subject)}
                    onPress={() => toggleSubject(subject)}
                  />
                ))}
              </View>
            ) : (
              <EmptySelection text="Add topics first so there are subjects to include." />
            )}
          </>
        ) : (
          <>
            <Label>Topics</Label>
            {topics.length ? (
              <View style={styles.selectionGrid}>
                {topics.map((topic) => (
                  <SelectionCard
                    key={topic.id}
                    title={topic.name}
                    subtitle={topic.subject}
                    active={topicIds.includes(topic.id)}
                    onPress={() => toggleTopic(topic.id)}
                  />
                ))}
              </View>
            ) : (
              <EmptySelection text="Add topics first so there is something to include." />
            )}
          </>
        )}

        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>This affects Today automatically</Text>
          <Text style={styles.explainerText}>
            As the exam gets closer, included topics receive more planning weight. Topics outside this scope do not get that exam boost.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{submitLabel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function ScopeButton({
  label,
  helper,
  active,
  onPress,
}: {
  label: string;
  helper: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.scopeCard,
        active && styles.scopeActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.scopeTitle, active && styles.activeText]}>{label}</Text>
      <Text style={styles.scopeHelp}>{helper}</Text>
    </Pressable>
  );
}

function SelectionCard({
  title,
  subtitle,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selection,
        active && styles.selectionActive,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.check, active && styles.checkActive]}>
        <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
      </View>
      <View style={styles.selectionCopy}>
        <Text style={[styles.selectionTitle, active && styles.activeText]}>{title}</Text>
        <Text style={styles.selectionSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function EmptySelection({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 52 },
  label: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: spacing.md, marginBottom: 8 },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, paddingHorizontal: 13, color: colors.text, fontSize: 14 },
  dateHelp: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 5 },
  scopeRow: { gap: 8 },
  scopeCard: { minHeight: 66, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 12, justifyContent: 'center' },
  scopeActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  scopeTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  scopeHelp: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  activeText: { color: colors.accent },
  selectionGrid: { gap: 8 },
  selection: { minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionActive: { borderColor: 'rgba(255,128,91,0.36)', backgroundColor: colors.accentSoft },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  checkActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkText: { color: '#25140e', fontSize: 12, fontWeight: '900' },
  selectionCopy: { flex: 1 },
  selectionTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  selectionSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  empty: { borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, padding: spacing.md },
  emptyText: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  explainer: { marginTop: spacing.xl, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 11 },
  explainerTitle: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  explainerText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: 9, marginTop: spacing.xl },
  secondary: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  primaryText: { color: '#25140e', fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
