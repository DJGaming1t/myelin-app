import { sleepingAt } from '@/src/features/adaptive/sleep-engine';
import { forgettingPressure } from '@/src/features/adaptive/memory-engine';
import { StudyTask, Topic, WorkspaceState } from '@/src/data/schema';
import {
  examAppliesToTopic,
  examCalendarDaysUntil,
  examStatus,
} from '@/src/features/exams/exam-engine';
import { buildJointExamPreparationPlan } from '@/src/features/exams/exam-plan-engine';
import {
  freeStudyWindows,
  localDayKey,
  taskPlanningScore,
} from '@/src/features/planning/day-engine';
import { CapacityFeasibilityAnalysis } from '@/src/features/planning/capacity-feasibility';
import { UnifiedWorkloadLedger } from '@/src/features/planning/workload-ledger';
import { taskRemainingMinutes } from '@/src/features/planning/task-engine';

export type PlanMode = 'study' | 'review';
export type PlanSource = 'topic' | 'task';

export type PlanBlock = {
  id: string;
  source: PlanSource;
  topicId: string | null;
  taskId: string | null;
  topicName: string;
  subject: string;
  mode: PlanMode;
  minutes: number;
  score: number;
  reasons: string[];
  dueQuestionCount: number;
  examDays: number | null;
  focusable: boolean;
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
  inboxTaskCount: number;
  overdueTaskCount: number;
  deadlineFeasibility: CapacityFeasibilityAnalysis;
  workloadLedger: UnifiedWorkloadLedger;
};

type Candidate = {
  key: string;
  source: PlanSource;
  topic: Topic | null;
  task: StudyTask | null;
  title: string;
  subject: string;
  priority: 1 | 2 | 3;
  baseScore: number;
  reasons: string[];
  dueQuestionCount: number;
  examDays: number | null;
  mode: PlanMode;
  remainingMinutes: number;
  autopilotMinutes: number;
  autopilotKind: 'preparation' | 'revision' | null;
};

export function startOfLocalDay(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function nextLocalDayStart(now: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}

function calendarDaysBetween(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86400000,
  );
}

export function minutesUsedToday(workspace: WorkspaceState, now: number) {
  const start = startOfLocalDay(now);
  const study = workspace.history
    .filter((entry) => entry.at >= start && entry.at <= now)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const breaks = workspace.breaks
    .filter((entry) => entry.at >= start && entry.at <= now)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const todayKey = localDayKey(now);
  const standaloneTaskFocus = workspace.tasks.reduce(
    (sum, task) =>
      task.focusDayKey === todayKey
        ? sum + (task.focusMinutesForDay ?? 0)
        : sum,
    0,
  );
  return Math.round(study + breaks + standaloneTaskFocus);
}

function nearestExamForTopic(workspace: WorkspaceState, topic: Topic, now: number) {
  return workspace.exams
    .filter(
      (exam) =>
        examStatus(exam.date, now).kind !== 'past' &&
        examAppliesToTopic(exam, topic),
    )
    .sort((a, b) => a.date - b.date)[0] ?? null;
}

