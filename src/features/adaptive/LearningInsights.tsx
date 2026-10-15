import { router, useFocusEffect } from 'expo-router';
import { RefObject, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WorkspaceState } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { INSIGHT_PRACTICE_LIMIT, LearningInsight, learningInsights } from './insight-engine';
import { outcomeSnapshot } from './outcome-engine';
import { colors, radius } from '@/src/theme/tokens';
type InsightProps = {
  workspace: WorkspaceState; now: number; insights?: ReturnType<typeof learningInsights>; actionRef?: RefObject<View | null>; onRefresh?: () => void;
};
export function LearningInsights(props: InsightProps) {
  const { ownerKey, status } = useWorkspace();
  return ownerKey && status === 'ready' ? <OwnerLearningInsights key={ownerKey} {...props} ownerKey={ownerKey} /> : null;
}

export function OwnerLearningInsights({ workspace, now, insights: suppliedInsights, actionRef, ownerKey, onRefresh }: InsightProps & { ownerKey: string }) {
  const { readWorkspace } = useWorkspace();
  const { startReview, session: review, ready: reviewReady } = useReview();
  const { session: focus, ready: focusReady } = useFocus();
  const [refreshedAt, setRefreshedAt] = useState(0);
  const insights = refreshedAt > now ? learningInsights(workspace, refreshedAt) : suppliedInsights ?? learningInsights(workspace, now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const pending = useRef<object | null>(null);
  const active = useRef(false);
  const sessions = useRef({ focus, review, focusReady, reviewReady });
  sessions.current = { focus, review, focusReady, reviewReady };
  useFocusEffect(useCallback(() => {
    active.current = true; pending.current = null; setBusy(false); setError(null);
    return () => { active.current = false; pending.current = null; };
  }, []));
  const currentSessions = () => sessions.current;
  const currentOwner = () => active.current && !!readWorkspace(ownerKey);

  async function practise(insight: LearningInsight) {
    if (!currentOwner() || pending.current || !sessions.current.focusReady || !sessions.current.reviewReady) return;
    const ticket = {}; pending.current = ticket; setBusy(true); setError(null);
    const valid = () => currentOwner() && pending.current === ticket;
    let navigated = false;
    try {
      if (sessions.current.focus) { navigated = true; router.push('/(app)/focus'); return; }
      if (sessions.current.review) { navigated = true; router.push('/(app)/review'); return; }
      const latest = learningInsights(readWorkspace(ownerKey)!, Date.now()).find(item => item.id === insight.id);
      const selected = latest?.cardIds.filter(id => insight.cardIds.includes(id)) ?? [];
      if (!selected.length) {
        setError({ id: insight.id, message: 'This suggestion changed. Refresh Progress before practising.' }); return;
      }
      const started = await startReview({ cardIds: selected, includeNotDue: true, limit: INSIGHT_PRACTICE_LIMIT });
      if (!valid()) return;
      if (!started || !started.queue.length || started.queue.some(item => !selected.includes(item.cardId))) {
        setError({ id: insight.id, message: 'Review could not start. Your questions and progress were kept. Try again.' }); return;
      }
      const liveSessions = currentSessions();
      if (!liveSessions.focusReady || !liveSessions.reviewReady || liveSessions.focus ||
        liveSessions.review && liveSessions.review.id !== started.id) {
        setError({ id: insight.id, message: 'Your active session changed. Resume it before starting more practice.' }); return;
      }
      navigated = true;
      router.push('/(app)/review');
    } catch {
      if (valid()) setError({ id: insight.id, message: 'Review could not start. Your questions and progress were kept. Try again.' });
    } finally {
      if (valid() && !navigated) { pending.current = null; setBusy(false); }
    }
  }

  return <View>{insights.map((insight, index) => <View key={insight.id} style={styles.card}>
    <Text style={styles.title}>{insight.title}</Text><Text style={styles.copy}>{insight.detail}</Text>
    <Text style={styles.note}>{insight.evidence}</Text>
    {insight.cardIds.length > INSIGHT_PRACTICE_LIMIT ? <Text style={styles.note}>This practice round includes up to {INSIGHT_PRACTICE_LIMIT} of these {insight.cardIds.length} questions.</Text> : null}
    {error?.id === insight.id ? <>
      <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>
      <Pressable accessibilityRole="button" onPress={() => { if (currentOwner() && !pending.current) { if (onRefresh) onRefresh(); else setRefreshedAt(Date.now()); setError(null); } }} style={styles.button}>
        <Text style={styles.action}>Refresh Progress suggestions</Text>
      </Pressable>
    </> : null}
    <Pressable ref={index === 0 ? actionRef : undefined} collapsable={false} testID={index === 0 && actionRef ? 'guide-progress-practice' : undefined}
      accessibilityRole="button" accessibilityState={{ disabled: busy || !focusReady || !reviewReady }} disabled={busy || !focusReady || !reviewReady}
      style={[styles.button, (busy || !focusReady || !reviewReady) && styles.disabled]} onPress={() => void practise(insight)}>
      <Text style={styles.action}>{focus || review ? 'Resume active session first' : busy ? 'Opening practice…' : 'Practise these questions →'}</Text>
    </Pressable>
  </View>)}</View>;
}
export function OutcomeEvidence({ workspace, now }: { workspace: WorkspaceState; now: number }) {
  const data = outcomeSnapshot(workspace, now);
  return <View style={styles.card}>
    <Text style={styles.title}>What is helping? · 30 days</Text>
    <Text style={styles.copy}>{data.starts} focus starts · {data.fullBlocks} reached the planned duration · {data.finished} saved blocks, including early finishes.</Text>
    <Text style={styles.copy}>{data.recovered} overdue tasks completed.</Text>
    <Text style={styles.copy}>{data.retentionSamples ? `${data.recalled}/${data.retentionSamples} delayed, unassisted reviews recalled (Practising or Good).` : 'Delayed recall evidence will appear after questions are reviewed at least one day later.'}</Text>
    <Text style={styles.note}>Recall grades are self-reported. Immediate retries and hinted answers are excluded from retention. Focus start measurements begin with this update.</Text>
    <Text style={[styles.title, { marginTop: 22 }]}>Launch experiment</Text>
    {data.trials.map(t => <Text key={t.variant} style={styles.copy}>{t.variant === 'five-minute' ? 'Five-minute suggestion' : 'Standard suggestion'}: {t.starts}/{t.offers} offers led to a start within 24h.</Text>)}
    <Text style={styles.note}>Task-level comparison, across all recorded offers. Offers still inside their 24-hour window are excluded. These are descriptive counts; MYELIN will not claim a winner from small samples or change your defaults automatically.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/settings')} style={styles.button}><Text style={styles.action}>{workspace.settings.launchExperiment ? 'Manage learning lab →' : 'Choose whether to join in Settings →'}</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ error: { color: colors.danger, fontSize: 12, lineHeight: 19, marginTop: 10 }, disabled: { opacity: 0.45 }, card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 16, borderRadius: radius.lg, marginBottom: 12 }, title: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 10 }, button: { minHeight: 48, justifyContent: 'center', marginTop: 8 }, action: { color: colors.accent, fontSize: 13, fontWeight: '700', lineHeight: 20 } });
