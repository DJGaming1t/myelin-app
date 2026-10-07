import { WorkspaceState } from '@/src/data/schema';
import {
  AssistantAction,
  parseAssistantActionBatch,
} from '@/src/features/assistant/ai-action-engine';
import {
  assistantActionBatchJsonSchema,
  assistantModelInstructions,
  buildAssistantModelContext,
} from '@/src/features/assistant/assistant-model-contract';
import {
  PreparedAssistantActionBatch,
  prepareAssistantActionBatch,
} from '@/src/features/assistant/assistant-action-session';

export const MYELIN_MINI_PROTOCOL_VERSION = 1 as const;
export const MYELIN_MINI_MIN_ACTION_CONFIDENCE = 0.72 as const;

export type MyelinMiniClarifyReason =
  | 'missing-date'
  | 'missing-required-detail'
  | 'ambiguous-reference'
  | 'missing-target';

export type MyelinMiniEscalationReason =
  | 'concept-explanation'
  | 'general-knowledge'
  | 'complex-reasoning'
  | 'multimodal'
  | 'unsupported-action'
  | 'safety'
  | 'low-confidence';

export type MyelinMiniActionDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  kind: 'actions';
  confidence: number;
  actions: AssistantAction[];
};

export type MyelinMiniClarifyDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  kind: 'clarify';
  confidence: number;
  reason: MyelinMiniClarifyReason;
  question: string;
  missingFields: string[];
};

export type MyelinMiniEscalationDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  kind: 'escalate';
  confidence: number;
  reason: MyelinMiniEscalationReason;
  summary: string;
};

export type MyelinMiniDecision =
  | MyelinMiniActionDecision
  | MyelinMiniClarifyDecision
  | MyelinMiniEscalationDecision;

export type MyelinMiniModelRequest = {
  system: string;
  user: string;
  responseSchema: ReturnType<typeof myelinMiniDecisionJsonSchema>;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type MyelinMiniModelAdapter = {
  id: string;
  generate(request: MyelinMiniModelRequest): Promise<unknown>;
};

export type MyelinMiniRouteResult =
  | {
      route: 'actions';
      confidence: number;
      prepared: PreparedAssistantActionBatch;
      modelId: string;
    }
  | {
      route: 'clarify';
      confidence: number;
      reason: MyelinMiniClarifyReason;
      question: string;
      missingFields: string[];
      modelId: string;
    }
  | {
      route: 'escalate';
      confidence: number;
      reason: MyelinMiniEscalationReason;
      summary: string;
      modelId: string;
    };

function cleanString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string') {
    throw new Error(`MYELIN Mini returned an invalid ${label}.`);
  }
  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw new Error(`MYELIN Mini returned an invalid ${label}.`);
  }
  return result;
}

function confidence(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error('MYELIN Mini returned an invalid confidence score.');
  }
  return value;
}

function asObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MYELIN Mini returned an invalid decision.');
  }
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`MYELIN Mini returned an invalid ${label}.`);
  }
  return value as T;
}

function cleanMissingFields(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new Error('MYELIN Mini returned invalid missing fields.');
  }
  return value.map((item) => cleanString(item, 'missing field', 80));
}

const clarifyReasons: readonly MyelinMiniClarifyReason[] = [
  'missing-date',
  'missing-required-detail',
  'ambiguous-reference',
  'missing-target',
];

const escalationReasons: readonly MyelinMiniEscalationReason[] = [
  'concept-explanation',
  'general-knowledge',
  'complex-reasoning',
  'multimodal',
  'unsupported-action',
  'safety',
  'low-confidence',
];

export function myelinMiniDecisionJsonSchema() {
  const actionItems =
    assistantActionBatchJsonSchema().properties.actions.items;

  return {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'requestId', 'kind', 'confidence', 'actions'],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          kind: { const: 'actions' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          actions: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: actionItems,
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: [
          'version',
          'requestId',
          'kind',
          'confidence',
          'reason',
          'question',
          'missingFields',
        ],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          kind: { const: 'clarify' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { enum: clarifyReasons },
          question: { type: 'string', minLength: 1, maxLength: 240 },
          missingFields: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: [
          'version',
          'requestId',
          'kind',
          'confidence',
          'reason',
          'summary',
        ],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          kind: { const: 'escalate' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { enum: escalationReasons },
          summary: { type: 'string', minLength: 1, maxLength: 320 },
        },
      },
    ],
  } as const;
}

export function myelinMiniSystemPrompt() {
  return [
    'You are MYELIN Mini, a tiny intent and tool-routing model for a study-planning app.',
    'You are not a general chatbot and you never calculate the timetable yourself.',
    'For clear study-management commands, return kind=actions using only the MYELIN action protocol.',
    'If one short user answer would make a command safe and unambiguous, return kind=clarify with exactly one concise question.',
    'If the request needs teaching, factual knowledge, image understanding, safety-sensitive support, unsupported operations, or difficult open-ended reasoning, return kind=escalate.',
    'Never invent dates, topic IDs, exam IDs, tasks, user preferences, or facts.',
    'Use existing IDs from context whenever a matching record exists.',
    'Use clientRef only to reference records created earlier in the same action list.',
    'If action confidence would be below 0.72, escalate instead of guessing.',
    ...assistantModelInstructions(),
  ].join('\n');
}

