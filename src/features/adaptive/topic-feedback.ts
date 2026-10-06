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
  const review = history
    .filter((entry) => entry.kind === 'review')
    .sort((a, b) => a.at - b.at)
    .slice(-8);

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


export type TopicAdaptationInsight = {
  topicId: string;
  topicName: string;
  subject: string;
  tone: 'adjustment' | 'progress';
  title: string;
  detail: string;
  evidence: string;
  priority: number;
};

function strongRecall(entry: WorkspaceState['history'][number]) {
  return entry.grade >= 2 && !entry.hintUsed;
}

function recallImprovement(
  workspace: WorkspaceState,
  topicId: string,
  now: number,
) {
  const reviews = workspace.history
    .filter(
      (entry) =>
        entry.topicId === topicId &&
        entry.kind === 'review' &&
        entry.at <= now &&
        entry.at >= now - 30 * DAY_MS,
    )
    .sort((a, b) => a.at - b.at)
    .slice(-6);

  if (reviews.length < 4) return null;

  const recent = reviews.slice(-2);
  const previous = reviews.slice(-4, -2);
  const recentRate = recent.filter(strongRecall).length / recent.length;
  const previousRate = previous.filter(strongRecall).length / previous.length;

  if (recentRate < 1 || recentRate - previousRate < 0.5) return null;

  return {
    sampleCount: 4,
    recentRate,
    previousRate,
  };
}

export function buildTopicAdaptationInsight(
  workspace: WorkspaceState,
  topicId: string,
  now = Date.now(),
): TopicAdaptationInsight | null {
  const topic = workspace.topics.find((item) => item.id === topicId);
  if (!topic) return null;

  const profile = buildTopicFeedbackProfile(workspace, topicId, now);
  if (profile.evidenceCount < 2) return null;

  const improvement = recallImprovement(workspace, topicId, now);
  if (improvement) {
    return {
      topicId,
      topicName: topic.name,
      subject: topic.subject,
      tone: 'progress',
      title: 'Recall is improving',
      detail:
        'Your latest two recall attempts were stronger than the two before them. MYELIN will keep adapting from new evidence rather than locking in the older pattern.',
      evidence: '4 recent recall attempts',
      priority: 32,
    };
  }

  if (profile.blockMultiplier <= 0.88 && profile.highEffortShare >= 0.5) {
    const target = Math.max(
      5,
      Math.round(workspace.settings.focusMinutes * profile.blockMultiplier),
    );
    return {
      topicId,
      topicName: topic.name,
      subject: topic.subject,
      tone: 'adjustment',
      title: 'Blocks shortened',
      detail:
        `Recent sessions often felt demanding, so MYELIN is aiming for about ${target}-minute blocks here while keeping the remaining workload visible.`,
      evidence:
        `${profile.focusSamples} focus ${profile.focusSamples === 1 ? 'sample' : 'samples'}`,
      priority: 30,
    };
  }

  if (profile.paceMultiplier >= 1.1 && profile.focusSamples >= 2) {
    const percent = Math.round((profile.paceMultiplier - 1) * 100);
    return {
      topicId,
      topicName: topic.name,
      subject: topic.subject,
      tone: 'adjustment',
      title: 'Taking longer than expected',
      detail:
        `Recent focus blocks took about ${percent}% longer than planned. Autopilot is allowing more working time without changing your saved topic estimate.`,
      evidence: `${profile.focusSamples} recent focus samples`,
      priority: 26,
    };
  }

  if (profile.lowRecallShare >= 0.5 && profile.reviewSamples >= 2) {
    return {
      topicId,
      topicName: topic.name,
      subject: topic.subject,
      tone: 'adjustment',
      title: 'Recall needs reinforcement',
      detail:
        'Several recent retrievals needed another attempt or felt uncertain, so MYELIN is reserving extra recall time and raising this topic sooner.',
      evidence: `${profile.reviewSamples} recent recall samples`,
      priority: 24,
    };
  }

  if (
    profile.reasons.includes('repeatedly postponed') &&
    profile.evidenceCount >= 2
  ) {
    return {
      topicId,
      topicName: topic.name,
      subject: topic.subject,
      tone: 'adjustment',
      title: 'Repeated postponement noticed',
      detail:
        'This topic has been deferred several times. MYELIN is increasing its recommendation pressure while still allowing short first steps.',
      evidence: 'Repeated postponements + study evidence',
      priority: 18,
    };
  }

  return null;
}

export function buildTopicAdaptationInsights(
  workspace: WorkspaceState,
  now = Date.now(),
  limit = 3,
) {
  return workspace.topics
    .map((topic) => buildTopicAdaptationInsight(workspace, topic.id, now))
    .filter((insight): insight is TopicAdaptationInsight => Boolean(insight))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.topicName.localeCompare(b.topicName) ||
        a.topicId.localeCompare(b.topicId),
    )
    .slice(0, Math.max(1, Math.min(5, limit)));
}
