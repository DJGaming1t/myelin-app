import { useState } from 'react';
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

import { colors, radius, spacing } from '@/src/theme/tokens';

import { QuestionInput } from './topic-operations';

type Props = {
  initial?: Partial<QuestionInput>;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: QuestionInput) => void;
};

export function QuestionForm({ initial, submitLabel, onCancel, onSubmit }: Props) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [hint, setHint] = useState(initial?.hint ?? '');
  const [error, setError] = useState('');

  function submit() {
    if (!prompt.trim()) {
      setError('Write the question or recall prompt first.');
      return;
    }

    setError('');
    onSubmit({ prompt, answer, hint });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.helper}>
          During review, MYELIN will show the prompt first. Your reference answer stays hidden until
          after you attempt it.
        </Text>

        <Field
          label="Recall prompt"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="e.g. Why can copper not displace hydrogen from dilute HCl?"
          maxLength={6000}
          minHeight={112}
          autoFocus={!initial?.prompt}
        />

        <Field
          label="Reference answer"
          value={answer}
          onChangeText={setAnswer}
          placeholder="The answer you want to compare yourself against…"
          maxLength={16000}
          minHeight={150}
        />

        <Field
          label="Hint (optional)"
          value={hint}
          onChangeText={setHint}
          placeholder="A subtle clue, not the whole answer…"
          maxLength={4000}
          minHeight={90}
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

function Field({
  label,
  minHeight,
  ...props
}: {
  label: string;
  minHeight: number;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline
        textAlignVertical="top"
        placeholderTextColor={colors.subtle}
        selectionColor={colors.accent}
        style={[styles.input, { minHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  helper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: 11,
    marginBottom: spacing.md,
  },
  field: { marginTop: spacing.md },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: 14,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
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
