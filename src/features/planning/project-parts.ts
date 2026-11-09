import { StudyTask } from '@/src/data/schema';
import { parseLocalDate } from './commitment-dates';
import { createStudyTask } from './task-engine';

export type ProjectPartInput = {
  title: string;
  day: string;
  minutes: string;
};

export function localDateText(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createProjectParts({
  title,
  subject,
  deadline,
  parts,
  now = Date.now(),
}: {
  title: string;
  subject: string;
  deadline: string;
  parts: readonly ProjectPartInput[];
  now?: number;
}): { tasks?: StudyTask[]; error?: string } {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    return { error: 'Add a project name first.' };
  }
  if (parts.length < 2) {
    return { error: 'Split the project into at least 2 parts.' };
  }

  let deadlineEnd = 0;
  if (deadline.trim()) {
    const parsedDeadline = parseLocalDate(deadline.trim());
    if (parsedDeadline === null) {
      return { error: 'Use a valid project deadline in YYYY-MM-DD format.' };
    }
    const d = new Date(parsedDeadline);
    deadlineEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const tasks: StudyTask[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partTitle = part.title.trim();
    if (!partTitle) {
      return { error: `Describe what you will complete in Part ${i + 1}.` };
    }
    const dayMs = parseLocalDate(part.day.trim());
    if (dayMs === null) {
      return { error: `Use a valid YYYY-MM-DD date for Part ${i + 1}.` };
    }
    const minutes = Math.round(Number(part.minutes));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 360) {
      return { error: `Part ${i + 1} needs between 5 and 360 minutes.` };
    }
    const d = new Date(dayMs);
    const workDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    const partDue =
      deadlineEnd > 0
        ? deadlineEnd
        : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();

    const task = createStudyTask({
      title: `${cleanTitle} — Part ${i + 1}: ${partTitle}`,
      subject: subject.trim(),
      type: 'assignment',
      planState: workDayStart > todayStartMs ? 'postponed' : 'today',
      dueAt: partDue,
      estimatedMinutes: minutes,
      priority: 2,
      now: now + i,
    });
    if (workDayStart > todayStartMs) {
      task.postponedUntil = workDayStart;
    }
    tasks.push(task);
  }

  return { tasks };
}
