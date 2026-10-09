import type { AssistantCreateCommitmentAction } from './ai-action-engine';
import type { AssistantClarificationAnswers } from './assistant-clarification';
import { normalizeAssistantCommand } from './schoolwork-language';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const normalize = (text: string) => text.toLowerCase().trim().replace(/a\.m\./g, 'am').replace(/p\.m\./g, 'pm').replace(/[.!?]+$/, '').replace(/\s+/g, ' ');

export function weeklyDaysLabel(days: number[]) {
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter(day => days.includes(day));
  if (ordered.length === 7) return 'Every day';
  if (ordered.join(',') === '1,2,3,4,5') return 'Monday–Friday';
  return ordered.map(day => DAY_NAMES[day]).join(', ');
}
export function scheduleTimeLabel(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function dayList(text: string): number[] | null {
  const value = text.trim().replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/g, '$1').replace(/\s+(?:and|&)\s+|\s*,\s*/g, ' ').replace(/\s+/g, ' ');
  const range = /^(\w+)\s*(?:to|through|[-–])\s*(\w+)$/.exec(value);
  if (range) {
    const first = DAYS[range[1]!]; const last = DAYS[range[2]!];
    if (first == null || last == null) return null;
    const result = [first]; let day = first;
    while (day !== last && result.length < 7) { day = (day + 1) % 7; result.push(day); }
    return result;
  }
  const tokens = value.split(' ');
  if (!tokens.length || tokens.some(day => DAYS[day] == null)) return null;
  return [...new Set(tokens.map(day => DAYS[day]!))];
}

export function parseWeeklyDaysReply(text: string): number[] | null {
  const value = normalize(text).replace(/^on\s+/, '').replace(/\s+every week$/, '');
  const parts = value.split(/\s+except\s+/);
  if (parts.length > 2) return null;
  const base = parts[0]!;
  const days = /^(?:every ?day|daily|all days)$/.test(base) ? [0, 1, 2, 3, 4, 5, 6]
    : /^(?:weekdays|monday to friday|mon-fri)$/.test(base) ? [1, 2, 3, 4, 5]
      : base === 'weekends' ? [0, 6] : dayList(base.replace(/^(?:every|each|weekly)\s+/, ''));
  if (!days?.length) return null;
  const excluded = parts[1] ? dayList(parts[1]) : [];
  if (!excluded) return null;
  const result = days.filter(day => !excluded.includes(day)).sort((a, b) => a - b);
  return result.length ? result : null;
}

function clock(text: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] ?? 0);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[3] === 'pm' ? 12 : 0);
  } else {
    // No guessed AM/PM: unmarked times require an explicit two-digit 24h clock.
    if (match[1]!.length !== 2 || !match[2] || hour > 23) return null;
  }
  return hour * 60 + minute;
}
export function parseScheduleTimeReply(text: string): { startMinutes: number; endMinutes: number } | null {
  const value = normalize(text).replace(/^(?:it is|it's|make it)\s+/, '').replace(/^from\s+/, '');
  const parts = value.split(/\s+(?:to|until|till)\s+|\s*[-–]\s*/);
  if (parts.length !== 2) return null;
  const startMinutes = clock(parts[0]!); const endMinutes = clock(parts[1]!);
  if (startMinutes == null || endMinutes == null || endMinutes - startMinutes < 5) return null;
  return { startMinutes, endMinutes };
}

type ScheduleResult = { route: 'actions'; action: AssistantCreateCommitmentAction } |
  { route: 'clarify'; reason: 'missing-required-detail' | 'ambiguous-reference'; question: string; missingFields: string[] };
const ask = (field: string, question: string): ScheduleResult => ({ route: 'clarify', reason: 'missing-required-detail', question, missingFields: [field] });

export function tryParseRecurringSchedule(request: string, answers: AssistantClarificationAnswers = {}): ScheduleResult | null {
  const text = normalize(normalizeAssistantCommand(request)).replace(/\s*,\s*/g, ' ');
  const prefix = /^(?:(?:i (?:have|attend|go to)|my|(?:add|set|record|schedule)(?: my| a)?)\s+)?(school|tuition|coaching)\b/.exec(text);
  if (!prefix) return null;
  if ((text.match(/\b(?:school|tuition|coaching)\b/g) ?? []).length > 1 || /\bevery\s+\d+\s+(?:weeks?|days?)\b/.test(text)) {
    return ask('request', 'Send one weekly school, tuition or coaching interval at a time. Alternating-week schedules need Day map.');
  }
  if (/\b(?:not|don't|cannot|can't|already|if|maybe|might|could|would|cancel|remove|delete|change|instead|used to|tomorrow|today|yesterday|last week|next week|next month|holiday|alternat\w*)\b/.test(text) ||
      /\b(?:and|then)\s+(?:(?:also|please|now|to|i)\s+)*(?:add|create|set|mark|update|move|generate|replan|plan|schedule|make|need|have|complete|finish|submit|practice|revise|study)\b/.test(text)) {
    return { route: 'clarify', reason: 'ambiguous-reference', question: 'For a weekly fixed-time entry, send one recurring schedule with its days and start/end times. Use Day map to change an existing entry or add a one-off event.', missingFields: ['request'] };
  }
  const kind = prefix[1] as AssistantCreateCommitmentAction['kind'];
  const tail = text.slice(prefix[0].length).trim().replace(/^(?:on|is|are)\s+/, '');
  const firstNumber = tail.search(/\d/);
  const dayText = (firstNumber < 0 ? tail : tail.slice(0, firstNumber)).trim().replace(/\s*from$/, '').trim();
  const explicitWeekly = /\b(?:every ?day|daily|weekdays|weekends|every|each|weekly|every week|all days)\b/.test(dayText) || /^(?:mon(?:day)?\s*(?:to|through|[-–])\s*fri(?:day)?)$/.test(dayText);
  let recurrenceDays = answers.recurrenceDays;
  if (recurrenceDays) {
    if (!recurrenceDays.length || recurrenceDays.length > 7 || new Set(recurrenceDays).size !== recurrenceDays.length || recurrenceDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) recurrenceDays = undefined;
  } else if (explicitWeekly) recurrenceDays = parseWeeklyDaysReply(dayText) ?? undefined;
  if (!recurrenceDays) return ask('recurrenceDays', 'Which days does this repeat every week? Reply “weekdays”, “every day except Sat and Sun”, or a list such as “Mon, Wed, Fri”.');
  let times = answers.startMinutes != null && answers.endMinutes != null ? { startMinutes: answers.startMinutes, endMinutes: answers.endMinutes } :
    firstNumber < 0 ? null : parseScheduleTimeReply(tail.slice(firstNumber));
  if (!times || !Number.isInteger(times.startMinutes) || !Number.isInteger(times.endMinutes) || times.startMinutes < 0 || times.endMinutes > 1439 || times.endMinutes - times.startMinutes < 5) {
    return ask('timeRange', 'What are the start and end times? Include AM/PM for both, e.g. “5:30 AM to 2 PM”, or use “05:30 to 14:00”. This shortcut supports one same-day interval.');
  }
  return { route: 'actions', action: { type: 'create_commitment', title: kind[0]!.toUpperCase() + kind.slice(1), kind,
    ...times, recurrenceDays: [...recurrenceDays].sort((a, b) => a - b) } };
}
