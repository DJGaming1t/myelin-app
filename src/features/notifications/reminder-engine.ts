import { WorkspaceState } from '@/src/data/schema';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import { isCardReady } from '@/src/features/review/review-engine';

export type ReminderVoice = 'calm' | 'signal' | 'spark';
export type ReminderKind = 'review' | 'exam' | 'study';

export type ReminderSettings = {
  enabled: boolean;
  reviewEnabled: boolean;
  examEnabled: boolean;
  studyBlockEnabled: boolean;
  studyLeadMinutes: number;
  voice: ReminderVoice;
  sound: boolean;
  reviewTimeMinutes: number;
  examTimeMinutes: number;
  quietStartMinutes: number;
  quietEndMinutes: number;
  examOffsets: number[];
};

export type PlannedReminder = {
  key: string;
  kind: ReminderKind;
  at: number;
  title: string;
  body: string;
  href: '/(app)/review' | '/(app)/exams' | '/(app)/today/day-map';
  accent: 'warm' | 'signal' | 'spark';
  data: Record<string, string | number>;
};

export const MAX_SCHEDULED_REMINDERS = 28;
export const MAX_REMINDERS_PER_DAY = 2;
export const REVIEW_HORIZON_DAYS = 7;

export const defaultReminderSettings = (): ReminderSettings => ({
  enabled: false,
  reviewEnabled: true,
  examEnabled: true,
  studyBlockEnabled: true,
  studyLeadMinutes: 10,
  voice: 'calm',
  sound: false,
  reviewTimeMinutes: 19 * 60 + 15,
  examTimeMinutes: 18 * 60 + 30,
  quietStartMinutes: 21 * 60 + 30,
  quietEndMinutes: 7 * 60,
  examOffsets: [7, 3, 1],
});

export function clampTimeMinutes(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1439, Math.round(value)));
}

export function normalizeReminderSettings(
  value: Partial<ReminderSettings> | null | undefined,
): ReminderSettings {
  const defaults = defaultReminderSettings();
  const voice: ReminderVoice =
    value?.voice === 'signal' || value?.voice === 'spark' || value?.voice === 'calm'
      ? value.voice
      : defaults.voice;

  const examOffsets = Array.from(
    new Set(
      (Array.isArray(value?.examOffsets) ? value!.examOffsets : defaults.examOffsets)
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 30)
        .map((item) => Number(item)),
    ),
  )
    .sort((a, b) => b - a)
    .slice(0, 6);

  return {
    enabled: value?.enabled === true,
    reviewEnabled: value?.reviewEnabled !== false,
    examEnabled: value?.examEnabled !== false,
    studyBlockEnabled: value?.studyBlockEnabled !== false,
    studyLeadMinutes: Math.max(
      0,
      Math.min(60, Math.round(value?.studyLeadMinutes ?? defaults.studyLeadMinutes)),
    ),
    voice,
    sound: value?.sound === true,
    reviewTimeMinutes: clampTimeMinutes(
      value?.reviewTimeMinutes ?? defaults.reviewTimeMinutes,
    ),
    examTimeMinutes: clampTimeMinutes(
      value?.examTimeMinutes ?? defaults.examTimeMinutes,
    ),
    quietStartMinutes: clampTimeMinutes(
      value?.quietStartMinutes ?? defaults.quietStartMinutes,
    ),
    quietEndMinutes: clampTimeMinutes(
      value?.quietEndMinutes ?? defaults.quietEndMinutes,
    ),
    examOffsets: examOffsets.length ? examOffsets : defaults.examOffsets,
  };
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
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

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function atLocalMinutes(dayTimestamp: number, minutes: number) {
  const day = new Date(dayTimestamp);
  const normalized = clampTimeMinutes(minutes);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(normalized / 60),
    normalized % 60,
    0,
    0,
  ).getTime();
}

function minuteOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

export function isInQuietHours(
  timestamp: number,
  quietStartMinutes: number,
  quietEndMinutes: number,
) {
  const start = clampTimeMinutes(quietStartMinutes);
  const end = clampTimeMinutes(quietEndMinutes);
  if (start === end) return false;

  const minute = minuteOfDay(timestamp);
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function moveOutOfQuietHours(
  timestamp: number,
  quietStartMinutes: number,
  quietEndMinutes: number,
) {
  if (!isInQuietHours(timestamp, quietStartMinutes, quietEndMinutes)) {
    return timestamp;
  }

  const start = clampTimeMinutes(quietStartMinutes);
  const end = clampTimeMinutes(quietEndMinutes);
  const currentMinute = minuteOfDay(timestamp);
  const date = new Date(timestamp);

  if (start < end || currentMinute < end) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Math.floor(end / 60),
      end % 60,
      0,
      0,
    ).getTime();
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    Math.floor(end / 60),
    end % 60,
    0,
    0,
  ).getTime();
}

