import { WorkspaceState } from '@/src/data/schema';

/** Read-only query boundary; no migration or deletion of rejected history. */
export function recordedAt(timestamp: number, now: number) {
  return Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= now &&
    Number.isFinite(new Date(timestamp).getTime());
}

export function recordedHistory(workspace: WorkspaceState, now: number) {
  const topicCards = new Map(workspace.topics.map(topic => {
    const counts = new Map<string, number>();
    for (const card of topic.cards) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    return [topic.id, counts] as const;
  }));
  return workspace.history.filter(session => recordedAt(session.at, now) &&
    topicCards.has(session.topicId) &&
    // Topic-only/legacy reviews remain valid. Explicit IDs require exact ownership.
    (session.cardId == null || topicCards.get(session.topicId)?.get(session.cardId) === 1));
}
