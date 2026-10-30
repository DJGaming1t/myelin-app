import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WorkspaceState } from '@/src/data/schema';
import { Reveal } from '@/src/components/motion/Reveal';
import { neuralEvidence } from './insight-engine';
import { colors, radius } from '@/src/theme/tokens';
const POINTS = [[0.14,0.18],[0.5,0.12],[0.85,0.25],[0.17,0.52],[0.53,0.47],[0.84,0.6],[0.13,0.85],[0.48,0.83],[0.84,0.91]];
const LINKS = [[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8]];
export function NeuralMap({ workspace }: { workspace: WorkspaceState }) {
  const evidence = neuralEvidence(workspace);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [width, setWidth] = useState(260);
  const pages = Math.max(1, Math.ceil(evidence.nodes.length / 9));
  const safePage = Math.min(page, pages - 1);
  const nodes = evidence.nodes.slice(safePage * 9, safePage * 9 + 9);
  const selected = nodes.find(n => n.topic.id === selectedId) ?? nodes[0];
  return <View style={styles.card}>
    <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>YOUR NEURAL MAP</Text><Text style={styles.title}>Built one recall at a time.</Text></View><Text accessibilityLabel={`${evidence.total} earned recall connections`} style={styles.count}>{evidence.total}</Text></View>
    {nodes.length ? <>
      <View style={styles.map} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {LINKS.map(([a, b]) => { if (!nodes[a] || !nodes[b]) return null; const x = POINTS[a][0] * width, y = POINTS[a][1] * 240; const dx = (POINTS[b][0] - POINTS[a][0]) * width, dy = (POINTS[b][1] - POINTS[a][1]) * 240; const length = Math.sqrt(dx * dx + dy * dy); const earned = nodes[a].wins > 0 && nodes[b].wins > 0; const activeFocusLink = !earned && (nodes[a].focusMinutes > 0 || nodes[a].wins > 0) && (nodes[b].focusMinutes > 0 || nodes[b].wins > 0); return <View key={`${a}-${b}`} pointerEvents="none" style={{ position: 'absolute', left: x + dx / 2 - length / 2, top: y + dy / 2, width: length, height: earned ? 2 : 1, backgroundColor: earned ? colors.accent : activeFocusLink ? colors.accentLine : colors.lineStrong, opacity: earned ? 0.55 : activeFocusLink ? 0.8 : 0.7, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />; })}
        {nodes.map((node, i) => <View key={node.topic.id} style={{ position: 'absolute', left: POINTS[i][0] * width - 23, top: POINTS[i][1] * 240 - 23 }}><Reveal delay={i * 25} distance={3}><Pressable accessibilityRole="button" accessibilityLabel={`${node.topic.name}, ${node.wins} earned recalls, ${node.focusMinutes} focused minutes`} accessibilityState={{ selected: selected?.topic.id === node.topic.id }} onPress={() => setSelectedId(node.topic.id)} style={[styles.node, node.focusMinutes > 0 && styles.insulated, node.wins > 0 && styles.earned, selected?.topic.id === node.topic.id && styles.selected]}><View style={[styles.core, { width: node.wins >= 10 ? 22 : node.wins ? 16 : node.focusMinutes > 0 ? 12 : 9, height: node.wins >= 10 ? 22 : node.wins ? 16 : node.focusMinutes > 0 ? 12 : 9, backgroundColor: node.wins ? colors.accent : node.focusMinutes > 0 ? colors.accentBright : colors.muted }]} /></Pressable></Reveal></View>)}
      </View>
      {selected ? <View style={styles.detailWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${selected.topic.name}`} style={styles.detail} onPress={() => router.push({ pathname: '/(app)/topics/[topicId]', params: { topicId: selected.topic.id } })}>
          <Text style={styles.topic}>{selected.topic.name} →</Text>
          <Text style={styles.copy}>
            {[
              selected.topic.subject,
              `${selected.wins} earned ${selected.wins === 1 ? 'recall' : 'recalls'}`,
              selected.focusMinutes > 0 ? `${selected.focusMinutes}m focused` : '',
              selected.openTasks > 0 ? `${selected.openTasks} open ${selected.openTasks === 1 ? 'task' : 'tasks'}` : '',
              selected.openMistakes > 0 ? `${selected.openMistakes} open ${selected.openMistakes === 1 ? 'mistake' : 'mistakes'}` : '',
            ].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
        <View style={styles.quickRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/focus', params: { topicId: selected.topic.id, minutes: String(selected.topic.estimate || workspace.settings.focusMinutes) } })} style={styles.quickAction}>
            <Text style={styles.quickActionText}>▶ Focus</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => selected.topic.cards.length > 0 ? router.push({ pathname: '/(app)/review', params: { topicId: selected.topic.id } }) : router.push({ pathname: '/(app)/topics/[topicId]/question/new', params: { topicId: selected.topic.id } })} style={styles.quickAction}>
            <Text style={styles.quickActionText}>{selected.topic.cards.length > 0 ? `Recall (${selected.topic.cards.length})` : '+ Question'}</Text>
          </Pressable>
          {selected.openMistakes > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/mistakes/retest')} style={styles.quickAction}>
              <Text style={styles.quickActionText}>Retest ({selected.openMistakes})</Text>
            </Pressable>
          ) : null}
        </View>
      </View> : null}
      {pages > 1 ? <View style={styles.paging}><Pressable accessibilityRole="button" accessibilityLabel="Previous map topics" disabled={safePage === 0} onPress={() => setPage(safePage - 1)} style={styles.pageButton}><Text style={styles.copy}>← Previous</Text></Pressable><Text style={styles.copy}>{safePage + 1}/{pages}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next map topics" disabled={safePage === pages - 1} onPress={() => setPage(safePage + 1)} style={styles.pageButton}><Text style={styles.copy}>Next →</Text></Pressable></View> : null}
    </> : <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/topics/new')} style={styles.empty}><Text style={styles.topic}>Plant your first connection →</Text><Text style={styles.copy}>Add a topic and a recall question to begin.</Text></Pressable>}
    <Text style={styles.milestone}>{evidence.earned.length ? `${evidence.earned[evidence.earned.length - 1]}-recall milestone earned` : 'First connection ahead'}{evidence.next ? ` · next at ${evidence.next}` : ' · keep growing'}{evidence.totalFocusMinutes > 0 ? ` · ${evidence.totalFocusMinutes}m focused across topics` : ''}</Text>
    <Text style={styles.note}>Bright nodes mark Good recalls without hints, once per question per day. Warm rings show focused study time on that topic. Earned progress stays when a review becomes due. This is a learning map, not a measurement of your brain.</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.xl, padding: 16, marginBottom: 18, overflow: 'hidden' }, heading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: colors.accent }, title: { fontSize: 19, lineHeight: 26, color: colors.text, fontWeight: '600', marginTop: 8 }, count: { fontSize: 28, color: colors.accent, fontWeight: '700', fontVariant: ['tabular-nums'] }, map: { height: 250, marginVertical: 10 }, node: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineStrong }, insulated: { borderColor: colors.accentLine, backgroundColor: colors.accentFaint }, earned: { borderColor: colors.accent }, selected: { borderWidth: 2, borderColor: colors.text }, core: { borderRadius: 20 }, detailWrap: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }, detail: { minHeight: 52, justifyContent: 'center', paddingVertical: 4 }, quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 4 }, quickAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bgRaised, alignItems: 'center', justifyContent: 'center' }, quickActionText: { color: colors.accent, fontSize: 11.5, fontWeight: '700' }, topic: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 22 }, copy: { fontSize: 12, color: colors.muted, lineHeight: 19 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }, milestone: { color: colors.accent, fontSize: 12, lineHeight: 18, marginTop: 8 }, empty: { minHeight: 140, justifyContent: 'center' }, paging: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pageButton: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 4 } });
