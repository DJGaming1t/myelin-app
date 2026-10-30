import {
  BreakLog,
  Confidence,
  Exam,
  Mistake,
  MistakeReason,
  RecallQuestion,
  ReviewGrade,
  StudySession,
  Topic,
  WorkspaceState,
  cloneWorkspace,
  createEmptyWorkspace,
} from '@/src/data/schema';
import { migrateAndValidateWorkspace } from '@/src/data/migrations';

export const NATIVE_BACKUP_FORMAT = 'myelin.native.backup' as const;
export const NATIVE_BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
// Compatibility for the first Feature 11 implementation still compiled in the app.
export const MAX_BACKUP_TEXT_BYTES = MAX_BACKUP_BYTES;

const DAY = 24 * 60 * 60 * 1000;
const ID = /^[a-zA-Z0-9_-]{1,120}$/;

export type ImportSource =
  | 'native-backup'
  | 'native-workspace'
  | 'web-v3'
  | 'web-v2'
  | 'web-v1';

export type ImportCandidate = {
  source: ImportSource;
  sourceLabel: string;
  workspace: WorkspaceState;
  warnings: string[];
  sourceUpdatedAt: number | null;
};

export type NativeBackupEnvelope = {
  format: typeof NATIVE_BACKUP_FORMAT;
  version: typeof NATIVE_BACKUP_VERSION;
  exportedAt: number;
  workspace: WorkspaceState;
};

export type MergeReport = {
  added: {
    topics: number;
    exams: number;
    mistakes: number;
    sessions: number;
    breaks: number;
    tasks: number;
    commitments: number;
  };
  skippedIdentical: number;
  remappedIds: number;
  keptCurrentSettings: true;
};

