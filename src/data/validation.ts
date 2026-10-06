import { parseLocalDate } from '@/src/features/planning/commitment-dates';
import {
  AssistantRequestReceipt,
  BreakLog,
  Commitment,
  CommitmentKind,
  FocusOutcome,
  MemoryState,
  Confidence,
  CURRENT_SCHEMA_VERSION,
  Exam,
  Mistake,
  MistakeReason,
  Priority,
  RecallQuestion,
  ReviewGrade,
  StudySession,
  StudyTask,
  StudyTaskPlanState,
  StudyTaskStatus,
  StudyTaskType,
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

function memory(raw: unknown): MemoryState {
  const m = object(raw, 'question memory');
  return { version: integer(m.version, 'memory version', 1, 1) as 1,
    stability: number(m.stability, 'memory stability', 0.01, 3650),
    difficulty: number(m.difficulty, 'memory difficulty', 1, 10),
    lapses: integer(m.lapses, 'memory lapses', 0, 1_000_000) };
}

function outcome(raw: unknown): FocusOutcome {
  const o = object(raw, 'focus outcome');
  const startedAt = number(o.startedAt, 'outcome start', 1);
  const endedAt = number(o.endedAt, 'outcome end');
  const status = oneOf(o.status, ['started', 'finished', 'abandoned'] as const, 'outcome status');
  if ((status === 'started' && endedAt !== 0) || (status !== 'started' && endedAt < startedAt)) throw new Error('Invalid outcome timing.');
  return { id: id(o.id), startedAt, endedAt, status,
    plannedMinutes: number(o.plannedMinutes, 'outcome planned minutes', 5, 240),
    minutes: number(o.minutes, 'outcome minutes', 0, 240),
    launchMode: oneOf(o.launchMode, ['full', 'five-minute'] as const, 'outcome launch'),
    taskOnly: o.taskOnly === true, overdue: o.overdue === true };
}

function question(raw: unknown): RecallQuestion {
  const q = object(raw, 'question');
  return {
    id: id(q.id),
    ...(q.memory == null ? {} : { memory: memory(q.memory) }),
    ...(q.confusionGroup == null ? {} : { confusionGroup: string(q.confusionGroup, 'confusion group', 80).trim() }),
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
    ...(t.preferredBlockMinutes == null
      ? {}
      : {
          preferredBlockMinutes: integer(
            t.preferredBlockMinutes,
            'topic preferred block minutes',
            5,
            90,
          ),
        }),
    ...(t.postponements == null ? {} : { postponements: integer(t.postponements, 'topic postponements', 0, 100000) }),
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

  if (s.plannedMinutes != null) {
    result.plannedMinutes = number(s.plannedMinutes, 'planned session minutes', 0, 720);
  }
  if (s.startedAt != null) {
    result.startedAt = number(s.startedAt, 'session start time', 1);
  }
  if (s.endedAt != null) {
    result.endedAt = number(s.endedAt, 'session end time', 1);
  }
  if (s.launchMode != null) {
    result.launchMode = oneOf(
      s.launchMode,
      ['full', 'five-minute'] as const,
      'focus launch mode',
    );
  }
  if (s.tinyStep != null) {
    result.tinyStep = string(s.tinyStep, 'first tiny step', 500);
  }
  if (s.hintUsed != null) {
    if (typeof s.hintUsed !== 'boolean') throw new Error('Invalid hint-used flag.');
    result.hintUsed = s.hintUsed;
  }
  if (s.elapsedDays != null) result.elapsedDays = number(s.elapsedDays, 'elapsed review days', 0, 100000);
  if (s.predictedRecall != null) result.predictedRecall = number(s.predictedRecall, 'predicted recall', 0, 1);
  if (s.reviewAttemptId != null) {
    result.reviewAttemptId = id(s.reviewAttemptId);
  }

  return result;
}

function breakLog(raw: unknown): BreakLog {
  const b = object(raw, 'break');
  return {
    at: number(b.at, 'break date', 1),
    minutes: number(b.minutes, 'break minutes', 0, 90),
  };
}

function task(raw: unknown, topicIds: Set<string>, examIds: Set<string>): StudyTask {
  const t = object(raw, 'study task');
  const rawTopicId = t.topicId == null ? null : id(t.topicId);
  const rawExamId = t.examId == null ? null : id(t.examId);
  const scheduledStart = number(t.scheduledStart ?? 0, 'task scheduled start');
  const scheduledEnd = number(t.scheduledEnd ?? 0, 'task scheduled end');
  if ((scheduledStart === 0) !== (scheduledEnd === 0)) {
    throw new Error('Task schedule must include both start and end.');
  }
  if (scheduledStart > 0 && scheduledEnd <= scheduledStart) {
    throw new Error('Task scheduled end must be after its start.');
  }

  return {
    id: id(t.id),
    title: nonEmpty(t.title, 'task title', 500),
    postponements: integer(t.postponements ?? 0, 'task postponements', 0, 100000),
    lastPostponedAt: number(t.lastPostponedAt ?? 0, 'last postponement'),
    steps: array(t.steps ?? [], 'task steps', 12).map(value => nonEmpty(value, 'task step', 500)),
    ...(t.launchTrial == null ? {} : { launchTrial: (() => {
      const trial = object(t.launchTrial, 'launch trial');
      return { variant: oneOf(trial.variant, ['five-minute', 'standard'] as const, 'launch variant'),
        offeredAt: number(trial.offeredAt, 'launch offered', 1), startedAt: number(trial.startedAt, 'launch started') };
    })() }),
    subject: string(t.subject ?? '', 'task subject', 120),
    topicId: rawTopicId && topicIds.has(rawTopicId) ? rawTopicId : null,
    examId: rawExamId && examIds.has(rawExamId) ? rawExamId : null,
    type: oneOf<StudyTaskType>(
      t.type ?? 'homework',
      ['homework', 'revision', 'practice', 'assignment', 'personal'],
      'task type',
    ),
    status: oneOf<StudyTaskStatus>(
      t.status ?? 'open',
      ['open', 'completed'],
      'task status',
    ),
    planState: oneOf<StudyTaskPlanState>(
      t.planState ?? 'inbox',
      ['inbox', 'today', 'scheduled', 'postponed'],
      'task plan state',
    ),
    dueAt: number(t.dueAt ?? 0, 'task due date'),
    estimatedMinutes: integer(t.estimatedMinutes ?? 0, 'task estimate', 0, 720),
    actualMinutes: integer(t.actualMinutes ?? 0, 'task actual minutes', 0, 100000),
    priority: integer(t.priority ?? 2, 'task priority', 1, 3) as Priority,
    notes: string(t.notes ?? '', 'task notes', 12000),
    scheduledStart,
    scheduledEnd,
    postponedUntil: number(t.postponedUntil ?? 0, 'task postponed until'),
    createdAt: number(t.createdAt, 'task creation date', 1),
    updatedAt: number(t.updatedAt ?? t.createdAt, 'task update date', 1),
    completedAt: number(t.completedAt ?? 0, 'task completion date'),
    ...(t.lastFocusSessionId == null
      ? {}
      : { lastFocusSessionId: id(t.lastFocusSessionId) }),
    ...(t.focusDayKey == null
      ? {}
      : {
          focusDayKey: (() => {
            const value = string(t.focusDayKey, 'task focus day', 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              throw new Error('Invalid task focus day.');
            }
            return value;
          })(),
        }),
    ...(t.focusMinutesForDay == null
      ? {}
      : {
          focusMinutesForDay: integer(
            t.focusMinutesForDay,
            'task focus minutes for day',
            0,
            1440,
          ),
        }),
  };
}

function commitment(raw: unknown): Commitment {
  const c = object(raw, 'commitment');
  const startAt = number(c.startAt, 'commitment start', 1);
  const endAt = number(c.endAt, 'commitment end', 1);

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  const startMinutes = integer(
    c.startMinutes ?? startDate.getHours() * 60 + startDate.getMinutes(),
    'commitment start minutes',
    0,
    1439,
  );
  const endMinutes = integer(
    c.endMinutes ?? endDate.getHours() * 60 + endDate.getMinutes(),
    'commitment end minutes',
    0,
    1439,
  );

  const recurrenceDays = Array.from(
    new Set(
      array(c.recurrenceDays ?? [], 'commitment recurrence', 7).map((value) =>
        integer(value, 'commitment weekday', 0, 6),
      ),
    ),
  ).sort((a, b) => a - b);
  const skippedDates = Array.from(
    new Set(
      array(c.skippedDates ?? [], 'commitment skipped dates', 366).map((value) => {
        const date = string(value, 'commitment skipped date', 10);
        if (parseLocalDate(date) === null) {
          throw new Error('Invalid commitment skipped date.');
        }
        return date;
      }),
    ),
  ).sort();

  if (recurrenceDays.length) {
    if (startMinutes === endMinutes) {
      throw new Error('Recurring commitment must have a non-zero duration.');
    }
  } else if (endAt <= startAt) {
    throw new Error('Commitment end must be after its start.');
  }

  return {
    id: id(c.id),
    title: nonEmpty(c.title, 'commitment title', 300),
    kind: oneOf<CommitmentKind>(
      c.kind ?? 'other',
      ['school', 'tuition', 'coaching', 'meal', 'commute', 'sleep', 'appointment', 'other'],
      'commitment type',
    ),
    startAt,
    endAt,
    startMinutes,
    endMinutes,
    recurrenceDays,
    skippedDates,
    createdAt: number(c.createdAt, 'commitment creation date', 1),
    updatedAt: number(c.updatedAt ?? c.createdAt, 'commitment update date', 1),
  };
}

function assistantReceipt(raw: unknown): AssistantRequestReceipt {
  const r = object(raw, 'assistant request receipt');
  return {
    requestId: nonEmpty(r.requestId, 'assistant request ID', 120),
    digest: nonEmpty(r.digest, 'assistant request digest', 120),
    appliedAt: number(r.appliedAt, 'assistant request applied date', 1),
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
    reduceMotion: s.reduceMotion === true,
    sleepEnabled: s.sleepEnabled !== false,
    sleepStartMinutes: integer(s.sleepStartMinutes ?? 1350, 'bedtime', 0, 1439),
    wakeMinutes: integer(s.wakeMinutes ?? 420, 'wake time', 0, 1439),
    launchExperiment: s.launchExperiment === true,
  };
}

export function validateWorkspaceV2(raw: unknown): WorkspaceState {
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

  const examIds = new Set(exams.map((item) => item.id));
  const tasks = array(root.tasks ?? [], 'study tasks', 10000).map((value) =>
    task(value, topicIds, examIds),
  );
  uniqueIds(tasks, 'task');

  const commitments = array(root.commitments ?? [], 'commitments', 3000).map(commitment);
  uniqueIds(commitments, 'commitment');

  const focusOutcomes = array(root.focusOutcomes ?? [], 'focus outcomes', 2000).map(outcome);
  uniqueIds(focusOutcomes, 'focus outcome');

  const assistantReceipts = array(
    root.assistantReceipts ?? [],
    'assistant request receipts',
    200,
  ).map(assistantReceipt);
  if (new Set(assistantReceipts.map((item) => item.requestId)).size !== assistantReceipts.length) {
    throw new Error('Duplicate assistant request receipt IDs.');
  }

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
    tasks,
    commitments,
    focusOutcomes,
    assistantReceipts,
    settings: settings(root.settings),
  };
}


export const validateWorkspaceV1 = validateWorkspaceV2;
