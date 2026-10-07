/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  myelinMiniSystemPrompt,
  parseMyelinMiniDecision,
} from '../src/features/assistant/myelin-mini';

type RawExample = {
  id: string;
  split: 'train' | 'validation';
  tags?: string[];
  input: {
    currentDate: string;
    userRequest: string;
    context?: unknown;
  };
  output: unknown;
};

function readJsonl(path: string): RawExample[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawExample);
}

function compile(example: RawExample) {
  const raw = example.output as { requestId?: unknown };
  if (typeof raw.requestId !== 'string') {
    throw new Error(`Focused training example ${example.id} has no requestId.`);
  }
  parseMyelinMiniDecision(example.output, raw.requestId);

  return {
    id: example.id,
    messages: [
      { role: 'system', content: myelinMiniSystemPrompt() },
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

const source = resolve(
  process.env.MYELIN_MINI_FAILURE_DATA ??
    'training/myelin-mini/failure-curriculum-v1.jsonl',
);
const outputDir = resolve(
  process.env.MYELIN_MINI_ROUTER_V2_DIR ??
    'training/myelin-mini/compiled',
);

const rows = readJsonl(source);

const train = rows.filter((row) => {
  if (row.split !== 'train') return false;
  return (
    row.id.startsWith('router-practice-') ||
    row.id.startsWith('act-practice-') ||
    row.id.startsWith('router-clarify-missing-target-')
  );
});

const validation = rows.filter((row) => row.split === 'validation');

const forbiddenExact = 'kal trig ke 30 min questions add kar do';
for (const row of train) {
  if (row.input.userRequest.trim().toLowerCase() === forbiddenExact) {
    throw new Error('Acceptance phrase leaked into focused training data.');
  }
}

if (train.length < 30) {
  throw new Error(`Focused v2 training set too small: ${train.length}`);
}
if (validation.length < 5) {
  throw new Error(`Focused v2 validation set too small: ${validation.length}`);
}

const compiledTrain = train.map(compile);
const compiledValidation = validation.map(compile);

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  resolve(outputDir, 'router-v2-train.jsonl'),
  compiledTrain.map((row) => JSON.stringify(row)).join('\n') + '\n',
  'utf8',
);
writeFileSync(
  resolve(outputDir, 'router-v2-validation.jsonl'),
  compiledValidation.map((row) => JSON.stringify(row)).join('\n') + '\n',
  'utf8',
);

console.log(
  `MYELIN Mini router v2 dataset | train=${compiledTrain.length} validation=${compiledValidation.length}`,
);