function nearestExamForTask(workspace: WorkspaceState, task: StudyTask, now: number) {
  if (task.examId) {
    const direct = workspace.exams.find((exam) => exam.id === task.examId && exam.date >= now);
    if (direct) return direct;
  }
  if (!task.topicId) return null;
  const topic = workspace.topics.find((item) => item.id === task.topicId);
  return topic ? nearestExamForTopic(workspace, topic, now) : null;
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

type TodayAutopilotAllocation = {
  minutes: number;
  preparationMinutes: number;
  revisionMinutes: number;
};

function topicCandidate(
  workspace: WorkspaceState,
  topic: Topic,
  now: number,
  autopilot: TodayAutopilotAllocation | null,
): Candidate | null {
  if (topic.snoozeUntil > now) return null;

  let score = topic.priority * 12 + Math.min(24, (topic.postponements ?? 0) * 6);
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

  const risk = forgettingPressure(topic.cards, now);
  score += Math.min(40, risk * 100);
  if (risk >= 0.1) reasons.unshift('recall may be fading');
  if ((topic.postponements ?? 0) >= 2) reasons.unshift('try a five-minute first step');

  const nearestExam = nearestExamForTopic(workspace, topic, now);
  const examDays = nearestExam ? Math.max(0, examCalendarDaysUntil(nearestExam.date, now)) : null;
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
  if (studiedToday > 0) score -= Math.min(34, Math.round(studiedToday * 0.7));

  if (topic.lastReviewed > 0) {
    const hoursSinceReview = (now - topic.lastReviewed) / 3600000;
    if (hoursSinceReview < 8) score -= 20;
  }

  if (autopilot) {
    score += 48 + Math.min(22, Math.round(autopilot.minutes / 5));
    reasons.unshift(
      `Autopilot planned ${autopilot.minutes} min for this topic today`,
    );
  }

  const mode: PlanMode =
    topicDue ||
    questionCount > 0 ||
    topic.status === 'review' ||
    (autopilot?.revisionMinutes ?? 0) > 0
      ? questionCount > 0 || topic.status === 'review'
        ? 'review'
        : 'study'
      : 'study';

  if (!reasons.length) reasons.push(topic.status === 'new' ? 'ready to start' : 'worth continuing');

  return {
    key: `topic:${topic.id}`,
    source: 'topic',
    topic,
    task: null,
    title: topic.name,
    subject: topic.subject,
    priority: topic.priority,
    baseScore: score,
    reasons,
    dueQuestionCount: questionCount,
    examDays,
    mode,
    remainingMinutes: autopilot
      ? Math.max(5, Math.min(topic.estimate, autopilot.minutes))
      : topic.estimate,
    autopilotMinutes: autopilot?.minutes ?? 0,
    autopilotKind: autopilot
      ? autopilot.revisionMinutes > autopilot.preparationMinutes
        ? 'revision'
        : 'preparation'
      : null,
  };
}

function taskCandidate(
  workspace: WorkspaceState,
  task: StudyTask,
  now: number,
  autopilot: TodayAutopilotAllocation | null,
): Candidate | null {
  if (task.status !== 'open' || task.postponedUntil > now) return null;
  const endToday = nextLocalDayStart(now);
  if (
    task.planState === 'scheduled' &&
    task.scheduledStart >= endToday
  ) {
    return null;
  }

  const linkedTopic = task.topicId
    ? workspace.topics.find((topic) => topic.id === task.topicId) ?? null
    : null;
  const reasons: string[] = [];
  let score = taskPlanningScore(workspace, task, now);
  if (linkedTopic) {
    const risk = forgettingPressure(linkedTopic.cards, now);
    score += Math.min(40, risk * 100);
    if (risk >= 0.1) reasons.push('recall may be fading');
  }
  if ((task.postponements ?? 0) >= 2) reasons.push('try a five-minute first step');

  if (task.dueAt > 0) {
    const days = calendarDaysBetween(now, task.dueAt);
    if (task.dueAt < now) reasons.push('overdue');
    else if (days === 0) reasons.push('due today');
    else if (days === 1) reasons.push('due tomorrow');
    else if (days <= 7) reasons.push(`due in ${days} days`);
  }

  if (task.planState === 'scheduled' && task.scheduledStart > 0) {
    const minutesAway = Math.round((task.scheduledStart - now) / 60000);
    if (minutesAway <= 30) {
      score += 30;
      reasons.unshift(minutesAway <= 0 ? 'planned time has arrived' : 'planned soon');
    } else {
      reasons.push('scheduled today');
    }
  } else if (task.planState === 'today') {
    reasons.push('chosen for today');
  }

  const exam = nearestExamForTask(workspace, task, now);
  const examDays = exam ? Math.max(0, examCalendarDaysUntil(exam.date, now)) : null;
  if (exam && examDays !== null && examDays <= 7) {
    reasons.push(examDays === 1 ? `${exam.name} tomorrow` : `${exam.name} in ${examDays} days`);
  }

  if (autopilot) {
    score += 42 + Math.min(18, Math.round(autopilot.minutes / 5));
    reasons.unshift(
      `Autopilot planned ${autopilot.minutes} min for this topic today`,
    );
  }

  const questionCount = linkedTopic ? dueQuestions(linkedTopic, now) : 0;
  const mode: PlanMode =
    task.type === 'revision' && linkedTopic && questionCount > 0 ? 'review' : 'study';

  if (!reasons.length) {
    reasons.push(task.type === 'homework' ? 'homework waiting' : `${task.type} task`);
  }

  return {
    key: `task:${task.id}`,
    source: 'task',
    topic: linkedTopic,
    task,
    title: task.title,
    subject: task.subject || linkedTopic?.subject || 'Study task',
    priority: task.priority,
    baseScore: score,
    reasons,
    dueQuestionCount: questionCount,
    examDays,
    mode,
    remainingMinutes: taskRemainingMinutes(task) || task.estimatedMinutes || 25,
    autopilotMinutes: autopilot?.minutes ?? 0,
    autopilotKind: autopilot
      ? autopilot.revisionMinutes > autopilot.preparationMinutes
        ? 'revision'
        : 'preparation'
      : null,
  };
}

const AUTOPILOT_HORIZON_DAYS = 120;

function todayAutopilotAllocations(
  workspace: WorkspaceState,
  now: number,
) {
  const plan = buildJointExamPreparationPlan(workspace, now, {
    maxDays: AUTOPILOT_HORIZON_DAYS,
  });
  const today = startOfLocalDay(now);
  const planDay = plan.days.find((day) => day.day === today);
  const allocations = new Map<string, TodayAutopilotAllocation>();

  for (const block of planDay?.blocks ?? []) {
    const current = allocations.get(block.topicId) ?? {
      minutes: 0,
      preparationMinutes: 0,
      revisionMinutes: 0,
    };
    current.minutes += block.minutes;
    if (block.kind === 'revision') current.revisionMinutes += block.minutes;
    else current.preparationMinutes += block.minutes;
    allocations.set(block.topicId, current);
  }

  return { plan, allocations };
}

export function buildTodayPlan(
  workspace: WorkspaceState,
  now = Date.now(),
  budgetOverride?: number,
): TodayPlan {
  const configuredBudgetMinutes = Math.max(
    10,
    Math.min(720, Math.round(budgetOverride ?? workspace.settings.dailyMinutes)),
  );
  const rawUsedMinutes = minutesUsedToday(workspace, now);
  const freeWindows = freeStudyWindows(workspace, now, {
    includeScheduledTasks: false,
    from: now,
    minMinutes: 5,
  });
  const futureFreeMinutes = sleepingAt(workspace.settings, now) ? 0 : freeWindows.reduce((sum, window) => sum + window.minutes, 0);
  const budgetMinutes = Math.max(
    0,
    Math.min(configuredBudgetMinutes, rawUsedMinutes + futureFreeMinutes),
  );
  const alreadyUsedMinutes = Math.min(budgetMinutes, rawUsedMinutes);
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

  const autopilot = todayAutopilotAllocations(workspace, now);

  const candidates: Candidate[] = [
    ...workspace.tasks
      .map((task) =>
        taskCandidate(
          workspace,
          task,
          now,
          task.topicId ? autopilot.allocations.get(task.topicId) ?? null : null,
        ),
      )
      .filter((candidate): candidate is Candidate => Boolean(candidate)),
    ...workspace.topics
      .map((topic) =>
        topicCandidate(
          workspace,
          topic,
          now,
          autopilot.allocations.get(topic.id) ?? null,
        ),
      )
      .filter((candidate): candidate is Candidate => Boolean(candidate)),
  ];

  // A task linked to a topic represents concrete work and should prevent the
  // generic topic recommendation from duplicating the same immediate intent.
  const linkedTaskTopicIds = new Set(
    candidates
      .filter((candidate) => candidate.source === 'task' && candidate.topic?.id)
      .map((candidate) => candidate.topic!.id),
  );
  const deduped = candidates.filter(
    (candidate) =>
      candidate.source === 'task' ||
      !linkedTaskTopicIds.has(candidate.topic?.id ?? ''),
  );

  const blocks: PlanBlock[] = [];
  const repeats = new Map<string, number>();
  const allocatedMinutes = new Map<string, number>();
  const windowRemaining = freeWindows.map((window) => window.minutes);
  let used = 0;
  let lastKey = '';
  const minimumUsefulBlock = 5;

  while (deduped.length && used < remainingBudgetMinutes) {
    const breakCost = blocks.length ? breakMinutes : 0;
    const budgetAvailable = remainingBudgetMinutes - used - breakCost;
    const largestWindow = windowRemaining.length ? Math.max(...windowRemaining) : 0;
    const availableForStudy = Math.min(budgetAvailable, largestWindow - breakCost);
    if (availableForStudy < minimumUsefulBlock) break;

    const ranked = deduped
      .map((candidate) => {
        const repeat = repeats.get(candidate.key) ?? 0;
        let adjusted = candidate.baseScore - repeat * 15;

        // Prefer work that fits this opening. A postponed task still needs a gentle start.
        if (candidate.remainingMinutes <= availableForStudy) adjusted += 8;
        if (candidate.key === lastKey) adjusted -= 30;

        return { candidate, repeat, adjusted };
      })
      .sort((a, b) => {
        if (b.adjusted !== a.adjusted) return b.adjusted - a.adjusted;
        if (b.candidate.priority !== a.candidate.priority) {
          return b.candidate.priority - a.candidate.priority;
        }
        return a.candidate.title.localeCompare(b.candidate.title);
      });

    const chosen = ranked[0];
    if (!chosen) break;

    const alreadyAllocated = allocatedMinutes.get(chosen.candidate.key) ?? 0;
    const candidateRemaining = Math.max(
      minimumUsefulBlock,
      chosen.candidate.remainingMinutes - alreadyAllocated,
    );
    const minutes = Math.floor(
      Math.min(targetFocusMinutes, candidateRemaining, availableForStudy),
    );
    if (minutes < minimumUsefulBlock) {
      deduped.splice(deduped.indexOf(chosen.candidate), 1);
      continue;
    }

    if (breakCost) used += breakCost;

    const windowIndex = windowRemaining.findIndex((minutesLeft) => minutesLeft >= minutes + breakCost);
    if (windowIndex < 0) {
      deduped.splice(deduped.indexOf(chosen.candidate), 1);
      continue;
    }
    windowRemaining[windowIndex] = Math.max(
      0,
      windowRemaining[windowIndex]! - minutes - (blocks.length ? breakMinutes : 0),
    );

    blocks.push({
      id: `${chosen.candidate.key}:${chosen.repeat + 1}`,
      source: chosen.candidate.source,
      topicId: chosen.candidate.topic?.id ?? null,
      taskId: chosen.candidate.task?.id ?? null,
      topicName: chosen.candidate.title,
      subject: chosen.candidate.subject,
      mode: chosen.candidate.mode,
      minutes,
      score: Math.round(chosen.adjusted),
      reasons: chosen.candidate.reasons.slice(0, 3),
      dueQuestionCount: chosen.candidate.dueQuestionCount,
      examDays: chosen.candidate.examDays,
      focusable:
        chosen.candidate.source === 'task' ||
        Boolean(chosen.candidate.topic),
    });

    used += minutes;
    repeats.set(chosen.candidate.key, chosen.repeat + 1);
    allocatedMinutes.set(
      chosen.candidate.key,
      alreadyAllocated + minutes,
    );
    lastKey = chosen.candidate.key;

    const fullyAllocated =
      (allocatedMinutes.get(chosen.candidate.key) ?? 0) >=
      chosen.candidate.remainingMinutes;
    if (fullyAllocated || (repeats.get(chosen.candidate.key) ?? 0) >= 4) {
      deduped.splice(deduped.indexOf(chosen.candidate), 1);
    }
  }

  const plannedStudyMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const plannedBreakMinutes = Math.max(0, blocks.length - 1) * breakMinutes;
  const usedTopicIds = new Set(blocks.flatMap((block) => (block.topicId ? [block.topicId] : [])));
  const todayStart = startOfLocalDay(now);
  const workloadPlan = autopilot.plan;
  const deadlineFeasibility = workloadPlan.feasibility;

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
    inboxTaskCount: workspace.tasks.filter(
      (task) => task.status === 'open' && task.planState === 'inbox' && task.postponedUntil <= now,
    ).length,
    overdueTaskCount: workspace.tasks.filter(
      (task) =>
        task.status === 'open' &&
        task.dueAt > 0 &&
        task.dueAt < todayStart,
    ).length,
    deadlineFeasibility,
    workloadLedger: workloadPlan.workloadLedger,
  };
}
