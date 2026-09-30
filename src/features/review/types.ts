import { Confidence } from '@/src/data/schema';

import { ReviewQueueItem } from './review-engine';

export const REVIEW_SESSION_FORMAT = 'myelin.native.review' as const;
export const REVIEW_SESSION_VERSION = 1 as const;

export type ReviewStage = 'attempt' | 'reference';

export type ReviewSessionState = {
  format: typeof REVIEW_SESSION_FORMAT;
  version: typeof REVIEW_SESSION_VERSION;
  id: string;
  createdAt: number;
  topicId: string | null;
  mixed: boolean;
  queue: ReviewQueueItem[];
  currentIndex: number;
  stage: ReviewStage;
  answerDraft: string;
  confidence: Confidence;
  hintUsed: boolean;
  cardStartedAt: number;
  completedCards: number;
};
