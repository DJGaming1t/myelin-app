import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FOCUS_SESSION_FORMAT,
  FOCUS_SESSION_VERSION,
  FocusSessionState,
  ParkedDistraction,
} from './types';

export type FocusKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const ROOT = '@myelin/native/focus';

function key(ownerKey: string) {
  return `${ROOT}/${encodeURIComponent(ownerKey)}`;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function number(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function distraction(raw: unknown): ParkedDistraction {
  const item = object(raw, 'distraction');
  return {
    id: text(item.id, 'distraction id', 120),
    text: text(item.text, 'distraction text', 240),
    createdAt: number(item.createdAt, 'distraction time', 1, Number.MAX_SAFE_INTEGER),
  };
}

export function validateFocusSession(raw: unknown): FocusSessionState {
  const session = object(raw, 'focus session');

  if (session.format !== FOCUS_SESSION_FORMAT) throw new Error('Not a MYELIN focus session.');
  if (session.version !== FOCUS_SESSION_VERSION) throw new Error('Unsupported focus session version.');

  const phase = session.phase;
  if (phase !== 'focus' && phase !== 'break') throw new Error('Invalid focus phase.');

  const launchMode = session.launchMode;
  if (launchMode !== 'full' && launchMode !== 'five-minute') {
    throw new Error('Invalid focus launch mode.');
  }

  const timerMode = session.timerMode ?? 'countdown';
  if (timerMode !== 'countdown' && timerMode !== 'pomodoro' && timerMode !== 'stopwatch') {
    throw new Error('Invalid timer mode.');
  }
  if (session.breakSuggested != null && typeof session.breakSuggested !== 'boolean') {
    throw new Error('Invalid break suggestion state.');
  }
  if (session.breaksRemaining != null && (typeof session.breaksRemaining !== 'number' || !Number.isInteger(session.breaksRemaining) || session.breaksRemaining < 0 || session.breaksRemaining > 8 || timerMode !== 'pomodoro')) throw new Error('Invalid planned breaks.');
  const reminder = session.breakReminder == null ? undefined : object(session.breakReminder, 'break reminder');
  if (reminder && (timerMode !== 'stopwatch' || phase !== 'focus')) throw new Error('Invalid break reminder state.');
  if (reminder && (!Number.isInteger(reminder.intervalMinutes) || !Number.isInteger(reminder.remaining))) throw new Error('Invalid break reminder values.');
  if (session.breakSuggested === true &&
      (phase !== 'break' || session.runningSince !== null || session.focusLogged !== true || session.elapsedMs !== 0)) {
    throw new Error('Invalid pending break.');
  }

  const distractionsRaw = session.distractions;
  if (!Array.isArray(distractionsRaw) || distractionsRaw.length > 30) {
    throw new Error('Invalid distraction list.');
  }

  const topicId = session.topicId == null ? undefined : text(session.topicId, 'topic id', 120);
  const taskId = session.taskId == null ? undefined : text(session.taskId, 'task id', 120);
  if (session.freeFocus != null && typeof session.freeFocus !== 'boolean') throw new Error('Invalid free focus state.');
  if (session.freeFocus === true && (topicId || taskId)) throw new Error('Free focus cannot have a target.');
  if (!topicId && !taskId && session.freeFocus !== true) throw new Error('Focus session has no target.');

  return {
    format: FOCUS_SESSION_FORMAT,
    version: FOCUS_SESSION_VERSION,
    id: text(session.id, 'focus id', 120),
    ...(topicId ? { topicId } : {}),
    ...(taskId ? { taskId } : {}),
    topicName: text(session.topicName, 'topic name', 500),
    subject: text(session.subject, 'subject', 120),
    phase,
    launchMode,
    timerMode,
    ...(session.freeFocus === true ? { freeFocus: true } : {}),
    ...(typeof session.breaksRemaining === 'number' ? { breaksRemaining: session.breaksRemaining } : {}),
    ...(reminder ? { breakReminder: {
      intervalMinutes: number(reminder.intervalMinutes, 'reminder interval', 5, 180),
      remaining: number(reminder.remaining, 'reminders remaining', 0, 8),
      nextAtElapsedMs: number(reminder.nextAtElapsedMs, 'next reminder', 0, 24 * 60 * 60 * 1000),
    } } : {}),
    ...(session.breakSuggested === true ? { breakSuggested: true } : {}),
    tinyStep: text(session.tinyStep ?? '', 'tiny step', 500),
    fullTargetMinutes: number(session.fullTargetMinutes, 'full target', 5, 240),
    plannedFocusMinutes: number(session.plannedFocusMinutes, 'focus target', 5, 240),
    breakMinutes: number(session.breakMinutes, 'break target', 1, 30),
    startedAt: number(session.startedAt, 'start time', 1, Number.MAX_SAFE_INTEGER),
    phaseStartedAt: number(session.phaseStartedAt, 'phase start time', 1, Number.MAX_SAFE_INTEGER),
    elapsedMs: number(session.elapsedMs, 'elapsed time', 0, 24 * 60 * 60 * 1000),
    runningSince:
      session.runningSince === null
        ? null
        : number(session.runningSince, 'running time', 1, Number.MAX_SAFE_INTEGER),
    focusLogged: session.focusLogged === true,
    focusActualMinutes: number(session.focusActualMinutes ?? 0, 'actual focus minutes', 0, 240),
    distractions: distractionsRaw.map(distraction),
  };
}

export function createFocusStorage(store: FocusKeyValueStore) {
  return {
    async load(ownerKey: string) {
      const raw = await store.getItem(key(ownerKey));
      if (!raw) return null;

      try {
        return validateFocusSession(JSON.parse(raw));
      } catch {
        await store.removeItem(key(ownerKey));
        return null;
      }
    },

    async save(ownerKey: string, session: FocusSessionState) {
      const valid = validateFocusSession(session);
      await store.setItem(key(ownerKey), JSON.stringify(valid));
      return valid;
    },

    async clear(ownerKey: string) {
      await store.removeItem(key(ownerKey));
    },
  };
}

export const focusStorage = createFocusStorage(AsyncStorage);
