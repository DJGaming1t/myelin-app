import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StudyTask } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { launchVariant, suggestedSteps } from './outcome-engine';
import { sleepingAt } from './sleep-engine';
import { colors, radius } from '@/src/theme/tokens';

type SupportProps = { task: StudyTask | null; topicPostponements?: number; onStep: (text: string) => void; onLaunch: (step: string) => void | Promise<void> };
const sameSteps = (left: string[], right: string[]) => left.length === right.length && left.every((step, index) => step === right[index]);
export function FocusSupport(props: SupportProps) {
  const { ownerKey } = useWorkspace();
  return <FocusSupportEditor key={`${ownerKey}:${props.task?.id ?? 'topic'}`} {...props} />;
}
function FocusSupportEditor({ task, topicPostponements = 0, onStep, onLaunch }: SupportProps) {
  const { workspace, ownerKey, status, readWorkspace, updateWorkspace } = useWorkspace();
  const avoided = (task?.postponements ?? topicPostponements) >= 2;
  const [expanded, setExpanded] = useState(avoided);
  const [draft, setDraft] = useState(() => task ? suggestedSteps(task).join('\n') : 'Open the material\nTry one question without notes\nCheck one gap');
  const [message, setMessage] = useState('');
  const baseline = useRef([...(task?.steps ?? [])]);
  const mounted = useRef(true);
  const submitted = useRef(false);
  const launching = useRef(false);
  const generation = useRef(0);
  const [version, setVersion] = useState(0);
  useEffect(() => () => { mounted.current = false; }, []);
  function ready() { return mounted.current && ownerKey ? readWorkspace(ownerKey) : null; }
  function validDraft() { return generation.current === version && !!ready(); }
  const experiment = workspace?.settings.launchExperiment === true;
  const variant = task ? (task.launchTrial?.variant ?? launchVariant(task, experiment)) : 'five-minute';
  useEffect(() => {
    if (!experiment || !avoided || !task || task.launchTrial || !ownerKey || !ready()) return;
    updateWorkspace(d => {
      const current = d.tasks.find(item => item.id === task.id)!;
      current.launchTrial = { variant: launchVariant(current, true), offeredAt: Date.now(), startedAt: 0 };
    }, { ownerKey, canApply: current => current.settings.launchExperiment === true && current.tasks.some(item => item.id === task.id && item.status === 'open' && (item.postponements ?? 0) >= 2 && !item.launchTrial) });
  }, [experiment, avoided, task?.id, task?.launchTrial, ownerKey, status, readWorkspace, updateWorkspace]);
  const currentTask = task ? workspace?.tasks.find(item => item.id === task.id) : null;
  const conflict = task && currentTask?.status === 'open' && !sameSteps(currentTask.steps ?? [], baseline.current);
  function useLatest() {
    if (!validDraft() || !task) return;
    const current = ready()?.tasks.find(item => item.id === task.id);
    if (!current || current.status !== 'open') return;
    baseline.current = [...(current.steps ?? [])]; setDraft(suggestedSteps(current).join('\n')); setMessage('Latest steps loaded. Your other task data was kept.');
    submitted.current = false; generation.current++; setVersion(generation.current);
  }
  function safeTask() {
    if (!validDraft()) return false;
    if (!task) return true;
    const current = ready()?.tasks.find(item => item.id === task.id);
    if (!current || current.status !== 'open') { setMessage('This task is no longer open. Your work was kept.'); return false; }
    if (!sameSteps(current.steps ?? [], baseline.current)) { setMessage('The saved steps changed. Your draft was kept. Use latest steps before continuing.'); return false; }
    return true;
  }
  async function launch() {
    if (!safeTask() || launching.current) return;
    launching.current = true;
    try { await onLaunch(draft.split('\n').map(step => step.trim()).find(Boolean)?.slice(0,500) ?? 'Open the material'); }
    finally { launching.current = false; }
  }
  function saveSteps() {
    if (submitted.current || !safeTask()) return;
    const steps = draft.split('\n').map(step => step.trim().slice(0,500)).filter(Boolean).slice(0,12);
    if (!steps.length) { setMessage('Write at least one small step.'); return; }
    if (task && ownerKey && !sameSteps(steps, baseline.current)) {
      const next = updateWorkspace(d => { const current = d.tasks.find(item => item.id === task.id)!; current.steps = steps; current.updatedAt = Date.now(); }, {
        ownerKey, canApply: current => current.tasks.some(item => item.id === task.id && item.status === 'open' && sameSteps(item.steps ?? [], baseline.current)),
      });
      if (!next) { setMessage('The saved steps changed. Your draft was kept. Use latest steps before continuing.'); return; }
      baseline.current = [...steps];
    }
    submitted.current = true; onStep(steps[0]); setMessage(task ? 'Steps saved. Your first step is ready.' : 'First step selected for this focus session.');
  }
  if (!workspace) return null;
  return <View style={styles.wrap}>
    {sleepingAt(workspace.settings, Date.now()) ? <Text style={styles.copy}>This is your protected sleep window. Today will suggest work after you wake. You can still choose a short session.</Text> : null}
    {avoided ? <View style={styles.callout}><Text style={styles.title}>{variant === 'five-minute' || !experiment ? 'Make the start smaller' : 'Choose one concrete first step'}</Text><Text style={styles.copy}>You have postponed this {task?.postponements ?? topicPostponements} times. Pick one step; the whole task can wait.</Text>{variant === 'five-minute' || !experiment ? <Pressable accessibilityRole="button" onPress={launch} style={styles.button}><Text style={styles.action}>Try just five minutes →</Text></Pressable> : null}</View> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => { if (validDraft()) setExpanded(value => !value); }} style={styles.button}><Text style={styles.action}>{expanded ? 'Hide first steps' : 'Break this into small steps'}</Text></Pressable>
    <AnimatedDisclosure visible={expanded}>
      <Text style={styles.copy}>Suggested starting points. Edit one step per line to fit your work.</Text>
      <TextInput accessibilityLabel="Small task steps" multiline value={draft} onChangeText={value => { if (validDraft()) { submitted.current = false; setDraft(value); } }} maxLength={6000} style={styles.input} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={saveSteps}><Text style={styles.action}>{task ? 'Save steps & use first step' : 'Use first step'}</Text></Pressable>
      {conflict ? <Pressable accessibilityRole="button" onPress={useLatest} style={styles.button}><Text style={styles.action}>Use latest steps</Text></Pressable> : null}
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
