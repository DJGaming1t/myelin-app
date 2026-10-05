import { Topic, WorkspaceState } from '@/src/data/schema';
import { forgettingPressure } from '@/src/features/adaptive/memory-engine';
import { examAppliesToTopic, examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import {
  addLocalDays,
  freeStudyWindows,
  scheduledTasksForDay,
  startOfLocalDay,
} from '@/src/features/planning/day-engine';

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
};

export type ExamPlanTopic = {
  topicId: string;
  topicName: string;
  subject: string;
  estimatedMinutes: number;
  retrievalReserveMinutes: number;
  totalRequiredMinutes: number;
  difficulty: 1 | 2 | 3;
  importance: 1 | 2 | 3;
  forgettingRisk: number;
  dueQuestionCount: number;
  mode: 'study' | 'review';
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
  usableCapacityMinutes: number;
  plannedMinutes: number;
  totalStudyLoadMinutes: number;
  loadRatio: number;
  strain: ExamPlanStrain;
  blocks: ExamPlanBlock[];
};

export type ExamPreparationPlan = {
  examId: string;
  examName: string;
  examDate: number;
  generatedAt: number;
  daysAvailable: number;
  capacityProfile: ExamCapacityProfile;
  topics: ExamPlanTopic[];
  totalRequiredMinutes: number;
  totalUsableCapacityMinutes: number;
  plannedMinutes: number;
  unallocatedMinutes: number;
  strainRatio: number;
  strain: ExamPlanStrain;
  days: ExamPlanDay[];
  warnings: string[];
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
  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
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
  const hasEnoughHistory = active.length >= 4;

  let sustainableDailyMinutes = Math.max(30, workspace.settings.dailyMinutes || 90);
  if (hasEnoughHistory && historicalMedianMinutes !== null) {
    const blended = Math.round(
      workspace.settings.dailyMinutes * 0.45 + historicalMedianMinutes * 0.55,
    );
    const upperBound = Math.max(60, Math.round(workspace.settings.dailyMinutes * 1.25));
    sustainableDailyMinutes = clamp(blended, 30, upperBound);
  }

  if (workspace.settings.energy === 'low') {
    sustainableDailyMinutes = Math.max(25, Math.round(sustainableDailyMinutes * 0.82));
  }

  return {
    source: hasEnoughHistory ? 'personalized' : 'default',
    sustainableDailyMinutes,
    historyActiveDays: active.length,
    historicalMedianMinutes,
    lookbackDays,
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
  override?: ExamPlanTopicOverride,
): ExamPlanTopic {
  const risk = forgettingPressure(topic.cards, now);
  const dueCount = dueQuestionCount(topic, now);
  const explicitEstimate = override?.estimatedMinutes;
  const estimatedMinutes = Math.max(
    10,
    Math.round(
      explicitEstimate && explicitEstimate > 0
        ? explicitEstimate
        : topic.estimate > 0
          ? topic.estimate
          : workspace.settings.focusMinutes,
    ),
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
  if (!reasons.length) reasons.push(topic.status === 'new' ? 'not started' : 'exam scope');

  return {
    topicId: topic.id,
    topicName: topic.name,
    subject: topic.subject,
    estimatedMinutes,
    retrievalReserveMinutes,
    totalRequiredMinutes: estimatedMinutes + retrievalReserveMinutes,
    difficulty,
    importance,
    forgettingRisk: risk,
    dueQuestionCount: dueCount,
    mode,
    reasons,
  };
}

function strainForRatio(ratio: number): ExamPlanStrain {
  if (ratio <= 0.65) return 'comfortable';
  if (ratio <= 0.85) return 'balanced';
  if (ratio <= 1) return 'tight';
  return 'overloaded';
}

function topicPriorityScore(topic: ExamPlanTopic, dayIndex: number, totalDays: number) {
  const progress = totalDays <= 1 ? 1 : dayIndex / (totalDays - 1);
  const earlyStudyBoost = topic.mode === 'study' ? Math.round((1 - progress) * 12) : 0;
  const lateReviewBoost = topic.mode === 'review' ? Math.round(progress * 10) : 0;
  return (
    topic.importance * 20 +
    topic.difficulty * 14 +
    topic.forgettingRisk * 30 +
    Math.min(20, topic.dueQuestionCount * 4) +
    earlyStudyBoost +
    lateReviewBoost
  );
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

  const overrides = new Map(
    (options.topicOverrides ?? []).map((override) => [override.topicId, override]),
  );
  const scopedTopics = workspace.topics.filter((topic) => examAppliesToTopic(exam, topic));
  const topics = scopedTopics.map((topic) =>
    topicWorkload(workspace, topic, now, overrides.get(topic.id)),
  );

  const capacityProfile = buildExamCapacityProfile(workspace, now);
  const bufferRatio = clamp(options.bufferRatio ?? 0.15, 0, 0.4);
  const maxDays = clamp(Math.round(options.maxDays ?? 45), 1, 120);
  const daysAvailable = Math.min(Math.max(1, examDays), maxDays);
  const today = startOfLocalDay(now);

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
    const usableCapacityMinutes = Math.max(
      0,
      Math.floor(grossCapacityMinutes * (1 - bufferRatio)),
    );
    const reservedBufferMinutes = Math.max(
      0,
      grossCapacityMinutes - usableCapacityMinutes,
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
      plannedMinutes: 0,
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

  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex]!;
    let available = day.usableCapacityMinutes;

    while (available >= 5) {
      const candidates = topics
        .filter((topic) => (remaining.get(topic.topicId) ?? 0) > 0)
        .sort(
          (a, b) =>
            topicPriorityScore(b, dayIndex, days.length) -
              topicPriorityScore(a, dayIndex, days.length) ||
            a.topicName.localeCompare(b.topicName),
        );

      if (!candidates.length) break;
      let progressed = false;

      for (const topic of candidates) {
        if (available < 5) break;
        const left = remaining.get(topic.topicId) ?? 0;
        if (left <= 0) continue;

        const minutes = Math.min(focusChunk, left, available);
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
  if (daysAvailable <= 2 && totalRequiredMinutes > 0) {
    warnings.push('There is very little recovery margin before the exam.');
  }
  if (totalUsableCapacityMinutes === 0 && totalRequiredMinutes > 0) {
    warnings.push('No sustainable study capacity is available before this exam.');
  } else if (unallocatedMinutes > 0) {
    warnings.push(
      `The current workload exceeds sustainable capacity by about ${unallocatedMinutes} minutes.`,
    );
  }

  return {
    examId: exam.id,
    examName: exam.name,
    examDate: exam.date,
    generatedAt: now,
    daysAvailable,
    capacityProfile,
    topics,
    totalRequiredMinutes,
    totalUsableCapacityMinutes,
    plannedMinutes,
    unallocatedMinutes,
    strainRatio,
    strain: strainForRatio(strainRatio),
    days,
    warnings,
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
