import { router } from 'expo-router';
import { RefObject, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WorkspaceState } from '@/src/data/schema';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { learningInsights } from './insight-engine';
import { outcomeSnapshot } from './outcome-engine';
import { colors, radius } from '@/src/theme/tokens';
export function LearningInsights({ workspace, now, insights: suppliedInsights, actionRef }: {
  workspace: WorkspaceState; now: number; insights?: ReturnType<typeof learningInsights>; actionRef?: RefObject<View | null>;
}) {
  const insights = suppliedInsights ?? learningInsights(workspace, now);
  const { startReview, session: review } = useReview();
  const { session: focus } = useFocus();
  const [busy, setBusy] = useState(false);
  return <View>{insights.map((insight, index) => <View key={insight.title} style={styles.card}>
    <Text style={styles.title}>{insight.title}</Text><Text style={styles.copy}>{insight.detail}</Text>
    <Pressable ref={index === 0 ? actionRef : undefined} collapsable={false} testID={index === 0 && actionRef ? "guide-progress-practice" : undefined} accessibilityRole="button" disabled={busy} style={styles.button} onPress={async () => {
      if (focus) { router.push('/(app)/focus'); return; }
      if (review) { router.push('/(app)/review'); return; }
      setBusy(true); try { await startReview({ cardIds: insight.cardIds, includeNotDue: true, limit: 10 }); router.push('/(app)/review'); } finally { setBusy(false); }
    }}><Text style={styles.action}>{focus || review ? 'Resume active session first' : 'Practise these questions →'}</Text></Pressable>
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
const styles = StyleSheet.create({ card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: 16, borderRadius: radius.lg, marginBottom: 12 }, title: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 10 }, button: { minHeight: 48, justifyContent: 'center', marginTop: 8 }, action: { color: colors.accent, fontSize: 13, fontWeight: '700', lineHeight: 20 } });
