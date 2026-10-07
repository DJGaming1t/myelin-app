/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';

import {
  evaluateMyelinMiniPredictions,
  myelinMiniPassesReleaseGate,
} from '../src/features/assistant/myelin-mini-evaluation';

function readJsonl(path: string) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const evalPath = process.argv[2];
const predictionsPath = process.argv[3];
const reportPath = process.argv[4];
const mode = process.argv[5] ?? 'release';
const enforce = process.argv.includes('--enforce');

if (!evalPath || !predictionsPath || !reportPath) {
  throw new Error(
    'Usage: tsx scripts/score-myelin-mini-predictions.ts <eval.jsonl> <predictions.jsonl> <report.json> [release|acceptance] [--enforce]',
  );
}

const examples = readJsonl(evalPath);
const predictions = readJsonl(predictionsPath);
const report = evaluateMyelinMiniPredictions(examples, predictions);

function acceptancePasses() {
  if (
    report.total !== 1 ||
    report.parseValidity !== 1 ||
    report.routeAccuracy !== 1 ||
    report.actionTypeSequenceAccuracy !== 1 ||
    report.unsafeActionCount !== 0
  ) {
    return false;
  }

  const expected = examples[0]?.output as any;
  const actual = predictions.find((item: any) => item.id === examples[0]?.id)?.output as any;
  const expectedAction = expected?.batch?.actions?.[0];
  const actualAction = actual?.batch?.actions?.[0];

  if (!expectedAction || !actualAction) return false;
  if (expectedAction.type !== 'create_task' || actualAction.type !== 'create_task') {
    return false;
  }

  return (
    actualAction.subject === expectedAction.subject &&
    actualAction.topic?.topicId === expectedAction.topic?.topicId &&
    actualAction.taskType === expectedAction.taskType &&
    actualAction.dueDate === expectedAction.dueDate &&
    actualAction.estimatedMinutes === expectedAction.estimatedMinutes &&
    actualAction.priority === expectedAction.priority
  );
}

const passes =
  mode === 'acceptance'
    ? acceptancePasses()
    : myelinMiniPassesReleaseGate(report);

writeFileSync(
  reportPath,
  JSON.stringify({ mode, passes, report }, null, 2) + '\n',
  'utf8',
);

console.log(
  JSON.stringify(
    {
      mode,
      passes,
      total: report.total,
      parseValidity: report.parseValidity,
      routeAccuracy: report.routeAccuracy,
      actionExactAccuracy: report.actionExactAccuracy,
      actionTypeSequenceAccuracy: report.actionTypeSequenceAccuracy,
      clarifyReasonAccuracy: report.clarifyReasonAccuracy,
      escalateReasonAccuracy: report.escalateReasonAccuracy,
      unsafeActionCount: report.unsafeActionCount,
      p50LatencyMs: report.latencyMs.p50,
      p95LatencyMs: report.latencyMs.p95,
      failures: report.failures.slice(0, 20),
    },
    null,
    2,
  ),
);

if (enforce && !passes) process.exitCode = 2;
