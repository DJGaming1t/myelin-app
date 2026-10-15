import { WorkspaceState } from '@/src/data/schema';
import { retrievability } from './memory-engine';

export const INSIGHT_PRACTICE_LIMIT = 10;
export type LearningInsightId = 'confident-mistakes' | 'fading-recall' | 'underconfident-recall';
export type LearningInsight = { id: LearningInsightId; title: string; detail: string; evidence: string; cardIds: string[] };

export function learningInsights(workspace: WorkspaceState, now: number): LearningInsight[] {
  // Legacy imports can reuse a card ID across topics. Do not target ambiguous IDs
  // through Review's existing card-ID filter or attribute one topic's grade to another.
  const cards = workspace.topics.flatMap(topic => topic.cards.map(card => ({ topicId: topic.id, card })));
  const owners = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const { topicId, card } of cards) {
    if (owners.has(card.id)) ambiguous.add(card.id);
    else owners.set(card.id, topicId);
  }
  const recent = workspace.history.filter(h => h.kind === 'review' && h.cardId &&
    !ambiguous.has(h.cardId) && owners.get(h.cardId) === h.topicId &&
    h.at <= now && h.at >= now - 30 * 86_400_000);
  const latest = new Map<string, typeof recent[number]>();
  // Equal timestamps follow the saved history order: the last recorded attempt wins.
  for (const h of recent) if (!latest.has(h.cardId!) || latest.get(h.cardId!)!.at <= h.at) latest.set(h.cardId!, h);
  const mismatch = [...latest.values()].filter(h => h.confidence === 'sure' && h.grade === 1).map(h => h.cardId!);
  const underconfident = [...latest.values()].filter(h => h.confidence === 'unsure' && h.grade === 3 && !h.hintUsed).map(h => h.cardId!);
  const fading = cards.filter(({ card }) => !ambiguous.has(card.id) && (retrievability(card, now) ?? 1) < 0.85).map(({ card }) => card.id);
  const evidence = 'Based on the latest self-reported review per question in the last 30 days.';
  const insights: LearningInsight[] = [];
  if (mismatch.length) insights.push({ id: 'confident-mistakes', title: 'Check confident mistakes',
    detail: `${mismatch.length} question${mismatch.length === 1 ? '' : 's'} last felt certain but needed another attempt. Explain why the correct answer differs before retrying.`, evidence, cardIds: mismatch });
  if (fading.length) insights.push({ id: 'fading-recall', title: 'Refresh fading recall',
    detail: `${fading.length} question${fading.length === 1 ? '' : 's'} may need refreshing based on elapsed time and past grades. This is an estimate.`,
    evidence: 'Estimated from elapsed time and saved grades; this is not a measured test result.', cardIds: fading });
  if (underconfident.length) insights.push({ id: 'underconfident-recall', title: 'Build trust in your recall',
    detail: `${underconfident.length} question${underconfident.length === 1 ? '' : 's'} went well without a hint despite low confidence. Notice what you recalled correctly.`, evidence, cardIds: underconfident });
  return insights.slice(0, 2);
}
export function neuralEvidence(workspace: WorkspaceState) {
  const wins = new Map<string, Set<string>>();
  for (const h of workspace.history) {
    if (h.kind !== 'review' || h.grade !== 3 || h.hintUsed || !h.cardId) continue;
    const d = new Date(h.at);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const evidence = wins.get(h.topicId) ?? new Set<string>();
    evidence.add(`${h.cardId}:${day}`); wins.set(h.topicId, evidence);
  }
  const nodes = workspace.topics.map(topic => ({ topic, wins: wins.get(topic.id)?.size ?? 0 })).sort((a, b) => a.topic.createdAt - b.topic.createdAt || a.topic.id.localeCompare(b.topic.id));
  const total = nodes.reduce((sum, n) => sum + n.wins, 0);
  const milestones = [1, 10, 25, 50, 100, 250, 500, 1000];
  return { nodes, total, earned: milestones.filter(n => total >= n), next: milestones.find(n => total < n) ?? null };
}
