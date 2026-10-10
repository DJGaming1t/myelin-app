import type { WorkspaceState } from '@/src/data/schema';
import { sleepWindows } from '@/src/features/adaptive/sleep-engine';
import { addLocalDays, commitmentOccurrencesForDay, freeStudyWindows, localDayKey, scheduledWorkTasksForDay, startOfLocalDay, taskPlanningScoreEvidence } from '@/src/features/planning/day-engine';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';

export type PlanningIssueCode = 'estimate-met' | 'missing-estimate' | 'overdue' | 'past-slot' | 'after-deadline' | 'deadline-capacity' | 'short-slot' | 'commitment-overlap' | 'task-overlap' | 'sleep-overlap' | 'daily-overload';
export type PlanningIssue = {
  code: PlanningIssueCode;
  taskIds: string[];
  day: string;
  minutes?: number;
  message: string;
};
export type AssistantPlanningReview = {
  revision: number;
  reviewedAt: number;
  throughDate: string;
  issues: PlanningIssue[];
  openTasks: number;
  unknownEstimates: number;
  dueMistakes: number;
  dueMistakeTopics: string[];
  completedTasksExcluded: number;
};

const minutes = (start: number, end: number) => Math.max(0, Math.round((end - start) / 60000));
const overlapMinutes = (a: number, b: number, c: number, d: number) => minutes(Math.max(a, c), Math.min(b, d));
const label = (text: string) => text.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100);

function remainingDailyBudget(workspace: WorkspaceState, day: number) {
  const next = addLocalDays(day, 1);
  const recorded = workspace.history.filter(item => item.at >= day && item.at < next).reduce((sum, item) => sum + item.minutes, 0)
    + workspace.breaks.filter(item => item.at >= day && item.at < next).reduce((sum, item) => sum + item.minutes, 0)
    + (workspace.focusOutcomes ?? []).filter(item => item.taskOnly && item.status === 'finished' && item.endedAt >= day && item.endedAt < next).reduce((sum, item) => sum + item.minutes, 0);
  return Math.max(0, workspace.settings.dailyMinutes - recorded);
}

// An optimistic upper bound: excludes sleep/fixed commitments and respects the
// recorded daily budget, but does not reserve time for other pending work.
// Exceeding it establishes a problem; being below it does not establish a fit.
function capacityBeforeDeadline(workspace: WorkspaceState, now: number, availableFrom: number, deadline: number) {
  let capacity = 0;
  for (let day = startOfLocalDay(now); day < deadline; day = addLocalDays(day, 1)) {
    const windows = freeStudyWindows(workspace, day, { from: Math.max(now, availableFrom, day), minMinutes: 1, includeScheduledTasks: false });
    const clockCapacity = windows.reduce((sum, window) => sum + Math.max(0, Math.floor((Math.min(window.end, deadline) - window.start) / 60000)), 0);
    capacity += Math.min(clockCapacity, remainingDailyBudget(workspace, day));
  }
  return capacity;
}

