import {
  Mistake,
  MistakeReason,
  WorkspaceState,
} from '@/src/data/schema';

const DAY = 24 * 60 * 60 * 1000;

export type MistakeInput = {
  topicId: string;
  cardId: string | null;
  prompt: string;
  detail: string;
  correction: string;
  reason: MistakeReason;
};

export type MistakeRetestResult = 'miss' | 'win';

export type MistakeRetestOutcome = {
  resolved: boolean;
  countedWin: boolean;
  wins: number;
  dueAt: number;
  label: string;
};

function recordId(prefix: string, now = Date.now()) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function localDayKey(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function createMistake(
  input: MistakeInput,
  now = Date.now(),
  id?: string,
): Mistake {
  return {
    id: id ?? recordId('mistake', now),
    topicId: input.topicId,
    cardId: input.cardId,
    prompt: input.prompt.trim(),
    detail: input.detail.trim(),
    correction: input.correction.trim(),
    reason: input.reason,
    createdAt: now,
    dueAt: now,
    resolvedAt: 0,
    wins: 0,
    lastWinDay: '',
    intervalDays: 0,
  };
}

export function applyMistakeInput(mistake: Mistake, input: MistakeInput) {
  mistake.topicId = input.topicId;
  mistake.cardId = input.cardId;
  mistake.prompt = input.prompt.trim();
  mistake.detail = input.detail.trim();
  mistake.correction = input.correction.trim();
  mistake.reason = input.reason;
}

export function findMistake(workspace: WorkspaceState, mistakeId: string) {
  return workspace.mistakes.find((mistake) => mistake.id === mistakeId) ?? null;
}

export function findOpenMistakeForCard(
  workspace: WorkspaceState,
  topicId: string,
  cardId: string,
) {
  return (
    workspace.mistakes.find(
      (mistake) =>
        mistake.topicId === topicId &&
        mistake.cardId === cardId &&
        mistake.resolvedAt === 0,
    ) ?? null
  );
}

export function captureRecallMistake(
  workspace: WorkspaceState,
  input: {
    topicId: string;
    cardId: string;
    prompt: string;
    response: string;
    correction: string;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  const existing = findOpenMistakeForCard(workspace, input.topicId, input.cardId);

  if (existing) {
    existing.prompt = input.prompt.trim();
    existing.detail = input.response.trim();
    existing.correction = input.correction.trim();
    existing.reason = 'recall';
    existing.dueAt = Math.min(existing.dueAt || now, now);
    existing.resolvedAt = 0;
    return existing;
  }

  const mistake = createMistake(
    {
      topicId: input.topicId,
      cardId: input.cardId,
      prompt: input.prompt,
      detail: input.response,
      correction: input.correction,
      reason: 'recall',
    },
    now,
  );

  workspace.mistakes.push(mistake);
  return mistake;
}

export function applyMistakeRetest(
  mistake: Mistake,
  result: MistakeRetestResult,
  now = Date.now(),
): MistakeRetestOutcome {
  if (mistake.resolvedAt > 0) {
    return {
      resolved: true,
      countedWin: false,
      wins: mistake.wins,
      dueAt: 0,
      label: 'Already resolved',
    };
  }

  if (result === 'miss') {
    mistake.wins = 0;
    mistake.lastWinDay = '';
    mistake.resolvedAt = 0;
    mistake.intervalDays = 1;
    mistake.dueAt = now + DAY;

    return {
      resolved: false,
      countedWin: false,
      wins: 0,
      dueAt: mistake.dueAt,
      label: 'Retry tomorrow',
    };
  }

  const day = localDayKey(now);
  if (mistake.lastWinDay === day) {
    mistake.dueAt = Math.max(mistake.dueAt, now + DAY);
    mistake.intervalDays = Math.max(1, mistake.intervalDays);

    return {
      resolved: false,
      countedWin: false,
      wins: mistake.wins,
      dueAt: mistake.dueAt,
      label: 'One win per day — retest tomorrow',
    };
  }

  mistake.wins = Math.min(2, mistake.wins + 1);
  mistake.lastWinDay = day;

  if (mistake.wins >= 2) {
    mistake.resolvedAt = now;
    mistake.dueAt = 0;
    mistake.intervalDays = 0;

    return {
      resolved: true,
      countedWin: true,
      wins: 2,
      dueAt: 0,
      label: 'Resolved after two spaced wins',
    };
  }

  mistake.intervalDays = 2;
  mistake.dueAt = now + 2 * DAY;

  return {
    resolved: false,
    countedWin: true,
    wins: mistake.wins,
    dueAt: mistake.dueAt,
    label: 'First win — prove it again in 2 days',
  };
}

export function reopenMistake(mistake: Mistake, now = Date.now()) {
  mistake.resolvedAt = 0;
  mistake.wins = 0;
  mistake.lastWinDay = '';
  mistake.intervalDays = 0;
  mistake.dueAt = now;
}

export function deleteMistakeFromWorkspace(
  workspace: WorkspaceState,
  mistakeId: string,
) {
  const before = workspace.mistakes.length;
  workspace.mistakes = workspace.mistakes.filter((mistake) => mistake.id !== mistakeId);
  if (workspace.mistakes.length === before) return false;

  for (const session of workspace.history) {
    if (session.mistakeId === mistakeId) delete session.mistakeId;
  }

  return true;
}

export function buildMistakeRetestQueue(
  workspace: WorkspaceState,
  now = Date.now(),
) {
  return workspace.mistakes
    .filter((mistake) => mistake.resolvedAt === 0 && (mistake.dueAt === 0 || mistake.dueAt <= now))
    .sort((a, b) => {
      const aOverdue = a.dueAt > 0 ? Math.max(0, now - a.dueAt) : Number.MAX_SAFE_INTEGER;
      const bOverdue = b.dueAt > 0 ? Math.max(0, now - b.dueAt) : Number.MAX_SAFE_INTEGER;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;

      const aTopic = workspace.topics.find((topic) => topic.id === a.topicId);
      const bTopic = workspace.topics.find((topic) => topic.id === b.topicId);
      const priorityDelta = (bTopic?.priority ?? 1) - (aTopic?.priority ?? 1);
      if (priorityDelta !== 0) return priorityDelta;

      if (a.wins !== b.wins) return a.wins - b.wins;
      return a.createdAt - b.createdAt;
    });
}

export function mistakeCounts(workspace: WorkspaceState, now = Date.now()) {
  const open = workspace.mistakes.filter((mistake) => mistake.resolvedAt === 0);
  return {
    due: open.filter((mistake) => mistake.dueAt === 0 || mistake.dueAt <= now).length,
    open: open.length,
    resolved: workspace.mistakes.filter((mistake) => mistake.resolvedAt > 0).length,
    total: workspace.mistakes.length,
  };
}
