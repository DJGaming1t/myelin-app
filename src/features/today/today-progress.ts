import { StudyTask, WorkspaceState } from '@/src/data/schema';
import {
  addLocalDays,
  localDayKey,
  startOfLocalDay,
  taskPlanningScore,
} from '@/src/features/planning/day-engine';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';
import { nextLocalDayStart, TodayPlan } from './planner';

export type TaskProgressItem = {
  id: string;
  completed: boolean;
};

export type TodayProgressSummary = {
  tasks: StudyTask[];
  total: number;
  done: number;
  incomplete: number;
  ratio: number;
  percent: number;
};

export type DayMapStep = {
  id: string;
  kind: 'task' | 'topic';
  taskId: string | null;
  topicId: string | null;
  title: string;
  subject: string;
  minutes: number;
  completed: boolean;
  current: boolean;
  overdue?: boolean;
  scheduledStart: number;
  scheduledEnd: number;
  mode: 'study' | 'review';
};

export type DayMapStepsSummary = {
  steps: DayMapStep[];
  previewSteps: DayMapStep[];
  totalSteps: number;
  completedSteps: number;
  remainingSteps: number;
  nextStep: DayMapStep | null;
};

/**
 * Pure progress calculation for any list of completion items.
 * Empty days return 0% (never 100%).
 */
export function taskProgress(tasks: readonly TaskProgressItem[]) {
  const seen = new Set<string>();
  const unique: TaskProgressItem[] = [];
  for (const item of tasks) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  const total = unique.length;
  const done = unique.filter((t) => Boolean(t.completed)).length;
  const incomplete = total - done;
  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, done / total));
  return {
    total,
    done,
    incomplete,
    ratio,
    percent: Math.round(ratio * 100),
  };
}

export const toDialAngle = (ratio: number) =>
  Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 360;

export const isBrickDone = (step: { completed: boolean }) =>
  Boolean(step.completed);

function overlapsLocalDay(
  start: number,
  end: number,
  dayStart: number,
  dayEnd: number,
) {
  if (start <= 0) return false;
  if (end > start) {
    return start < dayEnd && end > dayStart;
  }
  return start >= dayStart && start < dayEnd;
}

/**
 * Selects the authoritative, deduplicated list of tasks belonging to Today:
 * - Open tasks with planState === 'today' and postponedUntil <= now
 * - Open scheduled tasks whose [scheduledStart, scheduledEnd] overlaps today's local day
 *   (including tasks crossing midnight into today or starting tonight and crossing midnight into tomorrow)
 * - Completed tasks that were completed during today's local day [dayStart, dayEnd)
 *   (or completed today-state tasks updated today if completedAt was 0)
 * - Postponed tasks (planState === 'postponed' or postponedUntil > now) and future/past
 *   scheduled tasks are excluded.
 */
export function selectTodayTasks(
  workspace: WorkspaceState,
  now = Date.now(),
  recommendedTaskId: string | null = null,
): StudyTask[] {
  const dayStart = startOfLocalDay(now);
  const dayEnd = nextLocalDayStart(now);
  const seenIds = new Set<string>();
  const result: StudyTask[] = [];

  for (const task of workspace.tasks) {
    if (!task || !task.id || seenIds.has(task.id)) continue;

    if (task.status === 'completed') {
      const completedToday =
        task.completedAt > 0
          ? task.completedAt >= dayStart && task.completedAt < dayEnd
          : task.planState === 'today' &&
            task.updatedAt >= dayStart &&
            task.updatedAt < dayEnd;
      if (completedToday) {
        seenIds.add(task.id);
        result.push(task);
      }
      continue;
    }

    // Open task rules
    if (task.planState === 'postponed' || task.postponedUntil > now) {
      continue;
    }

    // A flexible inbox task recommended by today's planner is part of this view.
    if (task.id === recommendedTaskId && task.planState === 'inbox') {
      seenIds.add(task.id);
      result.push(task);
      continue;
    }

    if (task.planState === 'today') {
      seenIds.add(task.id);
      result.push(task);
      continue;
    }

    if (
      task.planState === 'scheduled' &&
      overlapsLocalDay(task.scheduledStart, task.scheduledEnd, dayStart, dayEnd)
    ) {
      seenIds.add(task.id);
      result.push(task);
    }
  }

  return result;
}

/**
 * Single source of truth for Today's task completion progress.
 */
