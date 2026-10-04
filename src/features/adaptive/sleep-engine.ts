import { WorkspaceSettings } from '@/src/data/schema';

function at(day: number, minutes: number, offset = 0) {
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, Math.floor(minutes / 60), minutes % 60).getTime();
}
// Calendar-based construction keeps local bedtime stable across daylight-saving changes.
export function sleepWindows(settings: WorkspaceSettings, day: number) {
  if (settings.sleepEnabled === false) return [];
  const start = settings.sleepStartMinutes ?? 1350;
  const end = settings.wakeMinutes ?? 420;
  if (start === end) return [];
  return [-1, 0, 1].map(offset => ({ start: at(day, start, offset), end: at(day, end, offset + (end < start ? 1 : 0)) }));
}
export function sleepingAt(settings: WorkspaceSettings, now: number) {
  return sleepWindows(settings, now).find(w => now >= w.start && now < w.end) ?? null;
}
export function clockLabel(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
export function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
