/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseMyelinMiniDecision } from '../src/features/assistant/myelin-mini';

import { evaluateMyelinMiniPredictions } from '../src/features/assistant/myelin-mini-evaluation';

type Row = {
  id: string;
  split?: string;
  input: { currentDate: string; userRequest: string; context?: {
    topics?: Array<{ id: string; name: string; subject: string }>;
    exams?: Array<{ id: string; name: string }>;
  } };
  output: unknown;
};
const root = 'training/myelin-mini/';
const read = (name: string): Row[] => readFileSync(root + name, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const fingerprint = (row: Row) => row.input.userRequest.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_]+/gu)?.join(' ') ?? '';

function validate(row: Row) {
  assert.match(row.input.currentDate, /^\d{4}-\d{2}-\d{2}$/);
  const raw = row.output as { requestId: string };
  const decision = parseMyelinMiniDecision(row.output, raw.requestId);
  if (decision.route !== 'actions') return;
  const topics = row.input.context?.topics ?? [];
  const exams = row.input.context?.exams ?? [];
  const newTopics = new Set<string>();
  const newExams = new Set<string>();
  function checkTopic(ref: { topicId?: string; clientRef?: string; name?: string; subject?: string }) {
    if (ref.topicId) assert.ok(topics.some(t => t.id === ref.topicId), `${row.id}: invented topic ${ref.topicId}`);
    else if (ref.clientRef) assert.ok(newTopics.has(ref.clientRef), `${row.id}: topic clientRef used before creation`);
    else assert.equal(topics.filter(t => t.name === ref.name && t.subject === ref.subject).length, 1, `${row.id}: ambiguous topic name`);
  }
  function checkExam(ref: { examId?: string; clientRef?: string; name?: string }) {
    if (ref.examId) assert.ok(exams.some(e => e.id === ref.examId), `${row.id}: invented exam ${ref.examId}`);
    else if (ref.clientRef) assert.ok(newExams.has(ref.clientRef), `${row.id}: exam clientRef used before creation`);
    else assert.equal(exams.filter(e => e.name === ref.name).length, 1, `${row.id}: ambiguous exam name`);
  }
  for (const action of decision.batch.actions) {
    switch (action.type) {
      case 'create_topic':
        assert.ok(!topics.some(t => t.name === action.name && t.subject === action.subject), `${row.id}: duplicate topic`);
        if (action.clientRef) newTopics.add(action.clientRef);
        break;
      case 'update_topic': checkTopic(action.topic); break;
      case 'create_exam':
        action.topicRefs.forEach(checkTopic);
        if (action.clientRef) newExams.add(action.clientRef);
        break;
      case 'create_task':
        if (action.topic) checkTopic(action.topic);
        if (action.exam) checkExam(action.exam);
        break;
      case 'generate_exam_plan':
        action.examRefs?.forEach(checkExam);
        action.topicOverrides.forEach(o => checkTopic(o.topic));
        break;
    }
  }
}

const curriculum = read('curriculum-v3.jsonl');
const evaluation = read('eval-v2.jsonl');
const prior = [...read('seed-v1.jsonl'), ...read('failure-curriculum-v1.jsonl')];
const manifest = JSON.parse(readFileSync(root + 'eval-v2-manifest.json', 'utf8'));
assert.equal(createHash('sha256').update(readFileSync(root + 'eval-v2.jsonl')).digest('hex'), manifest.sha256, 'Frozen eval-v2 content changed; create a new version instead.');
assert.equal(evaluation.length, manifest.cases);
assert.ok(evaluation.length >= 30);
assert.ok(curriculum.every(r => r.split === 'train' || r.split === 'validation'));
assert.ok(evaluation.every(r => r.split === 'evaluation'));

const evalRequests = new Set(evaluation.map(fingerprint));
const trainingRequests = new Set([...prior, ...curriculum].filter(r => r.split === 'train').map(fingerprint));
const validationRequests = new Set([...prior, ...curriculum].filter(r => r.split === 'validation').map(fingerprint));
for (const request of evalRequests) {
  assert.ok(!trainingRequests.has(request) && !validationRequests.has(request), `Evaluation request leaked into development data: ${request}`);
}
for (const request of validationRequests) assert.ok(!trainingRequests.has(request), `Train/validation request overlap: ${request}`);
const all = [...prior, ...curriculum, ...evaluation];
assert.equal(new Set(all.map(r => r.id)).size, all.length, 'Duplicate row IDs');
assert.equal(new Set(all.map(r => (r.output as { requestId: string }).requestId)).size, all.length, 'Duplicate request IDs');
assert.equal(evalRequests.size, evaluation.length, 'Duplicate evaluation request');
for (const row of [...curriculum, ...evaluation]) validate(row);

// Gold self-scoring checks evaluator compatibility, not model quality.
const report = evaluateMyelinMiniPredictions(evaluation, evaluation);
assert.deepEqual(report.failures, []);
assert.equal(report.actionExactAccuracy, 1);
assert.equal(report.clarifyReasonAccuracy, 1);
assert.equal(report.escalateReasonAccuracy, 1);

// Verify the guard rejects fabricated IDs and references before creation.
const withRef = evaluation.find(r => JSON.stringify(r.output).includes('"topicId"'))!;
const bad = structuredClone(withRef);
bad.output = JSON.parse(JSON.stringify(bad.output).replace(/"topicId":"[^"]+"/, '"topicId":"absent-record"'));
assert.throws(() => validate(bad), /invented topic/);
const chained = structuredClone(evaluation.find(r => JSON.stringify(r.output).includes('"clientRef":"e-elastic"'))!);
const batch = (chained.output as { batch: { actions: unknown[] } }).batch;
batch.actions.reverse();
assert.throws(() => validate(chained), /before creation/);
console.log(`PASS: ${curriculum.length} curriculum cases and ${evaluation.length} frozen evaluation cases; protocol, references, ordering, and split isolation verified.`);
