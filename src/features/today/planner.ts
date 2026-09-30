import { Exam, Topic, WorkspaceState } from '@/src/data/schema';

export type PlanMode = 'study' | 'review';

export type PlanBlock = {
  id: string;
  topicId: string;
  topicName: string;
  subject: string;
  mode: PlanMode;
  minutes: number;
  score: number;
  reasons: string[];
  dueQuestionCount: number;
  examDays: number | null;
};

export type TodayPlan = {
  generatedAt: number;
  budgetMinutes: number;
  alreadyUsedMinutes: number;
  remainingBudgetMinutes: number;
  plannedStudyMinutes: number;
  plannedBreakMinutes: number;
  plannedTotalMinutes: number;
  targetFocusMinutes: number;
  breakMinutes: number;
  blocks: PlanBlock[];
  nextBlock: PlanBlock | null;
  deferredTopicCount: number;
};

type TopicCandidate = {
  topic: Topic;
  baseScore: number;
  reasons: string[];
  dueQuestionCount: number;
  examDays: number | null;
  studiedToday: number;
  mode: PlanMode;
};

const DAY = 24 * 60 * 60 * 1000;

export function startOfLocalDay(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function minutesUsedToday(workspace: WorkspaceState, now: number) {
  const start = startOfLocalDay(now);
  const study = workspace.history
    .filter((entry) => entry.at >= start && entry.at <= now)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const breaks = workspace.breaks
    .filter((entry) => entry.at >= start && entry.at <= now)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  return Math.round(study + breaks);
}

function daysUntil(timestamp: number, now: number) {
  return Math.max(0, Math.ceil((timestamp - now) / DAY));
}

function examApplies(exam: Exam, topic: Topic) {
  if (exam.scope === 'topics') return exam.topicIds.includes(topic.id);
  return exam.subjects.includes(topic.subject);
}

function nearestExamForTopic(workspace: WorkspaceState, topic: Topic, now: number) {
  const exams = workspace.exams
    .filter((exam) => exam.date >= now && examApplies(exam, topic))
    .sort((a, b) => a.date - b.date);
  return exams[0] ?? null;
}

function examBoost(days: number) {
  if (days <= 1) return 55;
  if (days <= 3) return 45;
  if (days <= 7) return 32;
  if (days <= 14) return 18;
  if (days <= 30) return 8;
  return 0;
}

function topicStudyMinutesToday(workspace: WorkspaceState, topicId: string, now: number) {
  const start = startOfLocalDay(now);
  return workspace.history
    .filter((entry) => entry.topicId === topicId && entry.at >= start && entry.at <= now)
    .reduce((sum, entry) => sum + entry.minutes, 0);
}

function dueQuestions(topic: Topic, now: number) {
  return topic.cards.filter((card) => {
    if (card.reps === 0) return topic.status !== 'new';
    return card.dueAt === 0 || card.dueAt <= now;
  }).length;
}

function buildCandidate(workspace: WorkspaceState, topic: Topic, now: number): TopicCandidate | null {
  if (topic.snoozeUntil > now) return null;

  let score = topic.priority * 12;
  const reasons: string[] = [];

  if (topic.priority === 3) reasons.push('high priority');

  if (topic.status === 'learning') {
    score += 13;
    reasons.push('already in progress');
  } else if (topic.status === 'review') {
    score += 11;
  } else {
    score += 4;
  }

  const questionCount = dueQuestions(topic, now);
  const topicDue = topic.dueAt > 0 && topic.dueAt <= now;

  if (topicDue) {
    score += 28;
    reasons.unshift('topic review is due');
  }

  if (questionCount > 0) {
    score += Math.min(30, 8 + questionCount * 4);
    reasons.unshift(
      `${questionCount} recall ${questionCount === 1 ? 'question is' : 'questions are'} ready`,
    );
  }

  const nearestExam = nearestExamForTopic(workspace, topic, now);
  const examDays = nearestExam ? daysUntil(nearestExam.date, now) : null;

  if (nearestExam && examDays !== null) {
    const boost = examBoost(examDays);
    score += boost;
    if (boost > 0) {
      reasons.unshift(
        examDays === 0
          ? `${nearestExam.name} is today`
          : examDays === 1
            ? `${nearestExam.name} is tomorrow`
            : `${nearestExam.name} in ${examDays} days`,
      );
    }
  }

  const studiedToday = topicStudyMinutesToday(workspace, topic.id, now);
  if (studiedToday > 0) {
    score -= Math.min(34, Math.round(studiedToday * 0.7));
  }

  if (topic.lastReviewed > 0) {
    const hoursSinceReview = (now - topic.lastReviewed) / (60 * 60 * 1000);
    if (hoursSinceReview < 8) score -= 20;
  }

  const mode: PlanMode =
    topicDue || questionCount > 0 || topic.status === 'review' ? 'review' : 'study';

  if (reasons.length === 0) {
    reasons.push(topic.status === 'new' ? 'ready to start' : 'worth continuing');
  }

  return {
    topic,
    baseScore: score,
    reasons,
    dueQuestionCount: questionCount,
    examDays,
    studiedToday,
    mode,
  };
}

function blockDuration(topic: Topic, targetFocus: number, repeat: number, available: number) {
  const notionalRemaining = Math.max(5, topic.estimate - repeat * targetFocus);
  return Math.min(targetFocus, notionalRemaining, available);
}

export function buildTodayPlan(
  workspace: WorkspaceState,
  now = Date.now(),
  budgetOverride?: number,
): TodayPlan {
  const budgetMinutes = Math.max(
    10,
    Math.min(720, Math.round(budgetOverride ?? workspace.settings.dailyMinutes)),
  );
  const alreadyUsedMinutes = Math.min(budgetMinutes, minutesUsedToday(workspace, now));
  const remainingBudgetMinutes = Math.max(0, budgetMinutes - alreadyUsedMinutes);

  const configuredFocus = workspace.settings.focusMinutes;
  const targetFocusMinutes =
    workspace.settings.energy === 'low'
      ? Math.max(15, Math.min(25, configuredFocus))
      : Math.max(15, Math.min(60, configuredFocus));
  const configuredBreak = Math.max(1, Math.min(30, workspace.settings.breakMinutes));
  const breakMinutes =
    workspace.settings.energy === 'low'
      ? Math.max(configuredBreak, Math.min(12, Math.round(targetFocusMinutes * 0.35)))
      : configuredBreak;

  const candidates = workspace.topics
    .map((topic) => buildCandidate(workspace, topic, now))
    .filter((candidate): candidate is TopicCandidate => Boolean(candidate));

  const blocks: PlanBlock[] = [];
  const repeats = new Map<string, number>();
  let used = 0;
  let lastSubject = '';
  let lastTopicId = '';
  const minimumUsefulBlock = 5;

  while (candidates.length && used < remainingBudgetMinutes) {
    const breakCost = blocks.length ? breakMinutes : 0;
    const availableForStudy = remainingBudgetMinutes - used - breakCost;
    if (availableForStudy < minimumUsefulBlock) break;

    const ranked = candidates
      .map((candidate) => {
        const repeat = repeats.get(candidate.topic.id) ?? 0;
        let adjusted = candidate.baseScore - repeat * 15;

        if (lastSubject && candidate.topic.subject === lastSubject) adjusted -= 13;
        if (candidate.topic.id === lastTopicId) adjusted -= 30;

        return { candidate, repeat, adjusted };
      })
      .sort((a, b) => {
        if (b.adjusted !== a.adjusted) return b.adjusted - a.adjusted;
        if (b.candidate.topic.priority !== a.candidate.topic.priority) {
          return b.candidate.topic.priority - a.candidate.topic.priority;
        }
        return a.candidate.topic.name.localeCompare(b.candidate.topic.name);
      });

    const chosen = ranked[0];
    if (!chosen) break;

    const minutes = Math.floor(
      blockDuration(chosen.candidate.topic, targetFocusMinutes, chosen.repeat, availableForStudy),
    );
    if (minutes < minimumUsefulBlock) {
      candidates.splice(candidates.indexOf(chosen.candidate), 1);
      continue;
    }

    if (breakCost) used += breakCost;

    blocks.push({
      id: `${chosen.candidate.topic.id}:${chosen.repeat + 1}`,
      topicId: chosen.candidate.topic.id,
      topicName: chosen.candidate.topic.name,
      subject: chosen.candidate.topic.subject,
      mode: chosen.candidate.mode,
      minutes,
      score: Math.round(chosen.adjusted),
      reasons: chosen.candidate.reasons.slice(0, 3),
      dueQuestionCount: chosen.candidate.dueQuestionCount,
      examDays: chosen.candidate.examDays,
    });

    used += minutes;
    repeats.set(chosen.candidate.topic.id, chosen.repeat + 1);
    lastSubject = chosen.candidate.topic.subject;
    lastTopicId = chosen.candidate.topic.id;

    const maximumBlocks = Math.max(
      1,
      Math.min(3, Math.ceil(chosen.candidate.topic.estimate / targetFocusMinutes)),
    );
    if ((repeats.get(chosen.candidate.topic.id) ?? 0) >= maximumBlocks) {
      candidates.splice(candidates.indexOf(chosen.candidate), 1);
    }
  }

  const plannedStudyMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const plannedBreakMinutes = Math.max(0, blocks.length - 1) * breakMinutes;
  const usedTopicIds = new Set(blocks.map((block) => block.topicId));

  return {
    generatedAt: now,
    budgetMinutes,
    alreadyUsedMinutes,
    remainingBudgetMinutes,
    plannedStudyMinutes,
    plannedBreakMinutes,
    plannedTotalMinutes: plannedStudyMinutes + plannedBreakMinutes,
    targetFocusMinutes,
    breakMinutes,
    blocks,
    nextBlock: blocks[0] ?? null,
    deferredTopicCount: workspace.topics.filter(
      (topic) => topic.snoozeUntil <= now && !usedTopicIds.has(topic.id),
    ).length,
  };
}
