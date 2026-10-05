import { WorkspaceState } from '@/src/data/schema';
import { buildExamCapacityProfile } from '@/src/features/exams/exam-plan-engine';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import {
  ASSISTANT_ACTION_PROTOCOL_VERSION,
  MAX_ASSISTANT_ACTIONS,
  assistantActionToolCatalog,
} from '@/src/features/assistant/ai-action-engine';

export const ASSISTANT_MODEL_CONTEXT_VERSION = 1 as const;

export type AssistantModelContextOptions = {
  currentRoute?: string;
  horizonDays?: number;
  maxTopics?: number;
  maxExams?: number;
  maxTasks?: number;
  maxCommitments?: number;
};

export type AssistantModelContext = {
  version: typeof ASSISTANT_MODEL_CONTEXT_VERSION;
  generatedAt: number;
  currentDate: string;
  currentRoute: string;
  capacity: {
    source: 'default' | 'personalized';
    sustainableDailyMinutes: number;
    estimateMultiplier: number;
    completionReliability: number | null;
    postponementPressure: number;
    highEffortShare: number;
  };
  settings: {
    dailyMinutes: number;
    focusMinutes: number;
    breakMinutes: number;
    energy: 'low' | 'normal';
    sleepEnabled: boolean;
    sleepStartMinutes: number;
    wakeMinutes: number;
  };
  topics: Array<{
    id: string;
    name: string;
    subject: string;
    status: 'new' | 'learning' | 'review';
    priority: 1 | 2 | 3;
    estimatedMinutes: number;
    recallCards: number;
    dueRecallCards: number;
  }>;
  exams: Array<{
    id: string;
    name: string;
    date: string;
    daysUntil: number;
    topicIds: string[];
  }>;
  tasks: Array<{
    id: string;
    title: string;
    subject: string;
    topicId: string | null;
    examId: string | null;
    type: 'homework' | 'revision' | 'practice' | 'assignment' | 'personal';
    planState: 'inbox' | 'today' | 'scheduled' | 'postponed';
    dueDate: string | null;
    estimatedMinutes: number;
    priority: 1 | 2 | 3;
  }>;
  commitments: Array<{
    id: string;
    title: string;
    kind: string;
    startDate: string;
    endDate: string;
    startMinutes: number;
    endMinutes: number;
    recurrenceDays: number[];
  }>;
  truncated: {
    topics: boolean;
    exams: boolean;
    tasks: boolean;
    commitments: boolean;
  };
};

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function localDate(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function upcomingExamIds(workspace: WorkspaceState, now: number, horizonDays: number) {
  return workspace.exams
    .filter((exam) => {
      const days = examCalendarDaysUntil(exam.date, now);
      return days >= 0 && days <= horizonDays;
    })
    .sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
}

function relevantTasks(workspace: WorkspaceState, now: number, horizonDays: number) {
  const horizon = now + horizonDays * 86_400_000;
  return workspace.tasks
    .filter((task) => {
      if (task.status !== 'open') return false;
      if (!task.dueAt) return true;
      return task.dueAt <= horizon;
    })
    .sort((a, b) => {
      const aDue = a.dueAt || Number.POSITIVE_INFINITY;
      const bDue = b.dueAt || Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.title.localeCompare(b.title);
    });
}

function relevantCommitments(
  workspace: WorkspaceState,
  now: number,
  horizonDays: number,
) {
  const horizon = now + horizonDays * 86_400_000;
  return workspace.commitments
    .filter(
      (commitment) =>
        commitment.recurrenceDays.length > 0 ||
        (commitment.endAt >= now && commitment.startAt <= horizon),
    )
    .sort((a, b) => {
      const aRecurring = a.recurrenceDays.length > 0 ? 0 : 1;
      const bRecurring = b.recurrenceDays.length > 0 ? 0 : 1;
      if (aRecurring !== bRecurring) return aRecurring - bRecurring;
      return a.startAt - b.startAt || a.title.localeCompare(b.title);
    });
}

export function buildAssistantModelContext(
  workspace: WorkspaceState,
  now = Date.now(),
  options: AssistantModelContextOptions = {},
): AssistantModelContext {
  const horizonDays = clampInt(options.horizonDays, 45, 1, 120);
  const maxTopics = clampInt(options.maxTopics, 80, 1, 300);
  const maxExams = clampInt(options.maxExams, 20, 1, 100);
  const maxTasks = clampInt(options.maxTasks, 40, 1, 100);
  const maxCommitments = clampInt(options.maxCommitments, 30, 1, 100);

  const examsAll = upcomingExamIds(workspace, now, horizonDays);
  const tasksAll = relevantTasks(workspace, now, horizonDays);
  const commitmentsAll = relevantCommitments(workspace, now, horizonDays);
  const examTopicIds = new Set(examsAll.flatMap((exam) => exam.topicIds));
  const taskTopicIds = new Set(
    tasksAll.map((task) => task.topicId).filter((id): id is string => Boolean(id)),
  );

  const topicsAll = [...workspace.topics].sort((a, b) => {
    const aReferenced = examTopicIds.has(a.id) || taskTopicIds.has(a.id) ? 1 : 0;
    const bReferenced = examTopicIds.has(b.id) || taskTopicIds.has(b.id) ? 1 : 0;
    if (bReferenced !== aReferenced) return bReferenced - aReferenced;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const statusRank = { new: 0, learning: 1, review: 2 } as const;
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.name.localeCompare(b.name);
  });

  const topics = topicsAll.slice(0, maxTopics);
  const visibleTopicIds = new Set(topics.map((topic) => topic.id));
  const exams = examsAll
    .slice(0, maxExams)
    .map((exam) => ({
      id: exam.id,
      name: exam.name,
      date: localDate(exam.date),
      daysUntil: examCalendarDaysUntil(exam.date, now),
      topicIds: exam.topicIds.filter((topicId) => visibleTopicIds.has(topicId)),
    }));
  const tasks = tasksAll
    .filter((task) => !task.topicId || visibleTopicIds.has(task.topicId))
    .slice(0, maxTasks);
  const commitments = commitmentsAll.slice(0, maxCommitments);
  const capacity = buildExamCapacityProfile(workspace, now);

  return {
    version: ASSISTANT_MODEL_CONTEXT_VERSION,
    generatedAt: now,
    currentDate: localDate(now),
    currentRoute: (options.currentRoute ?? '').trim().slice(0, 120),
    capacity: {
      source: capacity.source,
      sustainableDailyMinutes: capacity.sustainableDailyMinutes,
      estimateMultiplier: capacity.estimateMultiplier,
      completionReliability: capacity.completionReliability,
      postponementPressure: capacity.postponementPressure,
      highEffortShare: capacity.highEffortShare,
    },
    settings: {
      dailyMinutes: workspace.settings.dailyMinutes,
      focusMinutes: workspace.settings.focusMinutes,
      breakMinutes: workspace.settings.breakMinutes,
      energy: workspace.settings.energy,
      sleepEnabled: workspace.settings.sleepEnabled !== false,
      sleepStartMinutes: workspace.settings.sleepStartMinutes ?? 1350,
      wakeMinutes: workspace.settings.wakeMinutes ?? 420,
    },
    topics: topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      subject: topic.subject,
      status: topic.status,
      priority: topic.priority,
      estimatedMinutes: topic.estimate,
      recallCards: topic.cards.length,
      dueRecallCards: topic.cards.filter(
        (card) => card.reps > 0 && (card.dueAt === 0 || card.dueAt <= now),
      ).length,
    })),
    exams,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      subject: task.subject,
      topicId: task.topicId,
      examId: task.examId,
      type: task.type,
      planState: task.planState,
      dueDate: task.dueAt ? localDate(task.dueAt) : null,
      estimatedMinutes: task.estimatedMinutes,
      priority: task.priority,
    })),
    commitments: commitments.map((commitment) => ({
      id: commitment.id,
      title: commitment.title,
      kind: commitment.kind,
      startDate: localDate(commitment.startAt),
      endDate: localDate(commitment.endAt),
      startMinutes: commitment.startMinutes,
      endMinutes: commitment.endMinutes,
      recurrenceDays: [...commitment.recurrenceDays],
    })),
    truncated: {
      topics: topicsAll.length > topics.length,
      exams: examsAll.length > exams.length,
      tasks: tasksAll.length > tasks.length,
      commitments: commitmentsAll.length > commitments.length,
    },
  };
}

const topicRefSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['topicId'],
      properties: { topicId: { type: 'string', minLength: 1, maxLength: 120 } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['clientRef'],
      properties: { clientRef: { type: 'string', minLength: 1, maxLength: 80 } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'subject'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 300 },
        subject: { type: 'string', minLength: 1, maxLength: 120 },
      },
    },
  ],
} as const;

const examRefSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['examId'],
      properties: { examId: { type: 'string', minLength: 1, maxLength: 120 } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['clientRef'],
      properties: { clientRef: { type: 'string', minLength: 1, maxLength: 80 } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
    },
  ],
} as const;

const prioritySchema = { type: 'integer', minimum: 1, maximum: 3 } as const;
const dateSchema = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

export function assistantActionBatchJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'requestId', 'actions'],
    properties: {
      version: { const: ASSISTANT_ACTION_PROTOCOL_VERSION },
      requestId: { type: 'string', minLength: 1, maxLength: 120 },
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_ASSISTANT_ACTIONS,
        items: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'name', 'subject', 'status', 'priority', 'estimatedMinutes', 'notes'],
              properties: {
                type: { const: 'create_topic' },
                clientRef: { type: 'string', minLength: 1, maxLength: 80 },
                name: { type: 'string', minLength: 1, maxLength: 300 },
                subject: { type: 'string', minLength: 1, maxLength: 120 },
                status: { enum: ['new', 'learning', 'review'] },
                priority: prioritySchema,
                estimatedMinutes: { type: 'integer', minimum: 5, maximum: 240 },
                notes: { type: 'string', maxLength: 20000 },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'topic', 'patch'],
              properties: {
                type: { const: 'update_topic' },
                topic: topicRefSchema,
                patch: {
                  type: 'object',
                  additionalProperties: false,
                  minProperties: 1,
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 300 },
                    subject: { type: 'string', minLength: 1, maxLength: 120 },
                    status: { enum: ['new', 'learning', 'review'] },
                    priority: prioritySchema,
                    estimatedMinutes: { type: 'integer', minimum: 5, maximum: 240 },
                    notes: { type: 'string', maxLength: 20000 },
                  },
                },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'name', 'date', 'topicRefs'],
              properties: {
                type: { const: 'create_exam' },
                clientRef: { type: 'string', minLength: 1, maxLength: 80 },
                name: { type: 'string', minLength: 1, maxLength: 200 },
                date: dateSchema,
                topicRefs: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 300,
                  items: topicRefSchema,
                },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'title', 'subject', 'taskType', 'estimatedMinutes', 'priority', 'notes'],
              properties: {
                type: { const: 'create_task' },
                clientRef: { type: 'string', minLength: 1, maxLength: 80 },
                title: { type: 'string', minLength: 1, maxLength: 500 },
                subject: { type: 'string', maxLength: 120 },
                topic: topicRefSchema,
                exam: examRefSchema,
                taskType: {
                  enum: ['homework', 'revision', 'practice', 'assignment', 'personal'],
                },
                dueDate: dateSchema,
                estimatedMinutes: { type: 'integer', minimum: 0, maximum: 720 },
                priority: prioritySchema,
                notes: { type: 'string', maxLength: 12000 },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'topicOverrides'],
              properties: {
                type: { const: 'generate_exam_plan' },
                examRefs: {
                  type: 'array',
                  maxItems: 100,
                  items: examRefSchema,
                },
                topicOverrides: {
                  type: 'array',
                  maxItems: 300,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['topic'],
                    properties: {
                      topic: topicRefSchema,
                      estimatedMinutes: {
                        type: 'integer',
                        minimum: 5,
                        maximum: 720,
                      },
                      difficulty: prioritySchema,
                      importance: prioritySchema,
                    },
                  },
                },
                bufferRatio: { type: 'number', minimum: 0, maximum: 0.4 },
                revisionRatio: { type: 'number', minimum: 0.08, maximum: 0.35 },
                revisionLeadDays: { type: 'integer', minimum: 1, maximum: 5 },
              },
            },
          ],
        },
      },
    },
  } as const;
}

export function assistantModelToolDefinitions() {
  const catalog = assistantActionToolCatalog();
  return catalog.map((tool) => ({
    name: tool.name,
    risk: tool.risk,
    description: tool.purpose,
  }));
}

export function assistantModelInstructions() {
  return [
    'Return only an assistant action batch that matches the provided JSON schema.',
    'Use existing IDs from context when available. Use clientRef only for records created earlier in the same batch.',
    'Never invent a timetable or scheduled blocks. Use generate_exam_plan so MYELIN calculates capacity and dates.',
    'Treat difficulty, importance, and time estimates as user-facing interpretations, not hidden certainty.',
    'Do not create duplicate topics, exams, or tasks when an existing record clearly matches.',
    'Do not infer missing dates or destructive changes. Ask the user instead when essential information is absent.',
    'Keep the batch as small as needed for the user request.',
  ] as const;
}
