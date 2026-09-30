import { Confidence, StudySession, WorkspaceState } from '@/src/data/schema';

export type DailyStudyPoint = {
  day: string;
  label: string;
  minutes: number;
};

export type ConfidenceBucket = {
  confidence: Confidence;
  attempts: number;
  again: number;
  practising: number;
  good: number;
  averageGrade: number | null;
};

export type TimeCalibration = {
  sampleSize: number;
  plannedMinutes: number;
  actualMinutes: number;
  averageDeltaMinutes: number | null;
  averageRatio: number | null;
  medianRatio: number | null;
  withinTenPercent: number;
  withinTwentyPercent: number;
  direction: 'longer' | 'shorter' | 'close' | 'insufficient';
  message: string;
};

export type TopicTrend = {
  topicId: string;
  topicName: string;
  subject: string;
  recentMinutes: number;
  previousMinutes: number;
  recentReviews: number;
  previousReviews: number;
  recentAverageGrade: number | null;
  previousAverageGrade: number | null;
  direction: 'more-active' | 'less-active' | 'similar' | 'new-data';
};

export type ProgressSnapshot = {
  generatedAt: number;
  study: {
    todayMinutes: number;
    last7Minutes: number;
    previous7Minutes: number;
    last30Minutes: number;
    last7Days: DailyStudyPoint[];
    activeDaysLast7: number;
  };
  reviews: {
    total: number;
    last30: number;
    again: number;
    practising: number;
    good: number;
    averageGrade: number | null;
  };
  confidence: {
    sampleSize: number;
    enoughData: boolean;
    buckets: ConfidenceBucket[];
    sureAgainCount: number;
    sureAgainRate: number | null;
    message: string;
  };
  timing: TimeCalibration;
  mistakes: {
    total: number;
    open: number;
    resolved: number;
    due: number;
  };
  topics: TopicTrend[];
};

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addLocalDays(timestamp: number, days: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ).getTime();
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dayLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(timestamp));
}

function sumMinutes(sessions: StudySession[]) {
  return sessions.reduce((sum, session) => sum + session.minutes, 0);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[middle] ?? null;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

function reviewSessions(workspace: WorkspaceState) {
  return workspace.history.filter((session) => session.kind === 'review' && session.grade > 0);
}

function sessionsInRange(
  sessions: StudySession[],
  startInclusive: number,
  endExclusive: number,
) {
  return sessions.filter(
    (session) => session.at >= startInclusive && session.at < endExclusive,
  );
}

function averageReviewGrade(sessions: StudySession[]) {
  return average(
    sessions
      .filter((session) => session.kind === 'review' && session.grade > 0)
      .map((session) => session.grade),
  );
}

function confidenceBucket(
  sessions: StudySession[],
  confidence: Confidence,
): ConfidenceBucket {
  const items = sessions.filter((session) => session.confidence === confidence);
  const grades = items.map((session) => session.grade);

  return {
    confidence,
    attempts: items.length,
    again: grades.filter((grade) => grade === 1).length,
    practising: grades.filter((grade) => grade === 2).length,
    good: grades.filter((grade) => grade === 3).length,
    averageGrade: average(grades),
  };
}

export function buildDailyStudyHistory(
  workspace: WorkspaceState,
  now = Date.now(),
  days = 7,
): DailyStudyPoint[] {
  const today = startOfLocalDay(now);
  const result: DailyStudyPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = addLocalDays(today, -offset);
    const end = addLocalDays(start, 1);
    result.push({
      day: dayKey(start),
      label: dayLabel(start),
      minutes: sumMinutes(sessionsInRange(workspace.history, start, end)),
    });
  }

  return result;
}

