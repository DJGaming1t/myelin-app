import { WorkspaceState } from '@/src/data/schema';
import type { AssistantClarificationAnswers } from './assistant-clarification';
import { checkAssistantActionGrounding, checkAssistantRequestGrounding } from './assistant-request-grounding';
import {
  AssistantActionBatch,
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
import {
  MYELIN_MINI_FAST_MODEL_ID,
  localDateKeyFromTimestamp,
  tryBuildMyelinMiniFastDecision,
} from '@/src/features/assistant/myelin-mini-fast-router';

export const MYELIN_MINI_PROTOCOL_VERSION = 1 as const;
export const MYELIN_MINI_MIN_ACTION_CONFIDENCE = 0.72 as const;

export type MyelinMiniClarificationReason =
  | 'missing-date'
  | 'missing-target'
  | 'ambiguous-reference'
  | 'missing-required-detail';

export type MyelinMiniEscalationReason =
  | 'ambiguous'
  | 'general-knowledge'
  | 'tutoring'
  | 'complex-reasoning'
  | 'multimodal'
  | 'unsupported-action'
  | 'safety'
  | 'low-confidence';

export type MyelinMiniActionDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  route: 'actions';
  confidence: number;
  batch: AssistantActionBatch;
};

export type MyelinMiniClarificationDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  route: 'clarify';
  confidence: number;
  reason: MyelinMiniClarificationReason;
  question: string;
  missingFields: string[];
};

export type MyelinMiniEscalationDecision = {
  version: typeof MYELIN_MINI_PROTOCOL_VERSION;
  requestId: string;
  route: 'escalate';
  confidence: number;
  reason: MyelinMiniEscalationReason;
  note: string;
};

export type MyelinMiniDecision =
  | MyelinMiniActionDecision
  | MyelinMiniClarificationDecision
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
      reason: MyelinMiniClarificationReason;
      question: string;
      missingFields: string[];
      modelId: string;
    }
  | {
      route: 'escalate';
      confidence: number;
      reason: MyelinMiniEscalationReason;
      note: string;
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

function cleanStringArray(
  value: unknown,
  label: string,
  maxItems: number,
) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new Error(`MYELIN Mini returned invalid ${label}.`);
  }
  return value.map((item, index) =>
    cleanString(item, `${label}[${index}]`, 120),
  );
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

function clarificationReason(value: unknown): MyelinMiniClarificationReason {
  const allowed: MyelinMiniClarificationReason[] = [
    'missing-date',
    'missing-target',
    'ambiguous-reference',
    'missing-required-detail',
  ];
  if (
    typeof value !== 'string' ||
    !allowed.includes(value as MyelinMiniClarificationReason)
  ) {
    throw new Error('MYELIN Mini returned an invalid clarification reason.');
  }
  return value as MyelinMiniClarificationReason;
}

function escalationReason(value: unknown): MyelinMiniEscalationReason {
  const allowed: MyelinMiniEscalationReason[] = [
    'ambiguous',
    'general-knowledge',
    'tutoring',
    'complex-reasoning',
    'multimodal',
    'unsupported-action',
    'safety',
    'low-confidence',
  ];
  if (
    typeof value !== 'string' ||
    !allowed.includes(value as MyelinMiniEscalationReason)
  ) {
    throw new Error('MYELIN Mini returned an invalid escalation reason.');
  }
  return value as MyelinMiniEscalationReason;
}

export function myelinMiniDecisionJsonSchema() {
  return {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'requestId', 'route', 'confidence', 'batch'],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          route: { const: 'actions' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          batch: assistantActionBatchJsonSchema(),
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: [
          'version',
          'requestId',
          'route',
          'confidence',
          'reason',
          'question',
          'missingFields',
        ],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          route: { const: 'clarify' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: {
            enum: [
              'missing-date',
              'missing-target',
              'ambiguous-reference',
              'missing-required-detail',
            ],
          },
          question: { type: 'string', minLength: 1, maxLength: 300 },
          missingFields: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'requestId', 'route', 'confidence', 'reason', 'note'],
        properties: {
          version: { const: MYELIN_MINI_PROTOCOL_VERSION },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          route: { const: 'escalate' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: {
            enum: [
              'ambiguous',
              'general-knowledge',
              'tutoring',
              'complex-reasoning',
              'multimodal',
              'unsupported-action',
              'safety',
              'low-confidence',
            ],
          },
          note: { type: 'string', minLength: 1, maxLength: 240 },
        },
      },
    ],
  } as const;
}

export function myelinMiniSystemPrompt() {
  return [
    'You are MYELIN Mini, a narrow intent and tool-routing model for a study-planning app.',
    'Your job is NOT to be a general chatbot and NOT to calculate the timetable yourself.',
    'Return exactly one route: actions, clarify, or escalate.',
    'Translate clear study-management commands into the existing MYELIN assistant action protocol.',
    'If a study-management request is missing an essential date, target, reference, or other required detail, route to clarify and ask one short question.',
    'If the user asks for teaching, factual knowledge, open-ended advice, images/documents, unsupported operations, safety-sensitive help, or difficult reasoning, route to escalate.',
    'Never invent dates, topic IDs, exam IDs, tasks, user preferences, or facts.',
    'Use only records present in the supplied context unless the user explicitly asks to create a new record.',
    'A confidence below 0.72 should normally escalate rather than produce actions.',
    ...assistantModelInstructions(),
  ].join('\n');
}

