/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CompiledExample = {
  id: string;
  messages: Message[];
};

function readJsonl(path: string): CompiledExample[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CompiledExample);
}

function writeJsonl(path: string, rows: CompiledExample[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );
}

function cloneWithRequestId(
  row: CompiledExample,
  suffix: string,
  options: {
    userRequest?: string;
    estimatedMinutes?: number;
    priority?: number;
  } = {},
): CompiledExample {
  const messages = row.messages.map((message) => ({ ...message }));
  const user = JSON.parse(messages[1]!.content);
  const output = JSON.parse(messages[2]!.content);
  const requestId = `router-focus-${row.id}-${suffix}`;

  user.requestId = requestId;
  if (options.userRequest) user.userRequest = options.userRequest;

  output.requestId = requestId;
  if (output.route === 'actions' && output.batch) {
    output.batch.requestId = requestId;
    const first = output.batch.actions?.[0];
    if (first) {
      if (typeof options.estimatedMinutes === 'number') {
        first.estimatedMinutes = options.estimatedMinutes;
      }
      if (typeof options.priority === 'number') {
        first.priority = options.priority;
      }
    }
  }

  messages[1]!.content = JSON.stringify(user);
  messages[2]!.content = JSON.stringify(output);

  return {
    id: `${row.id}-${suffix}`,
    messages,
  };
}

const compiledDir = resolve(
  process.env.MYELIN_MINI_COMPILED_DIR ??
    'training/myelin-mini/compiled',
);
const trainPath = resolve(compiledDir, 'train-v1.jsonl');
const validationPath = resolve(compiledDir, 'validation-v1.jsonl');
const outTrain = resolve(compiledDir, 'router-train-v1.jsonl');
const outValidation = resolve(compiledDir, 'router-validation-v1.jsonl');

const train = readJsonl(trainPath);
const validation = readJsonl(validationPath);

const routerActions = train.filter(
  (row) =>
    row.id.includes('router-practice-') ||
    row.id.includes('act-practice-'),
);
const clarifications = train.filter(
  (row) =>
    row.id.includes('router-clarify-') ||
    row.id.includes('clarify-target-'),
);
const escalations = train.filter((row) => row.id.startsWith('escalate-'));

if (routerActions.length < 30) {
  throw new Error(
    `Expected at least 30 router action rows, found ${routerActions.length}.`,
  );
}
if (clarifications.length < 4) {
  throw new Error(
    `Expected at least 4 clarification rows, found ${clarifications.length}.`,
  );
}
if (escalations.length < 8) {
  throw new Error(
    `Expected at least 8 escalation rows, found ${escalations.length}.`,
  );
}

const trigBase = routerActions.find((row) =>
  row.id.includes('router-practice-topic-trig-'),
);
if (!trigBase) {
  throw new Error('No Trigonometry router training row found.');
}

const focused: CompiledExample[] = [];

// Repeated exact command: teach the tiny model this important UX path directly.
for (let index = 1; index <= 8; index += 1) {
  focused.push(
    cloneWithRequestId(trigBase, `exact-${index}`, {
      userRequest: 'kal trig ke 30 min questions add kar do',
      estimatedMinutes: 30,
      priority: 2,
    }),
  );
}

// Keep nearby English/Hinglish commands dominant so this is not pure memorization.
for (const row of routerActions) {
  focused.push(cloneWithRequestId(row, 'focus-a'));
  focused.push(cloneWithRequestId(row, 'focus-b'));
}

// Keep safety behavior represented while concentrating on command routing.
for (const row of clarifications) {
  focused.push(cloneWithRequestId(row, 'focus'));
}
for (const row of escalations.slice(0, 10)) {
  focused.push(cloneWithRequestId(row, 'focus'));
}

if (focused.length < 80) {
  throw new Error(
    `Focused router dataset is unexpectedly small: ${focused.length}.`,
  );
}

// Validation is not the acceptance suite; it remains the normal production validation set.
const focusedValidation = validation.map((row, index) =>
  cloneWithRequestId(row, `router-validation-${index + 1}`),
);

if (focusedValidation.length < 10) {
  throw new Error(
    `Focused validation set is unexpectedly small: ${focusedValidation.length}.`,
  );
}

writeJsonl(outTrain, focused);
writeJsonl(outValidation, focusedValidation);

console.log(
  [
    `MYELIN Mini focused router dataset: ${focused.length}`,
    `router-actions=${routerActions.length}`,
    `clarify=${clarifications.length}`,
    `escalate=${Math.min(escalations.length, 10)}`,
    `validation=${focusedValidation.length}`,
    `train=${outTrain}`,
    `validation-file=${outValidation}`,
  ].join(' | '),
);
