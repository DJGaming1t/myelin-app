import { StudyTask } from '@/src/data/schema';
import { localDateKey } from './commitment-dates';

export function taskUrgency(task: StudyTask, now = Date.now()) {
  if (task.status !== 'open' || !task.dueAt) return null;
  if (task.dueAt < now) {
    const due = new Date(task.dueAt);
    const today = new Date(now);
    const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())) / 86400000);
    return { overdue: true, label: days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} overdue` : 'Overdue today' };
  }
  if (localDateKey(task.dueAt) === localDateKey(now)) return { overdue: false, label: 'Due today' };
  return null;
}
