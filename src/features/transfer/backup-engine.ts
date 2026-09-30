import {
  CURRENT_SCHEMA_VERSION,
  WORKSPACE_FORMAT,
  WorkspaceState,
  createEmptyWorkspace,
} from '@/src/data/schema';
import { migrateAndValidateWorkspace } from '@/src/data/migrations';

export const NATIVE_BACKUP_FORMAT = 'myelin.native.backup' as const;
export const NATIVE_BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_TEXT_BYTES = 25_000_000;

const DAY = 86_400_000;

export type BackupEnvelope = {
  format: typeof NATIVE_BACKUP_FORMAT;
  version: typeof NATIVE_BACKUP_VERSION;
  exportedAt: number;
  workspace: WorkspaceState;
};

export type ImportSource =
  | 'native-backup'
  | 'native-workspace'
  | 'web-v3'
  | 'web-legacy-v1'
  | 'web-legacy-v2';

export type ImportRelation =
  | 'current-empty'
  | 'source-newer'
  | 'source-older'
  | 'same-time'
  | 'unknown';

export type ImportPreview = {
  source: ImportSource;
  sourceLabel: string;
  workspace: WorkspaceState;
  sourceUpdatedAt: number | null;
  sourceRevision: number | null;
  relation: ImportRelation;
  warnings: string[];
  counts: {
    topics: number;
    questions: number;
    exams: number;
    mistakes: number;
    sessions: number;
    breaks: number;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string, max: number) {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function text(value: unknown, label: string, max: number, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
  if (!allowEmpty && !value.trim()) throw new Error(`${label} cannot be empty.`);
  return value;
}

function recordId(value: unknown) {
  const id = text(value, 'record ID', 120, false);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid record ID.');
  return id;
}

function finiteNumber(
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

function int(
  value: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  const result = finiteNumber(value, label, min, max);
  if (!Number.isInteger(result)) throw new Error(`Invalid ${label}.`);
  return result;
}

function uniqueById(items: { id: string }[], label: string) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Duplicate ${label} IDs.`);
  }
}

function stableLegacyId(topicId: string, index: number) {
  return `web_${topicId}_${index}`.slice(0, 120);
}

function isWorkspaceEmpty(workspace: WorkspaceState) {
  return (
    workspace.topics.length === 0 &&
    workspace.exams.length === 0 &&
    workspace.mistakes.length === 0 &&
    workspace.history.length === 0 &&
    workspace.breaks.length === 0
  );
}

function counts(workspace: WorkspaceState) {
  return {
    topics: workspace.topics.length,
    questions: workspace.topics.reduce((sum, topic) => sum + topic.cards.length, 0),
    exams: workspace.exams.length,
    mistakes: workspace.mistakes.length,
    sessions: workspace.history.length,
    breaks: workspace.breaks.length,
  };
}

function relationToCurrent(
  sourceUpdatedAt: number | null,
  sourceRevision: number | null,
  current: WorkspaceState,
): ImportRelation {
  if (isWorkspaceEmpty(current)) return 'current-empty';
  if (sourceUpdatedAt == null) return 'unknown';

  if (sourceUpdatedAt > current.updatedAt) return 'source-newer';
  if (sourceUpdatedAt < current.updatedAt) return 'source-older';

  if (sourceRevision != null) {
    if (sourceRevision > current.revision) return 'source-newer';
    if (sourceRevision < current.revision) return 'source-older';
  }

  return 'same-time';
}

export function createNativeBackup(
  workspace: WorkspaceState,
  exportedAt = Date.now(),
): BackupEnvelope {
  return {
    format: NATIVE_BACKUP_FORMAT,
    version: NATIVE_BACKUP_VERSION,
    exportedAt,
    workspace: migrateAndValidateWorkspace(workspace),
  };
}

export function serializeNativeBackup(
  workspace: WorkspaceState,
  exportedAt = Date.now(),
) {
  return JSON.stringify(createNativeBackup(workspace, exportedAt), null, 2);
}

function convertWebV3(raw: Record<string, unknown>) {
  const topicsRaw = array(raw.topics, 'web topics', 3000);
  const examsRaw = array(raw.exams, 'web exams', 500);
  const historyRaw = array(raw.history ?? [], 'web history', 50_000);
  const mistakesRaw = array(raw.mistakes ?? [], 'web mistakes', 10_000);
  const breaksRaw = array(raw.breaks ?? [], 'web breaks', 10_000);

  const topics = topicsRaw.map((value) => {
    const t = object(value, 'web topic');
    const cardsRaw = array(t.cards ?? [], 'web question list', 500);
    const cards = cardsRaw.map((cardValue) => {
      const c = object(cardValue, 'web question');
      return {
        id: recordId(c.id),
        prompt: text(c.prompt, 'question', 6000, false),
        answer: text(c.answer ?? '', 'answer', 16_000),
        hint: text(c.hint ?? '', 'hint', 4000),
        dueAt: finiteNumber(c.dueAt ?? 0, 'question due date'),
        intervalDays: finiteNumber(c.intervalDays ?? 0, 'question interval', 0, 3650),
        lastGrade: int(c.lastGrade ?? 0, 'question grade', 0, 3),
        lastReviewed: finiteNumber(c.lastReviewed ?? 0, 'question review date'),
        reps: int(c.reps ?? 0, 'question review count', 0, 1_000_000),
      };
    });
    uniqueById(cards, 'question');

    const status = t.status;
    if (status !== 'new' && status !== 'learning' && status !== 'review') {
      throw new Error('Invalid web topic status.');
    }

    return {
      id: recordId(t.id),
      name: text(t.name, 'topic name', 300, false),
      subject: text(t.subject, 'subject', 120, false),
      createdAt: finiteNumber(t.createdAt, 'topic creation date', 1),
      status,
      priority: int(t.priority, 'priority', 1, 3),
      estimate: int(t.estimate, 'topic estimate', 5, 240),
      notes: text(t.notes ?? '', 'notes', 20_000),
      dueAt: finiteNumber(t.dueAt ?? 0, 'topic due date'),
      intervalDays: finiteNumber(t.intervalDays ?? 0, 'topic interval', 0, 3650),
      lastGrade: int(t.lastGrade ?? 0, 'topic grade', 0, 3),
      lastReviewed: finiteNumber(t.lastReviewed ?? 0, 'topic review date'),
      snoozeUntil: finiteNumber(t.snoozeUntil ?? 0, 'topic snooze date'),
      cards,
    };
  });
  uniqueById(topics, 'topic');

  const topicIds = new Set(topics.map((topic) => topic.id));
  const cardIds = new Set(topics.flatMap((topic) => topic.cards.map((card) => card.id)));

  const exams = examsRaw.map((value) => {
    const e = object(value, 'web exam');
    const subjects = array(e.subjects ?? [], 'exam subjects', 100).map((subject) =>
      text(subject, 'exam subject', 120, false),
    );
    const selectedTopicIds = array(e.topicIds ?? [], 'exam topics', 300)
      .map(recordId)
      .filter((topicId) => topicIds.has(topicId));
    const scope = e.scope === 'topics' || selectedTopicIds.length > 0 ? 'topics' : 'subjects';

    return {
      id: recordId(e.id),
      name: text(e.name, 'exam name', 200, false),
      date: finiteNumber(e.date, 'exam date', 1),
      subjects: scope === 'subjects' ? subjects : [],
      scope,
      topicIds: scope === 'topics' ? selectedTopicIds : [],
    };
  });
  uniqueById(exams, 'exam');

  const mistakes = mistakesRaw.map((value) => {
    const m = object(value, 'web mistake');
    const topicId = recordId(m.topicId);
    if (!topicIds.has(topicId)) throw new Error('A web mistake refers to a missing topic.');

    const rawCardId = m.cardId ? recordId(m.cardId) : null;
    const cardId = rawCardId && cardIds.has(rawCardId) ? rawCardId : null;
    const reason =
      m.reason === 'calculation' ||
      m.reason === 'recall' ||
      m.reason === 'application'
        ? m.reason
        : 'concept';

    return {
      id: recordId(m.id),
      topicId,
      cardId,
      prompt: text(m.prompt, 'mistake prompt', 6000, false),
      detail: text(m.detail ?? '', 'mistake detail', 16_000),
      correction: text(m.correction ?? '', 'mistake correction', 16_000),
      reason,
      createdAt: finiteNumber(m.createdAt, 'mistake creation date', 1),
      dueAt: finiteNumber(m.dueAt ?? 0, 'mistake due date'),
      resolvedAt: finiteNumber(m.resolvedAt ?? 0, 'mistake resolution date'),
      wins: int(m.wins ?? 0, 'mistake wins', 0, 2),
      lastWinDay:
        typeof m.lastWinDay === 'string' ? m.lastWinDay.slice(0, 10) : '',
      intervalDays: finiteNumber(m.intervalDays ?? 0, 'mistake interval', 0, 3650),
    };
  });
  uniqueById(mistakes, 'mistake');
  const mistakeIds = new Set(mistakes.map((mistake) => mistake.id));

  const history = historyRaw.map((value) => {
    const h = object(value, 'web session');
    const topicId = recordId(h.topicId);
    if (!topicIds.has(topicId)) throw new Error('A web session refers to a missing topic.');
    if (h.kind !== 'study' && h.kind !== 'review') {
      throw new Error('Invalid web session type.');
    }

    const event: Record<string, unknown> = {
      id: recordId(h.id),
      topicId,
      at: finiteNumber(h.at, 'session date', 1),
      kind: h.kind,
      minutes: finiteNumber(h.minutes, 'session minutes', 0, 1440),
      grade: int(h.grade ?? 0, 'session grade', 0, 3),
      effort: int(h.effort ?? 3, 'session effort', 1, 5),
      prompt: text(h.prompt ?? '', 'session prompt', 6000),
      response: text(h.response ?? '', 'session response', 16_000),
      confidence:
        h.confidence === 'sure' || h.confidence === 'partial'
          ? h.confidence
          : 'unsure',
    };

    const rawCardId = h.cardId ? recordId(h.cardId) : null;
    if (rawCardId && cardIds.has(rawCardId)) event.cardId = rawCardId;

    const rawMistakeId = h.mistakeId ? recordId(h.mistakeId) : null;
    if (rawMistakeId && mistakeIds.has(rawMistakeId)) event.mistakeId = rawMistakeId;

    if (h.plannedMinutes != null) {
      event.plannedMinutes = finiteNumber(
        h.plannedMinutes,
        'planned session minutes',
        0,
        720,
      );
    }

    return event;
  });
  uniqueById(history as { id: string }[], 'session');

  const settingsRaw =
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as Record<string, unknown>)
      : {};

  const settings = {
    dailyMinutes: int(settingsRaw.dailyMinutes ?? 90, 'daily minutes', 10, 720),
    focusMinutes: int(settingsRaw.focusMinutes ?? 45, 'focus minutes', 5, 90),
    breakMinutes: int(settingsRaw.breakMinutes ?? 10, 'break minutes', 1, 30),
    energy: settingsRaw.energy === 'low' ? 'low' : 'normal',
    reduceMotion: false,
  };

  const breaks = breaksRaw.map((value) => {
    const b = object(value, 'web break');
    return {
      at: finiteNumber(b.at, 'break date', 1),
      minutes: finiteNumber(b.minutes, 'break minutes', 0, 90),
    };
  });

  const sourceRevision =
    typeof raw.revision === 'number' && Number.isInteger(raw.revision)
      ? raw.revision
      : 0;
  const sourceUpdatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0
      ? raw.updatedAt
      : Date.now();

  const workspace = migrateAndValidateWorkspace({
    format: WORKSPACE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: sourceRevision,
    updatedAt: sourceUpdatedAt,
    topics,
    exams,
    mistakes,
    history,
    breaks,
    settings,
  });

  const warnings: string[] = [];
  if (raw.focus) {
    warnings.push(
      'An unfinished web focus/break timer is not migrated. Completed study history is preserved.',
    );
  }
  if (raw.reviewDraft) {
    warnings.push(
      'An unfinished web review draft is not migrated. Completed review history is preserved.',
    );
  }
  if (raw.legacySnapshot) {
    warnings.push(
      'The web backup contains an older embedded legacy snapshot. The current validated web workspace is imported instead.',
    );
  }

  return { workspace, warnings, sourceUpdatedAt, sourceRevision };
}

function convertLegacyWeb(raw: Record<string, unknown>, version: 1 | 2) {
  const topicsRaw = array(raw.topics, 'legacy web topics', 3000);
  const examsRaw = array(raw.exams, 'legacy web exams', 500);

  const history: Record<string, unknown>[] = [];
  const topics = topicsRaw.map((value) => {
    const t = object(value, 'legacy web topic');
    const id = recordId(t.id);
    const lastAction = finiteNumber(t.lastAction, 'topic date', 1);
    const stability = finiteNumber(t.S, 'stability', 0.01, 10_000);
    const topicHistory = array(t.history ?? [], 'legacy topic history', 5000);

    let lastGrade = 0;
    let lastReviewed = 0;
    let status: 'learning' | 'review' = 'learning';

    topicHistory.forEach((historyValue, index) => {
      const h = object(historyValue, 'legacy history');
      const isReview = h.kind === 'review';
      if (!isReview && h.kind !== 'log') throw new Error('Invalid legacy history kind.');

      const at = finiteNumber(h.t, 'history date', 1);
      const event = {
        id: stableLegacyId(id, index),
        topicId: id,
        at,
        kind: isReview ? 'review' : 'study',
        minutes: finiteNumber(
          isReview ? (h.elapsed ?? 0) : h.minutes,
          'study minutes',
          0,
          1440,
        ),
        grade: isReview ? int(h.grade, 'review grade', 1, 3) : 0,
        effort: isReview ? 3 : int(h.effort ?? 3, 'study effort', 1, 5),
        prompt: isReview ? 'Topic recall' : '',
        response: '',
        confidence: 'unsure',
      };
      history.push(event);

      if (isReview) {
        lastGrade = event.grade;
        lastReviewed = at;
        status = 'review';
      }
    });

    const createdAt =
      t.createdAt == null
        ? lastAction
        : finiteNumber(t.createdAt, 'topic creation date', 1);
    const snooze =
      t.snooze == null ? 0 : finiteNumber(t.snooze, 'topic snooze date');
    const intervalDays = Math.max(0.01, stability * Math.log(1 / 0.75));

    return {
      id,
      name: text(t.name, 'topic name', 300, false),
      subject: text(t.subject, 'subject', 120, false),
      createdAt,
      status,
      priority: 2,
      estimate: 45,
      notes: '',
      dueAt: Math.max(lastAction + intervalDays * DAY, snooze),
      intervalDays,
      lastGrade,
      lastReviewed,
      snoozeUntil: 0,
      cards: [],
    };
  });
  uniqueById(topics, 'topic');
  uniqueById(history as { id: string }[], 'session');

  const exams = examsRaw.map((value) => {
    const e = object(value, 'legacy web exam');
    return {
      id: recordId(e.id),
      name: text(e.name, 'exam name', 200, false),
      date: finiteNumber(e.date, 'exam date', 1),
      subjects: [text(e.subject, 'exam subject', 120, false)],
      scope: 'subjects',
      topicIds: [],
    };
  });
  uniqueById(exams, 'exam');

  const timestamps = [
    ...topics.map((topic) => topic.lastReviewed || topic.createdAt),
    ...history.map((event) => event.at as number),
    ...exams.map((exam) => exam.date),
  ];
  const sourceUpdatedAt = Math.max(...timestamps, 1);

  const workspace = migrateAndValidateWorkspace({
    format: WORKSPACE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    updatedAt: sourceUpdatedAt,
    topics,
    exams,
    mistakes: [],
    history,
    breaks: [],
    settings: {
      dailyMinutes: 90,
      focusMinutes: 45,
      breakMinutes: 10,
      energy: 'normal',
      reduceMotion: false,
    },
  });

  return {
    workspace,
    sourceUpdatedAt,
    sourceRevision: 0,
    warnings: [
      'This older web backup predates per-question recall cards, mistake records and newer timing metadata. Available topic, exam and topic-level study/review history is preserved.',
    ],
  };
}

function parseUnknownBackup(raw: unknown) {
  const root = object(raw, 'MYELIN backup');

  if (root.format === NATIVE_BACKUP_FORMAT) {
    if (root.version !== NATIVE_BACKUP_VERSION) {
      throw new Error('This native backup version is not supported by this MYELIN build.');
    }
    const workspace = migrateAndValidateWorkspace(root.workspace);
    const exportedAt = finiteNumber(root.exportedAt, 'backup export date', 1);
    return {
      source: 'native-backup' as const,
      sourceLabel: 'MYELIN native backup',
      workspace,
      sourceUpdatedAt: workspace.updatedAt,
      sourceRevision: workspace.revision,
      warnings:
        exportedAt < workspace.updatedAt
          ? ['The backup export timestamp is older than the workspace timestamp. The workspace timestamp is used for comparison.']
          : [],
    };
  }

  if (root.format === WORKSPACE_FORMAT) {
    const workspace = migrateAndValidateWorkspace(root);
    return {
      source: 'native-workspace' as const,
      sourceLabel: 'MYELIN native workspace',
      workspace,
      sourceUpdatedAt: workspace.updatedAt,
      sourceRevision: workspace.revision,
      warnings: [
        'This file is a raw native workspace rather than the portable backup envelope. It is valid and can still be imported.',
      ],
    };
  }

  if (root.version === 3) {
    const converted = convertWebV3(root);
    return {
      source: 'web-v3' as const,
      sourceLabel: 'MYELIN web v3 backup',
      ...converted,
    };
  }

  if (root.ver === 1 || root.ver === 2) {
    const version = root.ver as 1 | 2;
    const converted = convertLegacyWeb(root, version);
    return {
      source: version === 1 ? ('web-legacy-v1' as const) : ('web-legacy-v2' as const),
      sourceLabel: `MYELIN legacy web v${version} backup`,
      ...converted,
    };
  }

  throw new Error('Choose a MYELIN native backup or supported MYELIN web JSON backup.');
}

export function buildImportPreview(
  jsonText: string,
  current: WorkspaceState,
): ImportPreview {
  if (typeof jsonText !== 'string' || jsonText.length === 0) {
    throw new Error('The selected backup is empty.');
  }
  if (jsonText.length > MAX_BACKUP_TEXT_BYTES) {
    throw new Error('This backup is too large to import safely.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const parsed = parseUnknownBackup(raw);
  return {
    ...parsed,
    relation: relationToCurrent(
      parsed.sourceUpdatedAt,
      parsed.sourceRevision,
      current,
    ),
    counts: counts(parsed.workspace),
  };
}

export function importRelationMessage(preview: ImportPreview) {
  if (preview.relation === 'current-empty') {
    return 'This workspace is empty, so importing will not replace existing study records.';
  }
  if (preview.relation === 'source-newer') {
    return 'The selected backup appears newer than this workspace. Import still requires confirmation.';
  }
  if (preview.relation === 'source-older') {
    return 'Warning: the selected backup appears older than this workspace. Importing it will replace newer local data.';
  }
  if (preview.relation === 'same-time') {
    return 'The selected backup has the same recorded update time/revision as this workspace. Import still replaces the current local copy.';
  }
  return 'The selected backup does not provide a reliable comparable update timestamp. Review its contents before replacing this workspace.';
}