// Uses the same local-calendar, recurrence, skip-date and sleep calculations as Day map.
// This is a read-only review. Unknown estimates are never replaced with guesses.
export function reviewAssistantPlanning(workspace: WorkspaceState, now = Date.now()): AssistantPlanningReview {
  const today = startOfLocalDay(now);
  const end = addLocalDays(today, 7);
  const open = workspace.tasks.filter(task => task.status === 'open');
  const issues: PlanningIssue[] = [];
  let unknownEstimates = 0;
  for (const task of open) {
    const scheduled = task.planState === 'scheduled' && task.scheduledStart > 0 && task.scheduledEnd > task.scheduledStart;
    const inHorizon = task.planState === 'today' || (task.dueAt > 0 && task.dueAt < end) ||
      (scheduled && task.scheduledStart < end && task.scheduledEnd > today);
    if (!inHorizon) continue;
    const name = label(task.title);
    const day = localDayKey(scheduled ? task.scheduledStart : task.dueAt || now);
    if (task.estimatedMinutes <= 0) {
      unknownEstimates++;
      issues.push({ code: 'missing-estimate', taskIds: [task.id], day,
        message: `“${name}” needs a duration estimate before I can judge whether all the work fits.` });
    }
    // Keep the saved slot visible, but don't label it as conflicting or
    // overbooking time when the known task estimate was already met.
    if (scheduled && task.estimatedMinutes > 0 && taskRemainingMinutes(task) <= 0) {
      issues.push({ code: 'estimate-met', taskIds: [task.id], day,
        message: `“${name}” still has a saved study slot, but its recorded work meets its estimate. The slot remains on Day map for review and does not reserve future study capacity. Mark complete or extend the estimate if more work is needed.` });
      continue;
    }
    if (task.dueAt > 0 && task.dueAt < now) issues.push({ code: 'overdue', taskIds: [task.id], day: localDayKey(task.dueAt),
      message: `“${name}” is still open after its recorded deadline (${localDayKey(task.dueAt)}). Check what remains.` });
    if (task.dueAt > now && task.dueAt < end && taskRemainingMinutes(task) > 0) {
      const capacity = capacityBeforeDeadline(workspace, now, task.postponedUntil, task.dueAt);
      const remaining = taskRemainingMinutes(task);
      if (remaining > capacity) issues.push({ code: 'deadline-capacity', taskIds: [task.id], day: localDayKey(task.dueAt), minutes: Math.ceil(remaining - capacity),
        message: `“${name}” needs ${remaining} min, but at most ${Math.floor(capacity)} min fits before its deadline using recorded free time and your daily budget. It is short by ${Math.ceil(remaining - capacity)} min even before allowing for other work or new breaks. Review scope or genuinely available time.` });
    }
    if (!scheduled) continue;
    if (task.scheduledEnd <= now) issues.push({ code: 'past-slot', taskIds: [task.id], day,
      message: `The planned time for “${name}” has passed, but it is still open. Check completion or choose a new time.` });
    if (task.dueAt > 0 && task.scheduledEnd > task.dueAt) {
      const late = minutes(task.dueAt, task.scheduledEnd);
      issues.push({ code: 'after-deadline', taskIds: [task.id], day, minutes: late,
        message: `“${name}” finishes ${late} min after its recorded deadline. Move the work before the deadline or review the deadline.` });
    }
    const shortage = taskRemainingMinutes(task) - minutes(task.scheduledStart, task.scheduledEnd);
    if (shortage > 0) issues.push({ code: 'short-slot', taskIds: [task.id], day, minutes: shortage,
      message: `“${name}” has ${shortage} min more estimated work than its scheduled block. You may need another block.` });
  }
  for (let offset = 0; offset < 7; offset++) {
    const day = addLocalDays(today, offset);
    const next = addLocalDays(day, 1);
    const from = offset === 0 ? now : day;
    const dayKey = localDayKey(day);
    const scheduled = open.filter(task => task.planState === 'scheduled' && task.scheduledStart > 0 &&
      task.scheduledEnd > task.scheduledStart && task.scheduledStart < next && task.scheduledEnd > from &&
      (task.estimatedMinutes <= 0 || taskRemainingMinutes(task) > 0))
      .sort((a, b) => a.scheduledStart - b.scheduledStart);
    const fixed = commitmentOccurrencesForDay(workspace.commitments, day);
    for (let i = 0; i < scheduled.length; i++) {
      const task = scheduled[i]!;
      const start = Math.max(from, task.scheduledStart);
      const finish = Math.min(next, task.scheduledEnd);
      for (const commitment of fixed) {
        const overlap = overlapMinutes(start, finish, commitment.start, commitment.end);
        if (overlap > 0) issues.push({ code: 'commitment-overlap', taskIds: [task.id], day: dayKey, minutes: overlap,
          message: `“${label(task.title)}” overlaps “${label(commitment.title)}” by ${overlap} min on ${dayKey}. Keep the fixed commitment and choose another study time.` });
      }
      const sleep = sleepWindows(workspace.settings, day).reduce((sum, window) => sum + overlapMinutes(start, finish, window.start, window.end), 0);
      if (sleep > 0) issues.push({ code: 'sleep-overlap', taskIds: [task.id], day: dayKey, minutes: sleep,
        message: `“${label(task.title)}” overlaps your sleep hours by ${sleep} min on ${dayKey}. Review the block rather than cutting sleep.` });
      for (let j = i + 1; j < scheduled.length; j++) {
        const other = scheduled[j]!;
        if (other.scheduledStart >= finish) break;
        const overlap = overlapMinutes(start, finish, Math.max(from, other.scheduledStart), Math.min(next, other.scheduledEnd));
        if (overlap > 0) issues.push({ code: 'task-overlap', taskIds: [task.id, other.id], day: dayKey, minutes: overlap,
          message: `“${label(task.title)}” and “${label(other.title)}” overlap by ${overlap} min on ${dayKey}. These need separate time.` });
      }
    }
    const unscheduledToday = offset === 0 ? open.filter(task => task.planState === 'today' && task.postponedUntil <= now) : [];
    const scheduledMinutes = scheduled.reduce((sum, task) => sum + overlapMinutes(from, next, task.scheduledStart, task.scheduledEnd), 0);
    const required = scheduledMinutes + unscheduledToday.reduce((sum, task) => sum + taskRemainingMinutes(task), 0);
    const clockCapacity = freeStudyWindows(workspace, day, { from, minMinutes: 1, includeScheduledTasks: false })
      .reduce((sum, window) => sum + window.minutes, 0);
    const capacity = Math.min(clockCapacity, remainingDailyBudget(workspace, day));
    const knownBlocks = scheduled.length + unscheduledToday.filter(task => taskRemainingMinutes(task) > 0).length;
    const breakReserve = Math.max(0, knownBlocks - 1) * workspace.settings.breakMinutes;
    if (required + breakReserve > capacity) {
      const shortfall = Math.ceil(required + breakReserve - capacity);
      issues.push({ code: 'daily-overload', taskIds: [...scheduled, ...unscheduledToday].map(task => task.id), day: dayKey, minutes: shortfall,
        message: `${dayKey}: ${Math.round(required)} min of planned work + ${breakReserve} min between-block breaks exceeds ${Math.floor(capacity)} min of remaining capacity by ${shortfall} min. Move lower-priority work, reduce scope, or review your availability. Additional work without an estimate is not counted.` });
    }
  }
  const dueMistakes = workspace.mistakes.filter(item => item.resolvedAt === 0 && item.dueAt <= now);
  const dueMistakeTopics = [...new Set(dueMistakes.map(item => workspace.topics.find(topic => topic.id === item.topicId)?.name).filter((name): name is string => Boolean(name)))];
  return { revision: workspace.revision, reviewedAt: now, throughDate: localDayKey(addLocalDays(today, 6)), issues,
    openTasks: open.length, unknownEstimates, dueMistakes: dueMistakes.length, dueMistakeTopics,
    completedTasksExcluded: workspace.tasks.length - open.length };
}

