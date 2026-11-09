import { Exam, Topic, WorkspaceState } from '@/src/data/schema';

export type ExamScope = Exam['scope'];

export type ExamInput = {
  name: string;
  date: number;
  scope: ExamScope;
  subjects: string[];
  topicIds: string[];
};

export type ExamStatus =
  | { kind: 'today'; days: 0; label: 'Today' }
  | { kind: 'upcoming'; days: number; label: string }
  | { kind: 'past'; days: number; label: string };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function id(prefix: string, now = Date.now()) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function calendarSerial(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function examCalendarDaysUntil(date: number, now = Date.now()) {
  return Math.round((calendarSerial(date) - calendarSerial(now)) / 86_400_000);
}

export function examStatus(date: number, now = Date.now()): ExamStatus {
  const days = examCalendarDaysUntil(date, now);

  if (days === 0) return { kind: 'today', days: 0, label: 'Today' };
  if (days > 0) {
    return {
      kind: 'upcoming',
      days,
      label: days === 1 ? 'Tomorrow' : `In ${days} days`,
    };
  }

  const ago = Math.abs(days);
  return {
    kind: 'past',
    days,
    label: ago === 1 ? 'Yesterday' : `${ago} days ago`,
  };
}

export function parseExamDateInput(value: string) {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Noon local time avoids edge cases around midnight and DST when a date-only exam is displayed.
  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate.getTime();
}

export function formatExamDateInput(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatExamDateLong(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function examAppliesToTopic(exam: Exam, topic: Topic) {
  return exam.scope === 'topics'
    ? exam.topicIds.includes(topic.id)
    : exam.subjects.includes(topic.subject);
}

export function examTopics(exam: Exam, topics: Topic[]) {
  return topics.filter((topic) => examAppliesToTopic(exam, topic));
}

export function createExam(input: ExamInput, now = Date.now(), examId?: string): Exam {
  return normalizeExam({
    id: examId ?? id('exam', now),
    name: input.name.trim(),
    date: input.date,
    scope: input.scope,
    subjects: input.subjects,
    topicIds: input.topicIds,
  });
}

export function applyExamInput(exam: Exam, input: ExamInput) {
  const normalized = normalizeExam({
    ...exam,
    name: input.name.trim(),
    date: input.date,
    scope: input.scope,
    subjects: input.subjects,
    topicIds: input.topicIds,
  });

  exam.name = normalized.name;
  exam.date = normalized.date;
  exam.scope = normalized.scope;
  exam.subjects = normalized.subjects;
  exam.topicIds = normalized.topicIds;
}

function normalizeExam(exam: Exam): Exam {
  const subjects = [...new Set(exam.subjects.map((subject) => subject.trim()).filter(Boolean))];
  const topicIds = [...new Set(exam.topicIds.filter(Boolean))];

  return {
    ...exam,
    name: exam.name.trim(),
    subjects: exam.scope === 'subjects' ? subjects : [],
    topicIds: exam.scope === 'topics' ? topicIds : [],
  };
}

export function validateExamInput(input: ExamInput, topics: Topic[]) {
  if (!input.name.trim()) return 'Give the exam a name.';
  if (!Number.isFinite(input.date) || input.date <= 0) return 'Enter a valid exam date.';

  if (input.scope === 'subjects') {
    const available = new Set(topics.map((topic) => topic.subject));
    if (!input.subjects.some((subject) => available.has(subject))) {
      return 'Choose at least one subject that has topics in MYELIN.';
    }
  } else {
    const available = new Set(topics.map((topic) => topic.id));
    if (!input.topicIds.some((topicId) => available.has(topicId))) {
      return 'Choose at least one topic for this exam.';
    }
  }

  return '';
}

export function findExam(workspace: WorkspaceState, examId: string) {
  return workspace.exams.find((exam) => exam.id === examId) ?? null;
}

export function deleteExamFromWorkspace(workspace: WorkspaceState, examId: string) {
  const before = workspace.exams.length;
  workspace.exams = workspace.exams.filter((exam) => exam.id !== examId);
  return workspace.exams.length !== before;
}

export function sortExams(exams: Exam[], now = Date.now()) {
  return [...exams].sort((a, b) => {
    const aStatus = examStatus(a.date, now);
    const bStatus = examStatus(b.date, now);

    const rank = (status: ExamStatus) => (status.kind === 'today' ? 0 : status.kind === 'upcoming' ? 1 : 2);
    const rankDelta = rank(aStatus) - rank(bStatus);
    if (rankDelta !== 0) return rankDelta;

    if (aStatus.kind === 'past' && bStatus.kind === 'past') return b.date - a.date;
    return a.date - b.date;
  });
}

export function nearestUpcomingExam(workspace: WorkspaceState, now = Date.now()) {
  return (
    sortExams(
      workspace.exams.filter((exam) => examStatus(exam.date, now).kind !== 'past'),
      now,
    )[0] ?? null
  );
}

export function examSubjectsFromTopics(topics: Topic[]) {
  return [...new Set(topics.map((topic) => topic.subject).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
