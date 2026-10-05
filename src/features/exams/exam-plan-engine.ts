import { Topic, WorkspaceState } from '@/src/data/schema';
import { forgettingPressure } from '@/src/features/adaptive/memory-engine';
import { examAppliesToTopic, examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import {
  addLocalDays,
  freeStudyWindows,
  scheduledTasksForDay,
  startOfLocalDay,
} from '@/src/features/planning/day-engine';
import {
  CapacityFeasibilityAnalysis,
  analyzeCapacityFeasibility,
} from '@/src/features/planning/capacity-feasibility';

export type ExamPlanStrain = 'comfortable' | 'balanced' | 'tight' | 'overloaded';
export type CapacitySource = 'default' | 'personalized';

export type ExamPlanTopicOverride = {
  topicId: string;
  estimatedMinutes?: number;
  difficulty?: 1 | 2 | 3;
  importance?: 1 | 2 | 3;
};

export type ExamPlanOptions = {
  topicOverrides?: ExamPlanTopicOverride[];
  bufferRatio?: number;
  maxDays?: number;
};

export type ExamCapacityProfile = {
  source: CapacitySource;
  sustainableDailyMinutes: number;
  historyActiveDays: number;
  historicalMedianMinutes: number | null;
  lookbackDays: number;
  completionReliability: number | null;
  completionSampleCount: number;
  estimateMultiplier: number;
  estimateSampleCount: number;
  postponementPressure: number;
  highEffortShare: number;
  hardStudyShareLimit: number;
};

export type ExamPlanTopic = {
  topicId: string;
  topicName: string;
  subject: string;
  baseEstimatedMinutes: number;
  estimateMultiplier: number;
  estimatedMinutes: number;
  retrievalReserveMinutes: number;
  totalRequiredMinutes: number;
  difficulty: 1 | 2 | 3;
  importance: 1 | 2 | 3;
  forgettingRisk: number;
  dueQuestionCount: number;
  mode: 'study' | 'review';
  requiredBy: number;
  requiredByExamName: string;
  reasons: string[];
};

export type ExamPlanBlock = {
  id: string;
  day: number;
  topicId: string;
  topicName: string;
  subject: string;
  minutes: number;
  mode: 'study' | 'review';
  reasons: string[];
};

export type ExamPlanDay = {
  day: number;
  freeClockMinutes: number;
  existingStudyMinutes: number;
  scheduledStudyMinutes: number;
  sustainableRemainingMinutes: number;
  grossCapacityMinutes: number;
  reservedBufferMinutes: number;
  competingExamReserveMinutes: number;
  usableCapacityMinutes: number;
  plannedMinutes: number;
  hardStudyMinutes: number;
  hardStudyLimitMinutes: number;
  totalStudyLoadMinutes: number;
  loadRatio: number;
  strain: ExamPlanStrain;
  blocks: ExamPlanBlock[];
};

export type CompetingExamSummary = {
  examId: string;
  examName: string;
  examDate: number;
  uniqueTopicCount: number;
  requiredMinutes: number;
};

export type ExamPreparationPlan = {
  examId: string;
  examName: string;
  examDate: number;
  generatedAt: number;
  daysAvailable: number;
  capacityProfile: ExamCapacityProfile;
  bufferRatio: number;
  topics: ExamPlanTopic[];
  competingExams: CompetingExamSummary[];
  totalRequiredMinutes: number;
  totalUsableCapacityMinutes: number;
  plannedMinutes: number;
  unallocatedMinutes: number;
  strainRatio: number;
  strain: ExamPlanStrain;
  days: ExamPlanDay[];
  warnings: string[];
  feasibility: CapacityFeasibilityAnalysis;
};

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function dayEnd(day: number) {
  return addLocalDays(startOfLocalDay(day), 1);
}

function actualStudyMinutesForDay(workspace: WorkspaceState, day: number) {
  const start = startOfLocalDay(day);
  const end = dayEnd(day);
  const topicSessions = workspace.history
    .filter((session) => session.at >= start && session.at < end)
    .reduce((sum, session) => sum + Math.max(0, session.minutes), 0);
  const standaloneTaskSessions = (workspace.focusOutcomes ?? [])
    .filter(
      (outcome) =>
        outcome.taskOnly &&
        outcome.status === 'finished' &&
        outcome.endedAt >= start &&
        outcome.endedAt < end,
    )
    .reduce((sum, outcome) => sum + Math.max(0, outcome.minutes), 0);

  return Math.round(topicSessions + standaloneTaskSessions);
}

function scheduledStudyMinutesForDay(workspace: WorkspaceState, day: number) {
  const start = startOfLocalDay(day);
  const end = dayEnd(day);
  return Math.round(
    scheduledTasksForDay(workspace.tasks, day).reduce((sum, task) => {
      const overlapStart = Math.max(start, task.scheduledStart);
      const overlapEnd = Math.min(end, task.scheduledEnd);
      return sum + Math.max(0, overlapEnd - overlapStart) / 60_000;
    }, 0),
  );
}

function recentWindowStart(now: number, lookbackDays: number) {
  return addLocalDays(startOfLocalDay(now), -lookbackDays);
}

function estimateRatios(
  workspace: WorkspaceState,
  windowStart: number,
  now: number,
) {
  const ratios: number[] = [];

  for (const session of workspace.history) {
    if (
      session.at < windowStart ||
      session.at > now ||
      !session.plannedMinutes ||
      session.plannedMinutes < 5 ||
      session.minutes < 2
    ) {
      continue;
    }
    ratios.push(clamp(session.minutes / session.plannedMinutes, 0.5, 2));
  }

  for (const outcome of workspace.focusOutcomes ?? []) {
    if (
      outcome.status !== 'finished' ||
      outcome.endedAt < windowStart ||
      outcome.endedAt > now ||
      outcome.plannedMinutes < 5 ||
      outcome.minutes < 2
    ) {
      continue;
    }
    ratios.push(clamp(outcome.minutes / outcome.plannedMinutes, 0.5, 2));
  }

  for (const task of workspace.tasks) {
    if (
      task.status !== 'completed' ||
      task.completedAt < windowStart ||
      task.completedAt > now ||
      task.estimatedMinutes < 5 ||
      task.actualMinutes < 2
    ) {
      continue;
    }
    ratios.push(clamp(task.actualMinutes / task.estimatedMinutes, 0.5, 2));
  }

  return ratios;
}

function completionEvidence(
  workspace: WorkspaceState,
  windowStart: number,
  now: number,
) {
  const outcomes = (workspace.focusOutcomes ?? []).filter(
    (outcome) =>
      outcome.startedAt >= windowStart &&
      outcome.startedAt <= now &&
      (outcome.status === 'finished' || outcome.status === 'abandoned'),
  );
  const finished = outcomes.filter((outcome) => outcome.status === 'finished').length;
  return {
    sampleCount: outcomes.length,
    reliability: outcomes.length >= 4 ? finished / outcomes.length : null,
  };
}

function recentPostponementPressure(
  workspace: WorkspaceState,
  windowStart: number,
  now: number,
) {
  const weighted = workspace.tasks.reduce((sum, task) => {
    if (!task.lastPostponedAt || task.lastPostponedAt < windowStart || task.lastPostponedAt > now) {
      return sum;
    }
    return sum + Math.min(3, Math.max(1, task.postponements ?? 1));
  }, 0);

  const denominator = Math.max(4, workspace.tasks.length * 1.5);
  return clamp(weighted / denominator, 0, 1);
}

function recentHighEffortShare(
  workspace: WorkspaceState,
  windowStart: number,
  now: number,
) {
  let total = 0;
  let hard = 0;
  for (const session of workspace.history) {
    if (session.at < windowStart || session.at > now || session.minutes <= 0) continue;
    total += session.minutes;
    if (session.effort >= 4) hard += session.minutes;
  }
  return total >= 60 ? clamp(hard / total, 0, 1) : 0;
}

export function buildExamCapacityProfile(
  workspace: WorkspaceState,
  now = Date.now(),
  lookbackDays = 14,
): ExamCapacityProfile {
  const today = startOfLocalDay(now);
  const dailyMinutes: number[] = [];

  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const day = addLocalDays(today, -offset);
    dailyMinutes.push(actualStudyMinutesForDay(workspace, day));
  }

  const active = dailyMinutes.filter((minutes) => minutes >= 10);
  const historicalMedianMinutes = active.length ? median(active) : null;
  const windowStart = recentWindowStart(now, lookbackDays);
  const completion = completionEvidence(workspace, windowStart, now);
  const ratios = estimateRatios(workspace, windowStart, now);
  const estimateMultiplier =
    ratios.length >= 4 ? clamp(median(ratios), 0.9, 1.35) : 1;
  const postponementPressure = recentPostponementPressure(workspace, windowStart, now);
  const highEffortShare = recentHighEffortShare(workspace, windowStart, now);

  const hasEnoughHistory =
    active.length >= 4 ||
    completion.sampleCount >= 4 ||
    ratios.length >= 4 ||
    postponementPressure >= 0.25 ||
    highEffortShare > 0;

  let sustainableDailyMinutes = Math.max(30, workspace.settings.dailyMinutes || 90);
  if (active.length >= 4 && historicalMedianMinutes !== null) {
    const blended = Math.round(
      workspace.settings.dailyMinutes * 0.45 + historicalMedianMinutes * 0.55,
    );
    const upperBound = Math.max(60, Math.round(workspace.settings.dailyMinutes * 1.25));
    sustainableDailyMinutes = clamp(blended, 30, upperBound);
  }

  if (completion.reliability !== null) {
    const reliabilityFactor = clamp(0.86 + completion.reliability * 0.16, 0.86, 1.02);
    sustainableDailyMinutes = Math.round(sustainableDailyMinutes * reliabilityFactor);
  }

  sustainableDailyMinutes = Math.round(
    sustainableDailyMinutes *
      (1 - postponementPressure * 0.1) *
      (1 - highEffortShare * 0.06),
  );

  if (workspace.settings.energy === 'low') {
    sustainableDailyMinutes = Math.max(25, Math.round(sustainableDailyMinutes * 0.82));
  }

  const hardStudyShareLimit = clamp(0.66 - highEffortShare * 0.16, 0.48, 0.66);

  return {
    source: hasEnoughHistory ? 'personalized' : 'default',
    sustainableDailyMinutes: Math.max(25, sustainableDailyMinutes),
    historyActiveDays: active.length,
    historicalMedianMinutes,
    lookbackDays,
    completionReliability: completion.reliability,
    completionSampleCount: completion.sampleCount,
    estimateMultiplier,
    estimateSampleCount: ratios.length,
    postponementPressure,
    highEffortShare,
    hardStudyShareLimit,
  };
}