export type MergeResult = {
  workspace: WorkspaceState;
  report: MergeReport;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function num(
  value: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  const result = num(value, label, min, max);
  if (!Number.isInteger(result)) throw new Error(`Invalid ${label}.`);
  return result;
}

function str(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function nonEmpty(value: unknown, label: string, max: number) {
  const result = str(value, label, max);
  if (!result.trim()) throw new Error(`${label} cannot be empty.`);
  return result;
}

function recordId(value: unknown) {
  const result = str(value, 'record ID', 120);
  if (!ID.test(result)) throw new Error('Invalid record ID.');
  return result;
}

function uniqueIds(items: { id: string }[], label: string) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Duplicate ${label} IDs.`);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function utf8ByteLength(input: string) {
  let bytes = 0;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function legacySessionId(topicId: string, timestamp: number, index: number) {
  return `legacy_${stableHash(`${topicId}:${timestamp}:${index}`)}`;
}

function validConfidence(value: unknown): Confidence {
  return value === 'sure' || value === 'partial' ? value : 'unsure';
}

function validReason(value: unknown): MistakeReason {
  return value === 'calculation' ||
    value === 'recall' ||
    value === 'application'
    ? value
    : 'concept';
}

function validGrade(value: unknown, label: string, allowZero = true): ReviewGrade {
  const min = allowZero ? 0 : 1;
  return integer(value, label, min, 3) as ReviewGrade;
}

export function createNativeBackup(
  workspace: WorkspaceState,
  exportedAt = Date.now(),
): NativeBackupEnvelope {
  return {
    format: NATIVE_BACKUP_FORMAT,
    version: NATIVE_BACKUP_VERSION,
    exportedAt,
    workspace: migrateAndValidateWorkspace(cloneWorkspace(workspace)),
  };
}

export function serializeNativeBackup(
  workspace: WorkspaceState,
  exportedAt = Date.now(),
) {
  return JSON.stringify(createNativeBackup(workspace, exportedAt), null, 2);
}

function convertWebV3(raw: Record<string, unknown>, now: number): ImportCandidate {
  const warnings: string[] = [];
  const topicsRaw = array(raw.topics, 'topic list', 3000);
  const examsRaw = array(raw.exams, 'exam list', 500);
  const historyRaw = array(raw.history ?? [], 'study history', 50000);
  const mistakesRaw = array(raw.mistakes ?? [], 'mistake list', 10000);
  const breaksRaw = array(raw.breaks ?? [], 'break history', 10000);

  const state = createEmptyWorkspace(now);

  state.topics = topicsRaw.map((rawTopic) => {
    const t = object(rawTopic, 'topic');
    const status = t.status;
    if (status !== 'new' && status !== 'learning' && status !== 'review') {
      throw new Error('Invalid topic status.');
    }

    const cardsRaw = array(t.cards ?? [], 'question list', 500);
    const topic: Topic = {
      id: recordId(t.id),
      name: nonEmpty(t.name, 'topic name', 300),
      subject: nonEmpty(t.subject, 'subject', 120),
      createdAt: num(t.createdAt, 'topic creation date', 1),
      status,
      priority: integer(t.priority, 'topic priority', 1, 3) as 1 | 2 | 3,
      estimate: integer(t.estimate, 'topic estimate', 5, 240),
      notes: str(t.notes ?? '', 'topic notes', 20000),
      dueAt: num(t.dueAt ?? 0, 'topic due date'),
      intervalDays: num(t.intervalDays ?? 0, 'topic interval', 0, 3650),
      lastGrade: validGrade(t.lastGrade ?? 0, 'topic grade'),
      lastReviewed: num(t.lastReviewed ?? 0, 'topic review date'),
      snoozeUntil: num(t.snoozeUntil ?? 0, 'topic snooze date'),
      cards: cardsRaw.map((rawCard) => {
        const c = object(rawCard, 'question');
        return {
          id: recordId(c.id),
          prompt: nonEmpty(c.prompt, 'question', 6000),
          answer: str(c.answer ?? '', 'answer', 16000),
          hint: str(c.hint ?? '', 'hint', 4000),
          dueAt: num(c.dueAt ?? 0, 'question due date'),
          intervalDays: num(c.intervalDays ?? 0, 'question interval', 0, 3650),
          lastGrade: validGrade(c.lastGrade ?? 0, 'question grade'),
          lastReviewed: num(c.lastReviewed ?? 0, 'question review date'),
          reps: integer(c.reps ?? 0, 'question review count', 0, 1_000_000),
        } satisfies RecallQuestion;
      }),
    };

    uniqueIds(topic.cards, 'question');
    return topic;
  });
  uniqueIds(state.topics, 'topic');

  const topicIds = new Set(state.topics.map((topic) => topic.id));
  const cardIds = new Set(
    state.topics.flatMap((topic) => topic.cards.map((card) => card.id)),
  );

  state.exams = examsRaw.map((rawExam) => {
    const e = object(rawExam, 'exam');
    const subjects = array(e.subjects ?? [], 'exam subjects', 100).map((value) =>
      nonEmpty(value, 'exam subject', 120),
    );
    const requestedTopicIds = array(e.topicIds ?? [], 'exam topics', 300).map(recordId);
    const topicIdsForExam = requestedTopicIds.filter((topicId) => topicIds.has(topicId));
    if (topicIdsForExam.length !== requestedTopicIds.length) {
      warnings.push('An exam referenced missing web topics; those links were skipped.');
    }

    const topicScoped = e.scope === 'topics' || requestedTopicIds.length > 0;
    const allTopics = !topicScoped && subjects.length === 0;
    if (allTopics) {
      warnings.push(
        'A web exam applied to every subject; it was converted to an explicit all-topic scope.',
      );
    }

    return {
      id: recordId(e.id),
      name: nonEmpty(e.name, 'exam name', 200),
      date: num(e.date, 'exam date', 1),
      subjects: topicScoped || allTopics ? [] : subjects,
      scope: topicScoped || allTopics ? 'topics' : 'subjects',
      topicIds: topicScoped
        ? topicIdsForExam
        : allTopics
          ? [...topicIds]
          : [],
    } satisfies Exam;
  });
  uniqueIds(state.exams, 'exam');

  state.mistakes = mistakesRaw.map((rawMistake) => {
    const m = object(rawMistake, 'mistake');
    const topicId = recordId(m.topicId);
    if (!topicIds.has(topicId)) {
      throw new Error('A web mistake refers to a missing topic.');
    }

    let cardId = m.cardId ? recordId(m.cardId) : null;
    if (cardId && !cardIds.has(cardId)) {
      cardId = null;
      warnings.push('A mistake had a missing question link; the mistake itself was preserved.');
    }

    return {
      id: recordId(m.id),
      topicId,
      cardId,
      prompt: nonEmpty(m.prompt, 'mistake prompt', 6000),
      detail: str(m.detail ?? '', 'mistake detail', 16000),
      correction: str(m.correction ?? '', 'mistake correction', 16000),
      reason: validReason(m.reason),
      createdAt: num(m.createdAt, 'mistake creation date', 1),
      dueAt: num(m.dueAt ?? 0, 'mistake due date'),
      resolvedAt: num(m.resolvedAt ?? 0, 'mistake resolution date'),
      wins: integer(m.wins ?? 0, 'mistake wins', 0, 2),
      lastWinDay:
        typeof m.lastWinDay === 'string' ? m.lastWinDay.slice(0, 10) : '',
      intervalDays: num(m.intervalDays ?? 0, 'mistake interval', 0, 3650),
    } satisfies Mistake;
  });
  uniqueIds(state.mistakes, 'mistake');

  const mistakeIds = new Set(state.mistakes.map((mistake) => mistake.id));

  state.history = historyRaw.map((rawSession) => {
    const h = object(rawSession, 'study session');
    if (h.kind !== 'study' && h.kind !== 'review') {
      throw new Error('Invalid web session type.');
    }

    const topicId = recordId(h.topicId);
    if (!topicIds.has(topicId)) {
      throw new Error('A web session refers to a missing topic.');
    }

    const session: StudySession = {
      id: recordId(h.id),
      topicId,
      at: num(h.at, 'session date', 1),
      kind: h.kind,
      minutes: num(h.minutes, 'session minutes', 0, 1440),
      grade: validGrade(h.grade ?? 0, 'session grade'),
      effort: integer(h.effort ?? 3, 'session effort', 1, 5) as 1 | 2 | 3 | 4 | 5,
      prompt: str(h.prompt ?? '', 'session prompt', 6000),
      response: str(h.response ?? '', 'session response', 16000),
      confidence: validConfidence(h.confidence),
    };

    if (h.plannedMinutes != null) {
      const webPlanned = num(
        h.plannedMinutes,
        'planned session minutes',
        0,
        720,
      );
      session.plannedMinutes = Math.min(240, webPlanned);
      if (webPlanned > 240) {
        warnings.push(
          'A web planned-time value above the native limit was capped at 240 minutes.',
        );
      }
    }

    if (h.cardId) {
      const cardId = recordId(h.cardId);
      if (cardIds.has(cardId)) session.cardId = cardId;
      else warnings.push('A study-history question link was missing and was skipped.');
    }

    if (h.mistakeId) {
      const mistakeId = recordId(h.mistakeId);
      if (mistakeIds.has(mistakeId)) session.mistakeId = mistakeId;
      else warnings.push('A study-history mistake link was missing and was skipped.');
    }

    return session;
  });
  uniqueIds(state.history, 'session');

  state.breaks = breaksRaw.map((rawBreak) => {
    const b = object(rawBreak, 'break');
    return {
      at: num(b.at, 'break date', 1),
      minutes: num(b.minutes, 'break minutes', 0, 90),
    } satisfies BreakLog;
  });

  const p = raw.settings == null ? {} : object(raw.settings, 'settings');
  state.settings = {
    dailyMinutes: integer(p.dailyMinutes ?? 90, 'daily minutes', 10, 720),
    focusMinutes: integer(p.focusMinutes ?? 45, 'focus minutes', 5, 90),
    breakMinutes: integer(p.breakMinutes ?? 10, 'break minutes', 1, 30),
    energy: p.energy === 'low' ? 'low' : 'normal',
    reduceMotion: false,
  };

  state.revision = 0;
  state.updatedAt = num(raw.updatedAt ?? now, 'web update date', 1);

  if (raw.focus) {
    warnings.push(
      'An in-progress web timer was not migrated. Completed study history is preserved.',
    );
  }
  if (raw.reviewDraft) {
    warnings.push(
      'An unfinished web review draft was not migrated. Saved review scheduling is preserved.',
    );
  }

  return {
    source: 'web-v3',
    sourceLabel: 'MYELIN web v3',
    workspace: migrateAndValidateWorkspace(state),
    warnings: [...new Set(warnings)],
    sourceUpdatedAt: state.updatedAt,
  };
}

function convertLegacyWeb(
  raw: Record<string, unknown>,
  version: 1 | 2,
  now: number,
): ImportCandidate {
  const topicsRaw = array(raw.topics, 'legacy topic list', 3000);
  const examsRaw = array(raw.exams, 'legacy exam list', 500);
  const state = createEmptyWorkspace(now);

  const allHistory: StudySession[] = [];

  state.topics = topicsRaw.map((rawTopic) => {
    const t = object(rawTopic, 'legacy topic');
    const topicId = recordId(t.id);
    const lastAction = num(t.lastAction, 'legacy topic date', 1);
    const stability = num(t.S, 'legacy stability', 0.01, 10000);
    const historyRaw = array(t.history, 'legacy topic history', 5000);
    const createdAt = num(t.createdAt ?? lastAction, 'legacy creation date', 1);

    const topic: Topic = {
      id: topicId,
      name: nonEmpty(t.name, 'topic name', 300),
      subject: nonEmpty(t.subject, 'subject', 120),
      createdAt,
      status: 'learning',
      priority: 2,
      estimate: 45,
      notes: '',
      cards: [],
      dueAt: Math.max(
        lastAction + stability * Math.log(1 / 0.75) * DAY,
        typeof t.snooze === 'number' ? t.snooze : 0,
      ),
      intervalDays: Math.max(0.01, stability * Math.log(1 / 0.75)),
      lastGrade: 0,
      lastReviewed: 0,
      snoozeUntil: 0,
    };

    historyRaw.forEach((rawHistory, index) => {
      const h = object(rawHistory, 'legacy history event');
      if (h.kind !== 'review' && h.kind !== 'log') {
        throw new Error('Invalid legacy history kind.');
      }
      const at = num(h.t, 'legacy history date', 1);
      const isReview = h.kind === 'review';
      const grade = isReview
        ? validGrade(h.grade, 'legacy review grade', false)
        : 0;

      const event: StudySession = {
        id: legacySessionId(topicId, at, index),
        topicId,
        at,
        kind: isReview ? 'review' : 'study',
        minutes: num(
          isReview ? h.elapsed ?? 0 : h.minutes,
          'legacy session minutes',
          0,
          1440,
        ),
        grade,
        effort: isReview
          ? 3
          : (integer(h.effort, 'legacy effort', 1, 5) as 1 | 2 | 3 | 4 | 5),
        prompt: isReview ? 'Topic recall' : '',
        response: '',
        confidence: 'unsure',
      };
      allHistory.push(event);

      if (isReview) {
        topic.lastGrade = grade;
        topic.lastReviewed = at;
        topic.status = 'review';
      }
    });

    return topic;
  });
  uniqueIds(state.topics, 'topic');

  state.exams = examsRaw.map((rawExam) => {
    const e = object(rawExam, 'legacy exam');
    return {
      id: recordId(e.id),
      name: nonEmpty(e.name, 'exam name', 200),
      date: num(e.date, 'exam date', 1),
      subjects: [nonEmpty(e.subject, 'exam subject', 120)],
      scope: 'subjects',
      topicIds: [],
    } satisfies Exam;
  });
  uniqueIds(state.exams, 'exam');

  state.history = allHistory;
  uniqueIds(state.history, 'session');

  return {
    source: version === 2 ? 'web-v2' : 'web-v1',
    sourceLabel: `MYELIN web v${version}`,
    workspace: migrateAndValidateWorkspace(state),
    warnings: [
      'Older web backups did not contain modern questions, mistake records, or detailed settings. Available topics, exams and history were converted.',
    ],
    sourceUpdatedAt: null,
  };
}

export function parseImportJson(
  rawText: string,
  now = Date.now(),
): ImportCandidate {
  if (utf8ByteLength(rawText) > MAX_BACKUP_BYTES) {
    throw new Error('Choose a MYELIN backup smaller than 8 MB.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  const root = object(parsed, 'backup');

  if (root.format === NATIVE_BACKUP_FORMAT) {
    if (root.version !== NATIVE_BACKUP_VERSION) {
      throw new Error('This MYELIN backup version is not supported yet.');
    }
    const workspace = migrateAndValidateWorkspace(root.workspace);
    return {
      source: 'native-backup',
      sourceLabel: 'MYELIN native backup',
      workspace,
      warnings: [],
      sourceUpdatedAt: workspace.updatedAt,
    };
  }

  if (root.format === 'myelin.native.workspace') {
    const workspace = migrateAndValidateWorkspace(root);
    return {
      source: 'native-workspace',
      sourceLabel: 'MYELIN native workspace',
      workspace,
      warnings: [],
      sourceUpdatedAt: workspace.updatedAt,
    };
  }

  if (root.version === 3) {
    return convertWebV3(root, now);
  }

  if (root.ver === 1 || root.ver === 2) {
    return convertLegacyWeb(root, root.ver, now);
  }

  throw new Error(
    'Choose a MYELIN native backup or a supported MYELIN web v1/v2/v3 JSON backup.',
  );
}

function comparable(value: unknown) {
  return JSON.stringify(value);
}

function allocateId(original: string, used: Set<string>, prefix: string) {
  if (!used.has(original)) {
    used.add(original);
    return { id: original, remapped: false };
  }

  const base = `${prefix}_${stableHash(original)}`;
  let candidate = base.slice(0, 110);
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 105)}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return { id: candidate, remapped: true };
}

export function mergeWorkspaces(
  current: WorkspaceState,
  imported: WorkspaceState,
): MergeResult {
  const next = cloneWorkspace(current);
  const report: MergeReport = {
    added: {
      topics: 0,
      exams: 0,
      mistakes: 0,
      sessions: 0,
      breaks: 0,
      tasks: 0,
      commitments: 0,
    },
    skippedIdentical: 0,
    remappedIds: 0,
    keptCurrentSettings: true,
  };

  const topicMap = new Map<string, string>();
  const cardMap = new Map<string, string>();
  const mistakeMap = new Map<string, string>();
  const examMap = new Map<string, string>();

  const usedTopicIds = new Set(next.topics.map((topic) => topic.id));
  const usedCardIds = new Set(
    next.topics.flatMap((topic) => topic.cards.map((card) => card.id)),
  );
  const usedExamIds = new Set(next.exams.map((exam) => exam.id));
  const usedMistakeIds = new Set(next.mistakes.map((mistake) => mistake.id));
  const usedSessionIds = new Set(next.history.map((session) => session.id));
  const usedTaskIds = new Set(next.tasks.map((task) => task.id));
  const usedCommitmentIds = new Set(next.commitments.map((item) => item.id));

  for (const sourceTopic of imported.topics) {
    const existing = next.topics.find((topic) => topic.id === sourceTopic.id);
    if (existing && comparable(existing) === comparable(sourceTopic)) {
      topicMap.set(sourceTopic.id, existing.id);
      for (const card of sourceTopic.cards) cardMap.set(card.id, card.id);
      report.skippedIdentical += 1;
      continue;
    }

    const topicAllocation = allocateId(sourceTopic.id, usedTopicIds, 'topic_import');
    if (topicAllocation.remapped) report.remappedIds += 1;
    topicMap.set(sourceTopic.id, topicAllocation.id);

    const topic = clone(sourceTopic);
    topic.id = topicAllocation.id;
    topic.cards = topic.cards.map((card) => {
      const allocation = allocateId(card.id, usedCardIds, 'card_import');
      if (allocation.remapped) report.remappedIds += 1;
      cardMap.set(card.id, allocation.id);
      return { ...card, id: allocation.id };
    });

    next.topics.push(topic);
    report.added.topics += 1;
  }

  for (const sourceExam of imported.exams) {
    const exam = clone(sourceExam);
    exam.topicIds = exam.topicIds
      .map((topicId) => topicMap.get(topicId) ?? topicId)
      .filter((topicId) => usedTopicIds.has(topicId));

    const existing = next.exams.find((item) => item.id === exam.id);
    if (existing && comparable(existing) === comparable(exam)) {
      examMap.set(sourceExam.id, existing.id);
      report.skippedIdentical += 1;
      continue;
    }

    const allocation = allocateId(exam.id, usedExamIds, 'exam_import');
    if (allocation.remapped) report.remappedIds += 1;
    exam.id = allocation.id;
    examMap.set(sourceExam.id, exam.id);
    next.exams.push(exam);
    report.added.exams += 1;
  }

  for (const sourceMistake of imported.mistakes) {
    const mistake = clone(sourceMistake);
    mistake.topicId = topicMap.get(mistake.topicId) ?? mistake.topicId;
    mistake.cardId = mistake.cardId
      ? cardMap.get(mistake.cardId) ?? mistake.cardId
      : null;

    const existing = next.mistakes.find((item) => item.id === mistake.id);
    if (existing && comparable(existing) === comparable(mistake)) {
      mistakeMap.set(sourceMistake.id, existing.id);
      report.skippedIdentical += 1;
      continue;
    }

    const allocation = allocateId(
      mistake.id,
      usedMistakeIds,
      'mistake_import',
    );
    if (allocation.remapped) report.remappedIds += 1;
    mistake.id = allocation.id;
    mistakeMap.set(sourceMistake.id, mistake.id);
    next.mistakes.push(mistake);
    report.added.mistakes += 1;
  }

  for (const sourceSession of imported.history) {
    const session = clone(sourceSession);
    session.topicId = topicMap.get(session.topicId) ?? session.topicId;
    if (session.cardId) {
      session.cardId = cardMap.get(session.cardId) ?? session.cardId;
    }
    if (session.mistakeId) {
      session.mistakeId =
        mistakeMap.get(session.mistakeId) ?? session.mistakeId;
    }

    const existing = next.history.find((item) => item.id === session.id);
    if (existing && comparable(existing) === comparable(session)) {
      report.skippedIdentical += 1;
      continue;
    }

    const allocation = allocateId(
      session.id,
      usedSessionIds,
      'session_import',
    );
    if (allocation.remapped) report.remappedIds += 1;
    session.id = allocation.id;
    next.history.push(session);
    report.added.sessions += 1;
  }

  for (const sourceTask of imported.tasks) {
    const task = clone(sourceTask);
    task.topicId = task.topicId ? topicMap.get(task.topicId) ?? task.topicId : null;
    task.examId = task.examId ? examMap.get(task.examId) ?? task.examId : null;

    const existing = next.tasks.find((item) => item.id === task.id);
    if (existing && comparable(existing) === comparable(task)) {
      report.skippedIdentical += 1;
      continue;
    }

    const allocation = allocateId(task.id, usedTaskIds, 'task_import');
    if (allocation.remapped) report.remappedIds += 1;
    task.id = allocation.id;
    next.tasks.push(task);
    report.added.tasks += 1;
  }

  for (const sourceCommitment of imported.commitments) {
    const item = clone(sourceCommitment);
    const existing = next.commitments.find((currentItem) => currentItem.id === item.id);
    if (existing && comparable(existing) === comparable(item)) {
      report.skippedIdentical += 1;
      continue;
    }

    const allocation = allocateId(item.id, usedCommitmentIds, 'commitment_import');
    if (allocation.remapped) report.remappedIds += 1;
    item.id = allocation.id;
    next.commitments.push(item);
    report.added.commitments += 1;
  }

  const existingBreaks = new Set(
    next.breaks.map((entry) => `${entry.at}:${entry.minutes}`),
  );
  for (const entry of imported.breaks) {
    const key = `${entry.at}:${entry.minutes}`;
    if (existingBreaks.has(key)) {
      report.skippedIdentical += 1;
      continue;
    }
    existingBreaks.add(key);
    next.breaks.push(clone(entry));
    report.added.breaks += 1;
  }

  // Outcomes contain no content references. Prefer a terminal record over a stale start.
  const outcomes = new Map((next.focusOutcomes ?? []).map(o => [o.id, o]));
  for (const o of imported.focusOutcomes ?? []) {
    const existing = outcomes.get(o.id);
    if (!existing || (existing.status === 'started' && o.status !== 'started')) outcomes.set(o.id, clone(o));
  }
  next.focusOutcomes = [...outcomes.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-2000);
  next.settings = clone(current.settings);
  return {
    workspace: migrateAndValidateWorkspace(next),
    report,
  };
}

export function workspaceImportCounts(workspace: WorkspaceState) {
  return {
    topics: workspace.topics.length,
    questions: workspace.topics.reduce(
      (sum, topic) => sum + topic.cards.length,
      0,
    ),
    exams: workspace.exams.length,
    mistakes: workspace.mistakes.length,
    sessions: workspace.history.length,
    breaks: workspace.breaks.length,
    tasks: workspace.tasks.length,
    commitments: workspace.commitments.length,
  };
}

export function isImportOlderThanCurrent(
  candidate: ImportCandidate,
  current: WorkspaceState,
) {
  return (
    candidate.sourceUpdatedAt !== null &&
    candidate.sourceUpdatedAt < current.updatedAt
  );
}
