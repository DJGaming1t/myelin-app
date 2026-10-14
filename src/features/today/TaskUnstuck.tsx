import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { StudyTask } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';
import { taskPlanningConflict, taskPlanningSnapshot } from '@/src/features/planning/task-planning';
import { canGetUnstuck, UNSTUCK_CHOICES, UnstuckChoice } from './task-unstuck';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export type TaskScheduleRequest = { ownerKey: string; task: StudyTask };
type Receipt = TaskScheduleRequest;
export function TaskUnstuck({ task, enabled = true, onSchedule }: { task: StudyTask; enabled?: boolean; onSchedule: (request: TaskScheduleRequest) => void }) {
  const { ownerKey, status, workspace, readWorkspace } = useWorkspace();
  const reduceMotion = useReducedMotion();
  const { session: focus, ready: focusReady } = useFocus();
  const { session: review, ready: reviewReady } = useReview();
  const available = enabled && focusReady && reviewReady && !focus && !review && status === 'ready' && canGetUnstuck(task);
  const availableRef = useRef(available); availableRef.current = available;
  const active = useRef<Receipt | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [choice, setChoice] = useState<UnstuckChoice | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { active.current = null; setReceipt(null); setChoice(null); setError(''); }, [ownerKey, available, task.id]);
  useEffect(() => () => { active.current = null; availableRef.current = false; }, []);
  function current(expected: Receipt) {
    if (active.current !== expected || !availableRef.current) return null;
    const latest = readWorkspace(expected.ownerKey)?.tasks.find(item => item.id === expected.task.id);
    return canGetUnstuck(latest) && !taskPlanningConflict(latest, taskPlanningSnapshot(expected.task)) ? latest! : null;
  }
  function open() {
    if (!ownerKey || !availableRef.current) return;
    const latest = readWorkspace(ownerKey)?.tasks.find(item => item.id === task.id);
    if (!canGetUnstuck(latest) || taskPlanningConflict(latest, taskPlanningSnapshot(task))) return;
    const next = { ownerKey, task: latest! }; active.current = next; setReceipt(next); setChoice(null); setError('');
  }
  function close(expected: Receipt) {
    if (active.current !== expected || !readWorkspace(expected.ownerKey)) return;
    active.current = null; setReceipt(null); setChoice(null); setError('');
  }
  function refresh(expected: Receipt) {
    if (active.current !== expected || !availableRef.current) return;
    const latest = readWorkspace(expected.ownerKey)?.tasks.find(item => item.id === expected.task.id);
    if (!canGetUnstuck(latest)) return;
    const next = { ownerKey: expected.ownerKey, task: latest! }; active.current = next; setReceipt(next); setError('');
  }
  function proceed(expected: Receipt, selected: UnstuckChoice) {
    const latest = current(expected);
    if (!latest) { if (active.current === expected && readWorkspace(expected.ownerKey)) setError('This task changed. Your work was kept. Use the current task before continuing.'); return; }
    active.current = null; setReceipt(null); setChoice(null); setError('');
    if (selected.target === 'schedule') onSchedule({ ownerKey: expected.ownerKey, task: latest });
    else if (selected.target === 'edit') router.push({ pathname: '/(app)/today/task/[taskId]', params: { taskId: latest.id } });
    else router.push({ pathname: '/(app)/focus', params: { taskId: latest.id, ...(latest.topicId ? { topicId: latest.topicId } : {}), minutes: String(Math.max(5, Math.min(240, taskRemainingMinutes(latest) || 25))) } });
  }
  const visible = available && receipt?.ownerKey === ownerKey ? receipt : null;
  const changed = visible && taskPlanningConflict(workspace?.tasks.find(item => item.id === visible.task.id), taskPlanningSnapshot(visible.task));
  return <>
    {available ? <Pressable accessibilityRole="button" accessibilityLabel={`Get unstuck with ${task.title}`} onPress={open} style={styles.entry}><Text style={styles.entryText}>Get unstuck →</Text></Pressable> : null}
    <Modal visible={!!visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => { if (visible) close(visible); }} statusBarTranslucent>
      {visible ? <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Get unstuck" onPress={() => close(visible)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet} testID="task-unstuck-sheet">
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>What’s in the way?</Text>
            <Text numberOfLines={2} style={styles.task}>{visible.task.title}</Text>
            <Text style={styles.copy}>Pick a reason. Your task and deadline stay as they are.</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="What is blocking this task" style={styles.choices}>
              {UNSTUCK_CHOICES.map(item => <Pressable key={item.id} accessibilityRole="radio" aria-checked={choice?.id === item.id} accessibilityState={{ checked: choice?.id === item.id }} onPress={() => { if (active.current === visible && availableRef.current && readWorkspace(visible.ownerKey)) { setChoice(item); setError(''); } }} style={[styles.choice, choice?.id === item.id && styles.selected]}><Text style={styles.choiceText}>{item.label}</Text></Pressable>)}
            </View>
            {changed || error ? <>
              <Text accessibilityLiveRegion="polite" style={styles.copy}>{error || 'This task changed. Your work was kept. Use the current task before continuing.'}</Text>
            </> : choice ? <View>
              <Text accessibilityLiveRegion="polite" style={styles.copy}>{choice.text}</Text>
              {choice.target === 'focus' ? <Text style={styles.copy}>You choose when to start in Focus.</Text> : null}
            </View> : null}
          </ScrollView>
          {changed || error ? <Pressable accessibilityRole="button" onPress={() => refresh(visible)} style={[styles.primary, styles.footerAction]}><Text style={styles.primaryText}>Use current task</Text></Pressable> : choice ? <Pressable accessibilityRole="button" onPress={() => proceed(visible, choice)} style={[styles.primary, styles.footerAction]}><Text style={styles.primaryText}>{choice.action}</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={() => close(visible)} style={styles.cancel}><Text style={styles.copy}>Cancel</Text></Pressable>
        </View>
      </View> : null}
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  entry: { minHeight: layout.minTouch, justifyContent: 'center', paddingVertical: 8 }, entryText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { maxHeight: '95%', borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.lg, backgroundColor: colors.panel }, content: { padding: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 28 }, task: { color: colors.text, fontSize: 14, marginVertical: 8 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }, choice: { minHeight: 48, minWidth: '45%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 10, justifyContent: 'center', alignItems: 'center' }, selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, choiceText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  footerAction: { flexShrink: 0, marginTop: 0, marginHorizontal: spacing.md, marginBottom: 8 },
  primary: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft, padding: 12, marginTop: 12, justifyContent: 'center' }, primaryText: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center' }, cancel: { minHeight: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 8 },
});
