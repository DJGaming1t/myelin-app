/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  myelinMiniSystemPrompt,
  parseMyelinMiniDecision,
} from '../src/features/assistant/myelin-mini';

type SeedExample = {
  id: string;
  split: 'train' | 'validation';
  input: {
    currentDate: string;
    userRequest: string;
    context?: unknown;
  };
  output: unknown;
};

function readJsonl(path: string): SeedExample[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as SeedExample;
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${path}:${index + 1}: ${String(error)}`,
        );
      }
    });
}

function compileExample(example: SeedExample) {
  const raw = example.output as { requestId?: unknown };
  if (typeof raw?.requestId !== 'string') {
    throw new Error(`Training example ${example.id} has no requestId.`);
  }
  parseMyelinMiniDecision(example.output, raw.requestId);

  return {
    id: example.id,
    messages: [
      {
        role: 'system',
        content: myelinMiniSystemPrompt(),
      },
      {
        role: 'user',
        content: JSON.stringify({
          requestId: raw.requestId,
          currentDate: example.input.currentDate,
          userRequest: example.input.userRequest,
          context: example.input.context ?? {},
        }),
      },
      {
        role: 'assistant',
        content: JSON.stringify(example.output),
      },
    ],
  };
}

function writeJsonl(path: string, rows: unknown[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );
}

const sourcePath = resolve(
  process.env.MYELIN_MINI_SEED ??
    'training/myelin-mini/seed-v1.jsonl',
);
const outputDir = resolve(
  process.env.MYELIN_MINI_COMPILED_DIR ??
    'training/myelin-mini/compiled',
);
const checkOnly = process.argv.includes('--check');

const examples = readJsonl(sourcePath);
const train = examples
  .filter((example) => example.split === 'train')
  .map(compileExample);
const validation = examples
  .filter((example) => example.split === 'validation')
  .map(compileExample);

if (train.length < 20) {
  throw new Error('MYELIN Mini training split is unexpectedly small.');
}
if (validation.length < 5) {
  throw new Error('MYELIN Mini validation split is unexpectedly small.');
}

if (!checkOnly) {
  writeJsonl(resolve(outputDir, 'train-v1.jsonl'), train);
  writeJsonl(resolve(outputDir, 'validation-v1.jsonl'), validation);
}

console.log(
  [
    `MYELIN Mini dataset: ${examples.length} examples`,
    `train=${train.length}`,
    `validation=${validation.length}`,
    checkOnly ? 'mode=check' : `output=${outputDir}`,
  ].join(' | '),
);
