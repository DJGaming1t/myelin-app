/// <reference types="node" />
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import {
  MyelinMiniPrediction,
  evaluateMyelinMiniPredictions,
  myelinMiniPassesReleaseGate,
} from '../src/features/assistant/myelin-mini-evaluation';

type EvalExample = {
  id: string;
  output: unknown;
};

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error('Invalid JSONL at ' + path + ':' + (index + 1) + ': ' + String(error));
      }
    });
}

const evalPath = resolve(
  process.env.MYELIN_MINI_EVAL_FILE ??
    'training/myelin-mini/eval-v1.jsonl',
);
const predictionsPath = resolve(
  process.env.MYELIN_MINI_PREDICTIONS_FILE ??
    'artifacts/myelin-mini/predictions-v1.jsonl',
);
const reportPath = resolve(
  process.env.MYELIN_MINI_REPORT_OUT ??
    'artifacts/myelin-mini/fine-tuned-report-v1.json',
);

const examples = readJsonl<EvalExample>(evalPath);
const predictions = readJsonl<MyelinMiniPrediction>(predictionsPath);
const report = evaluateMyelinMiniPredictions(examples, predictions);
const releaseGate = myelinMiniPassesReleaseGate(report);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      predictionsFile: predictionsPath,
      releaseGate,
      report,
    },
    null,
    2,
  ) + '\\n',
  'utf8',
);

const pct = (value: number | null) =>
  value == null ? 'n/a' : (value * 100).toFixed(1) + '%';

console.log('MYELIN Mini fine-tuned benchmark | cases=' + report.total + ' | parse=' + pct(report.parseValidity) + ' | route=' + pct(report.routeAccuracy));
console.log('actions exact=' + pct(report.actionExactAccuracy) + ' | types=' + pct(report.actionTypeSequenceAccuracy) + ' | clarify=' + pct(report.clarifyReasonAccuracy) + ' | escalate=' + pct(report.escalateReasonAccuracy));
console.log('unsafe-actions=' + report.unsafeActionCount + ' | p50=' + (report.latencyMs.p50?.toFixed(0) ?? 'n/a') + 'ms | p95=' + (report.latencyMs.p95?.toFixed(0) ?? 'n/a') + 'ms | release-gate=' + (releaseGate ? 'PASS' : 'FAIL'));

for (const failure of report.failures.slice(0, 30)) {
  console.log('- ' + failure.id + ': ' + failure.type + ': ' + failure.detail);
}

if (process.env.MYELIN_MINI_ENFORCE_GATE === '1' && !releaseGate) {
  process.exitCode = 2;
}