function dueQuestionCount(topic: Topic, now: number) {
  return topic.cards.filter((card) => {
    if (card.reps === 0) return topic.status !== 'new';
    return card.dueAt === 0 || card.dueAt <= now;
  }).length;
}

function derivedDifficulty(topic: Topic, risk: number): 1 | 2 | 3 {
  let difficulty: 1 | 2 | 3 =
    topic.status === 'new' ? 3 : topic.status === 'learning' ? 2 : 1;
  if (risk >= 0.35 && difficulty < 2) difficulty = 2;
  return difficulty;
}

function topicWorkload(
  workspace: WorkspaceState,
  topic: Topic,
  now: number,
  capacityProfile: ExamCapacityProfile,
  override?: ExamPlanTopicOverride,
  requiredBy = Number.POSITIVE_INFINITY,
  requiredByExamName = '',
): ExamPlanTopic {
  const risk = forgettingPressure(topic.cards, now);
  const dueCount = dueQuestionCount(topic, now);
  const explicitEstimate = override?.estimatedMinutes;
  const baseEstimatedMinutes = Math.max(
    10,
    Math.round(
      explicitEstimate && explicitEstimate > 0
        ? explicitEstimate
        : topic.estimate > 0
          ? topic.estimate
          : workspace.settings.focusMinutes,
    ),
  );
  const estimatedMinutes = Math.max(
    10,
    Math.round(baseEstimatedMinutes * capacityProfile.estimateMultiplier),
  );
  const retrievalReserveMinutes = Math.min(
    30,
    dueCount > 0 ? Math.max(10, dueCount * 5) : risk >= 0.25 ? 10 : 0,
  );
  const difficulty = override?.difficulty ?? derivedDifficulty(topic, risk);
  const importance = override?.importance ?? topic.priority;
  const mode: 'study' | 'review' =
    topic.status === 'review' || dueCount > 0 ? 'review' : 'study';

  const reasons: string[] = [];
  if (difficulty === 3) reasons.push('high effort');
  if (importance === 3) reasons.push('high priority');
  if (dueCount > 0) reasons.push('retrieval due');
  if (risk >= 0.25) reasons.push('recall may be fading');
  if (capacityProfile.estimateMultiplier >= 1.1) reasons.push('adjusted to your recent pace');
  if (Number.isFinite(requiredBy) && requiredByExamName) {
    reasons.push(`needed by ${requiredByExamName}`);
  }
  if (!reasons.length) reasons.push(topic.status === 'new' ? 'not started' : 'exam scope');

  return {
    topicId: topic.id,
    topicName: topic.name,
    subject: topic.subject,
    baseEstimatedMinutes,
    estimateMultiplier: capacityProfile.estimateMultiplier,
    estimatedMinutes,
    retrievalReserveMinutes,
    totalRequiredMinutes: estimatedMinutes + retrievalReserveMinutes,
    difficulty,
    importance,
    forgettingRisk: risk,
    dueQuestionCount: dueCount,
    mode,
    requiredBy,
    requiredByExamName,
    reasons,
  };
}

