import { WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { validateWorkspaceV2 } from '@/src/data/validation';
import {
  createExam,
  parseExamDateInput,
  validateExamInput,
} from '@/src/features/exams/exam-engine';
import {
  ExamPlanTopicOverride,
  JointExamPreparationPlan,
  buildJointExamPreparationPlan,
} from '@/src/features/exams/exam-plan-engine';
import { createStudyTask } from '@/src/features/planning/task-engine';
import {
  applyTopicInput,
  createTopic,
  findTopic,
} from '@/src/features/topics/topic-operations';

export const ASSISTANT_ACTION_PROTOCOL_VERSION = 1 as const;
export const MAX_ASSISTANT_ACTIONS = 100 as const;

type Priority = 1 | 2 | 3;
type TopicStatus = 'new' | 'learning' | 'review';
type TaskType = 'homework' | 'revision' | 'practice' | 'assignment' | 'personal';

export type AssistantTopicRef =
  | { topicId: string }
  | { clientRef: string }
  | { name: string; subject: string };

export type AssistantExamRef =
  | { examId: string }
  | { clientRef: string }
  | { name: string };

export type AssistantCreateTopicAction = {
  type: 'create_topic';
  clientRef?: string;
  name: string;
  subject: string;
  status: TopicStatus;
  priority: Priority;
  estimatedMinutes: number;
  notes: string;
};

export type AssistantUpdateTopicAction = {
  type: 'update_topic';
  topic: AssistantTopicRef;
  patch: Partial<{
    name: string;
    subject: string;
    status: TopicStatus;
    priority: Priority;
    estimatedMinutes: number;
    notes: string;
  }>;
};

export type AssistantCreateExamAction = {
  type: 'create_exam';
  clientRef?: string;
  name: string;
  date: string;
  topicRefs: AssistantTopicRef[];
};

export type AssistantCreateTaskAction = {
  type: 'create_task';
  clientRef?: string;
  title: string;
  subject: string;
  topic?: AssistantTopicRef;
  exam?: AssistantExamRef;
  taskType: TaskType;
  dueDate?: string;
  estimatedMinutes: number;
  priority: Priority;
  notes: string;
};

export type AssistantGenerateExamPlanAction = {
  type: 'generate_exam_plan';
  examRefs?: AssistantExamRef[];
  topicOverrides: Array<{
    topic: AssistantTopicRef;
    estimatedMinutes?: number;
    difficulty?: Priority;
    importance?: Priority;
  }>;
  bufferRatio?: number;
  revisionRatio?: number;
  revisionLeadDays?: number;
};

export type AssistantAction =
  | AssistantCreateTopicAction
  | AssistantUpdateTopicAction
  | AssistantCreateExamAction
  | AssistantCreateTaskAction
  | AssistantGenerateExamPlanAction;

export type AssistantActionBatch = {
  version: typeof ASSISTANT_ACTION_PROTOCOL_VERSION;
  requestId: string;
  actions: AssistantAction[];
};

export type AssistantActionRisk = 'read' | 'confirm';

export type AssistantExamPlanSummary = {
  examCount: number;
  uniqueTopicCount: number;
  strain: 'comfortable' | 'balanced' | 'tight' | 'overloaded';
  strainRatio: number;
  totalPreparationRequiredMinutes: number;
  totalRevisionRequiredMinutes: number;
  totalUsableCapacityMinutes: number;
  plannedPreparationMinutes: number;
  plannedRevisionMinutes: number;
  unallocatedPreparationMinutes: number;
  unallocatedRevisionMinutes: number;
  bufferRatio: number;
  revisionRatio: number;
  revisionLeadDays: number;
  feasibility: {
    feasible: boolean;
    totalRequiredMinutes: number;
    totalCapacityMinutes: number;
    totalOverloadMinutes: number;
    firstOverloadedDeadline: null | {
      deadlineAt: number;
      intervalStart: number;
      requiredMinutes: number;
      capacityMinutes: number;
      overloadMinutes: number;
      availableDayCount: number;
      extraMinutesPerAvailableDay: number | null;
      reliefCandidates: Array<{
        demandId: string;
        label: string;
        kind: 'task' | 'exam-preparation' | 'exam-revision' | 'other';
        priority: Priority;
        requiredMinutes: number;
        suggestedMinutes: number;
        movable: boolean;
      }>;
    };
  };
  workload: {
    demandCount: number;
    taskRemainingMinutes: number;
    scheduledTaskMinutes: number;
    unscheduledTaskMinutes: number;
    examPreparationMinutes: number;
    examRevisionMinutes: number;
    deduplicatedMinutes: number;
  };
  capacity: {
    source: 'default' | 'personalized';
    sustainableDailyMinutes: number;
    historicalMedianMinutes: number | null;
    completionReliability: number | null;
    estimateMultiplier: number;
    postponementPressure: number;
    highEffortShare: number;
  };
  exams: Array<{
    examId: string;
    examName: string;
    examDate: number;
    topicCount: number;
    preparationUnallocatedMinutes: number;
    revisionRequiredMinutes: number;
    revisionPlannedMinutes: number;
    revisionUnallocatedMinutes: number;
  }>;
  warnings: string[];
  days: Array<{
    day: number;
    plannedPreparationMinutes: number;
    plannedRevisionMinutes: number;
    usableCapacityMinutes: number;
    totalStudyLoadMinutes: number;
    strain: 'comfortable' | 'balanced' | 'tight' | 'overloaded';
    blocks: Array<{
      kind: 'preparation' | 'revision';
      topicId: string;
      topicName: string;
      subject: string;
      minutes: number;
      examIds: string[];
      examId: string | null;
      reasons: string[];
    }>;
  }>;
};

export type AssistantActionResult = {
  index: number;
  type: AssistantAction['type'];
  risk: AssistantActionRisk;
  summary: string;
  data?: unknown;
};

export function isAssistantExamPlanSummary(
  value: unknown,
): value is AssistantExamPlanSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<AssistantExamPlanSummary>;
  return (
    typeof item.examCount === 'number' &&
    typeof item.uniqueTopicCount === 'number' &&
    typeof item.strain === 'string' &&
    typeof item.strainRatio === 'number' &&
    typeof item.totalUsableCapacityMinutes === 'number' &&
    typeof item.totalPreparationRequiredMinutes === 'number' &&
    typeof item.totalRevisionRequiredMinutes === 'number' &&
    typeof item.unallocatedPreparationMinutes === 'number' &&
    typeof item.unallocatedRevisionMinutes === 'number' &&
    Boolean(item.capacity) &&
    Boolean(item.feasibility) &&
    Boolean(item.workload) &&
    Array.isArray(item.exams) &&
    Array.isArray(item.warnings) &&
    Array.isArray(item.days)
  );
}

