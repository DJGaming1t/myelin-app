/// <reference types="node" />
import assert from 'node:assert/strict';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createEmptyWorkspace, WorkspaceState } from '../src/data/schema';
import {
  createWorkspaceStorageEngine,
  KeyValueStore,
} from '../src/data/storageEngine';
import {
  createNativeBackup,
  isImportOlderThanCurrent,
  mergeWorkspaces,
  parseImportJson,
  serializeNativeBackup,
  workspaceImportCounts,
} from '../src/features/transfer/backup-engine';

const now = 1_800_000_000_000;

class MemoryStore implements KeyValueStore {
  values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

function nativeWorkspace(): WorkspaceState {
  const workspace = createEmptyWorkspace(now);
  workspace.revision = 7;
  workspace.updatedAt = now;
  workspace.settings.reduceMotion = true;
  workspace.topics.push({
    id: 'topic_native',
    name: 'Quadratic Equations',
    subject: 'Mathematics',
    createdAt: now - 10_000,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: 'Native notes',
    dueAt: now + 1000,
    intervalDays: 2,
    lastGrade: 3,
    lastReviewed: now - 1000,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_native',
        prompt: 'State the quadratic formula.',
        answer: 'Formula',
        hint: 'Think ±',
        dueAt: now + 1000,
        intervalDays: 2,
        lastGrade: 3,
        lastReviewed: now - 1000,
        reps: 2,
      },
    ],
  });
  workspace.exams.push({
    id: 'exam_native',
    name: 'Math test',
    date: now + 86_400_000,
    subjects: ['Mathematics'],
    scope: 'subjects',
    topicIds: [],
  });
  return workspace;
}

function webV3Backup() {
  return {
    version: 3,
    revision: 999999999999,
    updatedAt: now - 5000,
    topics: [
      {
        id: 'web_topic',
        name: 'Metals & non-metals',
        subject: 'Chemistry',
        createdAt: now - 100_000,
        status: 'review',
        priority: 3,
        estimate: 45,
        notes: 'web notes',
        dueAt: now + 5000,
        intervalDays: 2,
        lastGrade: 2,
        lastReviewed: now - 5000,
        snoozeUntil: 0,
        cards: [
          {
            id: 'web_card',
            prompt: 'Why does molten MgCl2 conduct?',
            answer: 'Mobile ions.',
            hint: 'Charged particles',
            dueAt: now + 5000,
            intervalDays: 2,
            lastGrade: 2,
            lastReviewed: now - 5000,
            reps: 3,
          },
        ],
      },
      {
        id: 'web_topic_2',
        name: 'Life Processes',
        subject: 'Biology',
        createdAt: now - 90_000,
        status: 'learning',
        priority: 2,
        estimate: 40,
        notes: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        snoozeUntil: 0,
        cards: [],
      },
    ],
    exams: [
      {
        id: 'web_exam_all',
        name: 'Full syllabus',
        date: now + 10_000,
        subjects: [],
        scope: 'subjects',
        topicIds: [],
      },
    ],
    mistakes: [
      {
        id: 'web_mistake',
        topicId: 'web_topic',
        cardId: 'deleted_card',
        prompt: 'I forgot why molten salt conducts.',
        detail: 'Wrong',
        correction: 'Ions move when molten.',
        reason: 'recall',
        createdAt: now - 4000,
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
        topicId: 'web_topic',
        cardId: 'web_card',
        at: now - 3000,
        kind: 'review',
        minutes: 4,
        plannedMinutes: 300,
        grade: 2,
        effort: 3,
        prompt: 'Why does molten MgCl2 conduct?',
        response: 'ions move',
        confidence: 'partial',
      },
    ],
    breaks: [{ at: now - 2000, minutes: 10 }],
    settings: {
      dailyMinutes: 120,
      focusMinutes: 45,
      breakMinutes: 10,
      energy: 'low',
    },
    focus: {
      mode: 'study',
      topicId: 'web_topic',
      total: 2700,
      remaining: 1200,
      endAt: now + 1000,
      running: true,
      startedAt: now - 1000,
      firstStep: 'read',
      parking: '',
    },
    reviewDraft: {
      queue: [{ topicId: 'web_topic', cardId: 'web_card', mistakeId: null }],
      index: 0,
      stage: 'prompt',
      response: 'draft',
      confidence: 'partial',
      onPaper: false,
      hintUsed: false,
      elapsedMs: 1000,
      completed: 0,
    },
  };
}

