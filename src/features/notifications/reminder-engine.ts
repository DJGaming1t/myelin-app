import { freeStudyWindows } from '@/src/features/planning/day-engine';
import { sleepingAt } from '@/src/features/adaptive/sleep-engine';
import { WorkspaceState } from '@/src/data/schema';
import { examCalendarDaysUntil } from '@/src/features/exams/exam-engine';
import { buildAppliedReclaimedWindows } from '@/src/features/exams/autopilot-recovery';
import { isCardReady } from '@/src/features/review/review-engine';

export type ReminderVoice = 'calm' | 'signal' | 'spark';
export type ReminderDetail = 'brief' | 'guided' | 'context';
export type ReminderKind = 'review' | 'exam' | 'study';

export type ReminderSettings = {
  adaptive?: boolean;
  enabled: boolean;
  reviewEnabled: boolean;
  examEnabled: boolean;
  studyBlockEnabled: boolean;
  studyLeadMinutes: number;
  voice: ReminderVoice;
  detail: ReminderDetail;
  sound: boolean;
  reviewTimeMinutes: number;
  examTimeMinutes: number;
  quietStartMinutes: number;
  quietEndMinutes: number;
  examOffsets: number[];
};

export type ReminderPlanContext = {
  activeFocus?: {
    topicId?: string | null;
    startedAt?: number | null;
    unavailableUntil: number;
  } | null;
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
  adaptive: true,
  reviewEnabled: true,
  examEnabled: true,
  studyBlockEnabled: true,
  studyLeadMinutes: 10,
  voice: 'calm',
  detail: 'guided',
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

  const detail: ReminderDetail =
    value?.detail === 'brief' ||
    value?.detail === 'context' ||
    value?.detail === 'guided'
      ? value.detail
      : defaults.detail;

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
    adaptive: value?.adaptive !== false,
    reviewEnabled: value?.reviewEnabled !== false,
    examEnabled: value?.examEnabled !== false,
    studyBlockEnabled: value?.studyBlockEnabled !== false,
    studyLeadMinutes: Math.max(
      0,
      Math.min(60, Math.round(value?.studyLeadMinutes ?? defaults.studyLeadMinutes)),
    ),
    voice,
    detail,
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
  settings: Pick<ReminderSettings, 'voice' | 'detail'>,
  summary: ReturnType<typeof dueReviewSummary>,
) {
  const count = summary.count;
  const noun = count === 1 ? 'review' : 'reviews';
  const topic = summary.firstTopic || 'your recall queue';
  const topicLabel =
    summary.topicCount === 1 ? '1 topic' : `${summary.topicCount} topics`;
  const mistakeNote = summary.hasMistake ? ' · includes a mistake revisit' : '';

  if (settings.detail === 'brief') {
    if (settings.voice === 'signal') {
      return {
        title: `${count} ${noun} ready`,
        body: `${topic} first.`,
        accent: 'signal' as const,
      };
    }

    if (settings.voice === 'spark') {
      return {
        title: 'Quick recall ✦',
        body: `${count} ready · ${topic}`,
        accent: 'spark' as const,
      };
    }

    return {
      title: 'Review window',
      body: `${count} ready · ${topic}`,
      accent: 'warm' as const,
    };
  }

  if (settings.detail === 'context') {
    if (settings.voice === 'signal') {
      return {
        title: `${count} ${noun} · ${topicLabel}`,
        body: `${topic} first${mistakeNote}. Open Review when you're ready.`,
        accent: 'signal' as const,
      };
    }

    if (settings.voice === 'spark') {
      return {
        title: 'Your recall queue is ready ✦',
        body:
          count === 1
            ? `${topic} is ready${mistakeNote}. One clean recall is enough.`
            : `${topic} leads a ${count}-item queue${mistakeNote}.`,
        accent: 'spark' as const,
      };
    }

    return {
      title: 'A quiet review window',
      body:
        count === 1
          ? `${topic} is ready${mistakeNote}. Open it when you have a clear minute.`
          : `${count} reviews across ${topicLabel}. ${topic} can be your first stop${mistakeNote}.`,
      accent: 'warm' as const,
    };
  }

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
  settings: Pick<ReminderSettings, 'voice' | 'detail'>,
  examName: string,
  days: number,
) {
  const distance = days === 1 ? 'tomorrow' : `in ${days} days`;

  if (settings.detail === 'brief') {
    if (settings.voice === 'spark') {
      return {
        title: 'Exam check-in ✦',
        body: `${examName} · ${distance}`,
        accent: 'spark' as const,
      };
    }

    return {
      title:
        settings.voice === 'signal'
          ? `${examName} • ${distance}`
          : 'Exam check-in',
      body:
        settings.voice === 'signal'
          ? 'Plan one next step.'
          : `${examName} · ${distance}`,
      accent: settings.voice === 'signal' ? ('signal' as const) : ('warm' as const),
    };
  }

  if (settings.detail === 'context') {
    if (settings.voice === 'signal') {
      return {
        title: `${examName} • ${distance}`,
        body: 'Open the exam plan, check the scope, and choose one useful next step.',
        accent: 'signal' as const,
      };
    }

    if (settings.voice === 'spark') {
      return {
        title: 'Next-step spark ✦',
        body: `${examName} is ${distance}. Pick one clean move from the exam plan for today.`,
        accent: 'spark' as const,
      };
    }

    return {
      title: 'A note for later',
      body: `${examName} is ${distance}. A short look at the exam plan is enough for today.`,
      accent: 'warm' as const,
    };
  }

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

export function studyReminderCopy(
  settings: Pick<ReminderSettings, 'voice' | 'detail'>,
  taskTitle: string,
  subject: string,
  durationMinutes: number,
) {
  const subjectLabel = subject ? `${subject} · ` : '';
  const duration = `${durationMinutes} min planned`;

  if (settings.detail === 'brief') {
    if (settings.voice === 'spark') {
      return {
        title: 'Study block incoming ✦',
        body: taskTitle,
        accent: 'spark' as const,
      };
    }

    return {
      title:
        settings.voice === 'signal'
          ? `Coming up: ${taskTitle}`
          : 'Planned study',
      body:
        settings.voice === 'signal'
          ? duration
          : `${taskTitle} · ${durationMinutes} min`,
      accent: settings.voice === 'signal' ? ('signal' as const) : ('warm' as const),
    };
  }

  if (settings.detail === 'context') {
    if (settings.voice === 'signal') {
      return {
        title: `Coming up: ${taskTitle}`,
        body: `${subjectLabel}${duration}. Open Day Map for the exact block.`,
        accent: 'signal' as const,
      };
    }

    if (settings.voice === 'spark') {
      return {
        title: 'Your next block is lined up ✦',
        body: `${taskTitle} · ${subjectLabel}${duration}. Day Map has the rest.`,
        accent: 'spark' as const,
      };
    }

    return {
      title: 'Your next study block',
      body: `${taskTitle} · ${subjectLabel}${duration}. Start when the block fits.`,
      accent: 'warm' as const,
    };
  }

  if (settings.voice === 'signal') {
    return {
      title: `Coming up: ${taskTitle}`,
      body: `${subjectLabel}${duration}. Open Day Map when you're ready.`,
      accent: 'signal' as const,
    };
  }

  if (settings.voice === 'spark') {
    return {
      title: 'Study block ready ✦',
      body: `${taskTitle} · ${durationMinutes} min. Your plan is waiting in Day Map.`,
      accent: 'spark' as const,
    };
  }

  return {
    title: 'A study block is coming up',
    body: `${taskTitle} · ${durationMinutes} min. Open Day Map when you're ready.`,
    accent: 'warm' as const,
  };
}

export function sampleReminderCopy(
  settings: Pick<ReminderSettings, 'voice' | 'detail'>,
  kind: ReminderKind,
) {
  if (kind === 'exam') {
    return examReminderCopy(settings, 'Mathematics test', 3);
  }

  if (kind === 'study') {
    return studyReminderCopy(
      settings,
      'Finish Exercise 5.2',
      'Mathematics',
      35,
    );
  }

  return reviewReminderCopy(settings, {
    count: 3,
    firstTopic: 'Refraction',
    topicCount: 2,
    hasMistake: true,
  });
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

function buildRecoveredWindowReminders(
  workspace: WorkspaceState,
  settings: ReminderSettings,
  now: number,
  context: ReminderPlanContext,
) {
  if (!settings.studyBlockEnabled) return [] as PlannedReminder[];

  const activeFocus = context.activeFocus ?? null;
  const windows = buildAppliedReclaimedWindows(
    workspace,
    now,
    {
      horizonDays: REVIEW_HORIZON_DAYS,
      protectionLeadMinutes: settings.studyLeadMinutes,
    },
  );
  const reminders: PlannedReminder[] = [];

  for (const window of windows) {
    const placement = window.placements.find(
      (item) =>
        item.start > now + 60_000 &&
        item.end > now &&
        item.start <=
          addLocalDays(now, REVIEW_HORIZON_DAYS),
    );
    if (!placement) continue;

    const activeFocusOverlaps =
      activeFocus &&
      activeFocus.unavailableUntil > placement.start &&
      !(
        activeFocus.topicId === placement.topicId &&
        activeFocus.startedAt != null &&
        activeFocus.startedAt >=
          placement.start - 5 * 60_000 &&
        activeFocus.startedAt < placement.end
      );
    if (activeFocusOverlaps) continue;

    let at =
      placement.start -
      settings.studyLeadMinutes * 60_000;
    if (at <= now + 60_000) continue;

    const shifted = moveOutOfQuietHours(
      at,
      settings.quietStartMinutes,
      settings.quietEndMinutes,
    );
    if (shifted >= placement.start) continue;
    at = shifted;

    const copy = studyReminderCopy(
      settings,
      placement.topicName,
      placement.subject,
      placement.minutes,
    );

    reminders.push({
      key:
        'recovered:' +
        window.commitmentId +
        ':' +
        window.occurrenceDateKey +
        ':' +
        placement.topicId +
        ':' +
        placement.start,
      kind: 'study',
      at,
      title: copy.title,
      body:
        settings.detail === 'brief'
          ? copy.body
          : `Recovered window · ${copy.body}`,
      href: '/(app)/today/day-map',
      accent: copy.accent,
      data: {
        recovered: 1,
        commitmentId: window.commitmentId,
        occurrenceDateKey: window.occurrenceDateKey,
        topicId: placement.topicId,
        scheduledStart: placement.start,
        scheduledEnd: placement.end,
      },
    });
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
    const copy = studyReminderCopy(
      settings,
      task.title,
      task.subject,
      duration,
    );

    reminders.push({
      key: `study:${task.id}:${task.scheduledStart}`,
      kind: 'study',
      at,
      title: copy.title,
      body: copy.body,
      href: '/(app)/today/day-map',
      accent: copy.accent,
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
    if (count >= MAX_REMINDERS_PER_DAY || accepted.some(item => Math.abs(item.at - reminder.at) < 90 * 60000)) continue;

    accepted.push(reminder);
    perDay.set(day, count + 1);

    if (accepted.length >= MAX_SCHEDULED_REMINDERS) break;
  }

  return accepted;
}

function preferredStudyMinute(workspace: WorkspaceState, fallback: number, now: number) {
  const samples = (workspace.focusOutcomes ?? []).filter(o => o.status === 'finished' && o.minutes >= 5 && o.startedAt >= now - 30 * 86400000 && o.startedAt <= now);
  const buckets = new Map<number, number[]>();
  for (const o of samples) {
    const d = new Date(o.startedAt); const minute = d.getHours() * 60 + d.getMinutes();
    const key = Math.floor(minute / 120); const values = buckets.get(key) ?? [];
    values.push(minute); buckets.set(key, values);
  }
  const best = [...buckets.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 3) return fallback;
  best.sort((a, b) => a - b);
  return Math.round(best[Math.floor(best.length / 2)] / 15) * 15;
}
function adaptReminders(plan: PlannedReminder[], workspace: WorkspaceState, settings: ReminderSettings, now: number) {
  return plan.flatMap(reminder => {
    let at = reminder.at;
    if (settings.adaptive !== false && reminder.kind === 'review') {
      const minute = preferredStudyMinute(workspace, settings.reviewTimeMinutes, now);
      at = atLocalMinutes(reminder.at, minute);
      // Do not interrupt a day on which recall was already practised.
      if (workspace.history.some(h => h.kind === 'review' && localDateKey(h.at) === localDateKey(at) && h.at <= now)) return [];
    }
    at = moveOutOfQuietHours(at, settings.quietStartMinutes, settings.quietEndMinutes);
    const sleeping = sleepingAt(workspace.settings, at);
    if (sleeping) at = moveOutOfQuietHours(sleeping.end, settings.quietStartMinutes, settings.quietEndMinutes);
    if (sleepingAt(workspace.settings, at)) return [];
    const recoveredStudy =
      reminder.kind === 'study' &&
      reminder.data.recovered === 1;
    if (settings.adaptive !== false && !recoveredStudy) {
      const earliest = Math.max(now + 60001, at);
      const needed = reminder.kind === 'study' ? 1 : 10;
      const windows = freeStudyWindows(workspace, at, { from: earliest, minMinutes: needed });
      const usable = windows.map(w => ({ ...w, start: moveOutOfQuietHours(w.start, settings.quietStartMinutes, settings.quietEndMinutes) }))
        .find(w => w.start + needed * 60000 <= w.end && !isInQuietHours(w.start + needed * 60000 - 1, settings.quietStartMinutes, settings.quietEndMinutes));
      if (!usable) return [];
      at = usable.start;
    }
    if (at <= now + 60000 || (reminder.kind !== 'exam' && at > addLocalDays(now, REVIEW_HORIZON_DAYS))) return [];
    if (reminder.kind === 'study') {
      if (at >= Number(reminder.data.scheduledStart)) return [];
      const task = workspace.tasks.find(t => t.id === reminder.data.taskId);
      return [{ ...reminder, at, ...(task && (task.postponements ?? 0) >= 2 && settings.adaptive !== false ? { body: `${task.title} is coming up. Begin with one five-minute step; then decide whether to continue.` } : {}) }];
    }
    if (reminder.kind === 'exam') {
      if (localDateKey(at) !== localDateKey(reminder.at)) return [];
      const exam = workspace.exams.find(e => e.id === reminder.data.examId);
      if (exam && at >= exam.date) return [];
    }
    if (reminder.kind === 'review') {
      const summary = dueReviewSummary(workspace, at);
      if (!summary.count) return [];
      return [{ ...reminder, at, ...reviewReminderCopy(settings, summary), data: { ...reminder.data, dueCount: summary.count, topicCount: summary.topicCount } }];
    }
    return [{ ...reminder, at }];
  });
}

export function buildReminderPlan(
  workspace: WorkspaceState,
  settingsInput: ReminderSettings,
  now = Date.now(),
  context: ReminderPlanContext = {},
) {
  const settings = normalizeReminderSettings(settingsInput);
  if (!settings.enabled) return [] as PlannedReminder[];

  return capPlan(adaptReminders([
    ...buildReviewReminders(workspace, settings, now),
    ...buildExamReminders(workspace, settings, now),
    ...buildStudyBlockReminders(workspace, settings, now),
    ...buildRecoveredWindowReminders(
      workspace,
      settings,
      now,
      context,
    ),
  ], workspace, settings, now));
}

export type RecoveredReminderInsightStatus =
  | 'scheduled'
  | 'reflowed'
  | 'protected'
  | 'suppressed';

export type RecoveredReminderPreview = {
  title: string;
  body: string;
  accent: 'warm' | 'signal' | 'spark';
};

export type RecoveredReminderInsight = {
  status: RecoveredReminderInsightStatus;
  commitmentTitle: string;
  topicName: string;
  subject: string;
  start: number;
  end: number;
  minutes: number;
  reminderAt: number | null;
  preview: RecoveredReminderPreview;
  why: string;
  detail: string;
};

export function buildRecoveredReminderInsight(
  workspace: WorkspaceState,
  settingsInput: ReminderSettings,
  now = Date.now(),
  context: ReminderPlanContext = {},
): RecoveredReminderInsight | null {
  const settings = normalizeReminderSettings(settingsInput);
  const activeFocus = context.activeFocus ?? null;

  const baselineWindows = buildAppliedReclaimedWindows(
    workspace,
    now,
    {
      horizonDays: REVIEW_HORIZON_DAYS,
      protectionLeadMinutes:
        settings.studyLeadMinutes,
    },
  );
  const liveWindows = buildAppliedReclaimedWindows(
    workspace,
    now,
    {
      horizonDays: REVIEW_HORIZON_DAYS,
      protectionLeadMinutes:
        settings.studyLeadMinutes,
      ...(activeFocus
        ? {
            unavailableUntil:
              activeFocus.unavailableUntil,
            activeFocusTopicId:
              activeFocus.topicId ?? null,
            activeFocusStartedAt:
              activeFocus.startedAt ?? null,
          }
        : {}),
    },
  );

  const baselineWindow =
    baselineWindows.find((window) =>
      window.placements.some(
        (placement) =>
          placement.start > now + 60_000 &&
          placement.end > now,
      ),
    ) ?? null;
  const liveWindow =
    liveWindows.find(
      (window) =>
        window.commitmentId ===
          baselineWindow?.commitmentId &&
        window.occurrenceDateKey ===
          baselineWindow?.occurrenceDateKey,
    ) ??
    liveWindows.find((window) =>
      window.placements.some(
        (placement) =>
          placement.start > now + 60_000 &&
          placement.end > now,
      ),
    ) ??
    null;

  const baselinePlacement =
    baselineWindow?.placements.find(
      (placement) =>
        placement.start > now + 60_000 &&
        placement.end > now,
    ) ?? null;
  const livePlacement =
    liveWindow?.placements.find(
      (placement) =>
        placement.start > now + 60_000 &&
        placement.end > now,
    ) ?? baselinePlacement;

  const window = liveWindow ?? baselineWindow;
  const placement = livePlacement ?? baselinePlacement;
  if (!window || !placement) return null;

  const baselineStart =
    baselinePlacement?.start ?? placement.start;
  const activeFocusOverlaps =
    Boolean(
      activeFocus &&
        activeFocus.unavailableUntil >
          baselineStart &&
        !(
          activeFocus.topicId ===
            baselinePlacement?.topicId &&
          activeFocus.startedAt != null &&
          baselinePlacement &&
          activeFocus.startedAt >=
            baselinePlacement.start -
              5 * 60_000 &&
          activeFocus.startedAt <
            baselinePlacement.end
        ),
    );

  const previewCopy = studyReminderCopy(
    settings,
    placement.topicName,
    placement.subject,
    placement.minutes,
  );
  const preview: RecoveredReminderPreview = {
    ...previewCopy,
    body:
      settings.detail === 'brief'
        ? previewCopy.body
        : `Recovered window · ${previewCopy.body}`,
  };

  const scheduled = buildReminderPlan(
    workspace,
    settings,
    now,
    context,
  ).find(
    (item) =>
      item.data.recovered === 1 &&
      item.data.commitmentId ===
        window.commitmentId &&
      item.data.occurrenceDateKey ===
        window.occurrenceDateKey,
  );

  if (
    activeFocusOverlaps ||
    liveWindow?.protection?.reason ===
      'active-focus'
  ) {
    return {
      status: 'protected',
      commitmentTitle: window.commitmentTitle,
      topicName: placement.topicName,
      subject: placement.subject,
      start: placement.start,
      end: placement.end,
      minutes: placement.minutes,
      reminderAt: null,
      preview,
      why:
        'Another Focus session overlaps the original recovered block, so MYELIN suppresses the stale heads-up and protects the study time first.',
      detail:
        'The recovered block has been moved around your live Focus session. Reminder timing will be reconsidered from the updated plan.',
    };
  }

  if (scheduled) {
    const reflowed =
      liveWindow?.protection?.reason ===
        'schedule-change' ||
      baselineWindow?.protection?.reason ===
        'schedule-change';

    return {
      status: reflowed
        ? 'reflowed'
        : 'scheduled',
      commitmentTitle: window.commitmentTitle,
      topicName: placement.topicName,
      subject: placement.subject,
      start: Number(
        scheduled.data.scheduledStart ??
          placement.start,
      ),
      end: Number(
        scheduled.data.scheduledEnd ??
          placement.end,
      ),
      minutes: placement.minutes,
      reminderAt: scheduled.at,
      preview: {
        title: scheduled.title,
        body: scheduled.body,
        accent: scheduled.accent,
      },
      why: reflowed
        ? 'A later fixed schedule change reshaped this recovered window, so MYELIN replaced the old reminder with the current block time.'
        : `Autopilot recovered this study window from ${window.commitmentTitle}. This is the first safe study block in it, so MYELIN plans one heads-up before it starts.`,
      detail: reflowed
        ? 'The notification follows the latest Day Map reservation rather than the original recovered time.'
        : `One calm heads-up is planned ${settings.studyLeadMinutes} minutes before this recovered block.`,
    };
  }

  let why =
    'Recovered study time exists, but MYELIN is not scheduling a notification for it right now.';
  let detail =
    'The block remains in the plan even when its notification is suppressed.';

  if (!settings.enabled) {
    why =
      'Reminders are turned off, so this recovered block stays visible in the plan without creating a device notification.';
    detail =
      'Turn reminders on to allow MYELIN to schedule a heads-up for eligible recovered blocks.';
  } else if (!settings.studyBlockEnabled) {
    why =
      'Day Map study reminders are turned off, so recovered study blocks stay silent.';
    detail =
      'The recovered block remains available in Today and Day Map.';
  }

  return {
    status: 'suppressed',
    commitmentTitle: window.commitmentTitle,
    topicName: placement.topicName,
    subject: placement.subject,
    start: placement.start,
    end: placement.end,
    minutes: placement.minutes,
    reminderAt: null,
    preview,
    why,
    detail,
  };
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