function dueReviewSummary(workspace: WorkspaceState, at: number) {
  const candidates: Array<{
    topicId: string;
    topicName: string;
    dueAt: number;
    type: 'card' | 'mistake';
  }> = [];

  for (const topic of workspace.topics) {
    for (const card of topic.cards) {
      if (!isCardReady(topic, card, at)) continue;
      candidates.push({
        topicId: topic.id,
        topicName: topic.name,
        dueAt: card.dueAt || topic.dueAt || topic.createdAt,
        type: 'card',
      });
    }
  }

  for (const mistake of workspace.mistakes) {
    if (mistake.resolvedAt > 0 || mistake.dueAt > at) continue;
    const topic = workspace.topics.find((item) => item.id === mistake.topicId);
    candidates.push({
      topicId: mistake.topicId,
      topicName: topic?.name || 'Mistake review',
      dueAt: mistake.dueAt || mistake.createdAt,
      type: 'mistake',
    });
  }

  candidates.sort((a, b) => a.dueAt - b.dueAt);

  return {
    count: candidates.length,
    firstTopic: candidates[0]?.topicName ?? '',
    topicCount: new Set(candidates.map((item) => item.topicId)).size,
    hasMistake: candidates.some((item) => item.type === 'mistake'),
  };
}

export function reviewReminderCopy(
  settings: Pick<ReminderSettings, 'voice'>,
  summary: ReturnType<typeof dueReviewSummary>,
) {
  const count = summary.count;
  const noun = count === 1 ? 'review' : 'reviews';
  const topic = summary.firstTopic || 'your recall queue';

  if (settings.voice === 'signal') {
    return {
      title: `${count} ${noun} ready`,
      body:
        summary.topicCount > 1
          ? `Start with ${topic}. One focused recall round is enough.`
          : `${topic} is ready for a focused recall round.`,
      accent: 'signal' as const,
    };
  }

  if (settings.voice === 'spark') {
    return {
      title: 'A small win is ready ✦',
      body:
        count === 1
          ? `${topic} is ready when you want a quick recall.`
          : `${topic} + ${count - 1} more are waiting in your review queue.`,
      accent: 'spark' as const,
    };
  }

  return {
    title: 'A quiet review window',
    body:
      count === 1
        ? `${topic} is ready. Open it when you have a clear minute.`
        : `${count} reviews are ready. ${topic} can be your first stop.`,
    accent: 'warm' as const,
  };
}

export function examReminderCopy(
  settings: Pick<ReminderSettings, 'voice'>,
  examName: string,
  days: number,
) {
  const distance = days === 1 ? 'tomorrow' : `in ${days} days`;

  if (settings.voice === 'signal') {
    return {
      title: `${examName} • ${distance}`,
      body: 'Open the exam plan and choose one useful next step.',
      accent: 'signal' as const,
    };
  }

  if (settings.voice === 'spark') {
    return {
      title: 'Next-step spark ✦',
      body: `${examName} is ${distance}. Pick one clean move for today.`,
      accent: 'spark' as const,
    };
  }

  return {
    title: 'A note for later',
    body: `${examName} is ${distance}. A short check-in is enough today.`,
    accent: 'warm' as const,
  };
}

function buildReviewReminders(
  workspace: WorkspaceState,
  settings: ReminderSettings,
  now: number,
) {
  if (!settings.reviewEnabled) return [] as PlannedReminder[];

  const reminders: PlannedReminder[] = [];
  const today = startOfLocalDay(now);

  for (let offset = 0; offset < REVIEW_HORIZON_DAYS; offset += 1) {
    const day = addLocalDays(today, offset);
    let at = atLocalMinutes(day, settings.reviewTimeMinutes);
    at = moveOutOfQuietHours(
      at,
      settings.quietStartMinutes,
      settings.quietEndMinutes,
    );
    if (at <= now + 60_000) continue;

    const summary = dueReviewSummary(workspace, at);
    if (!summary.count) continue;

    const copy = reviewReminderCopy(settings, summary);
    reminders.push({
      key: `review:${localDateKey(at)}`,
      kind: 'review',
      at,
      title: copy.title,
      body: copy.body,
      href: '/(app)/review',
      accent: copy.accent,
      data: {
        dueCount: summary.count,
        topicCount: summary.topicCount,
      },
    });
  }

  return reminders;
}

