import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { clockLabel, parseClock } from './sleep-engine';
import { colors, radius } from '@/src/theme/tokens';

export function AdaptiveSettings() {
  const { workspace, updateWorkspace } = useWorkspace();
  const [bed, setBed] = useState(clockLabel(workspace?.settings.sleepStartMinutes ?? 1350));
  const [wake, setWake] = useState(clockLabel(workspace?.settings.wakeMinutes ?? 420));
  const [message, setMessage] = useState('');
  if (!workspace) return null;
  function save() {
    const start = parseClock(bed), end = parseClock(wake);
    if (start === null || end === null || start === end) { setMessage('Use two different times in 24-hour HH:MM format.'); return; }
    updateWorkspace(d => { d.settings.sleepStartMinutes = start; d.settings.wakeMinutes = end; });
    setMessage('Sleep window saved. Suggestions and reminders will respect it.');
  }
  return <View style={styles.panel}>
    <Text style={styles.title}>Protect sleep</Text>
    <View style={styles.row}><Text style={styles.copy}>Keep study suggestions and reminders outside your sleep window.</Text><Switch accessibilityLabel="Protect sleep" value={workspace.settings.sleepEnabled !== false} onValueChange={value => { updateWorkspace(d => { d.settings.sleepEnabled = value; }); }} /></View>
    {workspace.settings.sleepEnabled !== false ? <>
      <View style={styles.row}>{[['Sleep from', bed, setBed], ['Wake at', wake, setWake]].map(([label, value, set]) => <View key={label as string} style={{ flex: 1 }}><Text style={styles.copy}>{label as string}</Text><TextInput accessibilityLabel={label as string} value={value as string} onChangeText={set as (value: string) => void} maxLength={5} placeholder="22:30" style={styles.input} keyboardType="numbers-and-punctuation" /></View>)}</View>
      <Pressable accessibilityRole="button" style={styles.button} onPress={save}><Text style={styles.buttonText}>Save sleep times</Text></Pressable>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
    </> : null}
    <Text style={[styles.title, { marginTop: 24 }]}>Learning lab · optional</Text>
    <View style={styles.row}><Text style={styles.copy}>Compare five-minute and standard launch suggestions for repeatedly postponed tasks. You always choose how to start.</Text><Switch accessibilityLabel="Compare launch suggestions" value={workspace.settings.launchExperiment === true} onValueChange={value => { updateWorkspace(d => { d.settings.launchExperiment = value; }); }} /></View>
    <Text style={styles.note}>Stable assignment per task. Progress shows starts within 24 hours after each first offer, with sample sizes. Small samples cannot prove which suggestion works better.</Text>
    <Text style={styles.note}>Focus outcomes contain times and counts, never parked thoughts or screen-time tracking. They stay in your private workspace and sync only if you enable cloud sync. Up to 2,000 focus outcomes are kept.</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.panel, marginTop: 20 }, title: { color: colors.text, fontSize: 17, fontWeight: '700' }, copy: { color: colors.muted, fontSize: 13, lineHeight: 20, flex: 1 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }, row: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 12 }, input: { color: colors.text, backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, padding: 12, fontSize: 16, marginTop: 6 }, button: { minHeight: 48, justifyContent: 'center', paddingVertical: 12 }, buttonText: { color: colors.accent, fontSize: 14, fontWeight: '700' } });