export type AssistantActionBatchResult = {
  requestId: string;
  requestDigest: string;
  duplicate: boolean;
  requiresConfirmation: boolean;
  hasMutations: boolean;
  results: AssistantActionResult[];
  nextWorkspace: WorkspaceState;
};

export type AssistantActionRunOptions = {
  mode?: 'preview' | 'apply';
  confirmed?: boolean;
  now?: number;
};

export class AssistantActionError extends Error {
  constructor(
    message: string,
    public readonly actionIndex: number | null = null,
  ) {
    super(message);
    this.name = 'AssistantActionError';
  }
}

function asObject(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssistantActionError(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string, max: number) {
  if (!Array.isArray(value) || value.length > max) {
    throw new AssistantActionError(`Invalid ${label}.`);
  }
  return value;
}

function cleanString(
  value: unknown,
  label: string,
  max: number,
  options: { allowEmpty?: boolean } = {},
) {
  if (typeof value !== 'string' || value.length > max) {
    throw new AssistantActionError(`Invalid ${label}.`);
  }
  const result = value.trim();
  if (!options.allowEmpty && !result) {
    throw new AssistantActionError(`${label} cannot be empty.`);
  }
  return result;
}

function optionalString(value: unknown, label: string, max: number) {
  if (value == null) return undefined;
  return cleanString(value, label, max);
}

function numberInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new AssistantActionError(`Invalid ${label}.`);
  }
  return value;
}

function integerInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  const result = numberInRange(value, label, min, max);
  if (!Number.isInteger(result)) throw new AssistantActionError(`Invalid ${label}.`);
  return result;
}

function optionalNumberInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  if (value == null) return undefined;
  return numberInRange(value, label, min, max);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AssistantActionError(`Invalid ${label}.`);
  }
  return value as T;
}

function strictKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(object).filter((key) => !allowedSet.has(key));
  if (extra.length) {
    throw new AssistantActionError(
      `${label} contains unsupported field${extra.length === 1 ? '' : 's'}: ${extra.join(', ')}.`,
    );
  }
}

function parseDate(value: unknown, label: string) {
  const date = cleanString(value, label, 10);
  const timestamp = parseExamDateInput(date);
  if (!timestamp) throw new AssistantActionError(`Invalid ${label}.`);
  return { date, timestamp };
}

