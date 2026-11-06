import { Topic, WorkspaceState } from '@/src/data/schema';
import { forgettingPressure } from '@/src/features/adaptive/memory-engine';
import { examAppliesToTopic, examCalendarDaysUntil } from '@/src/features/exams/exam-engine';

export type TopicAdaptationInsight = {
  topicId: string;
  topicName: string;
  subject: string;
  title: string;
  summary: string;
  actionableAdvice: string;
  urgencyScore: number;
  metrics: {
    urgency: string;
    mistakeDensity: string;
    examWeight: string;
  };
};

export function buildTopicAdaptationInsight(
  workspace: WorkspaceState,
  topicId: string,
  now = Date.now(),
): TopicAdaptationInsight | null {
  const topic = workspace.topics.find((item) => item.id === topicId);
  if (!topic) return null;
  return scoreTopicAdaptation(workspace, topic, now);
}

export function buildTopicAdaptationInsights(
  workspace: WorkspaceState,
  now = Date.now(),
): TopicAdaptationInsight[] {
  return workspace.topics
    .map((topic) => scoreTopicAdaptation(workspace, topic, now))
    .filter((item): item is TopicAdaptationInsight => item !== null)
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

function scoreTopicAdaptation(
  workspace: WorkspaceState,
  topic: Topic,
  now: number,
): TopicAdaptationInsight | null {
  const openMistakes = workspace.mistakes.filter(
    (m) => m.topicId === topic.id && !m.resolvedAt,
  ).length;
  const dueCards = topic.cards.filter((c) => c.dueAt <= now).length;
  const pressure = forgettingPressure(topic.cards, now);
  const nearestExamDays = workspace.exams
    .filter((exam) => examAppliesToTopic(exam, topic))
    .map((exam) => examCalendarDaysUntil(exam.date, now))
    .filter((days) => days >= 0)
    .sort((a, b) => a - b)[0];

  if (openMistakes === 0 && dueCards === 0 && pressure < 0.35 && nearestExamDays === undefined) {
    return null;
  }

  const urgencyScore =
    openMistakes * 24 +
    dueCards * 12 +
    Math.round(pressure * 40) +
    (nearestExamDays !== undefined ? Math.max(0, 30 - nearestExamDays) : 0);

  const title =
    openMistakes > 0
      ? 'Error patterns ready to clear'
      : dueCards > 0
        ? 'Recall window open'
        : 'Steady consolidation';

  const summary =
    openMistakes > 0
      ? `${openMistakes} open ${openMistakes === 1 ? 'mistake needs' : 'mistakes need'} a clean retest before adding new material.`
      : dueCards > 0
        ? `${dueCards} saved ${dueCards === 1 ? 'prompt is' : 'prompts are'} due for retrieval practice.`
        : `Memory trace is stabilizing (${Math.round((1 - pressure) * 100)}% estimated retention).`;

  const actionableAdvice =
    openMistakes > 0
      ? 'Run a short mistake retest or unhinted recall pass next.'
      : dueCards > 0
        ? 'Attempt recall before checking notes to strengthen retrieval.'
        : 'Keep blocks concise and interleave with a second subject.';

  return {
    topicId: topic.id,
    topicName: topic.name,
    subject: topic.subject,
    title,
    summary,
    actionableAdvice,
    urgencyScore,
    metrics: {
      urgency: pressure >= 0.6 ? 'High' : pressure >= 0.3 ? 'Moderate' : 'Calm',
      mistakeDensity: openMistakes > 0 ? `${openMistakes} open` : 'Clear',
      examWeight: nearestExamDays !== undefined ? `${nearestExamDays}d` : 'Flexible',
    },
  };
}
