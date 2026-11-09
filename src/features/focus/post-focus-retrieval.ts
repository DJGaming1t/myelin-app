import { WorkspaceState } from '@/src/data/schema';
import { buildReviewQueue } from '@/src/features/review/review-engine';

export type PostFocusRetrievalSuggestion = {
  topicId: string;
  topicName: string;
  count: number;
};

export function buildPostFocusRetrievalSuggestion(
  workspace: WorkspaceState,
  topicId: string | null | undefined,
  focusActualMinutes: number,
  now = Date.now(),
): PostFocusRetrievalSuggestion | null {
  if (!topicId || focusActualMinutes < 5) return null;
  const topic = workspace.topics.find((item) => item.id === topicId);
  if (!topic) return null;
  const queue = buildReviewQueue(workspace, { topicId: topic.id, now, limit: 3 });
  if (queue.length === 0) return null;
  return {
    topicId: topic.id,
    topicName: topic.name,
    count: Math.min(3, queue.length),
  };
}
