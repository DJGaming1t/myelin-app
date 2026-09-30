/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  NATIVE_BACKUP_FORMAT,
  NATIVE_BACKUP_VERSION,
  buildImportPreview,
  createNativeBackup,
  importRelationMessage,
  serializeNativeBackup,
} from '../src/features/transfer/backup-engine';

const DAY = 86_400_000;
const now = 1_800_000_000_000;

function currentWorkspace() {
  const workspace = createEmptyWorkspace(now);
  workspace.revision = 8;
  workspace.updatedAt = now;
  workspace.topics.push({
    id: 'native_topic',
    name: 'Current native topic',
    subject: 'Mathematics',
    createdAt: now - DAY,
    status: 'learning',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  });
  return workspace;
}

function webV3Backup(updatedAt = now + DAY) {
  return {
    version: 3,
    revision: 12,
    updatedAt,
    topics: [
      {
        id: 'web_math',
        name: 'Quadratics',
        subject: 'Mathematics',
        createdAt: now - 10 * DAY,
        status: 'review',
        priority: 3,
        estimate: 50,
        notes: 'Web notes',
        dueAt: now + DAY,
        intervalDays: 2,
        lastGrade: 2,
        lastReviewed: now - DAY,
        snoozeUntil: 0,
        cards: [
          {
            id: 'web_card',
            prompt: 'What is the discriminant?',
            answer: 'b² − 4ac',
            hint: 'Think D',
            dueAt: now,
            intervalDays: 2,
            lastGrade: 2,
            lastReviewed: now - DAY,
            reps: 3,
          },
        ],
      },
    ],
    exams: [
      {
        id: 'web_exam',
        name: 'Maths exam',
        date: now + 5 * DAY,
        subjects: ['Mathematics'],
        scope: 'subjects',
        topicIds: [],
      },
    ],
    mistakes: [
      {
        id: 'web_mistake',
        topicId: 'web_math',
        cardId: 'web_card',
        prompt: 'Mixed up D',
        detail: 'Wrong sign',
        correction: 'b² − 4ac',
        reason: 'recall',
        createdAt: now - 2 * DAY,
        dueAt: now,
        resolvedAt: 0,
        wins: 0,
        lastWinDay: '',
        intervalDays: 0,
      },
    ],
    history: [
      {
        id: 'web_session',
        topicId: 'web_math',
        cardId: 'web_card',
        mistakeId: 'web_mistake',
        at: now - DAY,
        kind: 'review',
        minutes: 3,
        plannedMinutes: 0,
        grade: 2,
        effort: 3,
        prompt: 'What is the discriminant?',
        response: 'Something about roots',
        confidence: 'partial',
      },
    ],
    breaks: [{ at: now - DAY, minutes: 7 }],
    settings: {
      dailyMinutes: 120,
      focusMinutes: 45,
      breakMinutes: 10,
      energy: 'low',
    },
    focus: {
      mode: 'study',
      topicId: 'web_math',
      total: 2700,
      remaining: 1200,
      endAt: now + 1000,
      running: true,
      startedAt: now - 1000,
      firstStep: 'Start Q1',
      parking: 'Later',
    },
    reviewDraft: {
      queue: [{ topicId: 'web_math', cardId: 'web_card', mistakeId: null }],
      index: 0,
      stage: 'prompt',
      response: 'draft',
      confidence: 'unsure',
      onPaper: false,
      hintUsed: false,
      elapsedMs: 2000,
      completed: 0,
    },
  };
}

function legacyWebV2() {
  return {
    ver: 2,
    topics: [
      {
        id: 'legacy_math',
        name: 'Real Numbers',
        subject: 'Mathematics',
        createdAt: now - 30 * DAY,
        lastAction: now - 5 * DAY,
        S: 4,
        snooze: 0,
        history: [
          {
            kind: 'log',
            t: now - 9 * DAY,
            minutes: 35,
            effort: 4,
          },
          {
            kind: 'review',
            t: now - 5 * DAY,
            elapsed: 4,
            grade: 3,
          },
        ],
      },
    ],
    exams: [
      {
        id: 'legacy_exam',
        name: 'Legacy test',
        subject: 'Mathematics',
        date: now + 10 * DAY,
      },
    ],
  };
}

