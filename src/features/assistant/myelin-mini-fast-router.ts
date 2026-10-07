import { WorkspaceState } from '@/src/data/schema';

export const MYELIN_MINI_FAST_MODEL_ID = 'myelin-mini-fast-v1' as const;

type FastDecision =
  | {
      version: 1;
      requestId: string;
      route: 'actions';
      confidence: number;
      batch: {
        version: 1;
        requestId: string;
        actions: unknown[];
      };
    }
  | {
      version: 1;
      requestId: string;
      route: 'clarify';
      confidence: number;
      reason:
        | 'missing-date'
        | 'missing-target'
        | 'ambiguous-reference'
        | 'missing-required-detail';
      question: string;
      missingFields: string[];
    }
  | {
      version: 1;
      requestId: string;
      route: 'escalate';
      confidence: number;
      reason:
        | 'ambiguous'
        | 'general-knowledge'
        | 'tutoring'
        | 'complex-reasoning'
        | 'multimodal'
        | 'unsupported-action'
        | 'safety'
        | 'low-confidence';
      note: string;
    };

type FastRouterInput = {
  workspace: WorkspaceState;
  userRequest: string;
  requestId: string;
  currentDate: string;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'my',
  'me',
  'it',
  'is',
  'are',
  'ke',
  'ka',
  'ki',
  'ko',
  'kar',
  'do',
  'kr',
  'please',
]);

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function words(value: string) {
  return normalize(value)
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word));
}

