/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  myelinMiniDecisionJsonSchema,
  myelinMiniSystemPrompt,
} from '../src/features/assistant/myelin-mini';

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
    .map((line) => JSON.parse(line) as T);
}

const evalPath = resolve(
  process.env.MYELIN_MINI_EVAL_FILE ??
    'training/myelin-mini/eval-v1.jsonl',
);
const outputPath = resolve(
  process.env.MYELIN_MINI_EVAL_PROMPTS_OUT ??
    'training/myelin-mini/compiled/eval-prompts-v1.jsonl',
);

const schema = myelinMiniDecisionJsonSchema();
const system =
  myelinMiniSystemPrompt() +
  '\nReturn valid JSON only. The response must match this JSON schema:\n' +
  JSON.stringify(schema);

const rows = readJsonl<EvalExample>(evalPath).map((example) => {
  const expected = example.output as { requestId?: unknown };
  if (typeof expected.requestId !== 'string') {
    throw new Error(`Evaluation case ${example.id} has no requestId.`);
  }

  return {
    id: example.id,
    requestId: expected.requestId,
    messages: [
      { role: 'system', content: system },
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
  };
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
  'utf8',
);

console.log(
  `MYELIN Mini eval prompts: ${rows.length} | output=${outputPath}`,
);
