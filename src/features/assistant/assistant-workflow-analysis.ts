import type { WorkspaceState } from '@/src/data/schema';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import { buildJointExamPreparationPlan } from '@/src/features/exams/exam-plan-engine';
import { addLocalDays, localDayKey, startOfLocalDay } from '@/src/features/planning/day-engine';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';
import { buildTodayPlan } from '@/src/features/today/planner';
import { reviewAssistantPlanning } from './assistant-planning-review';

// Bounded, read-only analysis of recorded data. This is NOT local or cloud LLM
// inference, and must never consume compound commands asking for mutations.
export function isAssistantWorkflowAnalysisRequest(request: string) {
  if (request.length > 280) return false;
  const text = request.trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  const subject = '(?:my|our|the) (?:(?:current|overall|daily|weekly|study|studying|school|learning) )*(?:workflow|study plan|routine|study routine|schedule|study schedule|study habits|workload|study progress|studying|progress)';
  const patterns = [
    new RegExp('^(?:(?:can|could|would) you |please )?(?:analyse|analyze|assess|evaluate|review|audit|check|look at) ' + subject + '$'),
    new RegExp('^(?:(?:can|could) you )?tell me (?:what is wrong with|what to improve in|how to improve) ' + subject + '$'),
    new RegExp('^(?:what (?:should|can) i improve (?:in|about)|what is wrong with) ' + subject + '$'),
    /^(?:how (?:am i doing|is my studying going|is my study plan going)|am i (?:studying|planning) (?:well|effectively))$/,
  ];
  return patterns.some(pattern => pattern.test(text));
}

function shown(value: string) {
  return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 90);
}

function displayMinutes(minutes: number) {
  const whole = Math.max(0, Math.round(minutes));
  return whole < 60 ? whole + ' min' : Math.floor(whole / 60) + ' h' +
    (whole % 60 ? ' ' + whole % 60 + ' min' : '');
}

