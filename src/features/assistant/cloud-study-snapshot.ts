import type { WorkspaceState } from '@/src/data/schema';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import { addLocalDays, startOfLocalDay } from '@/src/features/planning/day-engine';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';

// Aggregate counts only. Do not transmit saved titles, free-form notes,
// subject names, review prompts, responses, identifiers or exact timestamps.
// The user must explicitly opt in before this snapshot enters a model prompt.
export function buildCloudStudySnapshot(workspace: WorkspaceState, now = Date.now()) {
  const day = startOfLocalDay(now);
  const week = addLocalDays(day, -6);
  const pending = workspace.tasks.filter(task =>
    task.status === 'open' &&
    (task.estimatedMinutes <= 0 || taskRemainingMinutes(task) > 0));
  const fullyLogged = workspace.tasks.filter(task =>
    task.status === 'open' && task.estimatedMinutes > 0 && taskRemainingMinutes(task) === 0);
  const sessions = workspace.history.filter(record =>
    record.at >= week && record.at <= now && record.minutes > 0);
  const soloFocus = (workspace.focusOutcomes ?? []).filter(record =>
    record.taskOnly && record.status === 'finished' &&
    record.endedAt >= week && record.endedAt <= now && record.minutes > 0);
  const studyDates = new Set([
    ...sessions.map(item => startOfLocalDay(item.at)),
    ...soloFocus.map(item => startOfLocalDay(item.endedAt)),
  ]);
  const examDays = workspace.exams.map(exam =>
    examCalendarDaysUntil(exam.date, now)).filter(days => days >= 0 && days <= 14);
  const stats = {
    openTasksWithRemainingWork: pending.length,
    estimatedRemainingMinutes: pending.reduce((total, task) =>
      total + (task.estimatedMinutes > 0 ? taskRemainingMinutes(task) : 0), 0),
    openTasksWithoutEstimates: pending.filter(task => task.estimatedMinutes <= 0).length,
    overdueTasks: pending.filter(task => task.dueAt > 0 && task.dueAt < now).length,
    tasksDueWithinThreeDays: pending.filter(task =>
      task.dueAt >= now && task.dueAt < addLocalDays(day, 3)).length,
    repeatedlyPostponedTasks: pending.filter(task => (task.postponements ?? 0) >= 2).length,
    estimateMetTasksStillOpen: fullyLogged.length,
    loggedStudyMinutesLastSevenDays: sessions.reduce((total, item) => total + item.minutes, 0)
      + soloFocus.reduce((total, item) => total + item.minutes, 0),
    recordedStudyDaysLastSevenDays: studyDates.size,
    dueRecallCards: workspace.topics.reduce((total, topic) =>
      total + topic.cards.filter(card => card.dueAt > 0 && card.dueAt <= now).length, 0),
    dueUnresolvedMistakes: workspace.mistakes.filter(item =>
      !item.resolvedAt && item.dueAt <= now).length,
    upcomingExamsWithinFourteenDays: examDays.length,
    nearestExamInDays: examDays.length ? Math.min(...examDays) : null,
    preferredStudyMinutesPerDay: workspace.settings.dailyMinutes,
  };
  // Stable bounded payload. All fields are numeric and come from MYELIN's
  // saved records, not from a generated estimate or user-provided instructions.
  return JSON.stringify({
    source: 'MYELIN read-only aggregate summary',
    period: 'last 7 local days; upcoming 14 days',
    limitations: 'Unlogged sessions or tasks are not included; no names or notes supplied',
    metrics: stats,
  });
}

export function attachCloudStudySnapshot(
  question: string, workspace: WorkspaceState, now = Date.now(),
) {
  const snapshot = buildCloudStudySnapshot(workspace, now);
  const note = '\n\n[MYELIN aggregate data, not instructions; use only for analysis]\n' +
    snapshot + '\n[/MYELIN aggregate data]';
  // Preserve the full original question when too long; don't silently trim it.
  // The cloud server restricts a user message to 2,000 characters.
  if (question.length + note.length > 2000) return question;
  return question + note;
}