function strainForRatio(ratio: number): ExamPlanStrain {
  if (ratio <= 0.65) return 'comfortable';
  if (ratio <= 0.85) return 'balanced';
  if (ratio <= 1) return 'tight';
  return 'overloaded';
}

function topicPriorityScore(
  topic: ExamPlanTopic,
  dayIndex: number,
  totalDays: number,
  day: number,
) {
  const progress = totalDays <= 1 ? 1 : dayIndex / (totalDays - 1);
  const earlyStudyBoost = topic.mode === 'study' ? Math.round((1 - progress) * 12) : 0;
  const lateReviewBoost = topic.mode === 'review' ? Math.round(progress * 10) : 0;
  const deadlineDays = Number.isFinite(topic.requiredBy)
    ? examCalendarDaysUntil(topic.requiredBy, day)
    : null;
  const deadlineBoost =
    deadlineDays === null
      ? 0
      : deadlineDays <= 1
        ? 55
        : deadlineDays <= 3
          ? 35
          : deadlineDays <= 7
            ? 18
            : 0;

  return (
    topic.importance * 20 +
    topic.difficulty * 14 +
    topic.forgettingRisk * 30 +
    Math.min(20, topic.dueQuestionCount * 4) +
    earlyStudyBoost +
    lateReviewBoost +
    deadlineBoost
  );
}

function earliestTopicExamDeadline(
  workspace: WorkspaceState,
  topic: Topic,
  targetExamId: string,
  targetExamDate: number,
  now: number,
) {
  const earliest = workspace.exams
    .filter(
      (exam) =>
        exam.date > now &&
        examAppliesToTopic(exam, topic),
    )
    .sort((a, b) => a.date - b.date)[0];

  if (earliest) {
    return { date: earliest.date, examName: earliest.name };
  }

  const target = workspace.exams.find((exam) => exam.id === targetExamId);
  return {
    date: target?.date ?? targetExamDate,
    examName: target?.name ?? '',
  };
}

type MutableCompetingExamDemand = CompetingExamSummary & {
  remainingMinutes: number;
};

function competingExamDemands(
  workspace: WorkspaceState,
  targetExamId: string,
  targetTopicIds: Set<string>,
  now: number,
  horizonEnd: number,
  capacityProfile: ExamCapacityProfile,
): MutableCompetingExamDemand[] {
  const seenTopicIds = new Set(targetTopicIds);
  const exams = workspace.exams
    .filter(
      (exam) =>
        exam.id !== targetExamId &&
        exam.date > now &&
        exam.date <= horizonEnd,
    )
    .sort((a, b) => a.date - b.date);

  const demands: MutableCompetingExamDemand[] = [];
  for (const exam of exams) {
    const uniqueTopics = workspace.topics.filter(
      (topic) => examAppliesToTopic(exam, topic) && !seenTopicIds.has(topic.id),
    );
    if (!uniqueTopics.length) continue;

    uniqueTopics.forEach((topic) => seenTopicIds.add(topic.id));
    const requiredMinutes = uniqueTopics
      .map((topic) => topicWorkload(workspace, topic, now, capacityProfile))
      .reduce((sum, topic) => sum + topic.totalRequiredMinutes, 0);

    if (requiredMinutes <= 0) continue;
    demands.push({
      examId: exam.id,
      examName: exam.name,
      examDate: exam.date,
      uniqueTopicCount: uniqueTopics.length,
      requiredMinutes,
      remainingMinutes: requiredMinutes,
    });
  }

  return demands;
}

function dynamicBufferRatio(
  profile: ExamCapacityProfile,
  explicit?: number,
) {
  if (explicit !== undefined) return clamp(explicit, 0, 0.4);

  const reliability = profile.completionReliability ?? 0.8;
  return clamp(
    0.12 +
      (1 - reliability) * 0.08 +
      profile.postponementPressure * 0.07 +
      profile.highEffortShare * 0.05,
    0.12,
    0.3,
  );
}

function reserveForCompetingExams(
  demands: MutableCompetingExamDemand[],
  day: number,
  postBufferCapacity: number,
) {
  let availableReserve = Math.floor(postBufferCapacity * 0.45);
  let reserved = 0;

  for (const demand of demands) {
    if (availableReserve <= 0 || demand.remainingMinutes <= 0 || day >= demand.examDate) continue;

    const daysLeft = Math.max(1, examCalendarDaysUntil(demand.examDate, day));
    const dailyNeed = Math.ceil(demand.remainingMinutes / daysLeft);
    const allocation = Math.min(
      availableReserve,
      dailyNeed,
      demand.remainingMinutes,
    );

    demand.remainingMinutes -= allocation;
    availableReserve -= allocation;
    reserved += allocation;
  }

  return reserved;
}