// A specific question about a SAVED task can use the same conservative bound
// as Review my plan. This is not a general chatbot, schedule optimizer, or
// proof that all pending tasks can be completed together.
export function tryAssistantTaskDeadlineReply(request: string, workspace: WorkspaceState, now = Date.now()): string | null {
  if (request.length > 300) return null;
  const clean = request.trim().replace(/[?!]+$/, '').replace(/\s+/g, ' ');
  const match = /^(?:can i finish|can i complete|will i finish) (?:my )?(.{1,160}?) (?:before|by) (?:its|the) (?:deadline|due date)$/i.exec(clean);
  if (!match) return null;

  const name = match[1]!.trim().replace(/^["“”']|["“”']$/g, '').trim();
  const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const matches = workspace.tasks.filter(task => normalized(task.title) === normalized(name));
  const endNote = 'This is a read-only check of recorded MYELIN data. Nothing was changed.';
  const shown = label(name);
  if (!shown) return null;
  if (!matches.length) return `I couldn't find a recorded task named “${shown}”. Use its exact title from Today or your tasks. ${endNote}`;
  if (matches.length > 1) return `More than one task is named “${shown}”. I cannot safely choose one. Give the tasks distinct titles first. ${endNote}`;

  const task = matches[0]!;
  const taskName = label(task.title);
  if (task.status === 'completed') return `“${taskName}” is already marked completed in MYELIN. ${endNote}`;
  if (!task.dueAt) return `“${taskName}” has no recorded deadline. Set one to check whether its work could fit before it. ${endNote}`;
  if (task.dueAt <= now) return `“${taskName}” is still open and its recorded deadline (${localDayKey(task.dueAt)}) has passed. I cannot count time after that deadline as available. ${endNote}`;
  if (task.estimatedMinutes <= 0) return `“${taskName}” has no estimated duration. Add an estimate before I can compare the remaining work against recorded free time. ${endNote}`;
  const remaining = taskRemainingMinutes(task);
  if (remaining <= 0) return `“${taskName}” has no estimated minutes remaining but is still open. Check its completion status or estimate. ${endNote}`;

  // Keep checks bounded to the same seven-local-date horizon as Review my plan.
  const horizonEnd = addLocalDays(startOfLocalDay(now), 7);
  if (task.dueAt > horizonEnd) return `“${taskName}” has ${remaining} estimated minutes remaining, but its deadline is beyond the next seven local dates. Review the task closer to its deadline; I cannot judge its full available time from this short check. ${endNote}`;

  const upperBound = Math.floor(capacityBeforeDeadline(workspace, now, task.postponedUntil, task.dueAt));
  const shortage = Math.max(0, remaining - upperBound);
  const verdict = shortage > 0
    ? `It cannot fit within the recorded upper bound: at least ${shortage} min short even before other tasks or new breaks.`
    : `The individual upper bound is enough, so it might fit, but this does NOT guarantee a workable plan: other tasks, breaks and unrecorded commitments can use that time.`;
  const related = reviewAssistantPlanning(workspace, now).issues.filter(issue =>
    issue.taskIds.includes(task.id) &&
    ['after-deadline', 'commitment-overlap', 'sleep-overlap', 'task-overlap', 'short-slot'].includes(issue.code));
  const warnings = related.length ? `\n\nOther recorded conflicts: ${related.slice(0, 2).map(issue => issue.message).join(' ')}${related.length > 2 ? ` (${related.length - 2} additional checks in Review my plan.)` : ''}` : '';
  return `“${taskName}” has ${remaining} estimated min left before its recorded deadline (${localDayKey(task.dueAt)}). MYELIN estimates at most ${upperBound} min of individually usable time before then, after fixed commitments, sleep and your remaining daily study budget. ${verdict}${warnings}\n\n${endNote}`;
}

// Read-only first-step suggestion using the same priority and calendar engine
// as Today/Day map. No new scheduling, invisible model, or guaranteed completion.
export function tryAssistantNextTaskReply(request: string, workspace: WorkspaceState, now = Date.now()): string | null {
  const text = request.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  if (!/^(?:what should i (?:study|start|do|work on) next|what (?:task|work) should i (?:start|do) next|which task should i (?:start|do) (?:now|next)|what should i focus on (?:now|next)|suggest (?:my )?next (?:study )?task)$/.test(text)) return null;

  const today = startOfLocalDay(now);
  const nextDay = addLocalDays(today, 1);
  const note = 'This is a read-only next step from recorded data, not a guarantee that all work fits. Nothing was changed.';
  const nameOf = (task: WorkspaceState['tasks'][number]) => '“' + label(task.title) + '”';
  const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dueLabel = (task: WorkspaceState['tasks'][number]) =>
    task.dueAt > 0 ? (task.dueAt < now ? 'Its recorded deadline has passed' :
      task.dueAt < nextDay ? 'It is due today' :
      task.dueAt < addLocalDays(today, 2) ? 'It is due tomorrow' : 'A future deadline is recorded') :
      'No deadline is recorded';
  // The same factors used for sorting appear in the explanation: never
  // manufacture a separate notion of urgency, or call a score a probability.
  const evidence = (task: WorkspaceState['tasks'][number]) => taskPlanningScoreEvidence(workspace, task, now);
  const evidenceLabel = (task: WorkspaceState['tasks'][number]) => {
    const { factors, score, examDays } = evidence(task);
    const parts = [
      'saved priority +' + factors.priority,
      factors.today ? 'marked for Today +' + factors.today : '',
      factors.scheduled ? 'scheduled +' + factors.scheduled : '',
      factors.deadline ? 'deadline urgency +' + factors.deadline : '',
      factors.exam ? 'linked exam +' + factors.exam +
        (examDays !== null && examDays < 0 ? ' (the linked exam date has passed; review it)' : '') : '',
      factors.postponement ? 'past postponements +' + factors.postponement : '',
    ].filter(Boolean);
    return score + ' points (' + parts.join(', ') + ')';
  };
  const open = workspace.tasks.filter(task => task.status === 'open');
  if (!open.length) return 'You have no open MYELIN tasks. Add work in Today first. ' + note;

  const budget = Math.max(0, Math.floor(remainingDailyBudget(workspace, today)));
  if (budget < 5)
    return 'Your recorded daily study budget has fewer than five minutes left. I will not suggest extra study beyond that setting. ' + note;

  // Current planned session outranks an inbox suggestion. Never recommend
  // studying over recorded school, sleep, or another active scheduled task.
  const active = open.filter(task => task.planState === 'scheduled' && task.postponedUntil <= now &&
    task.scheduledStart <= now && task.scheduledEnd > now &&
    (task.estimatedMinutes <= 0 || taskRemainingMinutes(task) > 0));
  if (active.length > 1) return 'Several saved study blocks overlap now. Resolve them in Day map before starting. ' + note;
  if (active.length === 1) {
    const task = active[0]!;
    const safe = freeStudyWindows(workspace, today, { from: now, minMinutes: 1, includeScheduledTasks: false })
      .find(window => window.start <= now && window.end > now);
    if (!safe) return nameOf(task) + ' is scheduled now but conflicts with sleep or a fixed commitment. Check Day map. ' + note;
    const remaining = taskRemainingMinutes(task);
    if (task.estimatedMinutes <= 0 || remaining <= 0)
      return nameOf(task) + ' is scheduled now but its remaining estimate needs review. Check completion or duration. ' + note;
    const end = Math.min(task.scheduledEnd, safe.end,
      task.dueAt > now ? task.dueAt : Number.POSITIVE_INFINITY);
    const block = Math.min(Math.max(5, workspace.settings.focusMinutes), remaining,
      budget, Math.floor((end - now) / 60000));
    if (block < 5) return 'Fewer than five safe minutes remain in the current block for ' + nameOf(task) + '. Review Day map. ' + note;
    return nameOf(task) + ' is already scheduled now. Start a ' + block +
      '-minute Focus session. ' + dueLabel(task) +
      '. This block may only complete part of the task.\n\n' + note;
  }

  // Future scheduled study must retain its protected daily budget.
  const reserved = scheduledWorkTasksForDay(workspace.tasks, today)
    .reduce((sum, task) => sum + Math.max(0,
      Math.floor((Math.min(nextDay, task.scheduledEnd) - Math.max(now, task.scheduledStart)) / 60000)), 0);
  const spareBudget = Math.max(0, budget - reserved);
  if (spareBudget < 5)
    return 'Your upcoming recorded study blocks already use the remaining daily budget. Keep those blocks or review Today. ' + note;

  const candidates = open.filter(task =>
    task.planState !== 'scheduled' && task.postponedUntil <= now &&
    task.estimatedMinutes > 0 && taskRemainingMinutes(task) > 0)
    .sort((a, b) => evidence(b).score - evidence(a).score ||
      (a.dueAt || Number.POSITIVE_INFINITY) - (b.dueAt || Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const windows = freeStudyWindows(workspace, today, { from: now, minMinutes: 5 });
  for (const window of windows) {
    const capacity = Math.min(spareBudget, window.minutes);
    if (capacity < 5) break;
    for (const [index, task] of candidates.entries()) {
      const beforeDeadline = Math.floor((Math.min(window.end,
        task.dueAt > now ? task.dueAt : Number.POSITIVE_INFINITY) - window.start) / 60000);
      const block = Math.min(Math.max(5, workspace.settings.focusMinutes),
        taskRemainingMinutes(task), capacity, beforeDeadline);
      if (block < 5) continue;
      const start = window.start <= now ? 'A recorded free study window is available now' :
        'The next suitable recorded study window begins at ' + clock(window.start);
      // Compare only with an alternative that could fit in this SAME window.
      // Ranking scores alone do not make an unavailable task a usable option.
      const nextEligible = candidates.slice(index + 1).find(other =>
        Math.floor((Math.min(window.end,
          other.dueAt > now ? other.dueAt : Number.POSITIVE_INFINITY) - window.start) / 60000) >= 5 &&
        taskRemainingMinutes(other) >= 5);
      const selectedEvidence = evidence(task);
      const alternativeEvidence = nextEligible ? evidence(nextEligible) : null;
      const comparison = nextEligible && alternativeEvidence
        ? ' Next eligible alternative: ' + nameOf(nextEligible) + ' — ' +
          evidenceLabel(nextEligible) + '. ' +
          (selectedEvidence.score > alternativeEvidence.score
            ? 'This task has the higher total planning weight.'
            : 'The totals tie; MYELIN uses the earlier recorded due date and then a stable title order.')
        : ' No other eligible task fits a five-minute start in the same window.';
      const skipped = index > 0
        ? ' ' + index + ' higher-ranked ' + (index === 1 ? 'task was' : 'tasks were') +
          ' passed over because a five-minute start did not fit before its deadline in this window.'
        : '';
      return start + '. Try ' + nameOf(task) + ' for a ' + block + '-minute Focus block. ' +
        dueLabel(task) + '. Why this task: MYELIN score ' + evidenceLabel(task) + '.' +
        comparison + skipped +
        ' This is a useful first step, not a promise the whole task fits today.\n\n' + note;
    }
  }
  const scheduled = open.filter(task => task.planState === 'scheduled' && task.scheduledStart > now &&
    (task.estimatedMinutes <= 0 || taskRemainingMinutes(task) > 0))
    .sort((a, b) => a.scheduledStart - b.scheduledStart)[0];
  if (scheduled && !candidates.length)
    return 'Your next recorded scheduled task is ' + nameOf(scheduled) + ' at ' + clock(scheduled.scheduledStart) +
      '. Nothing was started or moved. ' + note;
  if (!candidates.length) {
    const staleSlot = open.find(task => task.planState === 'scheduled' &&
      task.estimatedMinutes > 0 && taskRemainingMinutes(task) <= 0);
    if (staleSlot) return nameOf(staleSlot) +
      ' has a saved study slot, but its recorded time already meets the estimate. The slot remains visible on Day map and does not reserve study time. Review completion or extend the estimate. ' + note;
    return 'No eligible unscheduled task has a known remaining estimate right now. Review missing estimates, postponements and scheduled tasks in Today. ' + note;
  }
  return 'No safe five-minute window for the eligible tasks remains in today’s recorded free time before their deadlines. Check Day map rather than forcing study through commitments. ' + note;
}

export function planningReviewReply(review: AssistantPlanningReview): string {
  const intro = `I checked your recorded tasks and schedule for today through ${review.throughDate}.`;
  const visible = review.issues.slice(0, 6);
  const findings = visible.length ? visible.map((issue, index) => `${index + 1}. ${issue.message}`).join('\n\n') :
    'I found no deadline, overlap, missing-estimate or daily-capacity issue in the recorded tasks I checked. Unrecorded commitments and remaining work may still affect the plan.';
  const more = review.issues.length > visible.length ? `\n\nThere are ${review.issues.length - visible.length} more checks to review in your tasks and Day map.` : '';
  const mistakes = review.dueMistakes ? `\n\n${review.dueMistakes} saved ${review.dueMistakes === 1 ? 'mistake is' : 'mistakes are'} due for review${review.dueMistakeTopics.length ? ` (${review.dueMistakeTopics.slice(0, 3).map(label).join(', ')})` : ''}. Open Review to revisit them.` : '';
  return `${intro}\n\n${findings}${more}${mistakes}\n\nThis is a check of your recorded plan, not a guarantee. Nothing was changed.`;
}

export function tryAssistantPlanningReply(request: string, workspace: WorkspaceState, now = Date.now()): string | null {
  const text = request.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  if (!/^(?:(?:please )?(?:review|check|analyse|analyze) (?:my |the )?(?:study )?(?:plan|planning|schedule|timetable)|(?:find|spot) (?:basic )?(?:mistakes|problems|conflicts) (?:in|with) (?:my |the )?(?:plan|schedule)|does my (?:plan|schedule) fit|what(?:'s| is) wrong with my (?:plan|schedule))$/.test(text)) return null;
  return planningReviewReply(reviewAssistantPlanning(workspace, now));
}

// Grounding for a future conversational phone model: no full notes, answers,
// sessions or guessed availability; limits are explicit rather than hidden.
export function planningModelContext(review: AssistantPlanningReview) {
  return JSON.stringify({ type: 'MYELIN_CALCULATED_PLAN_REVIEW', revision: review.revision,
    date: localDayKey(review.reviewedAt), throughDate: review.throughDate,
    openTasks: review.openTasks, unknownEstimates: review.unknownEstimates,
    dueMistakes: review.dueMistakes, checks: review.issues.slice(0, 8).map(issue => ({
      code: issue.code, day: issue.day, minutes: issue.minutes, description: issue.message,
    })), omittedChecks: Math.max(0, review.issues.length - 8),
    limits: 'Recorded data only; unknown estimates excluded; cannot change anything from this review.' });
}
