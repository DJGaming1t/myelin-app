import { nextMemory, retrievability } from '@/src/features/adaptive/memory-engine';
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
  memory: NonNullable<RecallQuestion['memory']>;
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
  card: Pick<RecallQuestion, 'intervalDays' | 'reps'> & Partial<RecallQuestion>,
  choice: ReviewChoice,
  now = Date.now(),
  evidence: { hintUsed?: boolean } = {},
): ReviewSchedule {
  const grade = choice === 'again' ? 1 : choice === 'practising' ? 2 : 3;
  const memory = nextMemory(card, grade === 3 && evidence.hintUsed ? 2 : grade, now);
  // A 90% target means interval equals stability; Again retains a short learning step.
  const intervalDays = grade === 1 ? 0 : Math.max(1, Math.min(3650, Math.round(memory.stability)));
  return { grade, memory, intervalDays,
    dueAt: now + (grade === 1 ? TEN_MINUTES : intervalDays * DAY),
    label: grade === 1 ? 'Again in about 10 min' : intervalDays === 1 ? 'Review tomorrow' : `Review in ${intervalDays} days` };

}

export function applyReviewGrade(
  topic: Topic,
  card: RecallQuestion,
  choice: ReviewChoice,
  now = Date.now(),
  evidence: { hintUsed?: boolean } = {},
) {
  const schedule = scheduleReview(card, choice, now, evidence);

  card.memory = schedule.memory;
  card.lastGrade = schedule.grade;
  card.lastReviewed = now;
  card.intervalDays = schedule.intervalDays;
  card.dueAt = schedule.dueAt;
  card.reps += 1;

  topic.lastGrade = schedule.grade;
  topic.lastReviewed = now;
  topic.status = 'review';
  topic.postponements = 0;

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
    cardIds?: string[];
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
        .filter((card) => (!options.cardIds || options.cardIds.includes(card.id)) && (options.includeNotDue || isCardReady(topic, card, now)))
        .map((card) => queueItem(topic, card)),
    );

  const cardMap = new Map(workspace.topics.flatMap(t => t.cards.map(c => [c.id, c] as const)));
  const risk = (item: ReviewQueueItem) => 1 - (retrievability(cardMap.get(item.cardId)!, now) ?? 1);
  candidates.sort((a, b) => {
    if (Math.abs(risk(b) - risk(a)) > 0.02) return risk(b) - risk(a);
    const aOverdue = a.reps > 0 && a.dueAt > 0 ? Math.max(0, now - a.dueAt) : 0;
    const bOverdue = b.reps > 0 && b.dueAt > 0 ? Math.max(0, now - b.dueAt) : 0;

    if (bOverdue !== aOverdue) return bOverdue - aOverdue;
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.reps !== b.reps) return a.reps - b.reps;
    return a.prompt.localeCompare(b.prompt);
  });

  const result: ReviewQueueItem[] = [];
  const remaining = [...candidates];
  let previousGroup = '';
  let contrastRun = 0;

  while (remaining.length && result.length < limit) {
    // Pair explicitly confused concepts; after a pair return to the urgency ranking.
    // Never alternate subjects as a proxy for confusion.
    let index = previousGroup && contrastRun === 1
      ? remaining.findIndex(item => cardMap.get(item.cardId)?.confusionGroup?.trim().toLocaleLowerCase() === previousGroup)
      : 0;
    if (index < 0) index = 0;
    const [chosen] = remaining.splice(index, 1);
    if (!chosen) break;
    result.push(chosen);
    const group = cardMap.get(chosen.cardId)?.confusionGroup?.trim().toLocaleLowerCase() ?? '';
    contrastRun = group && group === previousGroup ? contrastRun + 1 : 1;
    previousGroup = group;
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

export function reviewAttemptAlreadyRecorded(workspace: WorkspaceState, attemptId: string) {
  return workspace.history.some((entry) => entry.reviewAttemptId === attemptId);
}

export function confidenceLabel(confidence: Confidence) {
  if (confidence === 'sure') return 'Sure';
  if (confidence === 'partial') return 'Partly sure';
  return 'Unsure';
}
