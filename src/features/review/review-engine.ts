import {
  Confidence,
  RecallQuestion,
  ReviewGrade,
  Topic,
  WorkspaceState,
} from '@/src/data/schema';

export type ReviewChoice = 'again' | 'practising' | 'good';

export type ReviewQueueItem = {
  topicId: string;
  cardId: string;
  topicName: string;
  subject: string;
  prompt: string;
  priority: Topic['priority'];
  dueAt: number;
  reps: number;
};

export type ReviewSchedule = {
  grade: ReviewGrade;
  intervalDays: number;
  dueAt: number;
  label: string;
};

const DAY = 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

export function isCardReady(topic: Topic, card: RecallQuestion, now = Date.now()) {
  if (card.reps === 0) return topic.status !== 'new';
  return card.dueAt === 0 || card.dueAt <= now;
}

export function scheduleReview(
  card: Pick<RecallQuestion, 'intervalDays' | 'reps'>,
  choice: ReviewChoice,
  now = Date.now(),
): ReviewSchedule {
  const previous = Math.max(0, card.intervalDays);

  if (choice === 'again') {
    return {
      grade: 1,
      intervalDays: 0,
      dueAt: now + TEN_MINUTES,
      label: 'Again in about 10 min',
    };
  }

  if (choice === 'practising') {
    const intervalDays =
      card.reps === 0 ? 1 : Math.max(1, Math.min(90, Math.round(Math.max(1, previous) * 1.8)));

    return {
      grade: 2,
      intervalDays,
      dueAt: now + intervalDays * DAY,
      label: intervalDays === 1 ? 'Practise tomorrow' : `Practise in ${intervalDays} days`,
    };
  }

  const intervalDays =
    card.reps === 0 ? 3 : Math.max(3, Math.min(365, Math.round(Math.max(1, previous) * 2.5)));

  return {
    grade: 3,
    intervalDays,
    dueAt: now + intervalDays * DAY,
    label: intervalDays === 1 ? 'Good for 1 day' : `Good for ${intervalDays} days`,
  };
}

export function applyReviewGrade(
  topic: Topic,
  card: RecallQuestion,
  choice: ReviewChoice,
  now = Date.now(),
) {
  const schedule = scheduleReview(card, choice, now);

  card.lastGrade = schedule.grade;
  card.lastReviewed = now;
  card.intervalDays = schedule.intervalDays;
  card.dueAt = schedule.dueAt;
  card.reps += 1;

  topic.lastGrade = schedule.grade;
  topic.lastReviewed = now;
  topic.status = 'review';

  const reviewedCards = topic.cards.filter((item) => item.reps > 0);
  const nextDue = reviewedCards
    .map((item) => item.dueAt)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)[0];

  topic.dueAt = nextDue ?? 0;
  topic.intervalDays = reviewedCards.length
    ? Math.min(...reviewedCards.map((item) => item.intervalDays))
    : 0;

  return schedule;
}

function queueItem(topic: Topic, card: RecallQuestion): ReviewQueueItem {
  return {
    topicId: topic.id,
    cardId: card.id,
    topicName: topic.name,
    subject: topic.subject,
    prompt: card.prompt,
    priority: topic.priority,
    dueAt: card.dueAt,
    reps: card.reps,
  };
}

export function buildReviewQueue(
  workspace: WorkspaceState,
  options: {
    now?: number;
    topicId?: string;
    includeNotDue?: boolean;
    limit?: number;
  } = {},
) {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.min(100, options.limit ?? 30));

  const candidates = workspace.topics
    .filter((topic) => !options.topicId || topic.id === options.topicId)
    .flatMap((topic) =>
      topic.cards
        .filter((card) => options.includeNotDue || isCardReady(topic, card, now))
        .map((card) => queueItem(topic, card)),
    );

  candidates.sort((a, b) => {
    const aOverdue = a.reps > 0 && a.dueAt > 0 ? Math.max(0, now - a.dueAt) : 0;
    const bOverdue = b.reps > 0 && b.dueAt > 0 ? Math.max(0, now - b.dueAt) : 0;

    if (bOverdue !== aOverdue) return bOverdue - aOverdue;
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.reps !== b.reps) return a.reps - b.reps;
    return a.prompt.localeCompare(b.prompt);
  });

  const result: ReviewQueueItem[] = [];
  const remaining = [...candidates];
  let previousSubject = '';

  while (remaining.length && result.length < limit) {
    let index = remaining.findIndex((item) => item.subject !== previousSubject);
    if (index < 0) index = 0;
    const [chosen] = remaining.splice(index, 1);
    if (!chosen) break;
    result.push(chosen);
    previousSubject = chosen.subject;
  }

  return result;
}

export function reviewCounts(workspace: WorkspaceState, now = Date.now()) {
  let due = 0;
  let total = 0;

  for (const topic of workspace.topics) {
    for (const card of topic.cards) {
      total += 1;
      if (isCardReady(topic, card, now)) due += 1;
    }
  }

  return { due, total };
}

export function confidenceLabel(confidence: Confidence) {
  if (confidence === 'sure') return 'Sure';
  if (confidence === 'partial') return 'Partly sure';
  return 'Unsure';
}