function buildExamReminders(
  workspace: WorkspaceState,
  settings: ReminderSettings,
  now: number,
) {
  if (!settings.examEnabled) return [] as PlannedReminder[];

  const reminders: PlannedReminder[] = [];

  for (const exam of workspace.exams) {
    const daysUntil = examCalendarDaysUntil(exam.date, now);
    if (daysUntil < 1) continue;

    const examDate = new Date(exam.date);

    for (const offset of settings.examOffsets) {
      if (daysUntil < offset) continue;

      const day = new Date(
        examDate.getFullYear(),
        examDate.getMonth(),
        examDate.getDate() - offset,
        0,
        0,
        0,
        0,
      ).getTime();

      let at = atLocalMinutes(day, settings.examTimeMinutes);
      at = moveOutOfQuietHours(
        at,
        settings.quietStartMinutes,
        settings.quietEndMinutes,
      );

      const actualDays = examCalendarDaysUntil(exam.date, at);
      if (at <= now + 60_000 || actualDays < 1 || at >= exam.date) continue;

      const copy = examReminderCopy(settings, exam.name, actualDays);
      reminders.push({
        key: `exam:${exam.id}:${localDateKey(at)}`,
        kind: 'exam',
        at,
        title: copy.title,
        body: copy.body,
        href: '/(app)/exams',
        accent: copy.accent,
        data: {
          examId: exam.id,
          days: actualDays,
        },
      });
    }
  }

  return reminders;
}

function buildStudyBlockReminders(
  workspace: WorkspaceState,
  settings: ReminderSettings,
  now: number,
) {
  if (!settings.studyBlockEnabled) return [] as PlannedReminder[];

  const horizonEnd = addLocalDays(now, REVIEW_HORIZON_DAYS);
  const reminders: PlannedReminder[] = [];

  for (const task of workspace.tasks) {
    if (
      task.status !== 'open' ||
      task.planState !== 'scheduled' ||
      task.scheduledStart <= now + 60_000 ||
      task.scheduledStart > horizonEnd
    ) {
      continue;
    }

    let at = task.scheduledStart - settings.studyLeadMinutes * 60_000;
    if (at <= now + 60_000) continue;

    const shifted = moveOutOfQuietHours(
      at,
      settings.quietStartMinutes,
      settings.quietEndMinutes,
    );

    // A reminder is useless if quiet hours push it to or past the activity.
    if (shifted >= task.scheduledStart) continue;
    at = shifted;

    const duration = Math.max(
      5,
      Math.round((task.scheduledEnd - task.scheduledStart) / 60_000) ||
        task.estimatedMinutes ||
        25,
    );
    const subject = task.subject ? task.subject + ' · ' : '';

    reminders.push({
      key: `study:${task.id}:${task.scheduledStart}`,
      kind: 'study',
      at,
      title: `Coming up: ${task.title}`,
      body: `${subject}${duration} min planned. Open Day Map when you're ready.`,
      href: '/(app)/today/day-map',
      accent: 'warm',
      data: {
        taskId: task.id,
        scheduledStart: task.scheduledStart,
      },
    });
  }

  return reminders;
}

function capPlan(plan: PlannedReminder[]) {
  const perDay = new Map<string, number>();
  const accepted: PlannedReminder[] = [];

  for (const reminder of [...plan].sort((a, b) => a.at - b.at)) {
    const day = localDateKey(reminder.at);
    const count = perDay.get(day) ?? 0;
    if (count >= MAX_REMINDERS_PER_DAY) continue;

    accepted.push(reminder);
    perDay.set(day, count + 1);

    if (accepted.length >= MAX_SCHEDULED_REMINDERS) break;
  }

  return accepted;
}

export function buildReminderPlan(
  workspace: WorkspaceState,
  settingsInput: ReminderSettings,
  now = Date.now(),
) {
  const settings = normalizeReminderSettings(settingsInput);
  if (!settings.enabled) return [] as PlannedReminder[];

  return capPlan([
    ...buildReviewReminders(workspace, settings, now),
    ...buildExamReminders(workspace, settings, now),
    ...buildStudyBlockReminders(workspace, settings, now),
  ]);
}

export function reminderPlanSignature(plan: PlannedReminder[]) {
  return plan
    .map((item) =>
      [item.key, item.at, item.title, item.body, item.href].join('|'),
    )
    .join('~');
}

export function formatTimeMinutes(minutes: number) {
  const normalized = clampTimeMinutes(minutes);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 || 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}