export function tryAssistantWorkflowAnalysisReply(
  request: string, workspace: WorkspaceState, now = Date.now(),
): string | null {
  if (!isAssistantWorkflowAnalysisRequest(request)) return null;
  const today = startOfLocalDay(now);
  const open = workspace.tasks.filter(task => task.status === 'open');
  const pending = open.filter(task => task.estimatedMinutes <= 0 || taskRemainingMinutes(task) > 0);
  const unestimated = pending.filter(task => task.estimatedMinutes <= 0);
  const remaining = pending.reduce((sum, task) =>
    sum + (task.estimatedMinutes > 0 ? taskRemainingMinutes(task) : 0), 0);
  const overdue = pending.filter(task => task.dueAt > 0 && task.dueAt < now)
    .sort((a, b) => a.dueAt - b.dueAt);
  const soon = pending.filter(task => task.dueAt >= now &&
    task.dueAt < addLocalDays(today, 3))
    .sort((a, b) => a.dueAt - b.dueAt);
  const postponed = pending.filter(task => (task.postponements ?? 0) >= 2);
  const stale = open.filter(task => task.estimatedMinutes > 0 && taskRemainingMinutes(task) === 0);

  const weekStart = addLocalDays(today, -6);
  const sessions = workspace.history.filter(item => item.at >= weekStart && item.at <= now && item.minutes > 0);
  const taskOnlyFocus = (workspace.focusOutcomes ?? []).filter(item =>
    item.taskOnly && item.status === 'finished' && item.endedAt >= weekStart &&
    item.endedAt <= now && item.minutes > 0);
  const recorded = sessions.reduce((sum, item) => sum + item.minutes, 0) +
    taskOnlyFocus.reduce((sum, item) => sum + item.minutes, 0);
  const recordedDays = new Set([
    ...sessions.map(item => localDayKey(item.at)),
    ...taskOnlyFocus.map(item => localDayKey(item.endedAt)),
  ]).size;
  const dueCards = workspace.topics.reduce((sum, topic) =>
    sum + topic.cards.filter(card => card.dueAt > 0 && card.dueAt <= now).length, 0);
  const dueMistakes = workspace.mistakes.filter(item => !item.resolvedAt && item.dueAt <= now).length;
  const exams = workspace.exams.map(exam => ({
    exam, days: examCalendarDaysUntil(exam.date, now),
  })).filter(item => item.days >= 0 && item.days <= 14)
    .sort((a, b) => a.days - b.days || a.exam.name.localeCompare(b.exam.name));
  const review = reviewAssistantPlanning(workspace, now);
  const dayPlan = buildTodayPlan(workspace, now);

  const findings: string[] = [];
  if (overdue.length) findings.push(
    overdue.length + ' task(s) are past their recorded deadline, including “' +
    shown(overdue[0]!.title) + '”. Check the remaining work rather than assuming a past due date is still achievable.',
  );
  if (soon.length) findings.push(
    soon.length + ' open task(s) are due in the next three local dates. “' +
    shown(soon[0]!.title) + '” is due ' + localDayKey(soon[0]!.dueAt) + '.',
  );
  const capacityIssues = review.issues.filter(issue =>
    issue.code === 'daily-overload' || issue.code === 'deadline-capacity');
  if (capacityIssues.length) findings.push(
    'The schedule has ' + capacityIssues.length + ' capacity/deadline warning(s). ' +
    shown(capacityIssues[0]!.message).slice(0, 150) +
    ' Review the detailed plan before adding work.',
  );
  if (unestimated.length) findings.push(
    unestimated.length + ' open task(s) have no recorded duration; the known workload total is incomplete.',
  );
  if (postponed.length) findings.push(
    postponed.length + ' task(s) have been postponed at least twice. Try a smaller first step rather than repeatedly moving a full session.',
  );
  if (stale.length) findings.push(
    stale.length + ' open task(s) have already met their estimate. Review whether to complete or extend them instead of counting them as new work.',
  );
  if (dueCards || dueMistakes) findings.push(
    dueCards + ' recall card(s) and ' + dueMistakes +
    ' unresolved mistake(s) are due. Retrieval quality matters alongside minutes studied.',
  );
  if (exams.length) {
    const first = exams[0]!;
    findings.push('Your nearest recorded exam, “' + shown(first.exam.name) + '”, is ' +
      (first.days === 0 ? 'today' : 'in ' + first.days + ' day(s)') + '.');
    const joint = buildJointExamPreparationPlan(workspace, now, { maxDays: 14 });
    const uncovered = joint.unallocatedPreparationMinutes + joint.unallocatedRevisionMinutes;
    if (uncovered > 0) findings.push(
      'Autopilot cannot allocate about ' + displayMinutes(uncovered) +
      ' of estimated exam preparation/revision before the relevant dates within this 14-day window. This is a planning estimate, not a guaranteed outcome.',
    );
  }
  if (recorded === 0) findings.push(
    'No study minutes were recorded in the last seven local dates. That could be missing tracking, not a lack of real studying.',
  );
  if (!findings.length) findings.push(
    'No obvious deadline, repeated-postponement or recorded-capacity warning appeared. This does not prove your routine is optimal.',
  );

  const firstStep = overdue.length
    ? 'Check the true remaining work and due date for “' + shown(overdue[0]!.title) + '”.'
    : capacityIssues.length
      ? 'Review the flagged capacity shortfall in Today. Keep sleep and fixed commitments protected.'
      : dayPlan.nextBlock
        ? 'Today suggests “' + shown(dayPlan.nextBlock.topicName || dayPlan.nextBlock.subject) +
          '” for ' + dayPlan.nextBlock.minutes + ' minutes. Check the task/topic before starting.'
        : unestimated.length
          ? 'Add a realistic duration to “' + shown(unestimated[0]!.title) + '”.'
          : 'Record your next concrete task and actual study so future recommendations have better evidence.';

  const overview = open.length + ' open tasks (' + displayMinutes(remaining) +
    ' known work remaining' + (unestimated.length ? ', excluding unestimated tasks' : '') +
    '); ' + exams.length + ' upcoming exam(s) within 14 days; ' +
    displayMinutes(recorded) + ' logged across ' + recordedDays +
    ' day(s) in the last seven local dates.';

  return [
    'I checked your saved MYELIN workflow as of ' + localDayKey(now) +
      '. This is a read-only analysis of recorded data—not a Qwen or Gemini-generated answer.',
    '', '**Your recorded workload:** ' + overview,
    '', '**What stands out:**',
    ...findings.slice(0, 5).map((item, i) => String(i + 1) + '. ' + item),
    '', '**First change I would make:** ' + firstStep,
    '', 'Limits: Unlogged study, incomplete estimates and commitments outside MYELIN may change the conclusion. Nothing was changed.',
  ].join('\n').slice(0, 3500);
}
