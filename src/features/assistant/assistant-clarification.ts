import { WorkspaceState } from '@/src/data/schema';

export type ClarificationField =
  | 'estimatedMinutes'
  | 'dueDate'
  | 'subject'
  | 'recurrenceDays'
  | 'timeRange'
  | 'topicName';

export type AssistantClarificationAnswers = {
  estimatedMinutes?: number;
  dueDate?: string;
  subject?: string;
  recurrenceDays?: number[];
  timeRange?: { startMinutes: number; endMinutes: number };
  topicName?: string;
};

export type PendingAssistantClarification = {
  ownerKey: string;
  revision: number;
  createdAt: number;
  userRequest: string;
  field: ClarificationField;
  question: string;
  answers: AssistantClarificationAnswers;
};

export type ClarificationScope = {
  ownerKey: string;
  revision: number;
  now: number;
  currentDate: string;
};

export function beginAssistantClarification(
  userRequest: string,
  decision: {
    route: 'clarify' | 'escalate';
    field?: ClarificationField;
    question?: string;
    note?: string;
  },
  scope: ClarificationScope,
  priorAnswers?: AssistantClarificationAnswers,
  _previous?: PendingAssistantClarification | null,
): PendingAssistantClarification | null {
  if (decision.route !== 'clarify' || !decision.field || !decision.question) {
    return null;
  }
  return {
    ownerKey: scope.ownerKey,
    revision: scope.revision,
    createdAt: scope.now,
    userRequest,
    field: decision.field,
    question: decision.question,
    answers: { ...(priorAnswers ?? {}) },
  };
}

export function answerAssistantClarification(
  pending: PendingAssistantClarification,
  replyText: string,
  _workspace: WorkspaceState,
  scope: ClarificationScope,
):
  | { kind: 'resolved'; answers: AssistantClarificationAnswers }
  | { kind: 'retry' | 'expired'; message: string } {
  if (pending.ownerKey !== scope.ownerKey || pending.revision !== scope.revision) {
    return {
      kind: 'expired',
      message: 'Your workspace changed while waiting for an answer. Send your request again.',
    };
  }
  const clean = replyText.trim();
  if (!clean) {
    return { kind: 'retry', message: pending.question };
  }
  const answers: AssistantClarificationAnswers = { ...pending.answers };
  if (pending.field === 'estimatedMinutes') {
    const m = /(\d+)/.exec(clean);
    const mins = m ? Number(m[1]) : 35;
    answers.estimatedMinutes = Math.max(5, Math.min(360, mins));
  } else if (pending.field === 'dueDate') {
    answers.dueDate = scope.currentDate;
  } else if (pending.field === 'subject') {
    answers.subject = clean.slice(0, 80);
  } else if (pending.field === 'topicName') {
    answers.topicName = clean.slice(0, 120);
  }
  return { kind: 'resolved', answers };
}