export function buildMyelinMiniUserPrompt(
  workspace: WorkspaceState,
  userRequest: string,
  requestId: string,
  options: { currentRoute?: string; now?: number; clarificationAnswers?: AssistantClarificationAnswers } = {},
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
    ...(options.clarificationAnswers ? { clarificationAnswers: options.clarificationAnswers } : {}),
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

  const route = object.route;
  const score = confidence(object.confidence);

  if (route === 'clarify') {
    const allowedKeys = new Set([
      'version',
      'requestId',
      'route',
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
      route,
      confidence: score,
      reason: clarificationReason(object.reason),
      question: cleanString(object.question, 'clarification question', 300),
      missingFields: cleanStringArray(object.missingFields, 'missing fields', 12),
    };
  }

  if (route === 'escalate') {
    const allowedKeys = new Set([
      'version',
      'requestId',
      'route',
      'confidence',
      'reason',
      'note',
    ]);
    if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
      throw new Error('MYELIN Mini escalation contains unsupported fields.');
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      route,
      confidence: score,
      reason: escalationReason(object.reason),
      note: cleanString(object.note, 'escalation note', 240),
    };
  }

  if (route !== 'actions') {
    throw new Error('MYELIN Mini returned an unsupported route.');
  }

  const allowedKeys = new Set([
    'version',
    'requestId',
    'route',
    'confidence',
    'batch',
  ]);
  if (Object.keys(object).some((key) => !allowedKeys.has(key))) {
    throw new Error('MYELIN Mini action decision contains unsupported fields.');
  }

  const batch = parseAssistantActionBatch(object.batch);
  if (batch.requestId !== requestId) {
    throw new Error('MYELIN Mini action batch request ID does not match its decision.');
  }

  if (score < MYELIN_MINI_MIN_ACTION_CONFIDENCE) {
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      route: 'escalate',
      confidence: score,
      reason: 'low-confidence',
      note: 'The small model was not confident enough to safely prepare actions.',
    };
  }

  return {
    version: MYELIN_MINI_PROTOCOL_VERSION,
    requestId,
    route,
    confidence: score,
    batch,
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
  allowFastRouter?: boolean;
  clarificationAnswers?: AssistantClarificationAnswers;
}): Promise<MyelinMiniRouteResult> {
  const now = input.now ?? Date.now();
  const groundingInput = { workspace: input.workspace, userRequest: input.userRequest,
    currentDate: localDateKeyFromTimestamp(now), clarificationAnswers: input.clarificationAnswers };
  const question = checkAssistantRequestGrounding(groundingInput);
  if (input.signal?.aborted) { const error = new Error('The assistant request was cancelled.'); error.name = 'AbortError'; throw error; }
  if (question) return { route: 'clarify', confidence: 1, ...question, modelId: 'myelin-request-grounding-v1' };
  const fastRaw = input.allowFastRouter === false ? null : tryBuildMyelinMiniFastDecision({
    workspace: input.workspace,
    userRequest: input.userRequest,
    requestId: input.requestId,
    currentDate: localDateKeyFromTimestamp(now),
    clarificationAnswers: input.clarificationAnswers,
  });
  const modelId = fastRaw ? MYELIN_MINI_FAST_MODEL_ID : input.model.id;

  const raw =
    fastRaw ??
    (await input.model.generate({
      system: myelinMiniSystemPrompt(),
      user: buildMyelinMiniUserPrompt(
        input.workspace,
        input.userRequest,
        input.requestId,
        {
          currentRoute: input.currentRoute,
          now,
          clarificationAnswers: input.clarificationAnswers,
        },
      ),
      responseSchema: myelinMiniDecisionJsonSchema(),
      maxOutputTokens: 1200,
      signal: input.signal,
    }));

  if (input.signal?.aborted) { const error = new Error('The assistant request was cancelled.'); error.name = 'AbortError'; throw error; }
  const decision = parseMyelinMiniDecision(raw, input.requestId);
  if (decision.route === 'clarify') {
    return {
      route: 'clarify',
      confidence: decision.confidence,
      reason: decision.reason,
      question: decision.question,
      missingFields: decision.missingFields,
      modelId,
    };
  }

  if (decision.route === 'escalate') {
    return {
      route: 'escalate',
      confidence: decision.confidence,
      reason: decision.reason,
      note: decision.note,
      modelId,
    };
  }

  const groundingQuestion = fastRaw ? null : checkAssistantActionGrounding(groundingInput, decision.batch);
  if (groundingQuestion) return { route: 'clarify', confidence: 1, ...groundingQuestion, modelId };
  return {
    route: 'actions',
    confidence: decision.confidence,
    prepared: prepareAssistantActionBatch(
      input.workspace,
      decision.batch,
      now,
    ),
    modelId,
  };
}