function addDaysIso(date: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const stamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  );
  const next = new Date(stamp);
  return [
    next.getUTCFullYear().toString().padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function detectDueDate(text: string, currentDate: string) {
  const explicit = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (explicit) return explicit;

  if (/\b(?:tomorrow|tmr|kal)\b/.test(text)) {
    return addDaysIso(currentDate, 1) ?? undefined;
  }
  if (/\b(?:today|aaj)\b/.test(text)) {
    return currentDate;
  }
  return undefined;
}

function detectMinutes(text: string) {
  const minuteMatch = /\b(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/.exec(text);
  if (minuteMatch) {
    const value = Number(minuteMatch[1]);
    return value >= 5 && value <= 240 ? value : null;
  }

  const hourMatch = /\b(\d{1,2}(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(text);
  if (hourMatch) {
    const value = Math.round(Number(hourMatch[1]) * 60);
    return value >= 5 && value <= 240 ? value : null;
  }

  return null;
}

function detectPriority(text: string): 1 | 2 | 3 {
  if (/\b(?:high priority|urgent|very important|important)\b/.test(text)) {
    return 3;
  }
  if (/\b(?:low priority|not important)\b/.test(text)) {
    return 1;
  }
  return 2;
}

function detectTaskType(text: string) {
  if (/\b(?:homework|hw)\b/.test(text)) return 'homework' as const;
  if (/\b(?:assignment)\b/.test(text)) return 'assignment' as const;
  if (/\b(?:revise|revision|review)\b/.test(text)) return 'revision' as const;
  if (
    /\b(?:practice|practise|question|questions|qs|numerical|numericals|problem|problems|solve)\b/.test(
      text,
    )
  ) {
    return 'practice' as const;
  }
  return null;
}

function topicMatchScore(query: string, topicName: string) {
  const queryWords = words(query);
  const topicWords = words(topicName);
  const fullTopic = normalize(topicName);

  if (normalize(query).includes(fullTopic)) return 100;

  let score = 0;
  for (const queryWord of queryWords) {
    for (const topicWord of topicWords) {
      if (queryWord === topicWord) {
        score += 8;
        continue;
      }

      if (
        queryWord.length >= 4 &&
        topicWord.length >= 5 &&
        (topicWord.startsWith(queryWord) || queryWord.startsWith(topicWord))
      ) {
        score += 6;
      }
    }
  }

  return score;
}

function resolveTopic(workspace: WorkspaceState, text: string) {
  const scored = workspace.topics
    .map((topic) => ({
      topic,
      score: topicMatchScore(text, topic.name),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { kind: 'none' as const };
  }

  const bestScore = scored[0]!.score;
  const best = scored.filter((item) => item.score === bestScore);
  if (best.length > 1) {
    return {
      kind: 'ambiguous' as const,
      topics: best.map((item) => item.topic),
    };
  }

  return {
    kind: 'one' as const,
    topic: best[0]!.topic,
  };
}

function taskTitle(
  taskType: 'homework' | 'revision' | 'practice' | 'assignment',
  topicName: string,
  text: string,
) {
  if (taskType === 'practice') {
    if (/\b(?:question|questions|qs)\b/.test(text)) {
      return `Practice ${topicName} questions`;
    }
    if (/\b(?:numerical|numericals)\b/.test(text)) {
      return `Practice ${topicName} numericals`;
    }
    return `Practice ${topicName}`;
  }

  if (taskType === 'revision') return `Revise ${topicName}`;
  if (taskType === 'homework') return `${topicName} homework`;
  return `${topicName} assignment`;
}

function escalation(text: string, requestId: string): FastDecision | null {
  if (
    /\b(?:photo|image|screenshot|scan|attached)\b/.test(text) &&
    /\b(?:read|look|extract|add)\b/.test(text)
  ) {
    return {
      version: 1,
      requestId,
      route: 'escalate',
      confidence: 0.99,
      reason: 'multimodal',
      note: 'This request needs image or document understanding.',
    };
  }

  if (
    /\b(?:delete my account|delete everything|delete every task|delete all)\b/.test(
      text,
    )
  ) {
    return {
      version: 1,
      requestId,
      route: 'escalate',
      confidence: 0.99,
      reason: 'unsupported-action',
      note: 'This destructive operation is outside the MYELIN Mini action allowlist.',
    };
  }

  if (/\b(?:explain|teach me|why does|why is|what is|who wrote)\b/.test(text)) {
    return {
      version: 1,
      requestId,
      route: 'escalate',
      confidence: 0.97,
      reason: /\b(?:explain|teach me|why does|why is|what is)\b/.test(text)
        ? 'tutoring'
        : 'general-knowledge',
      note: 'This request needs a stronger knowledge or teaching model.',
    };
  }

  return null;
}

export function localDateKeyFromTimestamp(now: number) {
  const date = new Date(now);
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function tryBuildMyelinMiniFastDecision(
  input: FastRouterInput,
): FastDecision | null {
  const text = normalize(input.userRequest);
  if (!text) return null;

  const escalated = escalation(text, input.requestId);
  if (escalated) return escalated;

  const taskType = detectTaskType(text);
  const topicResult = resolveTopic(input.workspace, text);

  if (taskType) {
    if (topicResult.kind === 'ambiguous') {
      return {
        version: 1,
        requestId: input.requestId,
        route: 'clarify',
        confidence: 0.99,
        reason: 'ambiguous-reference',
        question: 'Which topic do you mean?',
        missingFields: ['topic'],
      };
    }

    if (topicResult.kind === 'none') {
      return {
        version: 1,
        requestId: input.requestId,
        route: 'clarify',
        confidence: 0.96,
        reason: 'missing-target',
        question: 'Which topic is this for?',
        missingFields: ['topic'],
      };
    }

    const minutes = detectMinutes(text);
    if (minutes == null) {
      return {
        version: 1,
        requestId: input.requestId,
        route: 'clarify',
        confidence: 0.96,
        reason: 'missing-required-detail',
        question: 'How many minutes should I set for it?',
        missingFields: ['estimatedMinutes'],
      };
    }

    const topic = topicResult.topic;
    const dueDate = detectDueDate(text, input.currentDate);

    return {
      version: 1,
      requestId: input.requestId,
      route: 'actions',
      confidence: 0.995,
      batch: {
        version: 1,
        requestId: input.requestId,
        actions: [
          {
            type: 'create_task',
            title: taskTitle(taskType, topic.name, text),
            subject: topic.subject,
            topic: { topicId: topic.id },
            taskType,
            ...(dueDate ? { dueDate } : {}),
            estimatedMinutes: minutes,
            priority: detectPriority(text),
            notes: '',
          },
        ],
      },
    };
  }

  if (/\b(?:put|move|set|mark).{0,30}\b(?:review)\b/.test(text)) {
    if (topicResult.kind === 'one') {
      return {
        version: 1,
        requestId: input.requestId,
        route: 'actions',
        confidence: 0.99,
        batch: {
          version: 1,
          requestId: input.requestId,
          actions: [
            {
              type: 'update_topic',
              topic: { topicId: topicResult.topic.id },
              patch: { status: 'review' },
            },
          ],
        },
      };
    }

    return {
      version: 1,
      requestId: input.requestId,
      route: 'clarify',
      confidence: 0.98,
      reason:
        topicResult.kind === 'ambiguous'
          ? 'ambiguous-reference'
          : 'missing-target',
      question:
        topicResult.kind === 'ambiguous'
          ? 'Which topic do you mean?'
          : 'Which topic do you want to move to review?',
      missingFields: ['topic'],
    };
  }

  return null;
}
