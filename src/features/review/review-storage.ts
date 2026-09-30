import AsyncStorage from '@react-native-async-storage/async-storage';

import { ReviewQueueItem } from './review-engine';
import {
  REVIEW_SESSION_FORMAT,
  REVIEW_SESSION_VERSION,
  ReviewSessionState,
} from './types';

export type ReviewKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const ROOT = '@myelin/native/review';

function storageKey(ownerKey: string) {
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

function queueItem(raw: unknown): ReviewQueueItem {
  const item = object(raw, 'review queue item');
  const priority = number(item.priority, 'priority', 1, 3);
  return {
    topicId: text(item.topicId, 'topic id', 120),
    cardId: text(item.cardId, 'card id', 120),
    topicName: text(item.topicName, 'topic name', 300),
    subject: text(item.subject, 'subject', 120),
    prompt: text(item.prompt, 'prompt', 6000),
    priority: priority as 1 | 2 | 3,
    dueAt: number(item.dueAt ?? 0, 'due time', 0, Number.MAX_SAFE_INTEGER),
    reps: number(item.reps ?? 0, 'repetitions', 0, 1_000_000),
  };
}

export function validateReviewSession(raw: unknown): ReviewSessionState {
  const state = object(raw, 'review session');

  if (state.format !== REVIEW_SESSION_FORMAT) throw new Error('Not a MYELIN review session.');
  if (state.version !== REVIEW_SESSION_VERSION) throw new Error('Unsupported review session version.');
  if (!Array.isArray(state.queue) || state.queue.length < 1 || state.queue.length > 100) {
    throw new Error('Invalid review queue.');
  }

  const queue = state.queue.map(queueItem);
  const currentIndex = number(state.currentIndex, 'review index', 0, queue.length);
  const stage = state.stage;
  if (stage !== 'attempt' && stage !== 'reference') throw new Error('Invalid review stage.');

  const confidence = state.confidence;
  if (confidence !== 'sure' && confidence !== 'partial' && confidence !== 'unsure') {
    throw new Error('Invalid confidence.');
  }

  return {
    format: REVIEW_SESSION_FORMAT,
    version: REVIEW_SESSION_VERSION,
    id: text(state.id, 'review id', 120),
    createdAt: number(state.createdAt, 'review creation time', 1, Number.MAX_SAFE_INTEGER),
    topicId:
      state.topicId === null ? null : text(state.topicId, 'review topic id', 120),
    mixed: state.mixed === true,
    queue,
    currentIndex,
    stage,
    answerDraft: text(state.answerDraft ?? '', 'answer draft', 16000),
    confidence,
    hintUsed: state.hintUsed === true,
    cardStartedAt: number(state.cardStartedAt, 'card start time', 1, Number.MAX_SAFE_INTEGER),
    attemptId: text(state.attemptId, 'review attempt id', 120),
    completedCards: number(state.completedCards ?? 0, 'completed cards', 0, 100),
  };
}

export function createReviewStorage(store: ReviewKeyValueStore) {
  return {
    async load(ownerKey: string) {
      const raw = await store.getItem(storageKey(ownerKey));
      if (!raw) return null;

      try {
        return validateReviewSession(JSON.parse(raw));
      } catch {
        await store.removeItem(storageKey(ownerKey));
        return null;
      }
    },

    async save(ownerKey: string, state: ReviewSessionState) {
      const validated = validateReviewSession(state);
      await store.setItem(storageKey(ownerKey), JSON.stringify(validated));
      return validated;
    },

    async clear(ownerKey: string) {
      await store.removeItem(storageKey(ownerKey));
    },
  };
}

export const reviewStorage = createReviewStorage(AsyncStorage);
