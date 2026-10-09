import type { WorkspaceState } from '@/src/data/schema';
import type { MyelinMiniRouteResult } from './myelin-mini';
import { normalizeSchoolworkLanguage, schoolworkSubjectReply } from './schoolwork-language';
import { parseScheduleTimeReply, parseWeeklyDaysReply } from './recurring-schedule-language';

export type AssistantClarificationAnswers = {
  subject?: string;
  topicId?: string;
  estimatedMinutes?: number;
  dueDate?: string;
  recurrenceDays?: number[];
  startMinutes?: number;
  endMinutes?: number;
};
export type ClarificationScope = { ownerKey: string; revision: number; currentDate: string; now: number };
type Field = 'subject' | 'topic' | 'estimatedMinutes' | 'dueDate' | 'recurrenceDays' | 'timeRange';
export type PendingAssistantClarification = {
  userRequest: string;
  question: string;
  field: Field;
  answers: AssistantClarificationAnswers;
  ownerKey: string;
  revision: number;
  currentDate: string;
  startedAt: number;
  turns: number;
};
const FIELDS: Field[] = ['subject', 'topic', 'estimatedMinutes', 'dueDate', 'recurrenceDays', 'timeRange'];
const TEN_MINUTES = 10 * 60_000;

export function beginAssistantClarification(
  userRequest: string,
  decision: MyelinMiniRouteResult,
  scope: ClarificationScope,
  answers: AssistantClarificationAnswers = {},
  previous?: PendingAssistantClarification | null,
): PendingAssistantClarification | null {
  if (decision.route !== 'clarify' || decision.missingFields.length !== 1) return null;
  const field = decision.missingFields[0] as Field;
  if (!FIELDS.includes(field) || (field === 'subject' && decision.reason === 'ambiguous-reference')) return null;
  if (previous && previous.turns >= 4) return null;
  return { userRequest, question: decision.question, field, answers: { ...answers },
    ownerKey: scope.ownerKey, revision: scope.revision, currentDate: scope.currentDate,
    startedAt: previous?.startedAt ?? scope.now, turns: (previous?.turns ?? 0) + 1 };
}

function dateReply(text: string, currentDate: string): string | null {
  const normalized = normalizeSchoolworkLanguage(text).replace(/^(?:it is|it's|make it)\s+/, '').replace(/^(?:by|on|due)\s+/, '').replace(/[.!]$/, '');
  if (/^20\d{2}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null;
  }
  const days = normalized === 'tomorrow' ? 1 : normalized === 'day after tomorrow' ? 2 : /^(?:today|tonight)$/.test(normalized) ? 0 : null;
  if (days == null) return null;
  const base = new Date(`${currentDate}T12:00:00Z`);
  if (!Number.isFinite(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function minutesReply(text: string): number | null {
  const normalized = text.toLowerCase().trim().replace(/^(?:it is|it's|make it)\s+/, '').replace(/^(?:about|around)\s+/, '').replace(/[.!]$/, '');
  if (/^half (?:an? )?hour$/.test(normalized)) return 30;
  const compound = /^(\d+)\s*(?:h|hr|hrs|hour|hours)\s+(\d+)\s*(?:m|min|mins|minute|minutes)$/.exec(normalized);
  if (compound) {
    const hours = Number(compound[1]); const minutes = Number(compound[2]); const total = hours * 60 + minutes;
    return minutes < 60 && Number.isInteger(total) && total >= 5 && total <= 720 ? total : null;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/.exec(normalized);
  if (!match) return null;
  const value = Number(match[1]) * (/^(?:h|hr|hour)/.test(match[2] ?? '') ? 60 : 1);
  return Number.isInteger(value) && value >= 5 && value <= 720 ? value : null;
}

const topicKey = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function answerAssistantClarification(
  pending: PendingAssistantClarification,
  answer: string,
  workspace: WorkspaceState,
  scope: ClarificationScope,
): { kind: 'resolved'; userRequest: string; answers: AssistantClarificationAnswers } | { kind: 'retry'; message: string } | { kind: 'expired'; message: string } {
  if (workspace.revision !== scope.revision || pending.ownerKey !== scope.ownerKey || pending.revision !== scope.revision ||
      pending.currentDate !== scope.currentDate || scope.now < pending.startedAt || scope.now - pending.startedAt > TEN_MINUTES) {
    return { kind: 'expired', message: 'This question expired or your workspace changed. Preview the original request again.' };
  }
  const answers = { ...pending.answers };
  if (pending.field === 'subject') {
    const subject = schoolworkSubjectReply(answer);
    if (!subject) return { kind: 'retry', message: 'Reply with one subject, such as Biology, Chemistry or Maths. Start a new request for a different task.' };
    answers.subject = subject;
  } else if (pending.field === 'estimatedMinutes') {
    const minutes = minutesReply(answer);
    if (minutes == null) return { kind: 'retry', message: 'Reply with one estimate from 5 to 720 minutes, e.g. 45 minutes or 1.5 hours.' };
    answers.estimatedMinutes = minutes;
  } else if (pending.field === 'dueDate') {
    const date = dateReply(answer, scope.currentDate);
    if (!date) return { kind: 'retry', message: 'Reply with one valid date (YYYY-MM-DD), today or tomorrow. Time-of-day deadlines are not supported here.' };
    answers.dueDate = date;
  } else if (pending.field === 'recurrenceDays') {
    const days = parseWeeklyDaysReply(answer);
    if (!days) return { kind: 'retry', message: 'Reply with weekly days, e.g. weekdays, every day except Sat and Sun, or Mon, Wed, Fri. No changes were made.' };
    answers.recurrenceDays = days;
  } else if (pending.field === 'timeRange') {
    const times = parseScheduleTimeReply(answer);
    if (!times) return { kind: 'retry', message: 'Reply with one same-day interval, e.g. 5:30 AM to 2 PM or 05:30 to 14:00. Include AM/PM for both 12-hour times.' };
    Object.assign(answers, times);
  } else {
    const key = topicKey(answer.replace(/^(?:it is|it's|the topic is)\s+/i, ''));
    const exact = workspace.topics.filter(topic => topicKey(topic.name) === key);
    const matches = exact.length ? exact : key.length >= 4 ? workspace.topics.filter(topic => topicKey(topic.name).startsWith(key)) : [];
    if (matches.length !== 1) return { kind: 'retry', message: 'Reply with the exact name of one existing topic. I will not invent a topic or choose between matching names.' };
    answers.topicId = matches[0]!.id;
  }
  return { kind: 'resolved', userRequest: pending.userRequest, answers };
}