export function buildMyelinMiniUserPrompt(
  workspace: WorkspaceState,
  userRequest: string,
  requestId: string,
  options: { currentRoute?: string; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  const context = buildAssistantModelContext(workspace, now, {
    currentRoute: options.currentRoute,
    horizonDays: 30,
    maxTopics: 36,
    maxExams: 12,
    maxTasks: 24,
    maxCommitments: 16,
  });

  return JSON.stringify({
    requestId,
    userRequest: userRequest.trim().slice(0, 4000),
    context,
  });
}

export function parseMyelinMiniDecision(
  raw: unknown,
  expectedRequestId: string,
): MyelinMiniDecision {
  const object = asObject(raw);
  if (object.version !== MYELIN_MINI_PROTOCOL_VERSION) {
    throw new Error('MYELIN Mini protocol version mismatch.');
  }

  const requestId = cleanString(object.requestId, 'request ID', 120);
  if (requestId !== expectedRequestId) {
    throw new Error('MYELIN Mini response request ID does not match the request.');
  }

  const score = confidence(object.confidence);
  const kind = object.kind;

  if (kind === 'clarify') {
    const allowedKeys = new Set([
      'version',
      'requestId',
      'kind',
      'confidence',
      'reason',
      'question',
      'missingFields',
    ]);
    if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
      throw new Error('MYELIN Mini clarification contains unsupported fields.');
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind,
      confidence: score,
      reason: oneOf(object.reason, clarifyReasons, 'clarification reason'),
      question: cleanString(object.question, 'clarification question', 240),
      missingFields: cleanMissingFields(object.missingFields),
    };
  }

  if (kind === 'escalate') {
    const allowedKeys = new Set([
      'version',
      'requestId',
      'kind',
      'confidence',
      'reason',
      'summary',
    ]);
    if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
      throw new Error('MYELIN Mini escalation contains unsupported fields.');
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind,
      confidence: score,
      reason: oneOf(object.reason, escalationReasons, 'escalation reason'),
      summary: cleanString(object.summary, 'escalation summary', 320),
    };
  }

  if (kind !== 'actions') {
    throw new Error('MYELIN Mini returned an unsupported decision kind.');
  }

  const allowedKeys = new Set([
    'version',
    'requestId',
    'kind',
    'confidence',
    'actions',
  ]);
  if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
    throw new Error('MYELIN Mini action decision contains unsupported fields.');
  }

  const batch = parseAssistantActionBatch({
    version: 1,
    requestId,
    actions: object.actions,
  });

  if (score < MYELIN_MINI_MIN_ACTION_CONFIDENCE) {
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind: 'escalate',
      confidence: score,
      reason: 'low-confidence',
      summary: 'The tiny model was not confident enough to safely prepare actions.',
    };
  }

  return {
    version: MYELIN_MINI_PROTOCOL_VERSION,
    requestId,
    kind,
    confidence: score,
    actions: batch.actions,
  };
}

export async function routeWithMyelinMini(input: {
  workspace: WorkspaceState;
  userRequest: string;
  requestId: string;
  model: MyelinMiniModelAdapter;
  currentRoute?: string;
  now?: number;
  signal?: AbortSignal;
}): Promise<MyelinMiniRouteResult> {
  const now = input.now ?? Date.now();
  const raw = await input.model.generate({
    system: myelinMiniSystemPrompt(),
    user: buildMyelinMiniUserPrompt(
      input.workspace,
      input.userRequest,
      input.requestId,
      {
        currentRoute: input.currentRoute,
        now,
      },
    ),
    responseSchema: myelinMiniDecisionJsonSchema(),
    maxOutputTokens: 1200,
    signal: input.signal,
  });

  const decision = parseMyelinMiniDecision(raw, input.requestId);

  if (decision.kind === 'clarify') {
    return {
      route: 'clarify',
      confidence: decision.confidence,
      reason: decision.reason,
      question: decision.question,
      missingFields: decision.missingFields,
      modelId: input.model.id,
    };
  }

  if (decision.kind === 'escalate') {
    return {
      route: 'escalate',
      confidence: decision.confidence,
      reason: decision.reason,
      summary: decision.summary,
      modelId: input.model.id,
    };
  }

  return {
    route: 'actions',
    confidence: decision.confidence,
    prepared: prepareAssistantActionBatch(
      input.workspace,
      {
        version: 1,
        requestId: decision.requestId,
        actions: decision.actions,
      },
      now,
    ),
    modelId: input.model.id,
  };
}
