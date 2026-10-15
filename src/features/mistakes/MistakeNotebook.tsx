import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { MistakeForm } from './MistakeForm';
import { findMistake } from './mistake-engine';
import { useMistakeMutation } from './useMistakeMutation';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Mutation = ReturnType<typeof useMistakeMutation>;
function Feedback({ action, inspect, inspectLabel = 'Load latest saved mistake' }: { action: Mutation; inspect: () => void; inspectLabel?: string }) {
  return <View>
    {action.error ? <Text accessibilityRole="alert" style={styles.error}>{action.error}</Text> : null}
    {action.busy ? <Text accessibilityLiveRegion="polite" style={styles.missing}>Saving notebook change…</Text> : null}
    {action.pending && !action.busy && !action.changed ? <Pressable accessibilityRole="button" onPress={() => void action.retry()} style={styles.reopen}>
      <Text style={styles.reopenText}>Retry saving change</Text></Pressable> : null}
    {(action.changed || action.error && !action.pending) && !action.busy ? <Pressable accessibilityRole="button" onPress={() => { if (action.active()) inspect(); }} style={styles.deleteButton}>
      <Text style={styles.reopenText}>{action.changed ? 'Open latest notebook' : inspectLabel}</Text></Pressable> : null}
  </View>;
}

export function NewMistakeEditor({ ownerKey, topicId, cardId }: { ownerKey: string; topicId: string; cardId: string }) {
  const { workspace } = useWorkspace();
  const [initialTopics] = useState(workspace?.topics ?? []);
  const topics = workspace?.topics.length ? workspace.topics : initialTopics;
  const topic = workspace?.topics.find(t => t.id === topicId);
  const card = topic?.cards.find(c => c.id === cardId);
  const action = useMistakeMutation(ownerKey, null, (_kind, id) => router.replace({ pathname: '/(app)/mistakes/[mistakeId]', params: { mistakeId: id } }));
  const exit = () => { if (action.active() && !action.locked) router.back(); };
  if (!topics.length) return <SafeAreaView style={styles.safe}><ScreenHeader title="Add mistake" onBack={exit} /><Text style={styles.missing}>Create a topic first. Every mistake belongs to a topic.</Text></SafeAreaView>;
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader eyebrow="CAPTURE THE ERROR" title="Add mistake" subtitle="Record the error and the correction you want to reproduce." onBack={exit} />
    <MistakeForm topics={topics} initial={{ topicId: topic?.id ?? topics[0].id, cardId: card?.id ?? null,
      prompt: card?.prompt ?? '', correction: card?.answer ?? '', reason: card ? 'recall' : 'concept' }}
      disabled={action.locked} feedback={<Feedback action={action} inspectLabel="Open notebook" inspect={() => router.replace('/(app)/mistakes')} />}
      submitLabel="Save mistake" onCancel={exit} onSubmit={input => { void action.perform('create', input); }} />
  </SafeAreaView>;
}

export function MistakeDetailEditor({ ownerKey, mistakeId }: { ownerKey: string; mistakeId: string }) {
  const [generation, setGeneration] = useState(0);
  return <MistakeDetailAttempt key={generation} ownerKey={ownerKey} mistakeId={mistakeId} refresh={() => setGeneration(value => value + 1)} />;
}

