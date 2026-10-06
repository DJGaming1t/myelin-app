import { WorkspaceState } from '@/src/data/schema';

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type TopicFeedbackProfile = {
  evidenceCount: number;
  focusSamples: number;
  reviewSamples: number;
  highEffortShare: number;
  lowRecallShare: number;
  paceMultiplier: number;
  workloadMultiplier: number;
  blockMultiplier: number;
  priorityBoost: number;
  difficulty: 1 | 2 | 3;
  reasons: string[];
};

export function buildTopicFeedbackProfile(
  workspace: WorkspaceState,
  topicId: string,
  now = Date.now(),
  lookbackDays = 30,
): TopicFeedbackProfile {
  const since = now - lookbackDays * DAY_MS;
  const history = workspace.history.filter(
    (entry) => entry.topicId === topicId && entry.at >= since && entry.at <= now,
  );
  const study = history.filter((entry) => entry.kind === 'study' && entry.minutes >= 5);
  const review = history.filter((entry) => entry.kind === 'review').slice(-8);

  const paceRatios = study
    .filter((entry) => (entry.plannedMinutes ?? 0) >= 5)
    .map((entry) => clamp(entry.minutes / entry.plannedMinutes!, 0.6, 1.6));
  const paceMultiplier = paceRatios.length >= 2
    ? clamp(median(paceRatios), 0.9, 1.3)
    : 1;

  const studyMinutes = study.reduce((sum, entry) => sum + entry.minutes, 0);
  const hardMinutes = study
    .filter((entry) => entry.effort >= 4)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const highEffortShare = studyMinutes >= 20 ? hardMinutes / studyMinutes : 0;

  const lowRecall = review.filter((entry) => {
    if (entry.grade <= 1) return true;
    if (entry.grade === 2 && entry.confidence !== 'sure') return true;
    return entry.confidence === 'unsure';
  }).length;
  const lowRecallShare = review.length ? lowRecall / review.length : 0;

  const topic = workspace.topics.find((item) => item.id === topicId);
  const postponementPressure = clamp((topic?.postponements ?? 0) / 3, 0, 1);
  const evidenceCount = study.length + review.length;
  const enoughEvidence = evidenceCount >= 2;

  let workloadMultiplier = paceMultiplier;
  let blockMultiplier = 1;
  let priorityBoost = 0;
  let difficulty: 1 | 2 | 3 = 1;
  const reasons: string[] = [];

  if (enoughEvidence && highEffortShare >= 0.5) {
    workloadMultiplier += highEffortShare >= 0.75 ? 0.12 : 0.07;
    blockMultiplier -= highEffortShare >= 0.75 ? 0.2 : 0.12;
    priorityBoost += highEffortShare >= 0.75 ? 10 : 6;
    difficulty = highEffortShare >= 0.75 ? 3 : 2;
    reasons.push('recent focus felt demanding');
  }

  if (enoughEvidence && review.length >= 1 && lowRecallShare >= 0.5) {
    workloadMultiplier += lowRecallShare >= 0.75 ? 0.12 : 0.07;
    blockMultiplier -= lowRecallShare >= 0.75 ? 0.12 : 0.07;
    priorityBoost += lowRecallShare >= 0.75 ? 18 : 10;
    difficulty = lowRecallShare >= 0.75 ? 3 : Math.max(difficulty, 2) as 1 | 2 | 3;
    reasons.push('recent recall needs reinforcement');
  }

  if (enoughEvidence && paceMultiplier >= 1.1) {
    priorityBoost += 6;
    reasons.push('taking longer than planned');
  }

  if (postponementPressure > 0) {
    priorityBoost += Math.round(postponementPressure * 10);
    if (postponementPressure >= 0.67) reasons.push('repeatedly postponed');
  }

  return {
    evidenceCount,
    focusSamples: study.length,
    reviewSamples: review.length,
    highEffortShare,
    lowRecallShare,
    paceMultiplier,
    workloadMultiplier: clamp(workloadMultiplier, 0.9, 1.4),
    blockMultiplier: enoughEvidence ? clamp(blockMultiplier, 0.7, 1) : 1,
    priorityBoost: enoughEvidence ? Math.min(36, priorityBoost) : 0,
    difficulty: enoughEvidence ? difficulty : 1,
    reasons,
  };
}
