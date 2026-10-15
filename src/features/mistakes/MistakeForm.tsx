import { ReactNode, useMemo, useRef, useState } from 'react';
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

import { MistakeReason, Topic } from '@/src/data/schema';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

import { MistakeInput } from './mistake-engine';

const REASONS: { value: MistakeReason; label: string; helper: string }[] = [
  { value: 'concept', label: 'Concept', helper: 'The idea itself was unclear' },
  { value: 'calculation', label: 'Calculation', helper: 'Arithmetic or working error' },
  { value: 'recall', label: 'Recall', helper: 'I knew it but could not retrieve it' },
  { value: 'application', label: 'Application', helper: 'I could not use the idea in context' },
];

type Props = {
  topics: Topic[];
  initial?: Partial<MistakeInput>;
  submitLabel: string;
  disabled?: boolean;
  feedback?: ReactNode;
  onCancel: () => void;
  onSubmit: (input: MistakeInput) => void;
};

export function MistakeForm({
  topics,
  initial,
  submitLabel,
  disabled = false,
  feedback,
  onCancel,
  onSubmit,
}: Props) {
  const locked = useRef(disabled);
  locked.current = disabled;
  const initialTopicId = initial?.topicId ?? topics[0]?.id ?? '';
  const [topicId, setTopicId] = useState(initialTopicId);
  const [cardId, setCardId] = useState<string | null>(initial?.cardId ?? null);
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [correction, setCorrection] = useState(initial?.correction ?? '');
  const [reason, setReason] = useState<MistakeReason>(initial?.reason ?? 'concept');
  const [error, setError] = useState('');

  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === topicId) ?? null,
    [topicId, topics],
  );

  function chooseTopic(nextTopicId: string) {
    if (locked.current) return;
    setTopicId(nextTopicId);
    if (nextTopicId !== topicId) setCardId(null);
  }

  function submit() {
    if (locked.current) return;
    if (!topicId || !selectedTopic) {
      setError('Choose a topic for this mistake.');
      return;
    }
    if (!prompt.trim()) {
      setError('Write the question, task or thing you got wrong.');
      return;
    }
    if (!correction.trim()) {
      setError('Write the corrected idea or answer before saving.');
      return;
    }

    setError('');
    onSubmit({
      topicId,
      cardId,
      prompt,
      detail,
      correction,
      reason,
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Label>Topic</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {topics.map((topic) => (
            <Chip
              disabled={disabled}
              key={topic.id}
              label={topic.name}
              active={topic.id === topicId}
              onPress={() => chooseTopic(topic.id)}
            />
          ))}
        </ScrollView>

        {selectedTopic?.cards.length ? (
          <>
            <Label>Link to recall question (optional)</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip disabled={disabled} label="None" active={!cardId} onPress={() => { if (!locked.current) setCardId(null); }} />
              {selectedTopic.cards.map((card) => (
                <Chip
                  disabled={disabled}
                  key={card.id}
                  label={card.prompt}
                  active={cardId === card.id}
                  onPress={() => {
                    if (locked.current) return;
                    setCardId(card.id);
                    if (!prompt.trim()) setPrompt(card.prompt);
                    if (!correction.trim()) setCorrection(card.answer);
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Label>What did you get wrong?</Label>
        <TextInput
          accessibilityLabel="Mistake prompt"
          value={prompt}
          editable={!disabled}
          onChangeText={value => { if (!locked.current) setPrompt(value); }}
          placeholder="Question, task, misconception or step…"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          multiline
          textAlignVertical="top"
          maxLength={6000}
          style={[styles.input, styles.prompt]}
        />

        <Label>What happened? (optional)</Label>
        <TextInput
          accessibilityLabel="What happened"
          value={detail}
          editable={!disabled}
          onChangeText={value => { if (!locked.current) setDetail(value); }}
          placeholder="Your wrong answer, the step you missed, what confused you…"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          multiline
          textAlignVertical="top"
          maxLength={16000}
          style={[styles.input, styles.detail]}
        />

        <Label>Correct idea / answer</Label>
        <TextInput
          accessibilityLabel="Correct answer"
          value={correction}
          editable={!disabled}
          onChangeText={value => { if (!locked.current) setCorrection(value); }}
          placeholder="Write the corrected reasoning in a form future-you can use…"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.accent}
          multiline
          textAlignVertical="top"
          maxLength={16000}
          style={[styles.input, styles.correction]}
        />

        <Label>Why did it happen?</Label>
        <View style={styles.reasonGrid}>
          {REASONS.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              disabled={disabled}
              accessibilityState={{ selected: reason === item.value, disabled }}
              onPress={() => { if (!locked.current) setReason(item.value); }}
              style={({ pressed }) => [
                styles.reasonCard,
                disabled && styles.disabled,
                reason === item.value && styles.reasonActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.reasonTitle, reason === item.value && styles.reasonTitleActive]}>
                {item.label}
              </Text>
              <Text style={styles.reasonHelp}>{item.helper}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>How resolution works</Text>
          <Text style={styles.explainerText}>
            MYELIN will retest the correction. Two successful retests on different days resolve the mistake.
            A miss resets the win streak.
          </Text>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {feedback}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            accessibilityState={{ disabled }}
            onPress={() => { if (!locked.current) onCancel(); }}
            style={({ pressed }) => [styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            accessibilityState={{ disabled }}
            onPress={submit}
            style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && styles.pressed]}>
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

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        disabled && styles.disabled,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 52 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: spacing.md, marginBottom: 8 },
  chips: { gap: 7, paddingRight: spacing.lg },
  chip: { maxWidth: 220, minHeight: layout.minTouch, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: 13 },
  chipActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 10.5, fontWeight: '600' },
  chipTextActive: { color: colors.accent },
  input: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, backgroundColor: colors.panel, padding: 13, color: colors.text, fontSize: 13, lineHeight: 20 },
  prompt: { minHeight: 105 },
  detail: { minHeight: 110 },
  correction: { minHeight: 145 },
  reasonGrid: { gap: 8 },
  reasonCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 12 },
  reasonActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  reasonTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  reasonTitleActive: { color: colors.accent },
  reasonHelp: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  explainer: { marginTop: spacing.lg, borderLeftWidth: 2, borderLeftColor: colors.success, paddingLeft: 11 },
  explainerTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  explainerText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  error: { color: colors.danger, fontSize: 10.5, lineHeight: 16, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: 9, marginTop: spacing.xl },
  secondary: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  primaryText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