export function computeTodayProgress(
  workspace: WorkspaceState,
  now = Date.now(),
  recommendedTaskId: string | null = null,
): TodayProgressSummary {
  const tasks = selectTodayTasks(workspace, now, recommendedTaskId);
  const items: TaskProgressItem[] = tasks.map((task) => ({
    id: task.id,
    completed: task.status === 'completed',
  }));
  const summary = taskProgress(items);
  return {
    tasks,
    ...summary,
  };
}

/**
 * Computes strictly COMPLETED focused study minutes for a given local day [dayStart, dayEnd),
 * reconciling workspace.history, task.focusMinutesForDay, and workspace.focusOutcomes
 * so that:
 * 1. Planned focus minutes, break logs, and 'started'/'abandoned' outcomes are NEVER counted.
 * 2. Sessions recorded in both workspace.history and workspace.focusOutcomes (via session_<id>)
 *    are never double-counted.
 * 3. Standalone task focus sessions recorded in both task.focusMinutesForDay (with lastFocusSessionId)
 *    and workspace.focusOutcomes (taskOnly: true) are never double-counted.
 * 4. Study sessions with overlapping wall-clock [startedAt, endedAt] intervals are merged
 *    so overlapped minutes are never counted twice.
 */
export function computeCompletedFocusMinutesForDay(
  workspace: WorkspaceState,
  dayTimestamp: number,
  upToTimestamp = Number.POSITIVE_INFINITY,
): number {
  const dayStart = startOfLocalDay(dayTimestamp);
  const dayEnd = addLocalDays(dayStart, 1);
  const cutoff = Math.min(dayEnd, upToTimestamp);
  if (cutoff <= dayStart) return 0;

  const dayKey = localDayKey(dayStart);
  const seenHistoryIds = new Set<string>();
  const sessionMinutesById = new Map<string, number>();
  const topicMinutesFromHistory = new Map<string, number>();

  const timedIntervals: Array<{ start: number; end: number; minutes: number }> = [];
  let untimedHistoryMinutes = 0;

  for (const entry of workspace.history) {
    if (!entry || entry.kind !== 'study') continue;
    if (entry.at < dayStart || entry.at > upToTimestamp || entry.at >= dayEnd) continue;
    if (entry.minutes <= 0) continue;
    if (entry.id && seenHistoryIds.has(entry.id)) continue;
    if (entry.id) seenHistoryIds.add(entry.id);

    const rawFocusId = entry.id ? entry.id.replace(/^session_/, '') : '';
    if (entry.id) sessionMinutesById.set(entry.id, entry.minutes);
    if (rawFocusId) sessionMinutesById.set(rawFocusId, entry.minutes);

    if (entry.topicId) {
      topicMinutesFromHistory.set(
        entry.topicId,
        (topicMinutesFromHistory.get(entry.topicId) ?? 0) + entry.minutes,
      );
    }

    if (
      typeof entry.startedAt === 'number' &&
      typeof entry.endedAt === 'number' &&
      entry.endedAt > entry.startedAt
    ) {
      const clampedStart = Math.max(dayStart, entry.startedAt);
      const clampedEnd = Math.min(cutoff, entry.endedAt);
      if (clampedEnd > clampedStart) {
        timedIntervals.push({
          start: clampedStart,
          end: clampedEnd,
          minutes: entry.minutes,
        });
      } else {
        untimedHistoryMinutes += entry.minutes;
      }
    } else {
      untimedHistoryMinutes += entry.minutes;
    }
  }

  // Reconcile timed history intervals so overlapping wall-clock ranges do not double-count
  let timedHistoryMinutes = 0;
  if (timedIntervals.length === 1) {
    timedHistoryMinutes = timedIntervals[0]!.minutes;
  } else if (timedIntervals.length > 1) {
    const sorted = [...timedIntervals].sort((a, b) => a.start - b.start || a.end - b.end);
    let currentStart = sorted[0]!.start;
    let currentEnd = sorted[0]!.end;
    let currentLoggedSum = sorted[0]!.minutes;
    let hasOverlapInGroup = false;

    for (let i = 1; i < sorted.length; i += 1) {
      const item = sorted[i]!;
      if (item.start < currentEnd) {
        hasOverlapInGroup = true;
        currentEnd = Math.max(currentEnd, item.end);
        currentLoggedSum += item.minutes;
      } else {
        timedHistoryMinutes += hasOverlapInGroup
          ? Math.min(currentLoggedSum, Math.round((currentEnd - currentStart) / 60000))
          : currentLoggedSum;
        currentStart = item.start;
        currentEnd = item.end;
        currentLoggedSum = item.minutes;
        hasOverlapInGroup = false;
      }
    }
    timedHistoryMinutes += hasOverlapInGroup
      ? Math.min(currentLoggedSum, Math.round((currentEnd - currentStart) / 60000))
      : currentLoggedSum;
  }

  let totalMinutes = timedHistoryMinutes + untimedHistoryMinutes;
  let standaloneTaskMinutesFromTasks = 0;
  const seenTaskIds = new Set<string>();

  for (const task of workspace.tasks) {
    if (!task || !task.id || seenTaskIds.has(task.id)) continue;
    seenTaskIds.add(task.id);
    if (task.focusDayKey !== dayKey) continue;
    const rawTaskFocus = Math.max(0, Math.round(task.focusMinutesForDay ?? 0));
    if (rawTaskFocus <= 0) continue;

    let duplicateMinutes = 0;
    if (task.lastFocusSessionId && sessionMinutesById.has(task.lastFocusSessionId)) {
      duplicateMinutes = sessionMinutesById.get(task.lastFocusSessionId) ?? 0;
    } else if (task.topicId && topicMinutesFromHistory.has(task.topicId)) {
      duplicateMinutes = Math.min(
        rawTaskFocus,
        topicMinutesFromHistory.get(task.topicId) ?? 0,
      );
    }

    const netTaskMinutes = Math.max(0, rawTaskFocus - duplicateMinutes);
    standaloneTaskMinutesFromTasks += netTaskMinutes;

    if (task.lastFocusSessionId) {
      sessionMinutesById.set(
        task.lastFocusSessionId,
        Math.max(sessionMinutesById.get(task.lastFocusSessionId) ?? 0, rawTaskFocus),
      );
    }
  }

  totalMinutes += standaloneTaskMinutesFromTasks;

  // Check focusOutcomes for any finished standalone sessions not already represented in tasks or history
  let unaccountedStandaloneTotal = standaloneTaskMinutesFromTasks;
  for (const outcome of workspace.focusOutcomes ?? []) {
    if (!outcome || outcome.status !== 'finished' || outcome.minutes <= 0) continue;
    if (outcome.endedAt < dayStart || outcome.endedAt > upToTimestamp || outcome.endedAt >= dayEnd) {
      continue;
    }
    if (outcome.id && sessionMinutesById.has(outcome.id)) {
      continue;
    }
    if (!outcome.taskOnly) {
      continue;
    }
    // If a standalone task had focusMinutesForDay set without lastFocusSessionId, avoid double counting
    if (unaccountedStandaloneTotal >= outcome.minutes) {
      unaccountedStandaloneTotal -= outcome.minutes;
      if (outcome.id) sessionMinutesById.set(outcome.id, outcome.minutes);
      continue;
    }
    const extra = outcome.minutes - unaccountedStandaloneTotal;
    unaccountedStandaloneTotal = 0;
    totalMinutes += extra;
    if (outcome.id) sessionMinutesById.set(outcome.id, outcome.minutes);
  }

  return Math.max(0, Math.round(totalMinutes));
}

