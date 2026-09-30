import {
  BreakLog,
  Confidence,
  CURRENT_SCHEMA_VERSION,
  Exam,
  Mistake,
  MistakeReason,
  Priority,
  RecallQuestion,
  ReviewGrade,
  StudySession,
  Topic,
  TopicStatus,
  WORKSPACE_FORMAT,
  WorkspaceSettings,
  WorkspaceState,
  defaultWorkspaceSettings,
} from './schema';

const ID = /^[a-zA-Z0-9_-]{1,120}$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function string(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function nonEmpty(value: unknown, label: string, max: number): string {
  const result = string(value, label, max);
  if (!result.trim()) throw new Error(`${label} cannot be empty.`);
  return result;
}

function id(value: unknown): string {
  const result = string(value, 'record ID', 120);
  if (!ID.test(result)) throw new Error('Invalid record ID.');
  return result;
}

function number(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, label, min, max);
  if (!Number.isInteger(result)) throw new Error(`Invalid ${label}.`);
  return result;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`Invalid ${label}.`);
  return value as T;
}

function uniqueIds<T extends { id: string }>(items: T[], label: string) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Duplicate ${label} IDs.`);
  }
}

function question(raw: unknown): RecallQuestion {
  const q = object(raw, 'question');
  return {
    id: id(q.id),
    prompt: nonEmpty(q.prompt, 'question', 6000),
    answer: string(q.answer ?? '', 'answer', 16000),
    hint: string(q.hint ?? '', 'hint', 4000),
    dueAt: number(q.dueAt ?? 0, 'question due date'),
    intervalDays: number(q.intervalDays ?? 0, 'question interval', 0, 3650),
    lastGrade: integer(q.lastGrade ?? 0, 'question grade', 0, 3) as ReviewGrade,
    lastReviewed: number(q.lastReviewed ?? 0, 'question review date'),
    reps: integer(q.reps ?? 0, 'question review count', 0, 1_000_000),
  };
}

function topic(raw: unknown): Topic {
  const t = object(raw, 'topic');
  const cards = array(t.cards ?? [], 'question list', 500).map(question);
  uniqueIds(cards, 'question');

  return {
    id: id(t.id),
    name: nonEmpty(t.name, 'topic name', 300),
    subject: nonEmpty(t.subject, 'subject', 120),
    createdAt: number(t.createdAt, 'topic creation date', 1),
    status: oneOf<TopicStatus>(t.status, ['new', 'learning', 'review'], 'topic status'),
    priority: integer(t.priority, 'priority', 1, 3) as Priority,
    estimate: integer(t.estimate, 'topic estimate', 5, 240),
    notes: string(t.notes ?? '', 'notes', 20000),
    dueAt: number(t.dueAt ?? 0, 'topic due date'),
    intervalDays: number(t.intervalDays ?? 0, 'topic interval', 0, 3650),
    lastGrade: integer(t.lastGrade ?? 0, 'topic grade', 0, 3) as ReviewGrade,
    lastReviewed: number(t.lastReviewed ?? 0, 'topic review date'),
    snoozeUntil: number(t.snoozeUntil ?? 0, 'topic snooze date'),
    cards,
  };
}

function exam(raw: unknown, topicIds: Set<string>): Exam {
  const e = object(raw, 'exam');
  const ids = array(e.topicIds ?? [], 'exam topics', 300).map(id).filter((topicId) => topicIds.has(topicId));
  const subjects = array(e.subjects ?? [], 'exam subjects', 100).map((value) => nonEmpty(value, 'exam subject', 120));

  return {
    id: id(e.id),
    name: nonEmpty(e.name, 'exam name', 200),
    date: number(e.date, 'exam date', 1),
    subjects,
    scope: oneOf(e.scope ?? 'subjects', ['subjects', 'topics'] as const, 'exam scope'),
    topicIds: ids,
  };
}

function mistake(raw: unknown, topicIds: Set<string>, cardIds: Set<string>): Mistake {
  const m = object(raw, 'mistake');
  const topicId = id(m.topicId);
  if (!topicIds.has(topicId)) throw new Error('A mistake refers to a missing topic.');

  const cardId = m.cardId == null ? null : id(m.cardId);
  if (cardId && !cardIds.has(cardId)) throw new Error('A mistake refers to a missing question.');

  return {
    id: id(m.id),
    topicId,
    cardId,
    prompt: nonEmpty(m.prompt, 'mistake prompt', 6000),
    detail: string(m.detail ?? '', 'mistake detail', 16000),
    correction: string(m.correction ?? '', 'mistake correction', 16000),
    reason: oneOf<MistakeReason>(
      m.reason ?? 'concept',
      ['concept', 'calculation', 'recall', 'application'],
      'mistake reason',
    ),
    createdAt: number(m.createdAt, 'mistake creation date', 1),
    dueAt: number(m.dueAt ?? 0, 'mistake due date'),
    resolvedAt: number(m.resolvedAt ?? 0, 'mistake resolution date'),
    wins: integer(m.wins ?? 0, 'mistake wins', 0, 2),
    lastWinDay: string(m.lastWinDay ?? '', 'mistake win day', 10),
    intervalDays: number(m.intervalDays ?? 0, 'mistake interval', 0, 3650),
  };
}

function session(raw: unknown, topicIds: Set<string>, cardIds: Set<string>, mistakeIds: Set<string>): StudySession {
  const s = object(raw, 'session');
  const topicId = id(s.topicId);
  if (!topicIds.has(topicId)) throw new Error('A session refers to a missing topic.');

  const cardId = s.cardId == null ? undefined : id(s.cardId);
  if (cardId && !cardIds.has(cardId)) throw new Error('A session refers to a missing question.');

  const mistakeId = s.mistakeId == null ? undefined : id(s.mistakeId);
  if (mistakeId && !mistakeIds.has(mistakeId)) throw new Error('A session refers to a missing mistake.');

  const result: StudySession = {
    id: id(s.id),
    topicId,
    at: number(s.at, 'session date', 1),
    kind: oneOf(s.kind, ['study', 'review'] as const, 'session kind'),
    minutes: number(s.minutes, 'session minutes', 0, 1440),
    grade: integer(s.grade ?? 0, 'session grade', 0, 3) as ReviewGrade,
    effort: integer(s.effort ?? 3, 'session effort', 1, 5) as 1 | 2 | 3 | 4 | 5,
    prompt: string(s.prompt ?? '', 'session prompt', 6000),
    response: string(s.response ?? '', 'session response', 16000),
    confidence: oneOf<Confidence>(
      s.confidence ?? 'unsure',
      ['sure', 'partial', 'unsure'],
      'session confidence',
    ),
  };

  if (cardId) result.cardId = cardId;
  if (mistakeId) result.mistakeId = mistakeId;
  return result;
}

function breakLog(raw: unknown): BreakLog {
  const b = object(raw, 'break');
  return {
    at: number(b.at, 'break date', 1),
    minutes: number(b.minutes, 'break minutes', 0, 90),
  };
}

function settings(raw: unknown): WorkspaceSettings {
  if (raw == null) return defaultWorkspaceSettings();
  const s = object(raw, 'settings');
  return {
    dailyMinutes: integer(s.dailyMinutes ?? 90, 'daily minutes', 10, 720),
    focusMinutes: integer(s.focusMinutes ?? 45, 'focus minutes', 5, 90),
    breakMinutes: integer(s.breakMinutes ?? 10, 'break minutes', 1, 30),
    energy: oneOf(s.energy ?? 'normal', ['low', 'normal'] as const, 'energy'),
  };
}

export function validateWorkspaceV1(raw: unknown): WorkspaceState {
  const root = object(raw, 'workspace');

  if (root.format !== WORKSPACE_FORMAT) throw new Error('Not a MYELIN native workspace.');
  if (root.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error('Unsupported workspace schema.');

  const topics = array(root.topics ?? [], 'topics', 3000).map(topic);
  uniqueIds(topics, 'topic');

  const topicIds = new Set(topics.map((item) => item.id));
  const cardIds = new Set(topics.flatMap((item) => item.cards.map((card) => card.id)));

  const exams = array(root.exams ?? [], 'exams', 500).map((value) => exam(value, topicIds));
  uniqueIds(exams, 'exam');

  const mistakes = array(root.mistakes ?? [], 'mistakes', 10000).map((value) =>
    mistake(value, topicIds, cardIds),
  );
  uniqueIds(mistakes, 'mistake');
  const mistakeIds = new Set(mistakes.map((item) => item.id));

  const history = array(root.history ?? [], 'history', 50000).map((value) =>
    session(value, topicIds, cardIds, mistakeIds),
  );
  uniqueIds(history, 'session');

  const breaks = array(root.breaks ?? [], 'break history', 10000).map(breakLog);

  return {
    format: WORKSPACE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: integer(root.revision ?? 0, 'workspace revision', 0, 1_000_000_000),
    updatedAt: number(root.updatedAt ?? Date.now(), 'workspace update date', 1),
    topics,
    exams,
    mistakes,
    history,
    breaks,
    settings: settings(root.settings),
  };
}
