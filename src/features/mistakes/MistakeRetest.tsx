import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { Mistake, Topic } from '@/src/data/schema';
import { applyMistakeRetest, buildMistakeRetestQueue, findMistake } from './mistake-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export function mistakeRetestSnapshot(m: Mistake) {
  return JSON.stringify([m.id, m.topicId, m.cardId, m.prompt, m.correction, m.createdAt,
    m.wins, m.lastWinDay, m.dueAt, m.resolvedAt, m.intervalDays]);
}

type Receipt = { historyId: string; label: string; snapshot: string };

export function MistakeRetestAttempt({ ownerKey, mistake, topic, onPending, onSaved, onRefresh }: {
  ownerKey: string; mistake: Mistake; topic: Topic;
  onPending: (mistake: Mistake) => void;
  onSaved: (notice: string) => void;
  onRefresh: () => void;
}) {
  const { readWorkspace, updateWorkspace, waitForSaves, retrySaves } = useWorkspace();
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const receiptRef = useRef<Receipt | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const canAct = () => mounted.current && !!readWorkspace(ownerKey);
  const baseline = mistakeRetestSnapshot(mistake);

  function finish(saved: Receipt) {
    const live = readWorkspace(ownerKey);
    if (!mounted.current || !live) return;
    const current = findMistake(live, mistake.id);
    const unchanged = !!current && mistakeRetestSnapshot(current) === saved.snapshot &&
      live.history.some(entry => entry.id === saved.historyId);
    onSaved(unchanged ? saved.label : 'Saved. This mistake changed; use its latest correction and retest state.');
  }

  async function grade(result: 'miss' | 'win') {
    if (!canAct() || !revealed || !answer.trim() || busyRef.current || receiptRef.current ||
      (result === 'win' && !mistake.correction.trim())) return;
    const gradedAt = Date.now();
    let label = '';
    const id = `session_${gradedAt.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    busyRef.current = true;
    const updated = updateWorkspace(draft => {
      const target = findMistake(draft, mistake.id)!;
      label = applyMistakeRetest(target, result, gradedAt).label;
      draft.history.push({ id, topicId: target.topicId, mistakeId: target.id, at: gradedAt,
        kind: 'review', minutes: 0, grade: result === 'win' ? 3 : 1, effort: 3,
        prompt: target.prompt, response: answer, confidence: 'unsure', startedAt: gradedAt, endedAt: gradedAt });
    }, { ownerKey, canApply: live => {
      const target = findMistake(live, mistake.id);
      return canAct() && !!target && mistakeRetestSnapshot(target) === baseline &&
        !target.resolvedAt && (target.dueAt === 0 || target.dueAt <= gradedAt) &&
        live.topics.some(item => item.id === target.topicId);
    } });
    if (!updated) {
      busyRef.current = false;
      if (canAct()) setError('This mistake changed or is no longer due. Refresh the retest before grading.');
      return;
    }
    const saved = { historyId: id, label, snapshot: mistakeRetestSnapshot(findMistake(updated, mistake.id)!) };
    receiptRef.current = saved;
    setReceipt(saved);
    onPending(mistake);
    setBusy(true);
    setError('');
    try { await waitForSaves(); if (canAct()) finish(saved); }
    catch { if (canAct()) setError('Your retest result could not be saved. Retry saving it; the win or miss will not be counted again.'); }
    finally { busyRef.current = false; if (canAct()) setBusy(false); }
  }

  async function retry() {
    const saved = receiptRef.current;
    if (!canAct() || !saved || busyRef.current) return;
    if (!readWorkspace(ownerKey)!.history.some(entry => entry.id === saved.historyId)) {
      setError('This result is no longer in this workspace. Refresh the retest.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const savedLatest = await retrySaves(ownerKey);
      if (!canAct()) return;
      if (savedLatest) finish(saved);
      else setError('Your retest result could not be saved. Retry saving it; the win or miss will not be counted again.');
    } finally { busyRef.current = false; if (canAct()) setBusy(false); }
  }

  function refresh() {
    if (!canAct() || busyRef.current) return;
    // A pending result must be persisted before leaving its recovery screen.
    if (receiptRef.current && readWorkspace(ownerKey)!.history.some(entry => entry.id === receiptRef.current!.historyId)) {
      setError('Retry saving this result before continuing. Your answer is still here.');
      return;
    }
    onRefresh();
  }

  return (
        <Reveal key={`${mistake.id}:${revealed ? 'revealed' : 'attempt'}`} distance={8}>
        <Text style={styles.subject}>{topic.subject.toUpperCase()} · {topic.name}</Text>
        <Text style={styles.prompt}>{mistake.prompt}</Text>

        {!revealed ? (
          <>
            <Text style={styles.answerLabel}>REBUILD THE CORRECTION FROM MEMORY</Text>
            <TextInput
              accessibilityLabel="Your correction from memory"
              value={answer}
              onChangeText={value => { if (canAct() && !receiptRef.current && !busyRef.current) setAnswer(value); }}
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
              onPress={() => { if (canAct() && answer.trim()) setRevealed(true); }}
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
                if (!canAct()) return;
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
            {mistake.detail ? <Compare label="ORIGINAL ERROR" text={mistake.detail} muted /> : null}
            <Compare label="CORRECTION" text={mistake.correction || 'No correction was saved.'} accent />

            <Text style={styles.gradeTitle}>Did you reproduce the correction correctly?</Text>
            <Text style={styles.gradeText}>
              Be strict: recognizing the correction after seeing it does not count as a win.
            </Text>

            {!mistake.correction.trim() ? <Text style={styles.gradeText}>Add a saved correction in the notebook before counting a win.</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {busy ? <Text accessibilityLiveRegion="polite" style={styles.gradeText}>Saving retest result…</Text> : null}
            {receipt && !busy ? <Pressable accessibilityRole="button" onPress={() => void retry()} style={styles.primary}>
              <Text style={styles.primaryText}>Retry saving result</Text>
            </Pressable> : null}
            {error && !busy ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.textButton}>
              <Text style={styles.textButtonText}>Refresh retest</Text>
            </Pressable> : null}
            <View style={styles.gradeRow}>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !!receipt}
                accessibilityState={{ disabled: busy || !!receipt }}
                onPress={() => void grade('miss')}
                style={({ pressed }) => [styles.missButton, (busy || !!receipt) && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.missTitle}>Still wrong</Text>
                <Text style={styles.gradeSub}>Reset streak</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !!receipt || !mistake.correction.trim()}
                accessibilityState={{ disabled: busy || !!receipt || !mistake.correction.trim() }}
                onPress={() => void grade('win')}
                style={({ pressed }) => [styles.winButton, (busy || !!receipt || !mistake.correction.trim()) && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.winTitle}>Got it right</Text>
                <Text style={styles.gradeSub}>
                  {mistake.wins === 0 ? 'First spaced win' : 'Resolve if spaced'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
        </Reveal>
  );
}

export function OwnerMistakeRetest({ ownerKey }: { ownerKey: string }) {
  const { workspace, readWorkspace } = useWorkspace();
  const mounted = useRef(true);
  const heldRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [held, setHeld] = useState<{ mistake: Mistake; topic: Topic } | null>(null);
  const [notice, setNotice] = useState('');
  const [generation, setGeneration] = useState(0);
  const now = Date.now();
  const queue = useMemo(() => workspace ? buildMistakeRetestQueue(workspace, now) : [], [workspace, now]);
  const current = held?.mistake ?? queue[0] ?? null;
  const topic = workspace?.topics.find(item => item.id === current?.topicId) ?? held?.topic ?? null;
  const end = () => { if (mounted.current && readWorkspace(ownerKey) && !heldRef.current) router.replace('/(app)/mistakes'); };
  if (!current || !topic) return <SafeAreaView style={styles.safe}>
    <View style={styles.top}><Pressable accessibilityRole="button" onPress={end} disabled={!!held} accessibilityState={{ disabled: !!held }} style={styles.endAction}>
      <Text style={styles.back}>← Mistakes</Text></Pressable><Text style={styles.topTitle}>RETEST</Text><View style={styles.topSpacer} /></View>
    <Reveal distance={10} style={styles.done}><Text style={styles.doneMark}>✓</Text>
      <Text style={styles.doneTitle}>No mistakes are due right now.</Text>
      <Text style={styles.doneText}>{notice || 'The next correction will return when its spacing interval is ready.'}</Text>
      <Pressable accessibilityRole="button" onPress={end} style={styles.primary}><Text style={styles.primaryText}>Back to notebook</Text></Pressable>
    </Reveal>
  </SafeAreaView>;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.top}><Pressable accessibilityRole="button" onPress={end} disabled={!!held} accessibilityState={{ disabled: !!held }} style={styles.endAction}>
      <Text style={styles.back}>← End</Text></Pressable><View style={styles.topCenter}><Text style={styles.topTitle}>MISTAKE RETEST</Text>
      <Text style={styles.topCount}>{held ? 'Result awaiting save' : `${queue.length} due`}</Text></View><Text style={styles.wins}>{current.wins}/2</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AnimatedDisclosure visible={!!notice} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></AnimatedDisclosure>
      <MistakeRetestAttempt key={JSON.stringify([mistakeRetestSnapshot(current), generation])} ownerKey={ownerKey} mistake={current} topic={topic}
        onPending={mistake => { heldRef.current = true; setHeld({ mistake, topic }); }} onSaved={label => { heldRef.current = false; setNotice(label); setHeld(null); }}
        onRefresh={() => { heldRef.current = false; setHeld(null); setGeneration(value => value + 1); }} />
    </ScrollView>
  </SafeAreaView>;
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
  error: { color: colors.danger, fontSize: 12, lineHeight: 19, marginTop: spacing.md },
  endAction: { minHeight: layout.minTouch, justifyContent: 'center' },
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
