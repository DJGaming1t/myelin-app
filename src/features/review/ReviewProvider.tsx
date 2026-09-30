import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Confidence, ReviewGrade } from '@/src/data/schema';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { findQuestion, findTopic } from '@/src/features/topics/topic-operations';

import {
  ReviewChoice,
  applyReviewGrade,
  buildReviewQueue,
  reviewAttemptAlreadyRecorded,
  scheduleReview,
} from './review-engine';
import { reviewStorage } from './review-storage';
import {
  REVIEW_SESSION_FORMAT,
  REVIEW_SESSION_VERSION,
  ReviewSessionState,
} from './types';

type StartReviewInput = {
  topicId?: string;
  includeNotDue?: boolean;
  limit?: number;
};

type GradeResult = {
  completed: boolean;
  grade: ReviewGrade;
};

type ReviewContextValue = {
  ready: boolean;
  session: ReviewSessionState | null;
  blockedByFocus: boolean;
  startReview: (input?: StartReviewInput) => Promise<ReviewSessionState | null>;
  setAnswerDraft: (value: string) => Promise<void>;
  setConfidence: (value: Confidence) => Promise<void>;
  useHint: () => Promise<void>;
  revealReference: () => Promise<void>;
  gradeCurrent: (choice: ReviewChoice, now?: number) => Promise<GradeResult | null>;
  discardReview: () => Promise<void>;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

function sessionId(now: number) {
  return `review_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function historyId(now: number) {
  return `session_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function attemptId(now = Date.now()) {
  return `attempt_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function ReviewProvider({ children }: PropsWithChildren) {
  const { ownerKey, workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ReviewSessionState | null>(null);

  const ownerRef = useRef<string | null>(null);
  const sessionRef = useRef<ReviewSessionState | null>(null);
  const workspaceRef = useRef(workspace);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const commit = useCallback(async (next: ReviewSessionState | null) => {
    const owner = ownerRef.current;
    sessionRef.current = next;
    setSession(next);
    if (!owner) return;

    saveQueue.current = saveQueue.current
      .then(async () => {
        if (next) await reviewStorage.save(owner, next);
        else await reviewStorage.clear(owner);
      })
      .catch(() => undefined);

    await saveQueue.current;
  }, []);

  const workspaceReady = Boolean(workspace);

  useEffect(() => {
    let cancelled = false;
    ownerRef.current = ownerKey;
    sessionRef.current = null;
    setSession(null);

    if (!ownerKey || !workspace) {
      setReady(false);
      return () => {
        cancelled = true;
      };
    }

    setReady(false);

    reviewStorage
      .load(ownerKey)
      .then(async (stored) => {
        if (cancelled || ownerRef.current !== ownerKey) return;

        if (stored) {
          const validQueue = stored.queue.filter((item) => {
            const topic = findTopic(workspace, item.topicId);
            return Boolean(topic && findQuestion(topic, item.cardId));
          });

          if (!validQueue.length) {
            await reviewStorage.clear(ownerKey);
            stored = null;
          } else {
            const currentIndex = Math.min(stored.currentIndex, validQueue.length - 1);
            stored = {
              ...stored,
              queue: validQueue,
              currentIndex,
            };
            await reviewStorage.save(ownerKey, stored);
          }
        }

        sessionRef.current = stored;
        setSession(stored);
        setReady(true);
      })
      .catch(() => {
        if (cancelled || ownerRef.current !== ownerKey) return;
        sessionRef.current = null;
        setSession(null);
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerKey, workspaceReady]);

  useEffect(() => {
    const current = sessionRef.current;
    if (!current || !workspace) return;

    const currentItem = current.queue[current.currentIndex];
    if (!currentItem) {
      void commit(null);
      return;
    }

    const topic = findTopic(workspace, currentItem.topicId);
    if (!topic || !findQuestion(topic, currentItem.cardId)) {
      const nextQueue = current.queue.filter((item) => {
        const candidateTopic = findTopic(workspace, item.topicId);
        return Boolean(candidateTopic && findQuestion(candidateTopic, item.cardId));
      });

      if (!nextQueue.length) {
        void commit(null);
        return;
      }

      void commit({
        ...current,
        queue: nextQueue,
        currentIndex: Math.min(current.currentIndex, nextQueue.length - 1),
        stage: 'attempt',
        answerDraft: '',
        confidence: 'unsure',
        hintUsed: false,
        cardStartedAt: Date.now(),
        attemptId: attemptId(),
      });
    }
  }, [commit, session?.currentIndex, workspace?.revision]);

  const transform = useCallback(
    async (change: (current: ReviewSessionState) => ReviewSessionState) => {
      const current = sessionRef.current;
      if (!current) return;
      await commit(change(current));
    },
    [commit],
  );

  const value = useMemo<ReviewContextValue>(
    () => ({
      ready,
      session,
      blockedByFocus: Boolean(activeFocus),

      async startReview(input = {}) {
        if (activeFocus || sessionRef.current) return sessionRef.current;

        const currentWorkspace = workspaceRef.current;
        if (!currentWorkspace || !ownerRef.current) return null;

        const queue = buildReviewQueue(currentWorkspace, {
          topicId: input.topicId,
          includeNotDue: input.includeNotDue,
          limit: input.limit,
        });

        if (!queue.length) return null;

        const now = Date.now();
        const next: ReviewSessionState = {
          format: REVIEW_SESSION_FORMAT,
          version: REVIEW_SESSION_VERSION,
          id: sessionId(now),
          createdAt: now,
          topicId: input.topicId ?? null,
          mixed: !input.topicId,
          queue,
          currentIndex: 0,
          stage: 'attempt',
          answerDraft: '',
          confidence: 'unsure',
          hintUsed: false,
          cardStartedAt: now,
          attemptId: attemptId(now),
          completedCards: 0,
        };

        await commit(next);
        return next;
      },

      setAnswerDraft: (answerDraft) =>
        transform((current) => ({
          ...current,
          answerDraft: answerDraft.slice(0, 16000),
        })),

      setConfidence: (confidence) =>
        transform((current) => ({
          ...current,
          confidence,
        })),

      useHint: () =>
        transform((current) => ({
          ...current,
          hintUsed: true,
        })),

      revealReference: () =>
        transform((current) => ({
          ...current,
          stage: 'reference',
        })),

      async gradeCurrent(choice, now = Date.now()) {
        const current = sessionRef.current;
        const currentWorkspace = workspaceRef.current;
        if (!current || !currentWorkspace || current.stage !== 'reference') return null;

        const item = current.queue[current.currentIndex];
        if (!item) return null;

        const topic = findTopic(currentWorkspace, item.topicId);
        const card = topic ? findQuestion(topic, item.cardId) : null;
        if (!topic || !card) return null;

        const schedule = scheduleReview(card, choice, now);
        const alreadyRecorded = reviewAttemptAlreadyRecorded(
          currentWorkspace,
          current.attemptId,
        );
        const answerDraft = current.answerDraft;
        const confidence = current.confidence;
        const hintUsed = current.hintUsed;
        const cardStartedAt = current.cardStartedAt;
        const prompt = card.prompt;

        if (!alreadyRecorded) {
          updateWorkspace((draft) => {
            const targetTopic = findTopic(draft, item.topicId);
            const targetCard = targetTopic ? findQuestion(targetTopic, item.cardId) : null;
            if (!targetTopic || !targetCard) return;

            applyReviewGrade(targetTopic, targetCard, choice, now);

            draft.history.push({
              id: historyId(now),
              topicId: targetTopic.id,
              cardId: targetCard.id,
              at: now,
              kind: 'review',
              minutes: Math.max(0, Math.round((now - cardStartedAt) / 60_000)),
              grade: schedule.grade,
              effort: 3,
              prompt,
              response: answerDraft,
              confidence,
              hintUsed,
              reviewAttemptId: current.attemptId,
              startedAt: cardStartedAt,
              endedAt: now,
            });
          });
          await waitForSaves();
        }

        let queue = [...current.queue];

        if (!alreadyRecorded && choice === 'again' && queue.length < 100) {
          const repeat = {
            ...item,
            dueAt: schedule.dueAt,
            reps: item.reps + 1,
          };
          const insertAt = Math.min(queue.length, current.currentIndex + 3);
          queue.splice(insertAt, 0, repeat);
        }

        const nextIndex = current.currentIndex + 1;

        if (nextIndex >= queue.length) {
          await commit(null);
          return { completed: true, grade: schedule.grade };
        }

        await commit({
          ...current,
          queue,
          currentIndex: nextIndex,
          stage: 'attempt',
          answerDraft: '',
          confidence: 'unsure',
          hintUsed: false,
          cardStartedAt: now,
          attemptId: attemptId(now),
          completedCards: current.completedCards + 1,
        });

        return { completed: false, grade: schedule.grade };
      },

      async discardReview() {
        await commit(null);
      },
    }),
    [activeFocus, commit, ready, session, transform, updateWorkspace, waitForSaves],
  );

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReview() {
  const value = useContext(ReviewContext);
  if (!value) throw new Error('useReview must be used inside ReviewProvider.');
  return value;
}
