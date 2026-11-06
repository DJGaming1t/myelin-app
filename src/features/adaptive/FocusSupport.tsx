import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StudyTask } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { launchVariant, suggestedSteps } from './outcome-engine';
import { sleepingAt } from './sleep-engine';
import { colors, radius } from '@/src/theme/tokens';

export function FocusSupport({ task, topicPostponements = 0, onStep, onLaunch }: { task: StudyTask | null; topicPostponements?: number; onStep: (text: string) => void; onLaunch: (step: string) => void }) {
  const { workspace, updateWorkspace } = useWorkspace();
  const avoided = (task?.postponements ?? topicPostponements) >= 2;
  const [expanded, setExpanded] = useState(avoided);
  const [draft, setDraft] = useState(task ? suggestedSteps(task).join('\n') : 'Open the material\nTry one question without notes\nCheck one gap');
  const [message, setMessage] = useState('');
  const experiment = workspace?.settings.launchExperiment === true;
  const variant = task ? (task.launchTrial?.variant ?? launchVariant(task, experiment)) : 'five-minute';
  useEffect(() => {
    if (!experiment || !avoided || !task || task.launchTrial) return;
    updateWorkspace(d => { const t = d.tasks.find(t => t.id === task.id); if (t && !t.launchTrial) t.launchTrial = { variant: launchVariant(t, true), offeredAt: Date.now(), startedAt: 0 }; });
  }, [experiment, avoided, task?.id, task?.launchTrial, updateWorkspace]);
  if (!workspace) return null;
  return <View style={styles.wrap}>
    {sleepingAt(workspace.settings, Date.now()) ? <Text style={styles.copy}>This is your protected sleep window. Today will suggest work after you wake. You can still choose a short session.</Text> : null}
    {avoided ? <View style={styles.callout}><Text style={styles.title}>{variant === 'five-minute' || !experiment ? 'Make the start smaller' : 'Choose one concrete first step'}</Text><Text style={styles.copy}>You have postponed this {task?.postponements ?? topicPostponements} times. Pick one step; the whole task can wait.</Text>{variant === 'five-minute' || !experiment ? <Pressable accessibilityRole="button" onPress={() => onLaunch(draft.split('\n').map(s => s.trim()).find(Boolean) ?? 'Open the material')} style={styles.button}><Text style={styles.action}>Try just five minutes →</Text></Pressable> : null}</View> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(v => !v)} style={styles.button}><Text style={styles.action}>{expanded ? 'Hide first steps' : 'Break this into small steps'}</Text></Pressable>
    <AnimatedDisclosure visible={expanded}>
      <Text style={styles.copy}>Suggested starting points. Edit one step per line to fit your work.</Text>
      <TextInput accessibilityLabel="Small task steps" multiline value={draft} onChangeText={setDraft} maxLength={6000} style={styles.input} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
        const steps = draft.split('\n').map(s => s.trim().slice(0, 500)).filter(Boolean).slice(0, 12);
        if (!steps.length) { setMessage('Write at least one small step.'); return; }
        if (task) updateWorkspace(d => { const t = d.tasks.find(t => t.id === task.id); if (t) t.steps = steps; });
        onStep(steps[0]); setMessage(task ? 'Steps saved. Your first step is ready.' : 'First step selected for this focus session.');
      }}><Text style={styles.action}>{task ? 'Save steps & use first step' : 'Use first step'}</Text></Pressable>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
    </AnimatedDisclosure>
  </View>;
}
export function DistractionShield() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.button} onPress={() => setOpen(v => !v)}><Text style={styles.action}>Set up distraction blocking · optional</Text></Pressable>
    <AnimatedDisclosure visible={open}>
      <Text style={styles.copy}>{Platform.OS === 'ios' ? 'In Settings, use Focus to silence notifications or Screen Time to limit distracting apps.' : 'In phone Settings, open Digital Wellbeing → Focus mode. Choose distracting apps and turn it on. Keep MYELIN available for your timer.'} MYELIN does not control or verify these system settings.</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={async () => { try { if (Platform.OS === 'android') await Linking.sendIntent('android.settings.SETTINGS'); else if (Platform.OS === 'ios') await Linking.openSettings(); else await Linking.openURL('https://support.google.com/android/answer/9346420'); } catch { setError('Open your phone Settings manually to set up Focus mode.'); } }}><Text style={styles.action}>{Platform.OS === 'web' ? 'Read Focus mode instructions' : 'Open phone settings'}</Text></Pressable>
      {error ? <Text style={styles.copy}>{error}</Text> : null}
    </AnimatedDisclosure>
  </View>;
}
const styles = StyleSheet.create({ wrap: { marginTop: 12 }, callout: { backgroundColor: colors.panel, borderLeftWidth: 2, borderLeftColor: colors.accent, padding: 14, borderRadius: radius.md }, title: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 20 }, input: { minHeight: 100, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, padding: 12, color: colors.text, lineHeight: 22, marginTop: 10 }, button: { minHeight: 48, justifyContent: 'center', paddingVertical: 10 }, action: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' } });
