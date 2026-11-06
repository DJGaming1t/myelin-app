import { FocusOutcome, StudyTask, WorkspaceState } from '@/src/data/schema';
import { FocusSessionState } from '@/src/features/focus/types';

// One outcome per timer. Repeated saves/recovery update the same record.
export function recordFocusOutcome(workspace: WorkspaceState, session: FocusSessionState, status: FocusOutcome['status'], minutes = 0, now = Date.now()) {
  const all = workspace.focusOutcomes ?? [];
  const old = all.find(o => o.id === session.id);
  if (old && old.status !== 'started') return;
  const task = workspace.tasks.find(t => t.id === session.taskId);
  const record: FocusOutcome = {
    id: session.id, startedAt: session.startedAt, endedAt: status === 'started' ? 0 : now, status,
    plannedMinutes: session.plannedFocusMinutes, minutes, launchMode: old?.launchMode ?? session.launchMode,
    taskOnly: !session.topicId, overdue: old?.overdue ?? Boolean(task?.dueAt && task.dueAt < session.startedAt),
  };
  workspace.focusOutcomes = [...all.filter(o => o.id !== session.id), record].sort((a, b) => a.startedAt - b.startedAt).slice(-2000);
  if (workspace.settings.launchExperiment && status === 'started' && task?.launchTrial && !task.launchTrial.startedAt && session.startedAt - task.launchTrial.offeredAt <= 86_400_000) task.launchTrial.startedAt = session.startedAt;
}
export function launchVariant(task: StudyTask, experiment: boolean) {
  if (!experiment) return 'five-minute' as const;
  // Stable task-level allocation: one assignment and one measured offer per task.
  let hash = 2166136261;
  for (const c of task.id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2 ? 'five-minute' as const : 'standard' as const;
}
export function suggestedSteps(task: StudyTask) {
  if (task.steps?.length) return task.steps;
  if (task.type === 'revision') return ['Choose one question', 'Answer without notes', 'Check and correct one gap'];
  if (task.type === 'assignment') return ['Open the brief and choose one requirement', 'Write three rough bullet points', 'Turn one bullet into a draft'];
  return ['Open the materials for this task', 'Try one small part for five minutes', 'Check that part and choose the next step'];
}
export function outcomeSnapshot(workspace: WorkspaceState, now: number) {
  const since = now - 30 * 86_400_000;
  const focus = (workspace.focusOutcomes ?? []).filter(o => o.startedAt >= since && o.startedAt <= now);
  const finished = focus.filter(o => o.status === 'finished');
  // First delayed, unassisted attempt per question per local day; immediate retries are not retention.
  const seen = new Set<string>();
  const retention = workspace.history.filter(h => h.kind === 'review' && h.cardId && h.at >= since && h.at <= now && (h.elapsedDays ?? 0) >= 1 && !h.hintUsed)
    .sort((a, b) => a.at - b.at).filter(h => { const date = new Date(h.at); const key = `${h.cardId}:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const trials = workspace.tasks.flatMap(t => t.launchTrial && t.launchTrial.offeredAt <= now - 86_400_000 ? [t.launchTrial] : []);
  return { starts: focus.length, finished: finished.length, fullBlocks: finished.filter(o => o.minutes >= o.plannedMinutes).length,
    recalled: retention.filter(h => h.grade >= 2).length, retentionSamples: retention.length,
    recovered: workspace.tasks.filter(t => t.status === 'completed' && t.dueAt > 0 && t.completedAt > t.dueAt && t.completedAt >= since && t.completedAt <= now).length,
    trials: (['five-minute', 'standard'] as const).map(variant => ({ variant, offers: trials.filter(t => t.variant === variant).length, starts: trials.filter(t => t.variant === variant && t.startedAt >= t.offeredAt && t.startedAt <= t.offeredAt + 86_400_000).length })) };
}
