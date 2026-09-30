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

  const distractionsRaw = session.distractions;
  if (!Array.isArray(distractionsRaw) || distractionsRaw.length > 30) {
    throw new Error('Invalid distraction list.');
  }

  return {
    format: FOCUS_SESSION_FORMAT,
    version: FOCUS_SESSION_VERSION,
    id: text(session.id, 'focus id', 120),
    topicId: text(session.topicId, 'topic id', 120),
    topicName: text(session.topicName, 'topic name', 300),
    subject: text(session.subject, 'subject', 120),
    phase,
    launchMode,
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
