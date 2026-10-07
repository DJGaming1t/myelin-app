/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  myelinMiniDecisionJsonSchema,
  myelinMiniSystemPrompt,
} from '../src/features/assistant/myelin-mini';
import {
  MyelinMiniPrediction,
  evaluateMyelinMiniPredictions,
  myelinMiniPassesReleaseGate,
} from '../src/features/assistant/myelin-mini-evaluation';

type EvalExample = {
  id: string;
  input: {
    currentDate: string;
    userRequest: string;
    context?: unknown;
  };
  output: unknown;
};

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${path}:${index + 1}: ${String(error)}`,
        );
      }
    });
}

function endpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }
  const fenced = trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('Model response did not contain a JSON object.');
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function runPool<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index]!, index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, values.length)) },
      () => consume(),
    ),
  );
  return results;
}

const model = process.env.MYELIN_MINI_MODEL?.trim();
const baseUrl = process.env.MYELIN_MINI_BASE_URL?.trim();
if (!model || !baseUrl) {
  throw new Error(
    'Set MYELIN_MINI_MODEL and MYELIN_MINI_BASE_URL. Example: MYELIN_MINI_BASE_URL=http://127.0.0.1:8000/v1',
  );
}

const apiKey = process.env.MYELIN_MINI_API_KEY?.trim();
const evalPath = resolve(
  process.env.MYELIN_MINI_EVAL_FILE ??
    'training/myelin-mini/eval-v1.jsonl',
);
const predictionsOut = process.env.MYELIN_MINI_PREDICTIONS_OUT?.trim();
const concurrency = numberEnv('MYELIN_MINI_CONCURRENCY', 4, 1, 32);
const timeoutMs = numberEnv('MYELIN_MINI_TIMEOUT_MS', 30_000, 1_000, 180_000);
const maxTokens = numberEnv('MYELIN_MINI_MAX_OUTPUT_TOKENS', 1200, 64, 4096);
const useJsonObject =
  process.env.MYELIN_MINI_JSON_OBJECT !== '0';

const examples = readJsonl<EvalExample>(evalPath);
if (!examples.length) throw new Error('Evaluation set is empty.');

const schema = myelinMiniDecisionJsonSchema();
const predictions = await runPool(
  examples,
  concurrency,
  async (example): Promise<MyelinMiniPrediction> => {
    const expected = example.output as { requestId?: unknown };
    if (typeof expected.requestId !== 'string') {
      throw new Error(`Evaluation case ${example.id} has no requestId.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
      const response = await fetch(endpoint(baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey
            ? { authorization: `Bearer ${apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'system',
              content:
                myelinMiniSystemPrompt() +
                '\nReturn valid JSON only. The response must match this JSON schema:\n' +
                JSON.stringify(schema),
            },
            {
              role: 'user',
              content: JSON.stringify({
                requestId: expected.requestId,
                currentDate: example.input.currentDate,
                userRequest: example.input.userRequest,
                context: example.input.context ?? {},
              }),
            },
          ],
          ...(useJsonObject
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: controller.signal,
      });

      const latencyMs = performance.now() - started;
      const body = (await response.json()) as {
        error?: { message?: string };
        choices?: Array<{
          message?: { content?: string | null };
        }>;
      };

      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            `HTTP ${response.status} from model endpoint.`,
        );
      }

      const message = body.choices?.[0]?.message?.content;
      if (!message) {
        throw new Error('Model endpoint returned no assistant content.');
      }

      return {
        id: example.id,
        output: extractJson(message),
        latencyMs,
      };
    } catch (error) {
      return {
        id: example.id,
        output: {
          version: 1,
          requestId: expected.requestId,
          route: 'escalate',
          confidence: 0,
          reason: 'low-confidence',
          note:
            error instanceof Error
              ? `Benchmark request failed: ${error.message}`.slice(0, 240)
              : 'Benchmark request failed.',
        },
        latencyMs: performance.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
);

if (predictionsOut) {
  writeFileSync(
    resolve(predictionsOut),
    predictions.map((item) => JSON.stringify(item)).join('\n') + '\n',
    'utf8',
  );
}

const report = evaluateMyelinMiniPredictions(examples, predictions);
const percent = (value: number | null) =>
  value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

console.log(`MYELIN Mini benchmark: ${model}`);
console.log(`cases=${report.total} parse=${percent(report.parseValidity)} route=${percent(report.routeAccuracy)}`);
console.log(
  `actions exact=${percent(report.actionExactAccuracy)} types=${percent(report.actionTypeSequenceAccuracy)}`,
);
console.log(
  `clarify=${percent(report.clarifyReasonAccuracy)} escalate=${percent(report.escalateReasonAccuracy)} unsafe-actions=${report.unsafeActionCount}`,
);
console.log(
  `latency mean=${report.latencyMs.mean?.toFixed(0) ?? 'n/a'}ms p50=${report.latencyMs.p50?.toFixed(0) ?? 'n/a'}ms p95=${report.latencyMs.p95?.toFixed(0) ?? 'n/a'}ms`,
);
console.log(`release-gate=${myelinMiniPassesReleaseGate(report) ? 'PASS' : 'FAIL'}`);

if (report.failures.length) {
  console.log('Failures:');
  for (const failure of report.failures.slice(0, 20)) {
    console.log(`- ${failure.id}: ${failure.type}: ${failure.detail}`);
  }
  if (report.failures.length > 20) {
    console.log(`... ${report.failures.length - 20} more`);
  }
}

if (
  process.env.MYELIN_MINI_ENFORCE_GATE === '1' &&
  !myelinMiniPassesReleaseGate(report)
) {
  process.exitCode = 2;
}
