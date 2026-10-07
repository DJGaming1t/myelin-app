/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { myelinMiniSystemPrompt } from '../src/features/assistant/myelin-mini';

type EvalRow = {
  id: string;
  input: {
    currentDate: string;
    userRequest: string;
    context?: unknown;
  };
  output: {
    requestId: string;
    [key: string]: unknown;
  };
};

const source = resolve(
  process.env.MYELIN_MINI_EVAL_FILE ??
    'training/myelin-mini/eval-v1.jsonl',
);
const output = resolve(
  process.env.MYELIN_MINI_EVAL_PROMPTS_OUT ??
    'training/myelin-mini/compiled/eval-prompts-v1.jsonl',
);

const rows = readFileSync(source, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as EvalRow);

const compiled = rows.map((row) => ({
  id: row.id,
  expected: row.output,
  messages: [
    {
      role: 'system',
      content: myelinMiniSystemPrompt(),
    },
    {
      role: 'user',
      content: JSON.stringify({
        requestId: row.output.requestId,
        currentDate: row.input.currentDate,
        userRequest: row.input.userRequest,
        context: row.input.context ?? {},
      }),
    },
  ],
}));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  compiled.map((row) => JSON.stringify(row)).join('\n') + '\n',
  'utf8',
);

console.log(
  `MYELIN Mini eval prompts: ${compiled.length} -> ${output}`,
);
