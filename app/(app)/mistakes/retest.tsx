import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  applyMistakeRetest,
  buildMistakeRetestQueue,
} from '@/src/features/mistakes/mistake-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function historyId(now: number) {
  return `session_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function MistakeRetestScreen() {
  const { workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');

  const now = Date.now();
  const queue = useMemo(
    () => (workspace ? buildMistakeRetestQueue(workspace, now) : []),
    [workspace, now],
  );
  const current = queue[0] ?? null;
  const topic = workspace?.topics.find((item) => item.id === current?.topicId) ?? null;

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening retest…</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function grade(result: 'miss' | 'win') {
    if (!current) return;
    const gradedAt = Date.now();
    const response = answer;

    let label = '';
    updateWorkspace((draft) => {
      const mistake = draft.mistakes.find((item) => item.id === current.id);
      if (!mistake) return;

      const outcome = applyMistakeRetest(mistake, result, gradedAt);
      label = outcome.label;

      draft.history.push({
        id: historyId(gradedAt),
        topicId: mistake.topicId,
        mistakeId: mistake.id,
        at: gradedAt,
        kind: 'review',
        minutes: 0,
        grade: result === 'win' ? 3 : 1,
        effort: 3,
        prompt: mistake.prompt,
        response,
        confidence: 'unsure',
        startedAt: gradedAt,
        endedAt: gradedAt,
      });
    });

    await waitForSaves();
    setAnswer('');
    setRevealed(false);
    setNotice(label);
  }

  if (!current || !topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/(app)/mistakes')} hitSlop={10}>
            <Text style={styles.back}>← Mistakes</Text>
          </Pressable>
          <Text style={styles.topTitle}>RETEST</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.done}>
          <Text style={styles.doneMark}>✓</Text>
          <Text style={styles.doneTitle}>No mistakes are due right now.</Text>
          <Text style={styles.doneText}>
            {notice || 'The next correction will return when its spacing interval is ready.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(app)/mistakes')}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Back to notebook</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(app)/mistakes')} hitSlop={10}>
          <Text style={styles.back}>← End</Text>
        </Pressable>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>MISTAKE RETEST</Text>
          <Text style={styles.topCount}>{queue.length} due</Text>
        </View>
        <Text style={styles.wins}>{current.wins}/2</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.subject}>{topic.subject.toUpperCase()} · {topic.name}</Text>
        <Text style={styles.prompt}>{current.prompt}</Text>

        {!revealed ? (
          <>
            <Text style={styles.answerLabel}>REBUILD THE CORRECTION FROM MEMORY</Text>
            <TextInput
              accessibilityLabel="Your correction from memory"
              value={answer}
              onChangeText={setAnswer}
              placeholder="Explain the correct idea or solve it again without looking…"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.accent}
              multiline
              textAlignVertical="top"
              maxLength={16000}
              style={styles.answer}
            />

            <Pressable
              accessibilityRole="button"
              disabled={!answer.trim()}
              onPress={() => setRevealed(true)}
              style={({ pressed }) => [
                styles.primary,
                !answer.trim() && styles.disabled,
                pressed && answer.trim() && styles.pressed,
              ]}>
              <Text style={styles.primaryText}>Show correction</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAnswer('— Recalled mentally —');
                setRevealed(true);
              }}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.textButtonText}>I answered this in my head</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Compare label="YOUR RETEST" text={answer} />
            {current.detail ? <Compare label="ORIGINAL ERROR" text={current.detail} muted /> : null}
            <Compare label="CORRECTION" text={current.correction || 'No correction was saved.'} accent />

            <Text style={styles.gradeTitle}>Did you reproduce the correction correctly?</Text>
            <Text style={styles.gradeText}>
              Be strict: recognizing the correction after seeing it does not count as a win.
            </Text>

            <View style={styles.gradeRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void grade('miss')}
                style={({ pressed }) => [styles.missButton, pressed && styles.pressed]}>
                <Text style={styles.missTitle}>Still wrong</Text>
                <Text style={styles.gradeSub}>Reset streak</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void grade('win')}
                style={({ pressed }) => [styles.winButton, pressed && styles.pressed]}>
                <Text style={styles.winTitle}>Got it right</Text>
                <Text style={styles.gradeSub}>
                  {current.wins === 0 ? 'First spaced win' : 'Resolve if spaced'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Compare({
  label,
  text,
  accent,
  muted,
}: {
  label: string;
  text: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={[styles.compare, accent && styles.compareAccent]}>
      <Text style={[styles.compareLabel, accent && styles.compareLabelAccent]}>{label}</Text>
      <Text style={[styles.compareText, muted && styles.compareMuted]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { minHeight: 58, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  topCenter: { alignItems: 'center' },
  topTitle: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.55 },
  topCount: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  topSpacer: { width: 45 },
  wins: { color: colors.accent, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  content: { padding: spacing.lg, paddingBottom: 52 },
  notice: { marginBottom: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(180,216,174,0.2)', backgroundColor: 'rgba(180,216,174,0.045)', padding: 10 },
  noticeText: { color: colors.success, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  subject: { color: colors.accent, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.55 },
  prompt: { color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: '600', marginTop: 10 },
  answerLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.45, marginTop: spacing.xl, marginBottom: 8 },
  answer: { minHeight: 150, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, padding: 13, color: colors.text, fontSize: 13, lineHeight: 20 },
  primary: { minHeight: 52, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 19 },
  disabled: { opacity: 0.35 },
  textButton: { minHeight: layout.minTouch, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  compare: { marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  compareAccent: { borderColor: 'rgba(180,216,174,0.22)', backgroundColor: 'rgba(180,216,174,0.045)' },
  compareLabel: { color: colors.subtle, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.45 },
  compareLabelAccent: { color: colors.success },
  compareText: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 6 },
  compareMuted: { color: colors.muted },
  gradeTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.xl },
  gradeText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  gradeRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  missButton: { flex: 1, minHeight: 66, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', backgroundColor: 'rgba(255,161,145,0.045)', padding: 11, justifyContent: 'center' },
  winButton: { flex: 1, minHeight: 66, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(180,216,174,0.25)', backgroundColor: 'rgba(180,216,174,0.045)', padding: 11, justifyContent: 'center' },
  missTitle: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  winTitle: { color: colors.success, fontSize: 11.5, fontWeight: '700' },
  gradeSub: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  doneMark: { color: colors.success, fontSize: 25 },
  doneTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  doneText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, textAlign: 'center', maxWidth: 340 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