function legacyBackup(ver: 1 | 2) {
  return {
    ver,
    topics: [
      {
        id: `legacy_topic_${ver}`,
        name: 'Legacy topic',
        subject: 'Science',
        createdAt: now - 200_000,
        lastAction: now - 100_000,
        S: 4,
        snooze: 0,
        history: [
          {
            kind: 'log',
            t: now - 90_000,
            minutes: 25,
            effort: 4,
          },
          {
            kind: 'review',
            t: now - 80_000,
            elapsed: 3,
            grade: 3,
          },
        ],
      },
    ],
    exams: [
      {
        id: `legacy_exam_${ver}`,
        name: 'Legacy exam',
        subject: 'Science',
        date: now + 500_000,
      },
    ],
  };
}

async function main() {
  const native = nativeWorkspace();
  const envelope = createNativeBackup(native, now + 123);
  assert.equal(envelope.format, 'myelin.native.backup');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.exportedAt, now + 123);

  const serialized = serializeNativeBackup(native, now + 123);
  const nativeCandidate = parseImportJson(serialized, now + 123);
  assert.equal(nativeCandidate.source, 'native-backup');
  assert.deepEqual(nativeCandidate.workspace, migrateAndValidateWorkspace(native));
  assert.deepEqual(workspaceImportCounts(nativeCandidate.workspace), {
    topics: 1,
    questions: 1,
    exams: 1,
    mistakes: 0,
    sessions: 0,
    breaks: 0,
    tasks: 0,
    commitments: 0,
  });

  const rawWorkspaceCandidate = parseImportJson(JSON.stringify(native), now);
  assert.equal(rawWorkspaceCandidate.source, 'native-workspace');

  const webCandidate = parseImportJson(JSON.stringify(webV3Backup()), now);
  assert.equal(webCandidate.source, 'web-v3');
  assert.equal(webCandidate.workspace.topics.length, 2);
  assert.equal(webCandidate.workspace.settings.energy, 'low');
  assert.equal(webCandidate.workspace.settings.reduceMotion, false);
  assert.equal(webCandidate.workspace.revision, 0);
  assert.equal(webCandidate.workspace.mistakes[0]?.cardId, null);
  assert.equal(webCandidate.workspace.history[0]?.plannedMinutes, 240);
  assert.equal(webCandidate.workspace.exams[0]?.scope, 'topics');
  assert.equal(webCandidate.workspace.exams[0]?.topicIds.length, 2);
  assert.ok(webCandidate.warnings.some((item) => item.includes('timer')));
  assert.ok(webCandidate.warnings.some((item) => item.includes('review draft')));
  assert.ok(webCandidate.warnings.some((item) => item.includes('missing question')));
  assert.ok(webCandidate.warnings.some((item) => item.includes('240 minutes')));
  assert.ok(webCandidate.warnings.some((item) => item.includes('every subject')));

  for (const version of [1, 2] as const) {
    const candidate = parseImportJson(JSON.stringify(legacyBackup(version)), now);
    assert.equal(candidate.source, version === 1 ? 'web-v1' : 'web-v2');
    assert.equal(candidate.workspace.topics.length, 1);
    assert.equal(candidate.workspace.history.length, 2);
    assert.equal(candidate.workspace.history[0]?.kind, 'study');
    assert.equal(candidate.workspace.history[1]?.kind, 'review');
    assert.equal(candidate.workspace.exams[0]?.scope, 'subjects');
    assert.equal(candidate.workspace.mistakes.length, 0);
    assert.ok(candidate.warnings[0]?.includes('Older web backups'));
  }

  assert.throws(
    () => parseImportJson('{"hello":"world"}', now),
    /supported MYELIN web/,
  );
  assert.throws(
    () => parseImportJson('{broken json', now),
    /not valid JSON/,
  );

  const current = createEmptyWorkspace(now);
  current.revision = 4;
  current.updatedAt = now;
  current.settings.dailyMinutes = 60;
  current.settings.focusMinutes = 25;
  current.settings.breakMinutes = 5;
  current.settings.reduceMotion = true;
  current.topics.push({
    id: 'topic_collision',
    name: 'Current topic',
    subject: 'Maths',
    createdAt: now - 100,
    status: 'learning',
    priority: 2,
    estimate: 30,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_collision',
        prompt: 'Current card',
        answer: 'Current answer',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
    ],
  });
  current.mistakes.push({
    id: 'mistake_collision',
    topicId: 'topic_collision',
    cardId: 'card_collision',
    prompt: 'Current mistake',
    detail: '',
    correction: 'Current correction',
    reason: 'concept',
    createdAt: now - 50,
    dueAt: now,
    resolvedAt: 0,
    wins: 0,
    lastWinDay: '',
    intervalDays: 0,
  });
  current.history.push({
    id: 'session_collision',
    topicId: 'topic_collision',
    cardId: 'card_collision',
    mistakeId: 'mistake_collision',
    at: now - 25,
    kind: 'review',
    minutes: 2,
    grade: 2,
    effort: 3,
    prompt: 'Current prompt',
    response: 'Current response',
    confidence: 'partial',
  });
  current.breaks.push({ at: now - 10, minutes: 5 });

  const imported = createEmptyWorkspace(now - 1000);
  imported.settings.dailyMinutes = 300;
  imported.settings.focusMinutes = 60;
  imported.topics.push({
    id: 'topic_collision',
    name: 'Imported topic',
    subject: 'Chemistry',
    createdAt: now - 1000,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: 'different',
    dueAt: now + 1000,
    intervalDays: 3,
    lastGrade: 3,
    lastReviewed: now - 500,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_collision',
        prompt: 'Imported card',
        answer: 'Imported answer',
        hint: '',
        dueAt: now + 1000,
        intervalDays: 3,
        lastGrade: 3,
        lastReviewed: now - 500,
        reps: 3,
      },
    ],
  });
  imported.exams.push({
    id: 'exam_imported',
    name: 'Imported exam',
    date: now + 10000,
    subjects: [],
    scope: 'topics',
    topicIds: ['topic_collision'],
  });
  imported.mistakes.push({
    id: 'mistake_collision',
    topicId: 'topic_collision',
    cardId: 'card_collision',
    prompt: 'Imported mistake',
    detail: '',
    correction: 'Imported correction',
    reason: 'recall',
    createdAt: now - 400,
    dueAt: now,
    resolvedAt: 0,
    wins: 0,
    lastWinDay: '',
    intervalDays: 0,
  });
  imported.history.push({
    id: 'session_collision',
    topicId: 'topic_collision',
    cardId: 'card_collision',
    mistakeId: 'mistake_collision',
    at: now - 300,
    kind: 'review',
    minutes: 3,
    grade: 1,
    effort: 3,
    prompt: 'Imported prompt',
    response: 'Imported response',
    confidence: 'sure',
  });
  imported.breaks.push(
    { at: now - 10, minutes: 5 },
    { at: now - 5, minutes: 10 },
  );

  const merged = mergeWorkspaces(current, imported);
  assert.equal(merged.workspace.topics.length, 2);
  assert.equal(merged.workspace.mistakes.length, 2);
  assert.equal(merged.workspace.history.length, 2);
  assert.equal(merged.workspace.exams.length, 1);
  assert.equal(merged.workspace.breaks.length, 2);
  assert.equal(merged.workspace.settings.dailyMinutes, 60);
  assert.equal(merged.workspace.settings.focusMinutes, 25);
  assert.equal(merged.workspace.settings.reduceMotion, true);
  assert.ok(merged.report.remappedIds >= 4);
  assert.equal(merged.report.added.topics, 1);
  assert.equal(merged.report.added.mistakes, 1);
  assert.equal(merged.report.added.sessions, 1);
  assert.equal(merged.report.added.breaks, 1);

  const plannerCurrent = createEmptyWorkspace(now);
  plannerCurrent.topics.push(native.topics[0]!);
  plannerCurrent.exams.push(native.exams[0]!);
  plannerCurrent.tasks.push({
    id: 'task_collision',
    title: 'Current homework',
    subject: 'Mathematics',
    topicId: 'topic_native',
    examId: 'exam_native',
    type: 'homework',
    status: 'open',
    planState: 'today',
    dueAt: now + 1000,
    estimatedMinutes: 35,
    actualMinutes: 0,
    priority: 2,
    notes: '',
    scheduledStart: 0,
    scheduledEnd: 0,
    postponedUntil: 0,
    createdAt: now - 100,
    updatedAt: now - 100,
    completedAt: 0,
  });
  const plannerImported = structuredClone(plannerCurrent);
  plannerImported.tasks[0]!.title = 'Imported different homework';
  plannerImported.commitments.push({
    id: 'commitment_imported',
    title: 'Tuition',
    kind: 'tuition',
    startAt: now + 2000,
    endAt: now + 5000,
    recurrenceDays: [1, 3, 5],
    createdAt: now - 100,
    updatedAt: now - 100,
  });
  const plannerMerged = mergeWorkspaces(plannerCurrent, plannerImported);
  assert.equal(plannerMerged.workspace.tasks.length, 2);
  assert.equal(plannerMerged.workspace.commitments.length, 1);
  assert.equal(plannerMerged.report.added.tasks, 1);
  assert.equal(plannerMerged.report.added.commitments, 1);
  assert.ok(plannerMerged.workspace.tasks.every((task) => task.topicId === 'topic_native'));
  assert.ok(plannerMerged.workspace.tasks.every((task) => task.examId === 'exam_native'));

  const importedTopic = merged.workspace.topics.find(
    (topic) => topic.name === 'Imported topic',
  );
  assert.ok(importedTopic);
  assert.notEqual(importedTopic!.id, 'topic_collision');
  assert.notEqual(importedTopic!.cards[0]?.id, 'card_collision');

  const importedMistake = merged.workspace.mistakes.find(
    (mistake) => mistake.prompt === 'Imported mistake',
  );
  assert.ok(importedMistake);
  assert.equal(importedMistake!.topicId, importedTopic!.id);
  assert.equal(importedMistake!.cardId, importedTopic!.cards[0]!.id);
  assert.notEqual(importedMistake!.id, 'mistake_collision');

  const importedSession = merged.workspace.history.find(
    (session) => session.prompt === 'Imported prompt',
  );
  assert.ok(importedSession);
  assert.equal(importedSession!.topicId, importedTopic!.id);
  assert.equal(importedSession!.cardId, importedTopic!.cards[0]!.id);
  assert.equal(importedSession!.mistakeId, importedMistake!.id);
  assert.notEqual(importedSession!.id, 'session_collision');

  const importedExam = merged.workspace.exams[0]!;
  assert.deepEqual(importedExam.topicIds, [importedTopic!.id]);

  migrateAndValidateWorkspace(merged.workspace);

  const identical = mergeWorkspaces(current, current);
  assert.equal(identical.workspace.topics.length, current.topics.length);
  assert.equal(identical.report.added.topics, 0);
  assert.ok(identical.report.skippedIdentical > 0);

  const olderCandidate = parseImportJson(
    serializeNativeBackup({ ...native, updatedAt: now - 10_000 }, now),
    now,
  );
  assert.equal(isImportOlderThanCurrent(olderCandidate, native), true);

  const store = new MemoryStore();
  const storage = createWorkspaceStorageEngine(store);
  const owner = 'user:transfer-test';
  await storage.saveImportRecovery(owner, native);
  const recovery = await storage.loadImportRecovery(owner);
  assert.deepEqual(recovery, migrateAndValidateWorkspace(native));

  await storage.reset(owner);
  assert.equal(
    await storage.loadImportRecovery(owner),
    null,
    'Workspace reset must remove import recovery snapshots.',
  );

  console.log('✓ native backup envelope round-trips through strict validation');
  console.log('✓ raw native workspace import remains supported');
  console.log('✓ exact web v3 fields migrate into native records');
  console.log('✓ web all-subject exams preserve scope semantics');
  console.log('✓ dangling web links are repaired without dropping durable records');
  console.log('✓ transient web focus/review state is reported instead of guessed');
  console.log('✓ legacy web v1/v2 topics, exams and history convert');
  console.log('✓ invalid non-MYELIN JSON is rejected');
  console.log('✓ merge preserves current settings and current records');
  console.log('✓ conflicting IDs are remapped with linked references intact');
  console.log('✓ identical records are skipped instead of duplicated');
  console.log('✓ older-backup detection is explicit');
  console.log('✓ pre-import recovery snapshots validate and reset cleanly');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