export function buildTimeCalibration(workspace: WorkspaceState): TimeCalibration {
  const sessions = workspace.history.filter(
    (session) =>
      session.kind === 'study' &&
      typeof session.plannedMinutes === 'number' &&
      session.plannedMinutes > 0 &&
      session.minutes >= 0,
  );

  const sampleSize = sessions.length;
  const plannedMinutes = sessions.reduce(
    (sum, session) => sum + (session.plannedMinutes ?? 0),
    0,
  );
  const actualMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);

  if (sampleSize < 3 || plannedMinutes <= 0) {
    return {
      sampleSize,
      plannedMinutes,
      actualMinutes,
      averageDeltaMinutes: null,
      averageRatio: null,
      medianRatio: null,
      withinTenPercent: 0,
      withinTwentyPercent: 0,
      direction: 'insufficient',
      message: `Need ${Math.max(0, 3 - sampleSize)} more completed focus ${3 - sampleSize === 1 ? 'block' : 'blocks'} before estimating your timing pattern.`,
    };
  }

  const ratios = sessions.map(
    (session) => session.minutes / Math.max(1, session.plannedMinutes ?? 1),
  );
  const deltas = sessions.map(
    (session) => session.minutes - (session.plannedMinutes ?? 0),
  );
  const averageRatio = average(ratios) ?? 1;
  const medianRatio = median(ratios) ?? 1;
  const averageDeltaMinutes = average(deltas) ?? 0;
  const withinTenPercent = ratios.filter((ratio) => Math.abs(ratio - 1) <= 0.1).length;
  const withinTwentyPercent = ratios.filter((ratio) => Math.abs(ratio - 1) <= 0.2).length;

  let direction: TimeCalibration['direction'] = 'close';
  let message = 'Your actual focus time is usually close to what you planned.';

  if (medianRatio >= 1.15) {
    direction = 'longer';
    message = `Blocks are tending to run longer than planned. Median actual time is ${Math.round(medianRatio * 100)}% of the plan.`;
  } else if (medianRatio <= 0.85) {
    direction = 'shorter';
    message = `Blocks are tending to end earlier than planned. Median actual time is ${Math.round(medianRatio * 100)}% of the plan.`;
  }

  return {
    sampleSize,
    plannedMinutes,
    actualMinutes,
    averageDeltaMinutes,
    averageRatio,
    medianRatio,
    withinTenPercent,
    withinTwentyPercent,
    direction,
    message,
  };
}

export function buildConfidenceCalibration(workspace: WorkspaceState) {
  const sessions = reviewSessions(workspace).filter(
    (session) => Boolean(session.reviewAttemptId),
  );
  const buckets = (['unsure', 'partial', 'sure'] as const).map((confidence) =>
    confidenceBucket(sessions, confidence),
  );
  const sure = buckets.find((bucket) => bucket.confidence === 'sure')!;
  const sampleSize = sessions.length;
  const enoughData = sampleSize >= 5;
  const sureAgainRate = sure.attempts ? sure.again / sure.attempts : null;

  let message = 'Confidence will become useful after more graded recall attempts.';
  if (enoughData) {
    if (sure.attempts >= 2 && sureAgainRate !== null && sureAgainRate >= 0.35) {
      message = 'Some answers marked “Sure” are still landing on Again. Check certainty before revealing the reference.';
    } else if (sure.attempts >= 2 && sureAgainRate !== null && sureAgainRate <= 0.1) {
      message = 'Your “Sure” answers have rarely landed on Again in the recorded sample.';
    } else {
      message = 'Confidence and recall results are mixed so far; keep recording both before drawing a stronger conclusion.';
    }
  }

  return {
    sampleSize,
    enoughData,
    buckets,
    sureAgainCount: sure.again,
    sureAgainRate,
    message,
  };
}

