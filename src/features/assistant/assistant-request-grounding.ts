import { WorkspaceState } from '@/src/data/schema';
import {
  AssistantClarificationAnswers,
  ClarificationField,
} from './assistant-clarification';

export class AssistantGroundingError extends Error {
  clarification: {
    field: ClarificationField;
    question: string;
  };

  constructor(field: ClarificationField, question: string) {
    super(question);
    this.name = 'AssistantGroundingError';
    this.clarification = { field, question };
  }
}

export function checkAssistantRequestGrounding({
  workspace: _workspace,
  userRequest: _userRequest,
  currentDate: _currentDate,
  clarificationAnswers: _clarificationAnswers,
}: {
  workspace: WorkspaceState;
  userRequest: string;
  currentDate: string;
  clarificationAnswers?: AssistantClarificationAnswers;
}): { field: ClarificationField; question: string } | null {
  return null;
}
