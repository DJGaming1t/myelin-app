import {
  Priority,
  RecallQuestion,
  Topic,
  TopicStatus,
  WorkspaceState,
} from '@/src/data/schema';

export type TopicInput = {
  name: string;
  subject: string;
  status: TopicStatus;
  priority: Priority;
  estimate: number;
  notes: string;
};

export type QuestionInput = {
  confusionGroup?: string;
  prompt: string;
  answer: string;
  hint: string;
};

function clean(value: string) {
  return value.trim();
}

export function makeRecordId(prefix: string, now = Date.now()) {
  const entropy = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${now.toString(36)}_${entropy}`;
}

export function createTopic(input: TopicInput, now = Date.now(), id?: string): Topic {
  return {
    id: id ?? makeRecordId('topic', now),
    name: clean(input.name),
    subject: clean(input.subject),
    createdAt: now,
    status: input.status,
    priority: input.priority,
    estimate: Math.max(5, Math.min(240, Math.round(input.estimate))),
    notes: input.notes.trim(),
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  };
}

export function applyTopicInput(topic: Topic, input: TopicInput) {
  topic.name = clean(input.name);
  topic.subject = clean(input.subject);
  topic.status = input.status;
  topic.priority = input.priority;
  topic.estimate = Math.max(5, Math.min(240, Math.round(input.estimate)));
  topic.notes = input.notes.trim();
}

export function createQuestion(
  input: QuestionInput,
  now = Date.now(),
  id?: string,
): RecallQuestion {
  return {
    id: id ?? makeRecordId('card', now),
    prompt: clean(input.prompt),
    confusionGroup: (input.confusionGroup ?? '').trim().slice(0, 80),
    answer: input.answer.trim(),
    hint: input.hint.trim(),
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    reps: 0,
  };
}

export function applyQuestionInput(question: RecallQuestion, input: QuestionInput) {
  question.prompt = clean(input.prompt);
  question.confusionGroup = (input.confusionGroup ?? '').trim().slice(0, 80);
  question.answer = input.answer.trim();
  question.hint = input.hint.trim();
}

export function findTopic(workspace: WorkspaceState, topicId: string) {
  return workspace.topics.find((topic) => topic.id === topicId) ?? null;
}

export function findQuestion(topic: Topic, questionId: string) {
  return topic.cards.find((question) => question.id === questionId) ?? null;
}

export function deleteQuestionFromWorkspace(
  workspace: WorkspaceState,
  topicId: string,
  questionId: string,
) {
  const topic = findTopic(workspace, topicId);
  if (!topic) return false;

  const before = topic.cards.length;
  topic.cards = topic.cards.filter((question) => question.id !== questionId);
  if (topic.cards.length === before) return false;

  for (const mistake of workspace.mistakes) {
    if (mistake.cardId === questionId) mistake.cardId = null;
  }

  for (const session of workspace.history) {
    if (session.cardId === questionId) delete session.cardId;
  }

  return true;
}

export function deleteTopicFromWorkspace(workspace: WorkspaceState, topicId: string) {
  const before = workspace.topics.length;
  workspace.topics = workspace.topics.filter((topic) => topic.id !== topicId);
  if (workspace.topics.length === before) return false;

  workspace.mistakes = workspace.mistakes.filter((mistake) => mistake.topicId !== topicId);
  workspace.history = workspace.history.filter((session) => session.topicId !== topicId);

  for (const exam of workspace.exams) {
    exam.topicIds = exam.topicIds.filter((id) => id !== topicId);
  }

  return true;
}

export type TopicFilter = {
  query?: string;
  status?: TopicStatus | 'all';
  subject?: string | 'all';
};

export function filterTopics(topics: Topic[], filter: TopicFilter) {
  const query = (filter.query ?? '').trim().toLocaleLowerCase();
  const status = filter.status ?? 'all';
  const subject = filter.subject ?? 'all';

  return topics
    .filter((topic) => status === 'all' || topic.status === status)
    .filter((topic) => subject === 'all' || topic.subject === subject)
    .filter((topic) => {
      if (!query) return true;
      const haystack = [
        topic.name,
        topic.subject,
        topic.notes,
        ...topic.cards.flatMap((card) => [card.prompt, card.answer, card.hint]),
      ]
        .join('\n')
        .toLocaleLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      return a.name.localeCompare(b.name);
    });
}

export function topicSubjects(topics: Topic[]) {
  return [...new Set(topics.map((topic) => topic.subject).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
