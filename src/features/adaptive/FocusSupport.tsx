import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StudyTask } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { launchVariant, suggestedSteps } from './outcome-engine';
import { sleepingAt } from './sleep-engine';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

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
    {sleepingAt(workspace.settings, Date.now()) ? (
      <View style={styles.sleepBanner}>
        <Text style={styles.sleepLabel}>SLEEP WINDOW PROTECTED</Text>
        <Text style={styles.copy}>This is your protected sleep window. Today will suggest work after you wake. You can still choose a short session.</Text>
      </View>
    ) : null}
    {avoided ? (
      <View style={styles.callout}>
        <Text style={styles.calloutKicker}>GENTLE RECOVERY</Text>
        <Text style={styles.title}>{variant === 'five-minute' || !experiment ? 'Make the start smaller' : 'Choose one concrete first step'}</Text>
        <Text style={styles.copy}>You have postponed this {task?.postponements ?? topicPostponements} times. Pick one step; the whole task can wait.</Text>
        {variant === 'five-minute' || !experiment ? (
          <SpringPressable accessibilityRole="button" onPress={launch} scaleTo={0.985} lift={0} style={styles.calloutButton}>
            <Text style={styles.calloutButtonText}>Try just five minutes →</Text>
          </SpringPressable>
        ) : null}
      </View>
    ) : null}
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => { if (validDraft()) setExpanded(value => !value); }}
      style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressed]}>
      <Text style={styles.action}>{expanded ? 'Hide first steps' : 'Break this into small steps'}</Text>
      <Text style={styles.disclosureMark}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    <AnimatedDisclosure visible={expanded} style={styles.disclosureBody}>
      <Text style={styles.copy}>Suggested starting points. Edit one step per line to fit your work.</Text>
      <TextInput
        accessibilityLabel="Small task steps"
        multiline
        textAlignVertical="top"
        value={draft}
        onChangeText={value => { if (validDraft()) { submitted.current = false; setDraft(value); } }}
        maxLength={6000}
        style={styles.input}
      />
      <View style={styles.editorActions}>
        <SpringPressable accessibilityRole="button" style={styles.editorButton} scaleTo={0.985} lift={0} onPress={saveSteps}>
          <Text style={styles.action}>{task ? 'Save steps & use first step' : 'Use first step'}</Text>
        </SpringPressable>
        {conflict ? (
          <SpringPressable accessibilityRole="button" onPress={useLatest} scaleTo={0.985} lift={0} style={styles.editorSecondaryButton}>
            <Text style={styles.action}>Use latest steps</Text>
          </SpringPressable>
        ) : null}
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.statusMessage}>{message}</Text> : null}
    </AnimatedDisclosure>
  </View>;
}
export function DistractionShield() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  return <View style={styles.wrap}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressed]}
      onPress={() => setOpen(v => !v)}>
      <Text style={styles.action}>Set up distraction blocking · optional</Text>
      <Text style={styles.disclosureMark}>{open ? '−' : '+'}</Text>
    </Pressable>
    <AnimatedDisclosure visible={open} style={styles.disclosureBody}>
      <Text style={styles.copy}>{Platform.OS === 'ios' ? 'In Settings, use Focus to silence notifications or Screen Time to limit distracting apps.' : 'In phone Settings, open Digital Wellbeing → Focus mode. Choose distracting apps and turn it on. Keep MYELIN available for your timer.'} MYELIN does not control or verify these system settings.</Text>
      <SpringPressable
        accessibilityRole="button"
        scaleTo={0.985}
        lift={0}
        style={styles.editorSecondaryButton}
        onPress={async () => {
          try {
            if (Platform.OS === 'android') await Linking.sendIntent('android.settings.SETTINGS');
            else if (Platform.OS === 'ios') await Linking.openSettings();
            else await Linking.openURL('https://support.google.com/android/answer/9346420');
          } catch {
            setError('Open your phone Settings manually to set up Focus mode.');
          }
        }}>
        <Text style={styles.action}>{Platform.OS === 'web' ? 'Read Focus mode instructions' : 'Open phone settings'}</Text>
      </SpringPressable>
      {error ? <Text style={styles.copy}>{error}</Text> : null}
    </AnimatedDisclosure>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  sleepBanner: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 10,
  },
  sleepLabel: { color: colors.accent, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  callout: {
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.accentLine,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  calloutKicker: { color: colors.accent, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 5 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  calloutButton: {
    minHeight: layout.minTouch,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  disclosureRow: {
    minHeight: layout.minTouch,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  disclosureMark: { color: colors.accent, fontSize: 20, lineHeight: 22, fontWeight: '500' },
  disclosureBody: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  input: {
    minHeight: 104,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 10,
  },
  editorActions: { gap: 8, marginTop: 10 },
  editorButton: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorSecondaryButton: {
    minHeight: layout.minTouch,
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusMessage: { color: colors.accent, fontSize: 12.5, lineHeight: 18, marginTop: 8, fontWeight: '600' },
  button: { minHeight: 48, justifyContent: 'center', paddingVertical: 10 },
  action: { color: colors.accent, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
