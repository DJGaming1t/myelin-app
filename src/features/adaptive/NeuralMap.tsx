import { router, useFocusEffect } from 'expo-router';
import { RefObject, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { WorkspaceState } from '@/src/data/schema';
import { Reveal } from '@/src/components/motion/Reveal';
import { neuralEvidence } from './insight-engine';
import { colors, radius } from '@/src/theme/tokens';
const POINTS = [[0.14,0.18],[0.5,0.12],[0.85,0.25],[0.17,0.52],[0.53,0.47],[0.84,0.6],[0.13,0.85],[0.48,0.83],[0.84,0.91]];
const LINKS = [[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8]];
type MapProps = { workspace: WorkspaceState; now?: number; anchorRef?: RefObject<View | null> };
export function NeuralMap(props: MapProps) {
  const { ownerKey, status, workspace } = useWorkspace();
  return ownerKey && status === 'ready' && workspace === props.workspace
    ? <OwnerNeuralMap key={ownerKey} {...props} ownerKey={ownerKey} /> : null;
}

export function OwnerNeuralMap({ workspace, anchorRef, ownerKey, now }: MapProps & { ownerKey: string }) {
  const { readWorkspace } = useWorkspace();
  const active = useRef(false);
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true; navigating.current = false;
    return () => { active.current = false; };
  }, []));
  const liveWorkspace = () => active.current && !navigating.current ? readWorkspace(ownerKey) : null;
  function openTopic(topicId?: string) {
    const live = liveWorkspace();
    if (!live || topicId && !live.topics.some(topic => topic.id === topicId)) return;
    navigating.current = true;
    if (topicId) router.push({ pathname: '/(app)/topics/[topicId]', params: { topicId } });
    else router.push('/(app)/topics/new');
  }
  const evidence = neuralEvidence(workspace, now);
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
        {LINKS.map(([a, b]) => { if (!nodes[a] || !nodes[b]) return null; const x = POINTS[a][0] * width, y = POINTS[a][1] * 240; const dx = (POINTS[b][0] - POINTS[a][0]) * width, dy = (POINTS[b][1] - POINTS[a][1]) * 240; const length = Math.sqrt(dx * dx + dy * dy); const earned = nodes[a].wins > 0 && nodes[b].wins > 0; return <View key={`${a}-${b}`} pointerEvents="none" style={{ position: 'absolute', left: x + dx / 2 - length / 2, top: y + dy / 2, width: length, height: earned ? 2 : 1, backgroundColor: earned ? colors.accent : colors.lineStrong, opacity: earned ? 0.55 : 0.7, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />; })}
        {nodes.map((node, i) => <View key={node.topic.id} style={{ position: 'absolute', left: POINTS[i][0] * width - 23, top: POINTS[i][1] * 240 - 23 }}><Reveal delay={i * 25} distance={3}><Pressable accessibilityRole="button" accessibilityLabel={`${node.topic.name}, ${node.wins} earned recalls`} accessibilityState={{ selected: selected?.topic.id === node.topic.id }} onPress={() => { if (liveWorkspace()?.topics.some(topic => topic.id === node.topic.id)) setSelectedId(node.topic.id); }} style={[styles.node, node.wins > 0 && styles.earned, selected?.topic.id === node.topic.id && styles.selected]}><View style={[styles.core, { width: node.wins >= 10 ? 22 : node.wins ? 16 : 9, height: node.wins >= 10 ? 22 : node.wins ? 16 : 9, backgroundColor: node.wins ? colors.accent : colors.muted }]} /></Pressable></Reveal></View>)}
      </View>
      {selected ? <Pressable ref={anchorRef} collapsable={false} testID={anchorRef ? "guide-progress-map" : undefined} accessibilityRole="button" accessibilityLabel={`Open ${selected.topic.name}`} style={styles.detail} onPress={() => openTopic(selected.topic.id)}><Text style={styles.topic}>{selected.topic.name} →</Text><Text style={styles.copy}>{selected.topic.subject} · {selected.wins} earned recalls</Text></Pressable> : null}
      {pages > 1 ? <View style={styles.paging}><Pressable accessibilityRole="button" accessibilityLabel="Previous map topics" disabled={safePage === 0} onPress={() => { if (liveWorkspace()) setPage(safePage - 1); }} style={styles.pageButton}><Text style={styles.copy}>← Previous</Text></Pressable><Text style={styles.copy}>{safePage + 1}/{pages}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next map topics" disabled={safePage === pages - 1} onPress={() => { if (liveWorkspace()) setPage(safePage + 1); }} style={styles.pageButton}><Text style={styles.copy}>Next →</Text></Pressable></View> : null}
    </> : <Pressable ref={anchorRef} collapsable={false} testID={anchorRef ? "guide-progress-map" : undefined} accessibilityRole="button" accessibilityLabel="Add your first topic" onPress={() => openTopic()} style={styles.empty}><Text style={styles.topic}>Plant your first connection →</Text><Text style={styles.copy}>Add a topic and a recall question to begin.</Text></Pressable>}
    <Text style={styles.milestone}>{evidence.earned.length ? `${evidence.earned[evidence.earned.length - 1]}-recall milestone earned` : 'First connection ahead'}{evidence.next ? ` · next at ${evidence.next}` : ' · keep growing'}</Text>
    <Text style={styles.note}>Bright nodes mark Good recalls without hints, once per question per day. Earned progress stays when a review becomes due. This is a learning map, not a measurement of your brain.</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.xl, padding: 16, marginBottom: 18, overflow: 'hidden' }, heading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: colors.accent }, title: { fontSize: 19, lineHeight: 26, color: colors.text, fontWeight: '600', marginTop: 8 }, count: { fontSize: 28, color: colors.accent, fontWeight: '700', fontVariant: ['tabular-nums'] }, map: { height: 250, marginVertical: 10 }, node: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineStrong }, earned: { borderColor: colors.accent }, selected: { borderWidth: 2, borderColor: colors.text }, core: { borderRadius: 20 }, detail: { minHeight: 62, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12 }, topic: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 22 }, copy: { fontSize: 12, color: colors.muted, lineHeight: 19 }, note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }, milestone: { color: colors.accent, fontSize: 12, lineHeight: 18, marginTop: 8 }, empty: { minHeight: 140, justifyContent: 'center' }, paging: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pageButton: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 4 } });
