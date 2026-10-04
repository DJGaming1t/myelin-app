import { WorkspaceState } from '@/src/data/schema';
import { retrievability } from './memory-engine';

export function learningInsights(workspace: WorkspaceState, now: number) {
  const recent = workspace.history.filter(h => h.kind === 'review' && h.at <= now && h.at >= now - 30 * 86_400_000 && h.cardId);
  const latest = new Map<string, typeof recent[number]>();
  for (const h of recent) if (!latest.has(h.cardId!) || latest.get(h.cardId!)!.at < h.at) latest.set(h.cardId!, h);
  const known = new Set(workspace.topics.flatMap(t => t.cards.map(c => c.id)));
  const mismatch = [...latest.values()].filter(h => known.has(h.cardId!) && h.confidence === 'sure' && h.grade === 1).map(h => h.cardId!);
  const underconfident = [...latest.values()].filter(h => known.has(h.cardId!) && h.confidence === 'unsure' && h.grade === 3 && !h.hintUsed).map(h => h.cardId!);
  const fading = workspace.topics.flatMap(t => t.cards).filter(c => (retrievability(c, now) ?? 1) < 0.85).map(c => c.id);
  return [
    ...(mismatch.length ? [{ title: 'Check confident mistakes', detail: `${mismatch.length} question${mismatch.length === 1 ? '' : 's'} last felt certain but needed another attempt. Explain why the correct answer differs before retrying.`, cardIds: mismatch }] : []),
    ...(fading.length ? [{ title: 'Refresh fading recall', detail: `${fading.length} question${fading.length === 1 ? '' : 's'} may need refreshing based on elapsed time and past grades. This is an estimate.`, cardIds: fading }] : []),
    ...(underconfident.length ? [{ title: 'Build trust in your recall', detail: `${underconfident.length} question${underconfident.length === 1 ? '' : 's'} went well without a hint despite low confidence. Notice what you recalled correctly.`, cardIds: underconfident }] : []),
  ].slice(0, 2);
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
