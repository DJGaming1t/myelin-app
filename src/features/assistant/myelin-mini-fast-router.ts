import { WorkspaceState } from '@/src/data/schema';
import { localDateKey } from '@/src/features/planning/commitment-dates';
import {
  PreparedAssistantActionBatch,
  prepareAssistantActionBatch,
} from './assistant-action-session';
import { AssistantClarificationAnswers } from './assistant-clarification';

export function localDateKeyFromTimestamp(now = Date.now()): string {
  return localDateKey(now);
}

export type AssistantFastDecision =
  | {
      route: 'actions';
      confidence: number;
      modelId: string;
      prepared: PreparedAssistantActionBatch;
    }
  | {
      route: 'clarify';
      confidence: number;
      modelId: string;
      field:
        | 'estimatedMinutes'
        | 'dueDate'
        | 'subject'
        | 'recurrenceDays'
        | 'timeRange'
        | 'topicName';
      question: string;
    }
  | {
      route: 'escalate';
      confidence: number;
      modelId: string;
      reason: 'tutoring' | 'general-knowledge' | 'complex-reasoning' | 'unsupported';
      note: string;
    };

export function tryBuildMyelinMiniFastDecision({
  workspace,
  userRequest,
  currentDate,
  clarificationAnswers,
}: {
  workspace: WorkspaceState;
  userRequest: string;
  requestId?: string;
  currentDate: string;
  clarificationAnswers?: AssistantClarificationAnswers;
}): AssistantFastDecision | null {
  const text = userRequest.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  if (
    lower.includes('complete ') ||
    lower.includes('finish ') ||
    lower.includes('homework') ||
    lower.includes('assignment') ||
    lower.includes('practical')
  ) {
    const minutes = clarificationAnswers?.estimatedMinutes ?? 45;
    const dueDate = clarificationAnswers?.dueDate ?? currentDate;
    const prepared = prepareAssistantActionBatch(workspace, [
      {
        type: 'create_task',
        title: text.replace(/^i have to\s+/i, '').replace(/\.$/, ''),
        subject: clarificationAnswers?.subject ?? '',
        taskType: 'homework',
        dueDate,
        estimatedMinutes: minutes,
        priority: 2,
      },
    ]);
    return {
      route: 'actions',
      confidence: 0.92,
      modelId: 'myelin-mini-fast-router-v1',
      prepared,
    };
  }

  return null;
}
