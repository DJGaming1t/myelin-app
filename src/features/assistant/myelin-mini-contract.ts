import {
  ASSISTANT_ACTION_PROTOCOL_VERSION,
  AssistantAction,
  AssistantActionBatch,
  parseAssistantActionBatch,
} from '@/src/features/assistant/ai-action-engine';

export const MYELIN_MINI_PROTOCOL_VERSION = 1 as const;

export const MYELIN_MINI_MIN_ACTION_CONFIDENCE = 0.72 as const;

export type MyelinMiniClarificationReason =
  | 'missing-date'
  | 'missing-target'
  | 'ambiguous-reference'
  | 'missing-required-detail';

export type MyelinMiniEscalationReason =
  | 'concept-explanation'
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
  reason: MyelinMiniClarificationReason;
  question: string;
  missingFields: string[];
};

export type MyelinMiniEscalateDecision = {
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
  | MyelinMiniEscalateDecision;

export type MyelinMiniTrainingExample = {
  id: string;
  split: 'train' | 'validation';
  input: {
    currentDate: string;
    userRequest: string;
    context?: {
      topics?: Array<{ id: string; name: string; subject: string }>;
      exams?: Array<{ id: string; name: string; date: string }>;
      tasks?: Array<{ id: string; title: string; subject: string }>;
    };
  };
  output: MyelinMiniDecision;
};

function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized;
}

function confidence(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Invalid MYELIN Mini confidence.');
  }
  return value;
}

function stringArray(value: unknown, label: string, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${label}.`);
  }
  return value.map((item, index) => string(item, `${label}[${index}]`, 120));
}

const CLARIFICATION_REASONS = new Set<MyelinMiniClarificationReason>([
  'missing-date',
  'missing-target',
  'ambiguous-reference',
  'missing-required-detail',
]);

const ESCALATION_REASONS = new Set<MyelinMiniEscalationReason>([
  'concept-explanation',
  'complex-reasoning',
  'multimodal',
  'unsupported-action',
  'safety',
  'low-confidence',
]);

export function parseMyelinMiniDecision(value: unknown): MyelinMiniDecision {
  const raw = object(value, 'MYELIN Mini decision');
  if (raw.version !== MYELIN_MINI_PROTOCOL_VERSION) {
    throw new Error('Unsupported MYELIN Mini protocol version.');
  }

  const requestId = string(raw.requestId, 'MYELIN Mini requestId', 120);
  const score = confidence(raw.confidence);

  if (raw.kind === 'actions') {
    const batch = parseAssistantActionBatch({
      version: ASSISTANT_ACTION_PROTOCOL_VERSION,
      requestId,
      actions: raw.actions,
    });
    if (score < MYELIN_MINI_MIN_ACTION_CONFIDENCE) {
      throw new Error(
        `MYELIN Mini action confidence must be at least ${MYELIN_MINI_MIN_ACTION_CONFIDENCE}.`,
      );
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind: 'actions',
      confidence: score,
      actions: batch.actions,
    };
  }

  if (raw.kind === 'clarify') {
    const reason = string(raw.reason, 'clarification reason', 80) as MyelinMiniClarificationReason;
    if (!CLARIFICATION_REASONS.has(reason)) {
      throw new Error('Unsupported MYELIN Mini clarification reason.');
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind: 'clarify',
      confidence: score,
      reason,
      question: string(raw.question, 'clarification question', 300),
      missingFields: stringArray(raw.missingFields, 'missingFields', 12),
    };
  }

  if (raw.kind === 'escalate') {
    const reason = string(raw.reason, 'escalation reason', 80) as MyelinMiniEscalationReason;
    if (!ESCALATION_REASONS.has(reason)) {
      throw new Error('Unsupported MYELIN Mini escalation reason.');
    }
    return {
      version: MYELIN_MINI_PROTOCOL_VERSION,
      requestId,
      kind: 'escalate',
      confidence: score,
      reason,
      summary: string(raw.summary, 'escalation summary', 400),
    };
  }

  throw new Error('Unsupported MYELIN Mini decision kind.');
}

export function myelinMiniActionBatch(
  decision: MyelinMiniActionDecision,
): AssistantActionBatch {
  return parseAssistantActionBatch({
    version: ASSISTANT_ACTION_PROTOCOL_VERSION,
    requestId: decision.requestId,
    actions: decision.actions,
  });
}

export function myelinMiniInstructions() {
  return [
    'You are MYELIN Mini. Your job is intent understanding and safe tool selection, not general tutoring.',
    'Return exactly one JSON decision: actions, clarify, or escalate.',
    'Use actions only when the request maps cleanly to MYELIN tools and all required information is available.',
    `Use actions only when confidence is at least ${MYELIN_MINI_MIN_ACTION_CONFIDENCE}.`,
    'Use clarify instead of guessing missing dates, targets, references, or required details.',
    'Use escalate for concept explanations, difficult open-ended reasoning, images/documents, unsupported actions, safety-sensitive requests, or low confidence.',
    'Never invent a timetable. For exam planning, call generate_exam_plan and let MYELIN calculate dates and capacity.',
    'Never invent IDs. Use IDs supplied in context, or name+subject references when the match is unambiguous.',
    'Keep action batches minimal and do not create duplicates when an existing record already matches.',
  ] as const;
}
