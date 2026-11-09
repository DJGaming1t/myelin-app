import { Priority, StudyTaskType, TopicStatus } from '@/src/data/schema';

export type AssistantStrain = 'comfortable' | 'balanced' | 'tight' | 'overloaded';

export type AssistantExamPlanSummary = {
  examCount: number;
  uniqueTopicCount: number;
  strain: AssistantStrain;
  bufferRatio: number;
  capacity: {
    sustainableDailyMinutes: number;
    source: 'personalized' | 'default';
    estimateMultiplier: number;
    completionReliability: number | null;
    postponementPressure: number;
  };
  workload: {
    taskRemainingMinutes: number;
    deduplicatedMinutes: number;
  };
  feasibility: {
    totalRequiredMinutes: number;
    totalCapacityMinutes: number;
    totalOverloadMinutes: number;
    firstOverloadedDeadline: {
      deadlineAt: number;
      overloadMinutes: number;
      requiredMinutes: number;
      capacityMinutes: number;
      extraMinutesPerAvailableDay: number | null;
      reliefCandidates: Array<{
        demandId: string;
        label: string;
        suggestedMinutes: number;
        movable: boolean;
      }>;
    } | null;
  };
  warnings: string[];
  exams: Array<{
    examId: string;
    examName: string;
    examDate: number;
    topicCount: number;
    preparationUnallocatedMinutes: number;
    revisionUnallocatedMinutes: number;
  }>;
  days: Array<{
    day: number;
    usableCapacityMinutes: number;
    plannedPreparationMinutes: number;
    plannedRevisionMinutes: number;
    strain: AssistantStrain;
    blocks: Array<{
      id: string;
      kind: 'preparation' | 'revision';
      topicId: string;
      topicName: string;
      subject: string;
      minutes: number;
      reasons: string[];
    }>;
  }>;
};

export function isAssistantExamPlanSummary(value: unknown): value is AssistantExamPlanSummary {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'examCount' in value &&
      'feasibility' in value &&
      'days' in value,
  );
}

export type AssistantAction =
  | {
      type: 'create_task';
      title: string;
      subject?: string;
      taskType: StudyTaskType;
      dueDate?: string | null;
      estimatedMinutes?: number | null;
      priority?: Priority;
      notes?: string;
    }
  | {
      type: 'create_topic';
      name: string;
      subject: string;
      estimatedHours?: number;
      priority?: Priority;
      status?: TopicStatus;
    }
  | {
      type: 'create_exam';
      name: string;
      examDate: string;
      subject?: string;
      topicNames?: string[];
    }
  | {
      type: 'create_commitment';
      title: string;
      startMinutes: number;
      endMinutes: number;
      recurrenceDays: number[];
    }
  | {
      type: 'generate_exam_plan';
    };

export type AssistantActionBatch = {
  actions: AssistantAction[];
};

export type AssistantActionResult = {
  type: AssistantAction['type'];
  summary: string;
  data?: unknown;
};
