import { WorkspaceState } from '@/src/data/schema';
import { buildReviewQueue } from '@/src/features/review/review-engine';
import { findTopic } from '@/src/features/topics/topic-operations';

export const POST_FOCUS_RETRIEVAL_LIMIT = 3 as const;
export const MIN_POST_FOCUS_RETRIEVAL_MINUTES = 5 as const;

export type PostFocusRetrievalSuggestion = {
  topicId: string;
  topicName: string;
  subject: string;
  cardIds: string[];
  count: number;
};

export function buildPostFocusRetrievalSuggestion(
  workspace: WorkspaceState,
  topicId: string | undefined,
  focusMinutes: number,
  now = Date.now(),
): PostFocusRetrievalSuggestion | null {
  if (!topicId || focusMinutes < MIN_POST_FOCUS_RETRIEVAL_MINUTES) return null;

  const topic = findTopic(workspace, topicId);
  if (!topic || topic.cards.length === 0) return null;

  const queue = buildReviewQueue(workspace, {
    now,
    topicId,
    limit: POST_FOCUS_RETRIEVAL_LIMIT,
  });

  if (!queue.length) return null;

  return {
    topicId: topic.id,
    topicName: topic.name,
    subject: topic.subject,
    cardIds: queue.map((item) => item.cardId),
    count: queue.length,
  };
}
