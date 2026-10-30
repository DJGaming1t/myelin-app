import type { StudyTask } from '@/src/data/schema';
import { createStudyTask } from './task-engine';

export type ProjectPartInput = { title: string; day: string; minutes: string };

export function localDateText(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}

export function parseProjectDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

export function createProjectParts(input: {
  title: string; subject: string; deadline: string; parts: ProjectPartInput[]; now?: number;
}): { tasks: StudyTask[]; error: null } | { tasks: null; error: string } {
  const now = input.now ?? Date.now();
  const title = input.title.trim();
  if (!title) return { tasks: null, error: 'Give your project a name.' };
  if (input.parts.length < 2 || input.parts.length > 20) return { tasks: null, error: 'Use between 2 and 20 parts.' };
  const deadlineDay = input.deadline.trim() ? parseProjectDay(input.deadline) : null;
  if (input.deadline.trim() && deadlineDay === null) return { tasks: null, error: 'Use a valid project deadline, such as 2026-11-20.' };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (deadlineDay !== null && deadlineDay < today.getTime()) return { tasks: null, error: 'The project deadline cannot be in the past.' };
  const dueAt = deadlineDay === null ? 0 : (() => { const end = new Date(deadlineDay); end.setDate(end.getDate() + 1); return end.getTime() - 1; })();
  const validated: { title: string; day: number; minutes: number }[] = [];
  for (const [index, part] of input.parts.entries()) {
    const day = parseProjectDay(part.day);
    const minutes = Number(part.minutes);
    if (!part.title.trim()) return { tasks: null, error: `Give part ${index + 1} a short description.` };
    if (day === null || day < today.getTime()) return { tasks: null, error: `Choose a valid day today or later for part ${index + 1}.` };
    if (deadlineDay !== null && day > deadlineDay) return { tasks: null, error: `Part ${index + 1} is after the project deadline.` };
    if (!/^\d+$/.test(part.minutes.trim()) || !Number.isInteger(minutes) || minutes < 5 || minutes > 720) return { tasks: null, error: `Use 5–720 minutes for part ${index + 1}.` };
    validated.push({ title: part.title.trim(), day, minutes });
  }
  const tasks = validated.map(part => {
    const task = createStudyTask({ title: `${title.slice(0, 180)}: ${part.title.slice(0, 250)}`, subject: input.subject,
      type: 'assignment', planState: 'today', dueAt, estimatedMinutes: part.minutes, now });
    task.postponedUntil = part.day > today.getTime() ? part.day : 0;
    return task;
  });
  return { tasks, error: null };
}