function parseTopicRef(raw: unknown): AssistantTopicRef {
  const ref = asObject(raw, 'topic reference');
  strictKeys(ref, ['topicId', 'clientRef', 'name', 'subject'], 'Topic reference');

  const topicId = optionalString(ref.topicId, 'topic ID', 120);
  const clientRef = optionalString(ref.clientRef, 'topic client reference', 80);
  const name = optionalString(ref.name, 'topic name', 300);
  const subject = optionalString(ref.subject, 'topic subject', 120);

  const modes = Number(Boolean(topicId)) + Number(Boolean(clientRef)) + Number(Boolean(name || subject));
  if (modes !== 1) {
    throw new AssistantActionError(
      'A topic reference must use exactly one of topicId, clientRef, or name + subject.',
    );
  }
  if (topicId) return { topicId };
  if (clientRef) return { clientRef };
  if (!name || !subject) {
    throw new AssistantActionError('A named topic reference needs both name and subject.');
  }
  return { name, subject };
}

function parseExamRef(raw: unknown): AssistantExamRef {
  const ref = asObject(raw, 'exam reference');
  strictKeys(ref, ['examId', 'clientRef', 'name'], 'Exam reference');

  const examId = optionalString(ref.examId, 'exam ID', 120);
  const clientRef = optionalString(ref.clientRef, 'exam client reference', 80);
  const name = optionalString(ref.name, 'exam name', 200);
  const modes = Number(Boolean(examId)) + Number(Boolean(clientRef)) + Number(Boolean(name));
  if (modes !== 1) {
    throw new AssistantActionError(
      'An exam reference must use exactly one of examId, clientRef, or name.',
    );
  }
  if (examId) return { examId };
  if (clientRef) return { clientRef };
  return { name: name! };
}

function parseCreateTopic(raw: Record<string, unknown>): AssistantCreateTopicAction {
  strictKeys(
    raw,
    ['type', 'clientRef', 'name', 'subject', 'status', 'priority', 'estimatedMinutes', 'notes'],
    'create_topic action',
  );
  return {
    type: 'create_topic',
    ...(raw.clientRef == null
      ? {}
      : { clientRef: cleanString(raw.clientRef, 'topic client reference', 80) }),
    name: cleanString(raw.name, 'topic name', 300),
    subject: cleanString(raw.subject, 'topic subject', 120),
    status: oneOf(raw.status ?? 'new', ['new', 'learning', 'review'] as const, 'topic status'),
    priority: integerInRange(raw.priority ?? 2, 'topic priority', 1, 3) as Priority,
    estimatedMinutes: integerInRange(
      raw.estimatedMinutes ?? 45,
      'topic estimated minutes',
      5,
      240,
    ),
    notes: cleanString(raw.notes ?? '', 'topic notes', 20_000, { allowEmpty: true }),
  };
}

function parseUpdateTopic(raw: Record<string, unknown>): AssistantUpdateTopicAction {
  strictKeys(raw, ['type', 'topic', 'patch'], 'update_topic action');
  const patch = asObject(raw.patch, 'topic patch');
  strictKeys(
    patch,
    ['name', 'subject', 'status', 'priority', 'estimatedMinutes', 'notes'],
    'Topic patch',
  );

  const parsedPatch: AssistantUpdateTopicAction['patch'] = {};
  if (patch.name != null) parsedPatch.name = cleanString(patch.name, 'topic name', 300);
  if (patch.subject != null) parsedPatch.subject = cleanString(patch.subject, 'topic subject', 120);
  if (patch.status != null) {
    parsedPatch.status = oneOf(
      patch.status,
      ['new', 'learning', 'review'] as const,
      'topic status',
    );
  }
  if (patch.priority != null) {
    parsedPatch.priority = integerInRange(patch.priority, 'topic priority', 1, 3) as Priority;
  }
  if (patch.estimatedMinutes != null) {
    parsedPatch.estimatedMinutes = integerInRange(
      patch.estimatedMinutes,
      'topic estimated minutes',
      5,
      240,
    );
  }
  if (patch.notes != null) {
    parsedPatch.notes = cleanString(patch.notes, 'topic notes', 20_000, { allowEmpty: true });
  }
  if (!Object.keys(parsedPatch).length) {
    throw new AssistantActionError('Topic patch cannot be empty.');
  }

  return {
    type: 'update_topic',
    topic: parseTopicRef(raw.topic),
    patch: parsedPatch,
  };
}