export function MistakeDetailAttempt({ ownerKey, mistakeId, refresh }: { ownerKey: string; mistakeId: string; refresh: () => void }) {
  const { readWorkspace } = useWorkspace();
  // Keep the form/record visible through optimistic edit/delete/reopen updates.
  const [baseline] = useState(() => { const w = readWorkspace(ownerKey); return w ? findMistake(w, mistakeId) : null; });
  const [topic] = useState(() => readWorkspace(ownerKey)?.topics.find(t => t.id === baseline?.topicId) ?? null);
  const [confirmation, setConfirmation] = useState<object | null>(null);
  const confirmationRef = useRef<object | null>(null);
  const action = useMistakeMutation(ownerKey, baseline, kind => {
    if (kind === 'reopen') refresh();
    else if (kind === 'delete') router.replace('/(app)/mistakes');
    else router.back();
  });
  const exit = () => { if (action.active() && !action.locked) router.back(); };
  function closeConfirmation(ticket: object) { if (confirmationRef.current !== ticket) return; confirmationRef.current = null; setConfirmation(null); }
  function remove() {
    if (!action.active() || action.locked) return;
    const ticket = {}; confirmationRef.current = ticket; setConfirmation(ticket);
  }
  const feedback = <Feedback action={action} inspect={refresh} />;
  const modal = <Modal transparent visible={!!confirmation} animationType="none" onRequestClose={() => { if (confirmation) closeConfirmation(confirmation); }}>
    <View style={styles.modalShade}><View style={styles.modalCard} accessibilityViewIsModal>
      <Text style={styles.resolutionTitle}>Delete this mistake?</Text>
      <Text style={styles.resolutionText}>Linked study history stays, with its mistake link removed. This cannot be undone.</Text>
      <Pressable accessibilityRole="button" onPress={() => {
        if (!confirmation || confirmationRef.current !== confirmation) return;
        closeConfirmation(confirmation); void action.perform('delete');
      }} style={styles.deleteButton}><Text style={styles.deleteText}>Delete mistake permanently</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { if (confirmation) closeConfirmation(confirmation); }} style={styles.deleteButton}><Text style={styles.reopenText}>Keep mistake</Text></Pressable>
    </View></View>
  </Modal>;
  if (!baseline || !topic) return <SafeAreaView style={styles.safe}><ScreenHeader title="Mistake not found" onBack={exit} /><Text style={styles.missing}>This mistake is no longer available in this workspace.</Text></SafeAreaView>;
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader eyebrow={baseline.resolvedAt ? 'RESOLVED' : topic.subject.toUpperCase()} title={baseline.resolvedAt ? baseline.prompt : 'Edit mistake'}
      subtitle={baseline.resolvedAt ? topic.name : `${baseline.wins}/2 spaced retest wins · ${topic.name}`} onBack={exit} />
    {!baseline.resolvedAt ? <>
      <MistakeForm topics={[topic]} initial={baseline} disabled={action.locked} submitLabel="Save changes" onCancel={exit}
        onSubmit={input => { void action.perform('edit', input); }} feedback={<>{feedback}<Pressable accessibilityRole="button" disabled={action.locked} onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>Delete mistake</Text></Pressable></>} />
    </> : <ScrollView contentContainerStyle={styles.resolvedContent}>
      <Info label="CAUSE" text={baseline.reason} /><Info label="WHAT HAPPENED" text={baseline.detail || 'No detail was recorded.'} />
      <Info label="CORRECTION" text={baseline.correction || 'No correction was recorded.'} accent />
      <Text style={styles.resolutionText}>Resolved after two spaced wins. Reopen it if the mistake returns.</Text>
      {feedback}
      <Pressable accessibilityRole="button" disabled={action.locked} onPress={() => void action.perform('reopen')} style={styles.reopen}><Text style={styles.reopenText}>Reopen mistake</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={action.locked} onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>Delete mistake</Text></Pressable>
    </ScrollView>}
    {modal}
  </SafeAreaView>;
}

function Info({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <View style={[styles.info, accent && styles.infoAccent]}>
      <Text style={[styles.infoLabel, accent && styles.infoLabelAccent]}>{label}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 12, lineHeight: 19, marginVertical: 10 },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, padding: spacing.lg },
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  missing: { color: colors.muted, padding: spacing.lg, lineHeight: 18 },
  deleteFloating: { position: 'absolute', right: spacing.lg, bottom: 8, minHeight: layout.minTouch, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '700' },
  resolvedContent: { padding: spacing.lg, paddingBottom: 52 },
  info: { marginBottom: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  infoAccent: { borderColor: 'rgba(180,216,174,0.2)', backgroundColor: 'rgba(180,216,174,0.045)' },
  infoLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  infoLabelAccent: { color: colors.success },
  infoText: { color: colors.text, fontSize: 12, lineHeight: 19, marginTop: 6 },
  resolutionCard: { marginTop: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.success, paddingLeft: 11 },
  resolutionTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  resolutionText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  reopen: { minHeight: 48, marginTop: spacing.xl, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  reopenText: { color: '#25140e', fontSize: 12, fontWeight: '800' },
  deleteButton: { minHeight: layout.minTouch, marginTop: 9, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
});