export function buildExamPreparationPlan(
  workspace: WorkspaceState,
  examId: string,
  now = Date.now(),
  options: ExamPlanOptions = {},
): ExamPreparationPlan | null {
  const exam = workspace.exams.find((item) => item.id === examId);
  if (!exam) return null;

  const examDays = examCalendarDaysUntil(exam.date, now);
  if (examDays < 0) return null;

  const capacityProfile = buildExamCapacityProfile(workspace, now);
  const overrides = new Map(
    (options.topicOverrides ?? []).map((override) => [override.topicId, override]),
  );
  const scopedTopics = workspace.topics.filter((topic) => examAppliesToTopic(exam, topic));
  const topics = scopedTopics.map((topic) => {
    const deadline = earliestTopicExamDeadline(
      workspace,
      topic,
      exam.id,
      exam.date,
      now,
    );
    return topicWorkload(
      workspace,
      topic,
      now,
      capacityProfile,
      overrides.get(topic.id),
      deadline.date,
      deadline.examName,
    );
  });

  const bufferRatio = dynamicBufferRatio(capacityProfile, options.bufferRatio);
  const maxDays = clamp(Math.round(options.maxDays ?? 45), 1, 120);
  const daysAvailable = Math.min(Math.max(1, examDays), maxDays);
  const today = startOfLocalDay(now);
  const horizonEnd = addLocalDays(startOfLocalDay(exam.date), 7);
  const competitionState = competingExamDemands(
    workspace,
    exam.id,
    new Set(topics.map((topic) => topic.topicId)),
    now,
    horizonEnd,
    capacityProfile,
  );
  const competingExams = competitionState.map(
    ({ remainingMinutes: _remainingMinutes, ...summary }) => summary,
  );

  const days: ExamPlanDay[] = [];
  for (let offset = 0; offset < daysAvailable; offset += 1) {
    const day = addLocalDays(today, offset);
    const from = offset === 0 ? now : day;
    const freeClockMinutes = freeStudyWindows(workspace, day, {
      includeScheduledTasks: true,
      from,
      minMinutes: 10,
    }).reduce((sum, window) => sum + window.minutes, 0);
    const existingStudyMinutes = actualStudyMinutesForDay(workspace, day);
    const scheduledStudyMinutes = scheduledStudyMinutesForDay(workspace, day);
    const sustainableRemainingMinutes = Math.max(
      0,
      capacityProfile.sustainableDailyMinutes -
        existingStudyMinutes -
        scheduledStudyMinutes,
    );
    const grossCapacityMinutes = Math.max(
      0,
      Math.min(freeClockMinutes, sustainableRemainingMinutes),
    );
    const postBufferCapacity = Math.max(
      0,
      Math.floor(grossCapacityMinutes * (1 - bufferRatio)),
    );
    const reservedBufferMinutes = Math.max(
      0,
      grossCapacityMinutes - postBufferCapacity,
    );
    const competingExamReserveMinutes = reserveForCompetingExams(
      competitionState,
      day,
      postBufferCapacity,
    );
    const usableCapacityMinutes = Math.max(
      0,
      postBufferCapacity - competingExamReserveMinutes,
    );
    const hardStudyLimitMinutes = Math.min(
      usableCapacityMinutes,
      Math.max(
        Math.min(usableCapacityMinutes, Math.round(workspace.settings.focusMinutes || 45)),
        Math.floor(usableCapacityMinutes * capacityProfile.hardStudyShareLimit),
      ),
    );

    days.push({
      day,
      freeClockMinutes,
      existingStudyMinutes,
      scheduledStudyMinutes,
      sustainableRemainingMinutes,
      grossCapacityMinutes,
      reservedBufferMinutes,
      competingExamReserveMinutes,
      usableCapacityMinutes,
      plannedMinutes: 0,
      hardStudyMinutes: 0,
      hardStudyLimitMinutes,
      totalStudyLoadMinutes: existingStudyMinutes + scheduledStudyMinutes,
      loadRatio:
        capacityProfile.sustainableDailyMinutes > 0
          ? (existingStudyMinutes + scheduledStudyMinutes) /
            capacityProfile.sustainableDailyMinutes
          : 0,
      strain: strainForRatio(
        capacityProfile.sustainableDailyMinutes > 0
          ? (existingStudyMinutes + scheduledStudyMinutes) /
              capacityProfile.sustainableDailyMinutes
          : 0,
      ),
      blocks: [],
    });
  }

  const remaining = new Map(
    topics.map((topic) => [topic.topicId, topic.totalRequiredMinutes]),
  );
  const focusChunk = clamp(Math.round(workspace.settings.focusMinutes || 45), 10, 90);
  let fatigueLimited = false;

  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex]!;
    let available = day.usableCapacityMinutes;

    while (available >= 5) {
      const candidates = topics
        .filter(
          (topic) =>
            (remaining.get(topic.topicId) ?? 0) > 0 &&
            day.day < startOfLocalDay(topic.requiredBy),
        )
        .sort(
          (a, b) =>
            topicPriorityScore(b, dayIndex, days.length, day.day) -
              topicPriorityScore(a, dayIndex, days.length, day.day) ||
            a.topicName.localeCompare(b.topicName),
        );

      if (!candidates.length) break;
      let progressed = false;

      for (const topic of candidates) {
        if (available < 5) break;
        const left = remaining.get(topic.topicId) ?? 0;
        if (left <= 0) continue;

        const hardRemaining =
          topic.difficulty === 3
            ? Math.max(0, day.hardStudyLimitMinutes - day.hardStudyMinutes)
            : Number.POSITIVE_INFINITY;
        if (topic.difficulty === 3 && hardRemaining < 5) {
          fatigueLimited = true;
          continue;
        }

        const minutes = Math.min(focusChunk, left, available, hardRemaining);
        if (minutes < 5) continue;

        const block: ExamPlanBlock = {
          id: `exam-plan:${exam.id}:${dayIndex}:${topic.topicId}:${day.blocks.length}`,
          day: day.day,
          topicId: topic.topicId,
          topicName: topic.topicName,
          subject: topic.subject,
          minutes,
          mode: topic.mode,
          reasons: topic.reasons.slice(0, 3),
        };

        day.blocks.push(block);
        day.plannedMinutes += minutes;
        if (topic.difficulty === 3) day.hardStudyMinutes += minutes;
        available -= minutes;
        remaining.set(topic.topicId, left - minutes);
        progressed = true;
      }

      if (!progressed) break;
    }

    day.totalStudyLoadMinutes =
      day.existingStudyMinutes + day.scheduledStudyMinutes + day.plannedMinutes;
    day.loadRatio =
      capacityProfile.sustainableDailyMinutes > 0
        ? day.totalStudyLoadMinutes / capacityProfile.sustainableDailyMinutes
        : 0;
    day.strain = strainForRatio(day.loadRatio);
  }

  const totalRequiredMinutes = topics.reduce(
    (sum, topic) => sum + topic.totalRequiredMinutes,
    0,
  );
  const totalUsableCapacityMinutes = days.reduce(
    (sum, day) => sum + day.usableCapacityMinutes,
    0,
  );
  const plannedMinutes = days.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const unallocatedMinutes = [...remaining.values()].reduce(
    (sum, minutes) => sum + Math.max(0, minutes),
    0,
  );
  const strainRatio =
    totalUsableCapacityMinutes > 0
      ? totalRequiredMinutes / totalUsableCapacityMinutes
      : totalRequiredMinutes > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const warnings: string[] = [];

  if (!topics.length) {
    warnings.push('This exam has no matching topics in MYELIN yet.');
  }
  if (capacityProfile.source === 'default') {
    warnings.push('Capacity is using your daily setting until MYELIN has enough study history.');
  }
  if (capacityProfile.estimateMultiplier >= 1.1) {
    warnings.push(
      `Recent sessions have taken longer than planned, so estimates were adjusted by about ${Math.round(
        (capacityProfile.estimateMultiplier - 1) * 100,
      )}%.`,
    );
  }
  if (daysAvailable <= 2 && totalRequiredMinutes > 0) {
    warnings.push('There is very little recovery margin before the exam.');
  }
  const missedEarlierDeadlineMinutes = topics.reduce((sum, topic) => {
    if (topic.requiredBy >= exam.date) return sum;
    return sum + (remaining.get(topic.topicId) ?? 0);
  }, 0);
  if (missedEarlierDeadlineMinutes > 0) {
    warnings.push(
      `About ${missedEarlierDeadlineMinutes} minutes of shared material cannot fit before an earlier exam deadline.`,
    );
  }
  if (competingExams.length > 0) {
    const reserved = days.reduce(
      (sum, day) => sum + day.competingExamReserveMinutes,
      0,
    );
    warnings.push(
      `${competingExams.length} other upcoming ${competingExams.length === 1 ? 'exam is' : 'exams are'} reserving about ${reserved} minutes of study capacity.`,
    );
  }
  if (fatigueLimited) {
    warnings.push('High-effort topics are being spread out instead of being packed into one day.');
  }
  if (totalUsableCapacityMinutes === 0 && totalRequiredMinutes > 0) {
    warnings.push('No sustainable study capacity is available before this exam.');
  } else if (unallocatedMinutes > 0) {
    warnings.push(
      `The current workload exceeds sustainable capacity by about ${unallocatedMinutes} minutes.`,
    );
  }

  const feasibility = analyzeCapacityFeasibility(
    topics.map((topic) => ({
      id: `exam-topic:${topic.topicId}`,
      label: topic.topicName,
      kind: 'exam-preparation' as const,
      requiredMinutes: topic.totalRequiredMinutes,
      priority: topic.importance,
      availableFrom: startOfLocalDay(now),
      deadlineAt: topic.requiredBy,
      capacityUntil: startOfLocalDay(topic.requiredBy),
      movable: topic.importance < 3,
    })),
    days.map((day) => ({
      day: day.day,
      usableMinutes: day.usableCapacityMinutes,
    })),
  );

  return {
    examId: exam.id,
    examName: exam.name,
    examDate: exam.date,
    generatedAt: now,
    daysAvailable,
    capacityProfile,
    bufferRatio,
    topics,
    competingExams,
    totalRequiredMinutes,
    totalUsableCapacityMinutes,
    plannedMinutes,
    unallocatedMinutes,
    strainRatio,
    strain: strainForRatio(strainRatio),
    days,
    warnings,
    feasibility,
  };
}