function parseCreateExam(raw: Record<string, unknown>): AssistantCreateExamAction {
  strictKeys(raw, ['type', 'clientRef', 'name', 'date', 'topicRefs'], 'create_exam action');
  const topicRefs = asArray(raw.topicRefs, 'exam topic references', 300).map(parseTopicRef);
  if (!topicRefs.length) {
    throw new AssistantActionError('An exam needs at least one topic reference.');
  }
  return {
    type: 'create_exam',
    ...(raw.clientRef == null
      ? {}
      : { clientRef: cleanString(raw.clientRef, 'exam client reference', 80) }),
    name: cleanString(raw.name, 'exam name', 200),
    date: parseDate(raw.date, 'exam date').date,
    topicRefs,
  };
}

function parseCreateTask(raw: Record<string, unknown>): AssistantCreateTaskAction {
  strictKeys(
    raw,
    [
      'type',
      'clientRef',
      'title',
      'subject',
      'topic',
      'exam',
      'taskType',
      'dueDate',
      'estimatedMinutes',
      'priority',
      'notes',
    ],
    'create_task action',
  );

  return {
    type: 'create_task',
    ...(raw.clientRef == null
      ? {}
      : { clientRef: cleanString(raw.clientRef, 'task client reference', 80) }),
    title: cleanString(raw.title, 'task title', 500),
    subject: cleanString(raw.subject ?? '', 'task subject', 120, { allowEmpty: true }),
    ...(raw.topic == null ? {} : { topic: parseTopicRef(raw.topic) }),
    ...(raw.exam == null ? {} : { exam: parseExamRef(raw.exam) }),
    taskType: oneOf(
      raw.taskType ?? 'homework',
      ['homework', 'revision', 'practice', 'assignment', 'personal'] as const,
      'task type',
    ),
    ...(raw.dueDate == null ? {} : { dueDate: parseDate(raw.dueDate, 'task due date').date }),
    estimatedMinutes: integerInRange(
      raw.estimatedMinutes ?? 0,
      'task estimated minutes',
      0,
      720,
    ),
    priority: integerInRange(raw.priority ?? 2, 'task priority', 1, 3) as Priority,
    notes: cleanString(raw.notes ?? '', 'task notes', 12_000, { allowEmpty: true }),
  };
}

function parseGeneratePlan(raw: Record<string, unknown>): AssistantGenerateExamPlanAction {
  strictKeys(
    raw,
    [
      'type',
      'examRefs',
      'topicOverrides',
      'bufferRatio',
      'revisionRatio',
      'revisionLeadDays',
    ],
    'generate_exam_plan action',
  );

  const examRefs =
    raw.examRefs == null
      ? undefined
      : asArray(raw.examRefs, 'plan exam references', 100).map(parseExamRef);
  const topicOverrides = asArray(
    raw.topicOverrides ?? [],
    'plan topic overrides',
    300,
  ).map((value) => {
    const item = asObject(value, 'topic override');
    strictKeys(
      item,
      ['topic', 'estimatedMinutes', 'difficulty', 'importance'],
      'Topic override',
    );
    return {
      topic: parseTopicRef(item.topic),
      ...(item.estimatedMinutes == null
        ? {}
        : {
            estimatedMinutes: integerInRange(
              item.estimatedMinutes,
              'override estimated minutes',
              5,
              720,
            ),
          }),
      ...(item.difficulty == null
        ? {}
        : {
            difficulty: integerInRange(
              item.difficulty,
              'override difficulty',
              1,
              3,
            ) as Priority,
          }),
      ...(item.importance == null
        ? {}
        : {
            importance: integerInRange(
              item.importance,
              'override importance',
              1,
              3,
            ) as Priority,
          }),
    };
  });

  return {
    type: 'generate_exam_plan',
    ...(examRefs == null ? {} : { examRefs }),
    topicOverrides,
    ...(raw.bufferRatio == null
      ? {}
      : {
          bufferRatio: optionalNumberInRange(
            raw.bufferRatio,
            'plan buffer ratio',
            0,
            0.4,
          ),
        }),
    ...(raw.revisionRatio == null
      ? {}
      : {
          revisionRatio: optionalNumberInRange(
            raw.revisionRatio,
            'plan revision ratio',
            0.08,
            0.35,
          ),
        }),
    ...(raw.revisionLeadDays == null
      ? {}
      : {
          revisionLeadDays: integerInRange(
            raw.revisionLeadDays,
            'revision lead days',
            1,
            5,
          ),
        }),
  };
}

