import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';
import { createProjectParts, localDateText, ProjectPartInput } from './project-parts';

type Part = ProjectPartInput & { key: number };
function defaultDay(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return localDateText(d); }

export function ProjectPartsForm() {
  const { workspace, ownerKey, status, updateWorkspace } = useWorkspace();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [deadline, setDeadline] = useState('');
  const [parts, setParts] = useState<Part[]>([
    { key: 1, title: '', day: defaultDay(0), minutes: '35' },
    { key: 2, title: '', day: defaultDay(1), minutes: '35' },
  ]);
  const nextKey = useRef(3);
  const submitted = useRef(false);
  const [error, setError] = useState('');

  function changePart(key: number, patch: Partial<ProjectPartInput>) {
    setError('');
    setParts(current => current.map(part => part.key === key ? { ...part, ...patch } : part));
  }
  function save() {
    if (!ownerKey || !workspace || status !== 'ready' || submitted.current) return;
    const result = createProjectParts({ title, subject, deadline, parts });
    if (result.error) { setError(result.error); return; }
    submitted.current = true;
    let atLimit = false;
    const updated = updateWorkspace(draft => { draft.tasks.push(...result.tasks!); }, { ownerKey, canApply: current => {
      atLimit = current.tasks.length + result.tasks!.length > 10000;
      return !atLimit;
    } });
    if (!updated) { submitted.current = false; setError(atLimit ? 'There is not enough room for these parts. Remove older tasks first.' : 'Your workspace changed. Reopen this form and try again.'); return; }
    router.back();
  }
  if (!workspace || !ownerKey || status !== 'ready') return null;

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader variant="compact" eyebrow="PROJECT PLAN" title="Make progress in parts" subtitle="Choose what to do on each day. You can adjust each task later." onBack={() => router.back()} />
    <Text style={styles.label}>Project name</Text>
    <TextInput accessibilityLabel="Project name" value={title} onChangeText={value => { setTitle(value); setError(''); }} placeholder="History project" placeholderTextColor={colors.subtle} maxLength={180} style={styles.input} />
    <Text style={styles.label}>Subject · optional</Text>
    <TextInput accessibilityLabel="Project subject" value={subject} onChangeText={setSubject} placeholder="History" placeholderTextColor={colors.subtle} maxLength={120} style={styles.input} />
    <Text style={styles.label}>Project deadline · optional</Text>
    <TextInput accessibilityLabel="Project deadline" value={deadline} onChangeText={value => { setDeadline(value); setError(''); }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.subtle} autoCapitalize="none" style={styles.input} />
    <Text style={styles.section}>Your parts</Text>
    <Text style={styles.helper}>Each part appears in Today from its chosen day. Use Schedule later if you want a specific time.</Text>
    {parts.map((part, index) => <View key={part.key} style={styles.card}>
      <View style={styles.cardHead}><Text style={styles.partTitle}>PART {index + 1}</Text>{parts.length > 2 ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove part ${index + 1}`} onPress={() => { setError(''); setParts(current => current.filter(item => item.key !== part.key)); }}><Text style={styles.remove}>Remove</Text></Pressable> : null}</View>
      <TextInput accessibilityLabel={`Part ${index + 1} description`} value={part.title} onChangeText={value => changePart(part.key, { title: value })} placeholder="What will you complete?" placeholderTextColor={colors.subtle} maxLength={250} style={styles.input} />
      <View style={styles.fields}><View style={styles.dayField}><Text style={styles.smallLabel}>Work on</Text><TextInput accessibilityLabel={`Part ${index + 1} day`} value={part.day} onChangeText={value => changePart(part.key, { day: value })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.subtle} autoCapitalize="none" style={styles.input} /></View><View style={styles.minuteField}><Text style={styles.smallLabel}>Minutes</Text><TextInput accessibilityLabel={`Part ${index + 1} minutes`} value={part.minutes} onChangeText={value => changePart(part.key, { minutes: value })} keyboardType="number-pad" style={styles.input} /></View></View>
      <View style={styles.row}>{[{ label: 'Today', day: defaultDay(0) }, { label: 'Tomorrow', day: defaultDay(1) }].map(choice => <Pressable key={choice.label} accessibilityRole="button" accessibilityLabel={`${choice.label} for part ${index + 1}`} onPress={() => changePart(part.key, { day: choice.day })} style={[styles.chip, part.day === choice.day && styles.chipActive]}><Text style={styles.chipText}>{choice.label}</Text></Pressable>)}</View>
    </View>)}
    {parts.length < 20 ? <Pressable accessibilityRole="button" onPress={() => { const key = nextKey.current++; setError(''); setParts(current => [...current, { key, title: '', day: defaultDay(current.length), minutes: '35' }]); }} style={styles.secondary}><Text style={styles.secondaryText}>+ Add another part</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={save} style={styles.primary}><Text style={styles.primaryText}>Add {parts.length} parts</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 56 },
  label: { color: colors.textDim, fontSize: 12.5, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 14, paddingHorizontal: 13 },
  section: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 28 },
  helper: { color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 6, marginBottom: 6 },
  card: { marginTop: 14, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  partTitle: { color: colors.accentBright, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  remove: { color: colors.muted, fontSize: 12, padding: 5 },
  fields: { flexDirection: 'row', gap: 10, marginTop: 12 }, dayField: { flex: 1 }, minuteField: { width: 94 },
  smallLabel: { color: colors.muted, fontSize: 12, marginBottom: 6 }, row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentFaint }, chipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 14 }, secondaryText: { color: colors.accentBright, fontWeight: '700' },
  primary: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: radius.md, marginTop: 18, backgroundColor: colors.accent }, primaryText: { color: '#1A0D08', fontSize: 15, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, marginTop: 12 },
});