export function examPlanTopicRemainingMinutes(
  plan: ExamPreparationPlan,
  topicId: string,
) {
  const required =
    plan.topics.find((topic) => topic.topicId === topicId)?.totalRequiredMinutes ?? 0;
  const planned = plan.days
    .flatMap((day) => day.blocks)
    .filter((block) => block.topicId === topicId)
    .reduce((sum, block) => sum + block.minutes, 0);
  return Math.max(0, required - planned);
}


export type JointExamPlanOptions = {
  examIds?: string[];
  topicOverrides?: ExamPlanTopicOverride[];
  bufferRatio?: number;
  maxDays?: number;
  revisionRatio?: number;
  revisionLeadDays?: number;
  minRevisionMinutes?: number;
  maxRevisionMinutes?: number;
};

export type JointExamPlanBlock = {
  id: string;
  day: number;
  kind: 'preparation' | 'revision';
  topicId: string;
  topicName: string;
  subject: string;
  minutes: number;
  mode: 'study' | 'review';
  examIds: string[];
  examId: string | null;
  reasons: string[];
};

export type JointExamPlanDay = {
  day: number;
  freeClockMinutes: number;
  existingStudyMinutes: number;
  scheduledStudyMinutes: number;
  sustainableRemainingMinutes: number;
  grossCapacityMinutes: number;
  reservedBufferMinutes: number;
  usableCapacityMinutes: number;
  plannedPreparationMinutes: number;
  plannedRevisionMinutes: number;
  hardStudyMinutes: number;
  hardStudyLimitMinutes: number;
  totalStudyLoadMinutes: number;
  loadRatio: number;
  strain: ExamPlanStrain;
  blocks: JointExamPlanBlock[];
};

export type JointExamPlanExamSummary = {
  examId: string;
  examName: string;
  examDate: number;
  topicIds: string[];
  revisionRequiredMinutes: number;
  revisionPlannedMinutes: number;
  revisionUnallocatedMinutes: number;
  preparationUnallocatedMinutes: number;
};

