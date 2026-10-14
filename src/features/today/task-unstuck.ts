import type { StudyTask } from '@/src/data/schema';
export const UNSTUCK_CHOICES = [
  { id: 'big', label: 'Too big', text: 'Choose one small part. Your full task estimate stays the same.', action: 'Open a smaller start', target: 'focus' },
  { id: 'unclear', label: 'Unclear', text: 'Write what counts as done before choosing a session.', action: 'Clarify this task', target: 'edit' },
  { id: 'time', label: 'No time', text: 'Compare available slots or choose a time yourself. Nothing moves until you apply.', action: 'Find another time', target: 'schedule' },
  { id: 'tired', label: 'Tired', text: 'Keep the next effort small. In Focus, choose the five-minute launch and stop there if needed.', action: 'Open a five-minute option', target: 'focus' },
] as const;
export type UnstuckChoice = typeof UNSTUCK_CHOICES[number];
export function canGetUnstuck(task: StudyTask | undefined | null) {
  return !!task && task.status === 'open' && (task.postponements ?? 0) >= 2;
}