function parseAction(raw: unknown): AssistantAction {
  const action = asObject(raw, 'assistant action');
  const type = cleanString(action.type, 'action type', 80);
  switch (type) {
    case 'create_topic':
      return parseCreateTopic(action);
    case 'update_topic':
      return parseUpdateTopic(action);
    case 'create_exam':
      return parseCreateExam(action);
    case 'create_task':
      return parseCreateTask(action);
    case 'generate_exam_plan':
      return parseGeneratePlan(action);
    default:
      throw new AssistantActionError(`Unsupported assistant action: ${type}.`);
  }
}

export function parseAssistantActionBatch(raw: unknown): AssistantActionBatch {
  const batch = asObject(raw, 'assistant action batch');
  strictKeys(batch, ['version', 'requestId', 'actions'], 'Assistant action batch');

  if (batch.version !== ASSISTANT_ACTION_PROTOCOL_VERSION) {
    throw new AssistantActionError('Unsupported assistant action protocol version.');
  }

  const actions = asArray(batch.actions, 'assistant actions', MAX_ASSISTANT_ACTIONS).map(
    (action, index) => {
      try {
        return parseAction(action);
      } catch (error) {
        if (error instanceof AssistantActionError) {
          throw new AssistantActionError(error.message, index);
        }
        throw error;
      }
    },
  );
  if (!actions.length) throw new AssistantActionError('Assistant action batch cannot be empty.');

  const clientRefs = new Set<string>();
  actions.forEach((action, index) => {
    if (!('clientRef' in action) || !action.clientRef) return;
    if (clientRefs.has(action.clientRef)) {
      throw new AssistantActionError(
        `Duplicate client reference: ${action.clientRef}.`,
        index,
      );
    }
    clientRefs.add(action.clientRef);
  });

  return {
    version: ASSISTANT_ACTION_PROTOCOL_VERSION,
    requestId: cleanString(batch.requestId, 'request ID', 120),
    actions,
  };
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function assistantRequestDigest(batch: AssistantActionBatch) {
  const input = JSON.stringify(batch);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function requestReceipt(workspace: WorkspaceState, requestId: string) {
  return (workspace.assistantReceipts ?? []).find(
    (receipt) => receipt.requestId === requestId,
  ) ?? null;
}

function resolveTopic(
  workspace: WorkspaceState,
  ref: AssistantTopicRef,
  topicClientRefs: Map<string, string>,
) {
  if ('topicId' in ref) {
    const topic = findTopic(workspace, ref.topicId);
    if (!topic) throw new AssistantActionError(`Unknown topic ID: ${ref.topicId}.`);
    return topic;
  }

  if ('clientRef' in ref) {
    const topicId = topicClientRefs.get(ref.clientRef);
    if (!topicId) {
      throw new AssistantActionError(`Unknown topic client reference: ${ref.clientRef}.`);
    }
    const topic = findTopic(workspace, topicId);
    if (!topic) throw new AssistantActionError('Resolved topic no longer exists.');
    return topic;
  }

  const matches = workspace.topics.filter(
    (topic) =>
      normalized(topic.name) === normalized(ref.name) &&
      normalized(topic.subject) === normalized(ref.subject),
  );
  if (!matches.length) {
    throw new AssistantActionError(
      `No topic matches "${ref.name}" in ${ref.subject}.`,
    );
  }
  if (matches.length > 1) {
    throw new AssistantActionError(
      `Topic reference is ambiguous: "${ref.name}" in ${ref.subject}.`,
    );
  }
  return matches[0]!;
}

function resolveExam(
  workspace: WorkspaceState,
  ref: AssistantExamRef,
  examClientRefs: Map<string, string>,
) {
  if ('examId' in ref) {
    const exam = workspace.exams.find((item) => item.id === ref.examId);
    if (!exam) throw new AssistantActionError(`Unknown exam ID: ${ref.examId}.`);
    return exam;
  }

  if ('clientRef' in ref) {
    const examId = examClientRefs.get(ref.clientRef);
    if (!examId) {
      throw new AssistantActionError(`Unknown exam client reference: ${ref.clientRef}.`);
    }
    const exam = workspace.exams.find((item) => item.id === examId);
    if (!exam) throw new AssistantActionError('Resolved exam no longer exists.');
    return exam;
  }

  const matches = workspace.exams.filter(
    (exam) => normalized(exam.name) === normalized(ref.name),
  );
  if (!matches.length) throw new AssistantActionError(`No exam matches "${ref.name}".`);
  if (matches.length > 1) {
    throw new AssistantActionError(`Exam reference is ambiguous: "${ref.name}".`);
  }
  return matches[0]!;
}

function actionRisk(action: AssistantAction): AssistantActionRisk {
  return action.type === 'generate_exam_plan' ? 'read' : 'confirm';
}

function planSummary(plan: JointExamPreparationPlan): AssistantExamPlanSummary {
  return {
    examCount: plan.exams.length,
    uniqueTopicCount: plan.uniqueTopicCount,
    strain: plan.feasibility.feasible ? plan.strain : 'overloaded',
    strainRatio: plan.strainRatio,
    totalPreparationRequiredMinutes: plan.totalPreparationRequiredMinutes,
    totalRevisionRequiredMinutes: plan.totalRevisionRequiredMinutes,
    totalUsableCapacityMinutes: plan.totalUsableCapacityMinutes,
    plannedPreparationMinutes: plan.plannedPreparationMinutes,
    plannedRevisionMinutes: plan.plannedRevisionMinutes,
    unallocatedPreparationMinutes: plan.unallocatedPreparationMinutes,
    unallocatedRevisionMinutes: plan.unallocatedRevisionMinutes,
    bufferRatio: plan.bufferRatio,
    revisionRatio: plan.revisionRatio,
    revisionLeadDays: plan.revisionLeadDays,
    feasibility: {
      feasible: plan.feasibility.feasible,
      totalRequiredMinutes: plan.feasibility.totalRequiredMinutes,
      totalCapacityMinutes: plan.feasibility.totalCapacityMinutes,
      totalOverloadMinutes: plan.feasibility.totalOverloadMinutes,
      firstOverloadedDeadline: plan.feasibility.firstOverloadedDeadline
        ? {
            deadlineAt: plan.feasibility.firstOverloadedDeadline.deadlineAt,
            intervalStart: plan.feasibility.firstOverloadedDeadline.intervalStart,
            requiredMinutes: plan.feasibility.firstOverloadedDeadline.requiredMinutes,
            capacityMinutes: plan.feasibility.firstOverloadedDeadline.capacityMinutes,
            overloadMinutes: plan.feasibility.firstOverloadedDeadline.overloadMinutes,
            availableDayCount:
              plan.feasibility.firstOverloadedDeadline.availableDayCount,
            extraMinutesPerAvailableDay:
              plan.feasibility.firstOverloadedDeadline.extraMinutesPerAvailableDay,
            reliefCandidates:
              plan.feasibility.firstOverloadedDeadline.reliefCandidates.map(
                (candidate) => ({ ...candidate }),
              ),
          }
        : null,
    },
    workload: {
      demandCount: plan.workloadLedger.demands.length,
      taskRemainingMinutes: plan.workloadLedger.taskRemainingMinutes,
      scheduledTaskMinutes: plan.workloadLedger.scheduledTaskMinutes,
      unscheduledTaskMinutes: plan.workloadLedger.unscheduledTaskMinutes,
      examPreparationMinutes: plan.workloadLedger.examPreparationMinutes,
      examRevisionMinutes: plan.workloadLedger.examRevisionMinutes,
      deduplicatedMinutes: plan.workloadLedger.deduplicatedMinutes,
    },
    capacity: {
      source: plan.capacityProfile.source,
      sustainableDailyMinutes: plan.capacityProfile.sustainableDailyMinutes,
      historicalMedianMinutes: plan.capacityProfile.historicalMedianMinutes,
      completionReliability: plan.capacityProfile.completionReliability,
      estimateMultiplier: plan.capacityProfile.estimateMultiplier,
      postponementPressure: plan.capacityProfile.postponementPressure,
      highEffortShare: plan.capacityProfile.highEffortShare,
    },
    exams: plan.exams.map((exam) => ({
      examId: exam.examId,
      examName: exam.examName,
      examDate: exam.examDate,
      topicCount: exam.topicIds.length,
      preparationUnallocatedMinutes: exam.preparationUnallocatedMinutes,
      revisionRequiredMinutes: exam.revisionRequiredMinutes,
      revisionPlannedMinutes: exam.revisionPlannedMinutes,
      revisionUnallocatedMinutes: exam.revisionUnallocatedMinutes,
    })),
    warnings: [...plan.warnings],
    days: plan.days.map((day) => ({
      day: day.day,
      plannedPreparationMinutes: day.plannedPreparationMinutes,
      plannedRevisionMinutes: day.plannedRevisionMinutes,
      usableCapacityMinutes: day.usableCapacityMinutes,
      totalStudyLoadMinutes: day.totalStudyLoadMinutes,
      strain: day.strain,
      blocks: day.blocks.map((block) => ({
        kind: block.kind,
        topicId: block.topicId,
        topicName: block.topicName,
        subject: block.subject,
        minutes: block.minutes,
        examIds: block.examIds,
        examId: block.examId,
        reasons: block.reasons,
      })),
    })),
  };
}

function executeParsedBatch(
  workspace: WorkspaceState,
  batch: AssistantActionBatch,
  now: number,
) {
  const draft = cloneWorkspace(workspace);
  const topicClientRefs = new Map<string, string>();
  const examClientRefs = new Map<string, string>();
  const taskClientRefs = new Map<string, string>();
  const results: AssistantActionResult[] = [];

  batch.actions.forEach((action, index) => {
    try {
      switch (action.type) {
        case 'create_topic': {
          const duplicate = draft.topics.find(
            (topic) =>
              normalized(topic.name) === normalized(action.name) &&
              normalized(topic.subject) === normalized(action.subject),
          );
          if (duplicate) {
            throw new AssistantActionError(
              `Topic already exists: ${action.name} in ${action.subject}.`,
            );
          }

          const topic = createTopic(
            {
              name: action.name,
              subject: action.subject,
              status: action.status,
              priority: action.priority,
              estimate: action.estimatedMinutes,
              notes: action.notes,
            },
            now + index,
          );
          draft.topics.push(topic);
          if (action.clientRef) topicClientRefs.set(action.clientRef, topic.id);
          results.push({
            index,
            type: action.type,
            risk: 'confirm',
            summary: `Create topic ${topic.name} in ${topic.subject}.`,
            data: { topicId: topic.id, clientRef: action.clientRef ?? null },
          });
          break;
        }

        case 'update_topic': {
          const topic = resolveTopic(draft, action.topic, topicClientRefs);
          applyTopicInput(topic, {
            name: action.patch.name ?? topic.name,
            subject: action.patch.subject ?? topic.subject,
            status: action.patch.status ?? topic.status,
            priority: action.patch.priority ?? topic.priority,
            estimate: action.patch.estimatedMinutes ?? topic.estimate,
            notes: action.patch.notes ?? topic.notes,
          });
          results.push({
            index,
            type: action.type,
            risk: 'confirm',
            summary: `Update topic ${topic.name}.`,
            data: { topicId: topic.id },
          });
          break;
        }

        case 'create_exam': {
          const topicIds = action.topicRefs.map(
            (ref) => resolveTopic(draft, ref, topicClientRefs).id,
          );
          const date = parseExamDateInput(action.date)!;
          const input = {
            name: action.name,
            date,
            scope: 'topics' as const,
            subjects: [],
            topicIds: [...new Set(topicIds)],
          };
          const validationError = validateExamInput(input, draft.topics);
          if (validationError) throw new AssistantActionError(validationError);
          if (
            draft.exams.some(
              (exam) =>
                normalized(exam.name) === normalized(action.name) &&
                exam.date === date,
            )
          ) {
            throw new AssistantActionError(
              `Exam already exists: ${action.name} on ${action.date}.`,
            );
          }

          const exam = createExam(input, now + index);
          draft.exams.push(exam);
          if (action.clientRef) examClientRefs.set(action.clientRef, exam.id);
          results.push({
            index,
            type: action.type,
            risk: 'confirm',
            summary: `Create ${exam.name} with ${exam.topicIds.length} topic${exam.topicIds.length === 1 ? '' : 's'}.`,
            data: { examId: exam.id, clientRef: action.clientRef ?? null },
          });
          break;
        }

        case 'create_task': {
          const topic = action.topic
            ? resolveTopic(draft, action.topic, topicClientRefs)
            : null;
          const exam = action.exam
            ? resolveExam(draft, action.exam, examClientRefs)
            : null;
          if (topic && exam && !exam.topicIds.includes(topic.id)) {
            throw new AssistantActionError(
              `Task topic ${topic.name} is not included in ${exam.name}.`,
            );
          }

          const task = createStudyTask({
            title: action.title,
            subject: action.subject || topic?.subject || '',
            topicId: topic?.id ?? null,
            examId: exam?.id ?? null,
            type: action.taskType,
            planState: 'inbox',
            dueAt: action.dueDate ? parseExamDateInput(action.dueDate)! : 0,
            estimatedMinutes: action.estimatedMinutes,
            priority: action.priority,
            notes: action.notes,
            now: now + index,
          });
          draft.tasks.push(task);
          if (action.clientRef) taskClientRefs.set(action.clientRef, task.id);
          results.push({
            index,
            type: action.type,
            risk: 'confirm',
            summary: `Create task ${task.title}.`,
            data: { taskId: task.id, clientRef: action.clientRef ?? null },
          });
          break;
        }

        case 'generate_exam_plan': {
          const examIds = action.examRefs?.map(
            (ref) => resolveExam(draft, ref, examClientRefs).id,
          );
          const topicOverrides: ExamPlanTopicOverride[] = action.topicOverrides.map(
            (override) => {
              const topic = resolveTopic(draft, override.topic, topicClientRefs);
              return {
                topicId: topic.id,
                ...(override.estimatedMinutes == null
                  ? {}
                  : { estimatedMinutes: override.estimatedMinutes }),
                ...(override.difficulty == null
                  ? {}
                  : { difficulty: override.difficulty }),
                ...(override.importance == null
                  ? {}
                  : { importance: override.importance }),
              };
            },
          );
          const plan = buildJointExamPreparationPlan(draft, now, {
            ...(examIds == null ? {} : { examIds }),
            topicOverrides,
            ...(action.bufferRatio == null ? {} : { bufferRatio: action.bufferRatio }),
            ...(action.revisionRatio == null
              ? {}
              : { revisionRatio: action.revisionRatio }),
            ...(action.revisionLeadDays == null
              ? {}
              : { revisionLeadDays: action.revisionLeadDays }),
          });
          results.push({
            index,
            type: action.type,
            risk: 'read',
            summary: `Generate joint plan for ${plan.exams.length} exam${plan.exams.length === 1 ? '' : 's'}.`,
            data: planSummary(plan),
          });
          break;
        }
      }
    } catch (error) {
      if (error instanceof AssistantActionError) {
        throw new AssistantActionError(error.message, index);
      }
      throw error;
    }
  });

  validateWorkspaceV2(draft);
  return { draft, results, taskClientRefs };
}

export function runAssistantActionBatch(
  workspace: WorkspaceState,
  rawBatch: unknown,
  options: AssistantActionRunOptions = {},
): AssistantActionBatchResult {
  const batch = parseAssistantActionBatch(rawBatch);
  const requestDigest = assistantRequestDigest(batch);
  const mode = options.mode ?? 'preview';
  const hasMutations = batch.actions.some((action) => actionRisk(action) === 'confirm');
  const requiresConfirmation = hasMutations;
  const prior = requestReceipt(workspace, batch.requestId);

  if (prior) {
    if (prior.digest !== requestDigest) {
      throw new AssistantActionError(
        `Assistant request ID "${batch.requestId}" was already applied with different content.`,
      );
    }
    return {
      requestId: batch.requestId,
      requestDigest,
      duplicate: true,
      requiresConfirmation: false,
      hasMutations,
      results: [],
      nextWorkspace: cloneWorkspace(workspace),
    };
  }

  if (mode === 'apply' && hasMutations && options.confirmed !== true) {
    throw new AssistantActionError(
      'This assistant action batch changes MYELIN data and requires confirmation.',
    );
  }

  const now = options.now ?? Date.now();
  const executed = executeParsedBatch(workspace, batch, now);

  if (mode === 'apply' && hasMutations) {
    const receipts = [
      ...(executed.draft.assistantReceipts ?? []),
      { requestId: batch.requestId, digest: requestDigest, appliedAt: now },
    ];
    executed.draft.assistantReceipts = receipts.slice(-200);
    validateWorkspaceV2(executed.draft);
  }

  return {
    requestId: batch.requestId,
    requestDigest,
    duplicate: false,
    requiresConfirmation,
    hasMutations,
    results: executed.results,
    nextWorkspace: executed.draft,
  };
}

export function assistantActionToolCatalog() {
  return [
    {
      name: 'create_topic',
      risk: 'confirm',
      purpose: 'Create a syllabus topic with subject, status, priority, and estimated study time.',
    },
    {
      name: 'update_topic',
      risk: 'confirm',
      purpose: 'Change a known topic. Ambiguous topic names are rejected.',
    },
    {
      name: 'create_exam',
      risk: 'confirm',
      purpose: 'Create a topic-scoped exam using known or newly-created topics.',
    },
    {
      name: 'create_task',
      risk: 'confirm',
      purpose: 'Create an inbox study task linked to an optional topic or exam.',
    },
    {
      name: 'generate_exam_plan',
      risk: 'read',
      purpose: 'Ask MYELIN to calculate a joint capacity-safe exam plan. The model does not create the timetable itself.',
    },
  ] as const;
}