export function buildTopicTrends(
  workspace: WorkspaceState,
  now = Date.now(),
): TopicTrend[] {
  const today = startOfLocalDay(now);
  const recentStart = addLocalDays(today, -6);
  const recentEnd = addLocalDays(today, 1);
  const previousStart = addLocalDays(recentStart, -7);
  const previousEnd = recentStart;

  return workspace.topics
    .map((topic) => {
      const topicSessions = workspace.history.filter(
        (session) => session.topicId === topic.id,
      );
      const recent = sessionsInRange(topicSessions, recentStart, recentEnd);
      const previous = sessionsInRange(topicSessions, previousStart, previousEnd);
      const recentMinutes = sumMinutes(recent);
      const previousMinutes = sumMinutes(previous);
      const recentReviews = recent.filter(
        (session) => session.kind === 'review' && session.grade > 0,
      );
      const previousReviews = previous.filter(
        (session) => session.kind === 'review' && session.grade > 0,
      );

      let direction: TopicTrend['direction'] = 'similar';
      if (previousMinutes === 0 && recentMinutes > 0) direction = 'new-data';
      else if (recentMinutes >= previousMinutes + 20) direction = 'more-active';
      else if (previousMinutes >= recentMinutes + 20) direction = 'less-active';

      return {
        topicId: topic.id,
        topicName: topic.name,
        subject: topic.subject,
        recentMinutes,
        previousMinutes,
        recentReviews: recentReviews.length,
        previousReviews: previousReviews.length,
        recentAverageGrade: averageReviewGrade(recentReviews),
        previousAverageGrade: averageReviewGrade(previousReviews),
        direction,
      };
    })
    .filter(
      (trend) =>
        trend.recentMinutes > 0 ||
        trend.previousMinutes > 0 ||
        trend.recentReviews > 0 ||
        trend.previousReviews > 0,
    )
    .sort((a, b) => {
      if (b.recentMinutes !== a.recentMinutes) return b.recentMinutes - a.recentMinutes;
      return a.topicName.localeCompare(b.topicName);
    });
}

export function buildProgressSnapshot(
  workspace: WorkspaceState,
  now = Date.now(),
): ProgressSnapshot {
  const today = startOfLocalDay(now);
  const tomorrow = addLocalDays(today, 1);
  const last7Start = addLocalDays(today, -6);
  const previous7Start = addLocalDays(last7Start, -7);
  const last30Start = addLocalDays(today, -29);

  const todaySessions = sessionsInRange(workspace.history, today, tomorrow);
  const last7Sessions = sessionsInRange(workspace.history, last7Start, tomorrow);
  const previous7Sessions = sessionsInRange(workspace.history, previous7Start, last7Start);
  const last30Sessions = sessionsInRange(workspace.history, last30Start, tomorrow);
  const reviews = reviewSessions(workspace);
  const last30Reviews = sessionsInRange(reviews, last30Start, tomorrow);
  const last7Days = buildDailyStudyHistory(workspace, now, 7);

  const openMistakes = workspace.mistakes.filter((mistake) => mistake.resolvedAt === 0);

  return {
    generatedAt: now,
    study: {
      todayMinutes: sumMinutes(todaySessions),
      last7Minutes: sumMinutes(last7Sessions),
      previous7Minutes: sumMinutes(previous7Sessions),
      last30Minutes: sumMinutes(last30Sessions),
      last7Days,
      activeDaysLast7: last7Days.filter((day) => day.minutes > 0).length,
    },
    reviews: {
      total: reviews.length,
      last30: last30Reviews.length,
      again: last30Reviews.filter((session) => session.grade === 1).length,
      practising: last30Reviews.filter((session) => session.grade === 2).length,
      good: last30Reviews.filter((session) => session.grade === 3).length,
      averageGrade: averageReviewGrade(last30Reviews),
    },
    confidence: buildConfidenceCalibration(workspace),
    timing: buildTimeCalibration(workspace),
    mistakes: {
      total: workspace.mistakes.length,
      open: openMistakes.length,
      resolved: workspace.mistakes.filter((mistake) => mistake.resolvedAt > 0).length,
      due: openMistakes.filter(
        (mistake) => mistake.dueAt === 0 || mistake.dueAt <= now,
      ).length,
    },
    topics: buildTopicTrends(workspace, now),
  };
}

export function formatMinutesCompact(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
