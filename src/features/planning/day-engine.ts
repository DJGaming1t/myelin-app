import { Commitment, StudyTask, WorkspaceState } from '@/src/data/schema';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import { taskRemainingMinutes } from './task-engine';

export type DayWindow = { start: number; end: number; minutes: number };
export type DayMapEntry =
  | { id: string; kind: 'commitment'; start: number; end: number; title: string; label: string }
  | { id: string; kind: 'task'; start: number; end: number; title: string; label: string; taskId: string; missed: boolean };

export type TaskSlot = { start: number; end: number; minutes: number };
export type RebuildMove = { taskId: string; fromStart: number; start: number; end: number };

export function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function addLocalDays(timestamp: number, days: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

function localAtMinutes(day: number, minutes: number) {
  const d = new Date(day);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  ).getTime();
}

function localAt(day: number, source: number) {
  const d = new Date(day);
  const s = new Date(source);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    s.getHours(),
    s.getMinutes(),
    0,
    0,
  ).getTime();
}

function calendarDayDistance(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - aUtc) / 86400000);
}

function overlaps(start: number, end: number, rangeStart: number, rangeEnd: number) {
  return start < rangeEnd && end > rangeStart;
}

export function commitmentOccurrencesForDay(
  commitments: Commitment[],
  dayTimestamp: number,
): Array<{ id: string; title: string; kind: Commitment['kind']; start: number; end: number }> {
  const day = startOfLocalDay(dayTimestamp);
  const next = addLocalDays(day, 1);
  const weekday = new Date(day).getDay();
  const previousDay = addLocalDays(day, -1);
  const previousWeekday = new Date(previousDay).getDay();

  return commitments.flatMap((item) => {
    if (item.recurrenceDays.length) {
      const occurrences: Array<{
        id: string;
        title: string;
        kind: Commitment['kind'];
        start: number;
        end: number;
      }> = [];

      if (item.recurrenceDays.includes(weekday)) {
        const rawStart = localAtMinutes(day, item.startMinutes);
        let rawEnd = localAtMinutes(day, item.endMinutes);
        if (rawEnd <= rawStart) {
          rawEnd = localAtMinutes(addLocalDays(day, 1), item.endMinutes);
        }
        if (overlaps(rawStart, rawEnd, day, next)) {
          occurrences.push({
            id: item.id,
            title: item.title,
            kind: item.kind,
            start: Math.max(day, rawStart),
            end: Math.min(next, rawEnd),
          });
        }
      }

      // Recurring commitments that started yesterday and cross midnight must
      // still block the early hours of the current day.
      if (item.recurrenceDays.includes(previousWeekday)) {
        const previousStart = localAtMinutes(previousDay, item.startMinutes);
        let previousEnd = localAtMinutes(previousDay, item.endMinutes);
        if (previousEnd <= previousStart) {
          previousEnd = localAtMinutes(day, item.endMinutes);
        }
        if (previousEnd > day) {
          occurrences.push({
            id: item.id + ':carry',
            title: item.title,
            kind: item.kind,
            start: day,
            end: Math.min(next, previousEnd),
          });
        }
      }

      return occurrences;
    }

    if (!overlaps(item.startAt, item.endAt, day, next)) return [];
    return [{
      id: item.id,
      title: item.title,
      kind: item.kind,
      start: Math.max(day, item.startAt),
      end: Math.min(next, item.endAt),
    }];
  });
}

export function scheduledTasksForDay(tasks: StudyTask[], dayTimestamp: number) {
  const day = startOfLocalDay(dayTimestamp);
  const next = addLocalDays(day, 1);
  return tasks.filter(
    (task) =>
      task.status === 'open' &&
      task.planState === 'scheduled' &&
      task.scheduledStart > 0 &&
      overlaps(task.scheduledStart, task.scheduledEnd, day, next),
  );
}

function mergeBusy(intervals: Array<{ start: number; end: number }>) {
  const ordered = intervals
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const item of ordered) {
    const last = merged[merged.length - 1];
    if (!last || item.start > last.end) merged.push({ ...item });
    else last.end = Math.max(last.end, item.end);
  }
  return merged;
}