export type JointExamPreparationPlan = {
  generatedAt: number;
  capacityProfile: ExamCapacityProfile;
  bufferRatio: number;
  revisionRatio: number;
  revisionLeadDays: number;
  exams: JointExamPlanExamSummary[];
  uniqueTopicCount: number;
  totalPreparationRequiredMinutes: number;
  totalRevisionRequiredMinutes: number;
  totalUsableCapacityMinutes: number;
  plannedPreparationMinutes: number;
  plannedRevisionMinutes: number;
  unallocatedPreparationMinutes: number;
  unallocatedRevisionMinutes: number;
  strainRatio: number;
  strain: ExamPlanStrain;
  days: JointExamPlanDay[];
  warnings: string[];
  feasibility: CapacityFeasibilityAnalysis;
};

type JointTopicDemand = {
  topic: ExamPlanTopic;
  examIds: string[];
  examNames: string[];
  remainingMinutes: number;
};

type JointRevisionDemand = {
  examId: string;
  examName: string;
  examDate: number;
  startDay: number;
  topicIds: string[];
  requiredMinutes: number;
  remainingMinutes: number;
};

function selectedUpcomingExams(
  workspace: WorkspaceState,
  now: number,
  examIds: string[] | undefined,
  maxDays: number,
) {
  const requested = examIds?.length ? new Set(examIds) : null;
  return workspace.exams
    .filter((exam) => {
      if (requested && !requested.has(exam.id)) return false;
      const days = examCalendarDaysUntil(exam.date, now);
      return days >= 0 && days <= maxDays;
    })
    .sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
}

function jointTopicDemands(
  workspace: WorkspaceState,
  exams: WorkspaceState['exams'],
  now: number,
  profile: ExamCapacityProfile,
  overrides: Map<string, ExamPlanTopicOverride>,
): JointTopicDemand[] {
  const byTopic = new Map<string, JointTopicDemand>();

  for (const topic of workspace.topics) {
    const matching = exams
      .filter((exam) => examAppliesToTopic(exam, topic))
      .sort((a, b) => a.date - b.date);
    if (!matching.length) continue;

    const earliest = matching[0]!;
    const workload = topicWorkload(
      workspace,
      topic,
      now,
      profile,
      overrides.get(topic.id),
      earliest.date,
      earliest.name,
    );

    byTopic.set(topic.id, {
      topic: workload,
      examIds: matching.map((exam) => exam.id),
      examNames: matching.map((exam) => exam.name),
      remainingMinutes: workload.totalRequiredMinutes,
    });
  }

  return [...byTopic.values()];
}

function jointRevisionDemands(
  exams: WorkspaceState['exams'],
  topicDemands: JointTopicDemand[],
  revisionRatio: number,
  revisionLeadDays: number,
  minRevisionMinutes: number,
  maxRevisionMinutes: number,
): JointRevisionDemand[] {
  return exams.map((exam) => {
    const matching = topicDemands.filter((demand) => demand.examIds.includes(exam.id));
    const baseMinutes = matching.reduce(
      (sum, demand) => sum + demand.topic.estimatedMinutes,
      0,
    );
    const requiredMinutes = matching.length
      ? clamp(
          Math.round(baseMinutes * revisionRatio),
          minRevisionMinutes,
          maxRevisionMinutes,
        )
      : 0;

    return {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.date,
      startDay: addLocalDays(startOfLocalDay(exam.date), -revisionLeadDays),
      topicIds: matching.map((demand) => demand.topic.topicId),
      requiredMinutes,
      remainingMinutes: requiredMinutes,
    };
  });
}

function jointTopicPriority(
  demand: JointTopicDemand,
  day: number,
  dayIndex: number,
  totalDays: number,
) {
  return topicPriorityScore(demand.topic, dayIndex, totalDays, day);
}

function activeRevisionDemand(
  demand: JointRevisionDemand,
  day: number,
) {
  return (
    demand.remainingMinutes > 0 &&
    day >= demand.startDay &&
    day < startOfLocalDay(demand.examDate)
  );
}

function jointExamSummary(
  exams: WorkspaceState['exams'],
  topicDemands: JointTopicDemand[],
  revisionDemands: JointRevisionDemand[],
  days: JointExamPlanDay[],
): JointExamPlanExamSummary[] {
  return exams.map((exam) => {
    const topics = topicDemands.filter((demand) => demand.examIds.includes(exam.id));
    const revision = revisionDemands.find((demand) => demand.examId === exam.id);
    const revisionPlannedMinutes = days
      .flatMap((day) => day.blocks)
      .filter((block) => block.kind === 'revision' && block.examId === exam.id)
      .reduce((sum, block) => sum + block.minutes, 0);

    return {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.date,
      topicIds: topics.map((demand) => demand.topic.topicId),
      revisionRequiredMinutes: revision?.requiredMinutes ?? 0,
      revisionPlannedMinutes,
      revisionUnallocatedMinutes: revision?.remainingMinutes ?? 0,
      preparationUnallocatedMinutes: topics.reduce(
        (sum, demand) => sum + Math.max(0, demand.remainingMinutes),
        0,
      ),
    };
  });
}