function main() {
  const current = currentWorkspace();

  const serialized = serializeNativeBackup(current, now + 1000);
  const nativeEnvelope = JSON.parse(serialized);
  assert.equal(nativeEnvelope.format, NATIVE_BACKUP_FORMAT);
  assert.equal(nativeEnvelope.version, NATIVE_BACKUP_VERSION);
  assert.equal(nativeEnvelope.workspace.topics[0]?.id, 'native_topic');

  const nativePreview = buildImportPreview(serialized, createEmptyWorkspace(now));
  assert.equal(nativePreview.source, 'native-backup');
  assert.equal(nativePreview.relation, 'current-empty');
  assert.equal(nativePreview.counts.topics, 1);

  const rawNative = JSON.stringify(createNativeBackup(current, now).workspace);
  const rawPreview = buildImportPreview(rawNative, createEmptyWorkspace(now));
  assert.equal(rawPreview.source, 'native-workspace');
  assert.equal(rawPreview.counts.topics, 1);
  assert.ok(rawPreview.warnings.length >= 1);

  const webPreview = buildImportPreview(JSON.stringify(webV3Backup()), current);
  assert.equal(webPreview.source, 'web-v3');
  assert.equal(webPreview.relation, 'source-newer');
  assert.deepEqual(webPreview.counts, {
    topics: 1,
    questions: 1,
    exams: 1,
    mistakes: 1,
    sessions: 1,
    breaks: 1,
  });
  assert.equal(webPreview.workspace.topics[0]?.cards[0]?.id, 'web_card');
  assert.equal(webPreview.workspace.settings.dailyMinutes, 120);
  assert.equal(webPreview.workspace.settings.energy, 'low');
  assert.equal(webPreview.workspace.settings.reduceMotion, false);
  assert.equal(webPreview.workspace.history[0]?.mistakeId, 'web_mistake');
  assert.ok(
    webPreview.warnings.some((warning) => warning.includes('focus')),
    'Unfinished web timer must be disclosed rather than silently migrated.',
  );
  assert.ok(
    webPreview.warnings.some((warning) => warning.includes('review draft')),
    'Unfinished web review draft must be disclosed.',
  );

  const olderPreview = buildImportPreview(
    JSON.stringify(webV3Backup(now - 20 * DAY)),
    current,
  );
  assert.equal(olderPreview.relation, 'source-older');
  assert.match(importRelationMessage(olderPreview), /older than this workspace/);

  const legacyPreview = buildImportPreview(JSON.stringify(legacyWebV2()), current);
  assert.equal(legacyPreview.source, 'web-legacy-v2');
  assert.equal(legacyPreview.counts.topics, 1);
  assert.equal(legacyPreview.counts.questions, 0);
  assert.equal(legacyPreview.counts.sessions, 2);
  assert.equal(legacyPreview.workspace.history[0]?.kind, 'study');
  assert.equal(legacyPreview.workspace.history[1]?.kind, 'review');
  assert.equal(legacyPreview.workspace.history[1]?.grade, 3);
  assert.ok(
    legacyPreview.warnings.some((warning) => warning.includes('predates per-question')),
  );

  const danglingWeb = webV3Backup();
  danglingWeb.mistakes[0]!.cardId = 'missing_card';
  danglingWeb.history[0]!.cardId = 'missing_card';
  danglingWeb.history[0]!.mistakeId = 'missing_mistake';
  const sanitized = buildImportPreview(JSON.stringify(danglingWeb), current);
  assert.equal(sanitized.workspace.mistakes[0]?.cardId, null);
  assert.equal(sanitized.workspace.history[0]?.cardId, undefined);
  assert.equal(sanitized.workspace.history[0]?.mistakeId, undefined);

  assert.throws(
    () => buildImportPreview('{not json', current),
    /not valid JSON/,
  );
  assert.throws(
    () => buildImportPreview(JSON.stringify({ hello: 'world' }), current),
    /Choose a MYELIN/,
  );
  assert.throws(
    () =>
      buildImportPreview(
        JSON.stringify({
          format: NATIVE_BACKUP_FORMAT,
          version: 999,
          exportedAt: now,
          workspace: current,
        }),
        current,
      ),
    /not supported/,
  );

  console.log('✓ portable native backup envelope round-trips through strict validation');
  console.log('✓ raw native workspaces remain importable with a warning');
  console.log('✓ current web v3 topics/questions/exams/mistakes/history/settings migrate');
  console.log('✓ unfinished web focus/review state is explicitly disclosed');
  console.log('✓ older backup comparison is detected before replacement');
  console.log('✓ legacy web v2 topic-level history migrates without inventing cards');
  console.log('✓ dangling optional web card/mistake links are safely removed');
  console.log('✓ malformed and unsupported backup files are rejected');
}

main();