export function freeStudyWindows(
  workspace: WorkspaceState,
  dayTimestamp: number,
  options: { includeScheduledTasks?: boolean; from?: number; minMinutes?: number } = {},
): DayWindow[] {
  const day = startOfLocalDay(dayTimestamp);
  const dayStart = localAt(day, new Date(2000, 0, 1, 6, 0).getTime());
  const dayEnd = localAt(day, new Date(2000, 0, 1, 23, 0).getTime());
  const from = Math.max(dayStart, options.from ?? dayStart);
  const fixed = commitmentOccurrencesForDay(workspace.commitments, day).map((item) => ({
    start: item.start,
    end: item.end,
  }));
  const scheduled = options.includeScheduledTasks === false
    ? []
    : scheduledTasksForDay(workspace.tasks, day).map((task) => ({
        start: task.scheduledStart,
        end: task.scheduledEnd,
      }));

  const busy = mergeBusy([...fixed, ...scheduled].map((item) => ({
    start: Math.max(from, item.start),
    end: Math.min(dayEnd, item.end),
  })));

  const windows: DayWindow[] = [];
  let cursor = from;
  for (const block of busy) {
    if (block.end <= cursor) continue;
    if (block.start > cursor) {
      const minutes = Math.floor((block.start - cursor) / 60000);
      if (minutes >= (options.minMinutes ?? 5)) windows.push({ start: cursor, end: block.start, minutes });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < dayEnd) {
    const minutes = Math.floor((dayEnd - cursor) / 60000);
    if (minutes >= (options.minMinutes ?? 5)) windows.push({ start: cursor, end: dayEnd, minutes });
  }
  return windows;
}

function taskExamDays(workspace: WorkspaceState, task: StudyTask, now: number) {
  const direct = task.examId ? workspace.exams.find((exam) => exam.id === task.examId) : null;
  if (direct) return examCalendarDaysUntil(direct.date, now);
  if (!task.topicId) return null;
  const topic = workspace.topics.find((item) => item.id === task.topicId);
  if (!topic) return null;
  const exam = workspace.exams
    .filter((item) =>
      item.scope === 'topics'
        ? item.topicIds.includes(topic.id)
        : item.subjects.includes(topic.subject),
    )
    .filter((item) => item.date >= now)
    .sort((a, b) => a.date - b.date)[0];
  return exam ? examCalendarDaysUntil(exam.date, now) : null;
}

export function taskPlanningScore(workspace: WorkspaceState, task: StudyTask, now = Date.now()) {
  let score = task.priority * 12;
  if (task.planState === 'today') score += 28;
  if (task.planState === 'scheduled') score += 34;

  if (task.dueAt > 0) {
    const dueDay = startOfLocalDay(task.dueAt);
    const today = startOfLocalDay(now);
    const days = calendarDayDistance(today, dueDay);
    if (days < 0) score += 70;
    else if (days === 0) score += 58;
    else if (days === 1) score += 46;
    else if (days <= 3) score += 30;
    else if (days <= 7) score += 14;
  }

  const examDays = taskExamDays(workspace, task, now);
  if (examDays !== null) {
    if (examDays <= 1) score += 45;
    else if (examDays <= 3) score += 34;
    else if (examDays <= 7) score += 22;
  }
  return score;
}

export function suggestTaskSlots(
  workspace: WorkspaceState,
  task: StudyTask,
  now = Date.now(),
  limit = 4,
): TaskSlot[] {
  const needed = Math.max(5, taskRemainingMinutes(task) || task.estimatedMinutes || 25);
  const slots: TaskSlot[] = [];
  const shadow: WorkspaceState = JSON.parse(JSON.stringify(workspace));
  const current = shadow.tasks.find((item) => item.id === task.id);
  if (current) {
    current.planState = 'today';
    current.scheduledStart = 0;
    current.scheduledEnd = 0;
  }

  for (let offset = 0; offset < 3 && slots.length < limit; offset += 1) {
    const day = addLocalDays(startOfLocalDay(now), offset);
    const from = offset === 0 ? now : day;
    const windows = freeStudyWindows(shadow, day, { from, minMinutes: 5 });
    for (const window of windows) {
      if (window.minutes < needed) continue;
      slots.push({ start: window.start, end: window.start + needed * 60000, minutes: needed });
      if (slots.length >= limit) break;
    }
  }
  return slots;
}

export function buildDayMap(workspace: WorkspaceState, now = Date.now()) {
  const day = startOfLocalDay(now);
  const commitments: DayMapEntry[] = commitmentOccurrencesForDay(workspace.commitments, day).map(
    (item) => ({
      id: `commitment:${item.id}`,
      kind: 'commitment',
      start: item.start,
      end: item.end,
      title: item.title,
      label: item.kind,
    }),
  );

  const nextDay = addLocalDays(day, 1);
  const tasks: DayMapEntry[] = scheduledTasksForDay(workspace.tasks, day).map((task) => ({
    id: `task:${task.id}`,
    kind: 'task',
    start: Math.max(day, task.scheduledStart),
    end: Math.min(nextDay, task.scheduledEnd),
    title: task.title,
    label: task.subject || task.type,
    taskId: task.id,
    missed: task.scheduledEnd < now,
  }));

  const entries = [...commitments, ...tasks].sort((a, b) => a.start - b.start || a.end - b.end);
  const free = freeStudyWindows(workspace, day, { minMinutes: 5 });
  const plannedStudyMinutes = workspace.tasks
    .filter((task) => {
      if (task.status !== 'open' || task.postponedUntil > now) return false;
      if (task.planState === 'today') return true;
      if (task.planState !== 'scheduled') return false;
      return task.scheduledStart >= day && task.scheduledStart < addLocalDays(day, 1);
    })
    .reduce((sum, task) => {
      const remaining = taskRemainingMinutes(task);
      if (remaining > 0) return sum + remaining;
      if (task.estimatedMinutes > 0) return sum + task.estimatedMinutes;
      if (task.scheduledEnd > task.scheduledStart) {
        return sum + Math.round((task.scheduledEnd - task.scheduledStart) / 60000);
      }
      return sum + 25;
    }, 0);
  const fixedBusyMinutes = commitmentOccurrencesForDay(workspace.commitments, day).reduce(
    (sum, item) => sum + Math.max(0, Math.round((item.end - item.start) / 60000)),
    0,
  );
  const availableMinutes = freeStudyWindows(workspace, day, { includeScheduledTasks: false }).reduce(
    (sum, window) => sum + window.minutes,
    0,
  );

  return {
    day,
    entries,
    free,
    plannedStudyMinutes,
    fixedBusyMinutes,
    availableMinutes,
    overloadMinutes: Math.max(0, plannedStudyMinutes - availableMinutes),
  };
}

export function rebuildRemainingDay(workspace: WorkspaceState, now = Date.now()) {
  const candidates = workspace.tasks
    .filter(
      (task) =>
        task.status === 'open' &&
        task.postponedUntil <= now &&
        (task.planState === 'today' ||
          (task.planState === 'scheduled' && task.scheduledEnd >= now)),
    )
    .sort((a, b) => taskPlanningScore(workspace, b, now) - taskPlanningScore(workspace, a, now));

  const virtual: WorkspaceState = JSON.parse(JSON.stringify(workspace));
  for (const task of virtual.tasks) {
    if (task.status === 'open' && task.scheduledStart >= now) {
      task.planState = 'today';
      task.scheduledStart = 0;
      task.scheduledEnd = 0;
    }
  }

  const moves: RebuildMove[] = [];
  for (const source of candidates) {
    const task = virtual.tasks.find((item) => item.id === source.id);
    if (!task) continue;
    const slot = suggestTaskSlots(virtual, task, now, 1)[0];
    if (!slot) continue;
    moves.push({
      taskId: task.id,
      fromStart: source.scheduledStart,
      start: slot.start,
      end: slot.end,
    });
    task.planState = 'scheduled';
    task.scheduledStart = slot.start;
    task.scheduledEnd = slot.end;
  }

  return { moves, unscheduledCount: Math.max(0, candidates.length - moves.length) };
}