export function buildJointExamPreparationPlan(
  workspace: WorkspaceState,
  now = Date.now(),
  options: JointExamPlanOptions = {},
): JointExamPreparationPlan {
  const maxDays = clamp(Math.round(options.maxDays ?? 45), 1, 120);
  const exams = selectedUpcomingExams(workspace, now, options.examIds, maxDays);
  const profile = buildExamCapacityProfile(workspace, now);
  const bufferRatio = dynamicBufferRatio(profile, options.bufferRatio);
  const revisionRatio = clamp(options.revisionRatio ?? 0.18, 0.08, 0.35);
  const revisionLeadDays = clamp(Math.round(options.revisionLeadDays ?? 2), 1, 5);
  const minRevisionMinutes = clamp(Math.round(options.minRevisionMinutes ?? 20), 5, 120);
  const maxRevisionMinutes = Math.max(
    minRevisionMinutes,
    clamp(Math.round(options.maxRevisionMinutes ?? 90), 10, 240),
  );
  const overrides = new Map(
    (options.topicOverrides ?? []).map((override) => [override.topicId, override]),
  );

  const topicDemands = jointTopicDemands(
    workspace,
    exams,
    now,
    profile,
    overrides,
  );
  const revisionDemands = jointRevisionDemands(
    exams,
    topicDemands,
    revisionRatio,
    revisionLeadDays,
    minRevisionMinutes,
    maxRevisionMinutes,
  );

  const today = startOfLocalDay(now);
  const lastExam = exams[exams.length - 1] ?? null;
  const daysAvailable = lastExam
    ? Math.min(
        maxDays,
        Math.max(1, examCalendarDaysUntil(lastExam.date, now)),
      )
    : 0;

  const days: JointExamPlanDay[] = [];
  for (let offset = 0; offset < daysAvailable; offset += 1) {
    const day = addLocalDays(today, offset);
    const from = offset === 0 ? now : day;
    const freeClockMinutes = freeStudyWindows(workspace, day, {
      includeScheduledTasks: true,
      from,
      minMinutes: 10,
    }).reduce((sum, window) => sum + window.minutes, 0);
    const existingStudyMinutes = actualStudyMinutesForDay(workspace, day);
    const scheduledStudyMinutes = scheduledStudyMinutesForDay(workspace, day);
    const sustainableRemainingMinutes = Math.max(
      0,
      profile.sustainableDailyMinutes -
        existingStudyMinutes -
        scheduledStudyMinutes,
    );
    const grossCapacityMinutes = Math.max(
      0,
      Math.min(freeClockMinutes, sustainableRemainingMinutes),
    );
    const usableCapacityMinutes = Math.max(
      0,
      Math.floor(grossCapacityMinutes * (1 - bufferRatio)),
    );
    const reservedBufferMinutes = Math.max(
      0,
      grossCapacityMinutes - usableCapacityMinutes,
    );
    const hardStudyLimitMinutes = Math.min(
      usableCapacityMinutes,
      Math.max(
        Math.min(
          usableCapacityMinutes,
          Math.round(workspace.settings.focusMinutes || 45),
        ),
        Math.floor(usableCapacityMinutes * profile.hardStudyShareLimit),
      ),
    );

    days.push({
      day,
      freeClockMinutes,
      existingStudyMinutes,
      scheduledStudyMinutes,
      sustainableRemainingMinutes,
      grossCapacityMinutes,
      reservedBufferMinutes,
      usableCapacityMinutes,
      plannedPreparationMinutes: 0,
      plannedRevisionMinutes: 0,
      hardStudyMinutes: 0,
      hardStudyLimitMinutes,
      totalStudyLoadMinutes: existingStudyMinutes + scheduledStudyMinutes,
      loadRatio:
        profile.sustainableDailyMinutes > 0
          ? (existingStudyMinutes + scheduledStudyMinutes) /
            profile.sustainableDailyMinutes
          : 0,
      strain: strainForRatio(
        profile.sustainableDailyMinutes > 0
          ? (existingStudyMinutes + scheduledStudyMinutes) /
            profile.sustainableDailyMinutes
          : 0,
      ),
      blocks: [],
    });
  }

  const focusChunk = clamp(Math.round(workspace.settings.focusMinutes || 45), 10, 90);
  const revisionChunk = Math.min(25, focusChunk);
  let fatigueLimited = false;

  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex]!;
    const completedBeforeDay = new Set(
      topicDemands
        .filter((demand) => demand.remainingMinutes <= 0)
        .map((demand) => demand.topic.topicId),
    );
    const activeRevision = revisionDemands
      .filter((demand) => activeRevisionDemand(demand, day.day))
      .sort((a, b) => a.examDate - b.examDate);

    const revisionNeedToday = activeRevision.reduce((sum, demand) => {
      const eligible = demand.topicIds.some((topicId) => completedBeforeDay.has(topicId));
      if (!eligible) return sum;
      const daysLeft = Math.max(1, examCalendarDaysUntil(demand.examDate, day.day));
      return sum + Math.ceil(demand.remainingMinutes / daysLeft);
    }, 0);
    const revisionReserve = Math.min(
      Math.floor(day.usableCapacityMinutes * 0.4),
      revisionNeedToday,
    );

    let preparationAvailable = Math.max(
      0,
      day.usableCapacityMinutes - revisionReserve,
    );

    while (preparationAvailable >= 5) {
      const candidates = topicDemands
        .filter(
          (demand) =>
            demand.remainingMinutes > 0 &&
            day.day < startOfLocalDay(demand.topic.requiredBy),
        )
        .sort(
          (a, b) =>
            jointTopicPriority(b, day.day, dayIndex, days.length) -
              jointTopicPriority(a, day.day, dayIndex, days.length) ||
            a.topic.topicName.localeCompare(b.topic.topicName),
        );

      if (!candidates.length) break;
      let progressed = false;

      for (const demand of candidates) {
        if (preparationAvailable < 5) break;
        const topic = demand.topic;
        const hardRemaining =
          topic.difficulty === 3
            ? Math.max(0, day.hardStudyLimitMinutes - day.hardStudyMinutes)
            : Number.POSITIVE_INFINITY;

        if (topic.difficulty === 3 && hardRemaining < 5) {
          fatigueLimited = true;
          continue;
        }

        const minutes = Math.min(
          focusChunk,
          demand.remainingMinutes,
          preparationAvailable,
          hardRemaining,
        );
        if (minutes < 5) continue;

        day.blocks.push({
          id: `joint:prep:${dayIndex}:${topic.topicId}:${day.blocks.length}`,
          day: day.day,
          kind: 'preparation',
          topicId: topic.topicId,
          topicName: topic.topicName,
          subject: topic.subject,
          minutes,
          mode: topic.mode,
          examIds: demand.examIds,
          examId: null,
          reasons: topic.reasons.slice(0, 3),
        });
        day.plannedPreparationMinutes += minutes;
        if (topic.difficulty === 3) day.hardStudyMinutes += minutes;
        demand.remainingMinutes -= minutes;
        preparationAvailable -= minutes;
        progressed = true;
      }

      if (!progressed) break;
    }

    let revisionAvailable =
      day.usableCapacityMinutes - day.plannedPreparationMinutes;
    for (const demand of activeRevision) {
      if (revisionAvailable < 5 || demand.remainingMinutes < 5) continue;

      const candidates = topicDemands
        .filter(
          (topicDemand) =>
            demand.topicIds.includes(topicDemand.topic.topicId) &&
            completedBeforeDay.has(topicDemand.topic.topicId),
        )
        .sort(
          (a, b) =>
            b.topic.importance - a.topic.importance ||
            b.topic.difficulty - a.topic.difficulty ||
            b.topic.forgettingRisk - a.topic.forgettingRisk ||
            a.topic.topicName.localeCompare(b.topic.topicName),
        );

      for (const candidate of candidates) {
        if (revisionAvailable < 5 || demand.remainingMinutes < 5) break;
        if (
          day.blocks.some(
            (block) =>
              block.kind === 'revision' &&
              block.examId === demand.examId &&
              block.topicId === candidate.topic.topicId,
          )
        ) {
          continue;
        }

        const minutes = Math.min(
          revisionChunk,
          demand.remainingMinutes,
          revisionAvailable,
        );
        if (minutes < 5) continue;

        day.blocks.push({
          id: `joint:review:${demand.examId}:${dayIndex}:${candidate.topic.topicId}`,
          day: day.day,
          kind: 'revision',
          topicId: candidate.topic.topicId,
          topicName: candidate.topic.topicName,
          subject: candidate.topic.subject,
          minutes,
          mode: 'review',
          examIds: [demand.examId],
          examId: demand.examId,
          reasons: [`final revision for ${demand.examName}`],
        });
        day.plannedRevisionMinutes += minutes;
        demand.remainingMinutes -= minutes;
        revisionAvailable -= minutes;
      }
    }

    day.totalStudyLoadMinutes =
      day.existingStudyMinutes +
      day.scheduledStudyMinutes +
      day.plannedPreparationMinutes +
      day.plannedRevisionMinutes;
    day.loadRatio =
      profile.sustainableDailyMinutes > 0
        ? day.totalStudyLoadMinutes / profile.sustainableDailyMinutes
        : 0;
    day.strain = strainForRatio(day.loadRatio);
  }

  const totalPreparationRequiredMinutes = topicDemands.reduce(
    (sum, demand) => sum + demand.topic.totalRequiredMinutes,
    0,
  );
  const totalRevisionRequiredMinutes = revisionDemands.reduce(
    (sum, demand) => sum + demand.requiredMinutes,
    0,
  );
  const totalUsableCapacityMinutes = days.reduce(
    (sum, day) => sum + day.usableCapacityMinutes,
    0,
  );
  const plannedPreparationMinutes = days.reduce(
    (sum, day) => sum + day.plannedPreparationMinutes,
    0,
  );
  const plannedRevisionMinutes = days.reduce(
    (sum, day) => sum + day.plannedRevisionMinutes,
    0,
  );
  const unallocatedPreparationMinutes = topicDemands.reduce(
    (sum, demand) => sum + Math.max(0, demand.remainingMinutes),
    0,
  );
  const unallocatedRevisionMinutes = revisionDemands.reduce(
    (sum, demand) => sum + Math.max(0, demand.remainingMinutes),
    0,
  );
  const requiredTotal =
    totalPreparationRequiredMinutes + totalRevisionRequiredMinutes;
  const strainRatio =
    totalUsableCapacityMinutes > 0
      ? requiredTotal / totalUsableCapacityMinutes
      : requiredTotal > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const warnings: string[] = [];

  if (!exams.length) {
    warnings.push('There are no upcoming exams to plan yet.');
  }
  if (profile.source === 'default' && exams.length) {
    warnings.push('Capacity is using your daily setting until MYELIN has enough study history.');
  }
  if (topicDemands.some((demand) => demand.examIds.length > 1)) {
    warnings.push('Shared topics are planned once and reused across every matching exam.');
  }
  if (fatigueLimited) {
    warnings.push('High-effort topics are being spread out instead of being packed into one day.');
  }
  if (unallocatedPreparationMinutes > 0) {
    warnings.push(
      `About ${unallocatedPreparationMinutes} minutes of preparation cannot fit before the relevant exam deadlines.`,
    );
  }
  if (unallocatedRevisionMinutes > 0) {
    warnings.push(
      `About ${unallocatedRevisionMinutes} minutes of final revision could not fit after the core preparation work.`,
    );
  }

  const examSummaries = jointExamSummary(
    exams,
    topicDemands,
    revisionDemands,
    days,
  );
  const hasUnallocated =
    unallocatedPreparationMinutes > 0 || unallocatedRevisionMinutes > 0;

  const feasibility = analyzeCapacityFeasibility(
    [
      ...topicDemands.map((demand) => ({
        id: `joint-prep:${demand.topic.topicId}`,
        label: demand.topic.topicName,
        kind: 'exam-preparation' as const,
        requiredMinutes: demand.topic.totalRequiredMinutes,
        priority: demand.topic.importance,
        availableFrom: startOfLocalDay(now),
        deadlineAt: demand.topic.requiredBy,
        capacityUntil: startOfLocalDay(demand.topic.requiredBy),
        movable: demand.topic.importance < 3,
      })),
      ...revisionDemands
        .filter((demand) => demand.requiredMinutes > 0)
        .map((demand) => ({
          id: `joint-revision:${demand.examId}`,
          label: `Final revision · ${demand.examName}`,
          kind: 'exam-revision' as const,
          requiredMinutes: demand.requiredMinutes,
          priority: 3 as const,
          availableFrom: demand.startDay,
          deadlineAt: demand.examDate,
          capacityUntil: startOfLocalDay(demand.examDate),
          movable: false,
        })),
    ],
    days.map((day) => ({
      day: day.day,
      usableMinutes: day.usableCapacityMinutes,
    })),
  );

  return {
    generatedAt: now,
    capacityProfile: profile,
    bufferRatio,
    revisionRatio,
    revisionLeadDays,
    exams: examSummaries,
    uniqueTopicCount: topicDemands.length,
    totalPreparationRequiredMinutes,
    totalRevisionRequiredMinutes,
    totalUsableCapacityMinutes,
    plannedPreparationMinutes,
    plannedRevisionMinutes,
    unallocatedPreparationMinutes,
    unallocatedRevisionMinutes,
    strainRatio,
    strain: hasUnallocated ? 'overloaded' : strainForRatio(strainRatio),
    days,
    warnings,
    feasibility,
  };
}