/**
 * Authoritative completed focus time for Today (never includes planned minutes or breaks).
 */
export function computeCompletedFocusMinutesToday(
  workspace: WorkspaceState,
  now = Date.now(),
): number {
  return computeCompletedFocusMinutesForDay(workspace, now, now);
}

/**
 * Formats a minute duration cleanly for the Today hero pill (e.g., "0m", "45m", "2h 10m").
 */
export function formatCompletedFocusDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

/**
 * Computes the user's consecutive active study streak in local calendar days.
 * - A local day is active if completed focus/study or graded review minutes > 0.
 * - If today already has > 0 minutes, counts today + consecutive active days before today.
 * - If today has 0 minutes so far, preserves an active streak ending yesterday.
 */
export function computeStudyStreakDays(
  workspace: WorkspaceState,
  now = Date.now(),
  maxLookbackDays = 365,
): number {
  const todayStart = startOfLocalDay(now);

  function isDayActive(dayOffset: number): boolean {
    const day = addLocalDays(todayStart, -dayOffset);
    const dayEnd = addLocalDays(day, 1);
    const upTo = dayOffset === 0 ? now : dayEnd;
    if (computeCompletedFocusMinutesForDay(workspace, day, upTo) > 0) {
      return true;
    }
    // Also check graded review sessions on that local day
    return workspace.history.some(
      (entry) =>
        entry.kind === 'review' &&
        entry.grade > 0 &&
        entry.minutes > 0 &&
        entry.at >= day &&
        entry.at < Math.min(dayEnd, upTo + 1),
    );
  }

  let streak = 0;
  const todayActive = isDayActive(0);
  const startOffset = todayActive ? 0 : 1;

  for (let offset = startOffset; offset < maxLookbackDays; offset += 1) {
    if (isDayActive(offset)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Builds the ordered Day Map steps from real workspace tasks (supporting 0, 1, or N tasks).
 * - Retains EVERY real today task in `steps`.
 * - Provides `previewSteps` (bounded to `previewLimit`, default 5) for compact arc rendering.
 * - Places completed steps first (ordered by completedAt) followed by incomplete steps
 *   (with the active `nextBlock` task first, then scheduled tasks by start time, then by planning score),
 *   marking the first incomplete step as `current: true`.
 */
export function buildDayMapSteps(
  workspace: WorkspaceState,
  now = Date.now(),
  plan: TodayPlan | null = null,
  options: { previewLimit?: number; includeTopicBlocksWhenNoTasks?: boolean } = {},
): DayMapStepsSummary {
  const previewLimit = Math.max(1, options.previewLimit ?? 5);
  const todayTasks = selectTodayTasks(workspace, now, plan?.nextBlock?.taskId ?? null);
  const dayStart = startOfLocalDay(now);
  const dayEnd = nextLocalDayStart(now);

  if (todayTasks.length === 0 && options.includeTopicBlocksWhenNoTasks && plan?.blocks.length) {
    const steps: DayMapStep[] = plan.blocks.map((block, index) => ({
      id: `step:${block.id}`,
      kind: block.source,
      taskId: block.taskId,
      topicId: block.topicId,
      title: block.topicName,
      subject: block.subject,
      minutes: block.minutes,
      completed: false,
      current: index === 0,
      scheduledStart: 0,
      scheduledEnd: 0,
      mode: block.mode,
    }));
    return {
      steps,
      previewSteps: steps.slice(0, previewLimit),
      totalSteps: steps.length,
      completedSteps: 0,
      remainingSteps: steps.length,
      nextStep: steps[0] ?? null,
    };
  }

  const completedTasks = todayTasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => (a.completedAt || a.updatedAt) - (b.completedAt || b.updatedAt));

  const nextTaskId = plan?.nextBlock?.taskId ?? null;
  const openTasks = todayTasks
    .filter((task) => task.status === 'open')
    .sort((a, b) => {
      if (nextTaskId) {
        if (a.id === nextTaskId && b.id !== nextTaskId) return -1;
        if (b.id === nextTaskId && a.id !== nextTaskId) return 1;
      }
      const aScheduled = a.planState === 'scheduled' && a.scheduledStart > 0;
      const bScheduled = b.planState === 'scheduled' && b.scheduledStart > 0;
      if (aScheduled && bScheduled && a.scheduledStart !== b.scheduledStart) {
        return a.scheduledStart - b.scheduledStart;
      }
      if (aScheduled !== bScheduled) {
        return aScheduled ? -1 : 1;
      }
      const scoreDiff =
        taskPlanningScore(workspace, b, now) - taskPlanningScore(workspace, a, now);
      if (scoreDiff !== 0) return scoreDiff;
      return a.createdAt - b.createdAt;
    });

  const orderedTasks = [...completedTasks, ...openTasks];
  const firstOpenId = openTasks[0]?.id ?? null;

  const steps: DayMapStep[] = orderedTasks.map((task) => {
    const isCompleted = task.status === 'completed';
    const isCurrent = !isCompleted && task.id === firstOpenId;
    const duration =
      taskRemainingMinutes(task) ||
      task.estimatedMinutes ||
      (task.scheduledEnd > task.scheduledStart
        ? Math.max(5, Math.round((Math.min(dayEnd, task.scheduledEnd) - Math.max(dayStart, task.scheduledStart)) / 60000))
        : 25);

    return {
      id: `task:${task.id}`,
      kind: 'task',
      taskId: task.id,
      topicId: task.topicId,
      title: task.title,
      subject: task.subject || task.type,
      minutes: duration,
      completed: isCompleted,
      current: isCurrent,
      overdue: !isCompleted && task.dueAt > 0 && task.dueAt < now,
      scheduledStart: task.scheduledStart > 0 ? Math.max(dayStart, task.scheduledStart) : 0,
      scheduledEnd: task.scheduledEnd > 0 ? Math.min(dayEnd, task.scheduledEnd) : 0,
      mode: task.type === 'revision' ? 'review' : 'study',
    };
  });

  const nextStep = steps.find((step) => step.current) ?? null;

  return {
    steps,
    previewSteps: steps.slice(0, previewLimit),
    totalSteps: steps.length,
    completedSteps: completedTasks.length,
    remainingSteps: openTasks.length,
    nextStep,
  };
}
