import { DAY_MS, retrievability } from '@/src/features/adaptive/memory-engine';
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
import { captureRecallMistake } from '@/src/features/mistakes/mistake-engine';
import { findQuestion, findTopic } from '@/src/features/topics/topic-operations';

import {
  ReviewChoice,
  applyReviewGrade,
  buildReviewQueue,
  scheduleReview,
} from './review-engine';
import { reviewStorage } from './review-storage';
import {
  REVIEW_SESSION_FORMAT,
  REVIEW_SESSION_VERSION,
  ReviewSessionState,
} from './types';

type StartReviewInput = {
  cardIds?: string[];
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
  saveError: string | null;
  retryRestore: () => void;
  startReview: (input?: StartReviewInput) => Promise<ReviewSessionState | null>;
  setAnswerDraft: (value: string) => Promise<boolean>;
  setConfidence: (value: Confidence) => Promise<boolean>;
  useHint: () => Promise<boolean>;
  revealReference: () => Promise<boolean>;
  gradeCurrent: (choice: ReviewChoice, now?: number) => Promise<GradeResult | null>;
  discardReview: () => Promise<boolean>;
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
  const { ownerKey, workspace, status, readWorkspace, updateWorkspace, waitForSaves, retrySaves } = useWorkspace();
  const { session: activeFocus, ready: focusReady } = useFocus();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ReviewSessionState | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const gradingRef = useRef<object | null>(null);
  const ownerRef = useRef<string | null>(null);
  const sessionRef = useRef<ReviewSessionState | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const workspaceReady = Boolean(workspace) && status === 'ready';
  const lifecycle = useRef({ ownerKey, workspaceReady, epoch: 0, ready, activeFocus, focusReady, mounted: true });
  if (lifecycle.current.ownerKey !== ownerKey || lifecycle.current.workspaceReady !== workspaceReady) {
    lifecycle.current.epoch++;
  }
  Object.assign(lifecycle.current, { ownerKey, workspaceReady, ready, activeFocus, focusReady });
  const ownerEpoch = lifecycle.current.epoch;

  const sameOwner = useCallback((owner: string, epoch: number) =>
    lifecycle.current.mounted && lifecycle.current.ownerKey === owner && lifecycle.current.epoch === epoch &&
    ownerRef.current === owner && !!readWorkspace(owner), [readWorkspace]);

  // Keep writes serialized, but let each caller observe its own storage failure.
  const persist = useCallback((owner: string, next: ReviewSessionState | null) => {
    const attempt = saveQueue.current.catch(() => undefined).then(async () => {
      if (next) await reviewStorage.save(owner, next);
      else await reviewStorage.clear(owner);
    });
    saveQueue.current = attempt;
    return attempt;
  }, []);

  const commit = useCallback(async (next: ReviewSessionState | null, owner: string, epoch: number, failureMessage?: string) => {
    if (!sameOwner(owner, epoch)) return false;
    const previous = sessionRef.current;
    sessionRef.current = next;
    setSession(next);
    try {
      await persist(owner, next);
      if (!sameOwner(owner, epoch)) return false;
      if (sessionRef.current === next) setSaveError(null);
      return true;
    } catch {
      if (sameOwner(owner, epoch) && sessionRef.current === next) {
        sessionRef.current = previous;
        setSession(previous);
        setSaveError(failureMessage ?? 'Review changes could not be saved. The last change was reversed. Try again.');
      }
      return false;
    }
  }, [persist, sameOwner]);

  useEffect(() => {
    let cancelled = false;
    lifecycle.current.mounted = true;
    ownerRef.current = ownerKey;
    sessionRef.current = null;
    gradingRef.current = null;
    setSession(null);
    setSaveError(null);
    setReady(false);
    lifecycle.current.ready = false;
    if (!ownerKey || !workspaceReady) return;
    const epoch = ownerEpoch;
    const valid = () => !cancelled && sameOwner(ownerKey, epoch);

    void (async () => {
      // A return to an owner must load after their already accepted queued writes.
      await saveQueue.current.catch(() => undefined);
      if (!valid()) return;
      let stored = await reviewStorage.load(ownerKey);
      if (!valid()) return;
      const live = readWorkspace(ownerKey)!;
      if (stored) {
        const previousIndex = stored.currentIndex;
        const surviving = stored.queue.map((item, index) => ({ item, index })).filter(({ item }) => {
          const topic = findTopic(live, item.topicId);
          return !!topic && !!findQuestion(topic, item.cardId);
        });
        if (!surviving.length) stored = null;
        else {
          const retainedIndex = surviving.findIndex(({ index }) => index === previousIndex);
          const currentIndex = retainedIndex >= 0 ? retainedIndex : Math.min(
            surviving.filter(({ index }) => index < previousIndex).length, surviving.length - 1);
          stored = { ...stored, queue: surviving.map(({ item }) => item), currentIndex,
            ...(retainedIndex >= 0 ? {} : { stage: 'attempt' as const, answerDraft: '',
              confidence: 'unsure' as const, hintUsed: false, cardStartedAt: Date.now(), attemptId: attemptId() }) };
        }
        await persist(ownerKey, stored);
        if (!valid()) return;
      }
      sessionRef.current = stored;
      setSession(stored);
      lifecycle.current.ready = true;
      setReady(true);
    })().catch(() => {
      if (!valid()) return;
      setSaveError('Your saved review could not be restored. Retry before starting another queue.');
    });
    return () => { cancelled = true; lifecycle.current.mounted = false; lifecycle.current.ready = false; };
  }, [ownerKey, workspaceReady, restoreAttempt, ownerEpoch, sameOwner, persist, readWorkspace]);

  useEffect(() => {
    const current = sessionRef.current;
    if (!current || !workspace || !ready || !ownerKey || !sameOwner(ownerKey, ownerEpoch)) return;

    const currentItem = current.queue[current.currentIndex];
    if (!currentItem) {
      void commit(null, ownerKey, ownerEpoch);
      return;
    }

    const topic = findTopic(workspace, currentItem.topicId);
    if (!topic || !findQuestion(topic, currentItem.cardId)) {
      const nextQueue = current.queue.filter((item) => {
        const candidateTopic = findTopic(workspace, item.topicId);
        return Boolean(candidateTopic && findQuestion(candidateTopic, item.cardId));
      });

      if (!nextQueue.length) {
        void commit(null, ownerKey, ownerEpoch);
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
      }, ownerKey, ownerEpoch);
    }
  }, [commit, session?.currentIndex, workspace?.revision, ownerKey, ownerEpoch, ready, sameOwner]);

  // Bind controls to the render's owner and attempt, not whichever session exists later.
  const currentForAction = useCallback(() => {
    if (!ownerKey || !sameOwner(ownerKey, ownerEpoch) || !lifecycle.current.ready ||
      !lifecycle.current.focusReady || lifecycle.current.activeFocus) return null;
    const current = sessionRef.current;
    return current && current.id === session?.id && current.attemptId === session?.attemptId ? current : null;
  }, [ownerKey, ownerEpoch, sameOwner, session?.id, session?.attemptId]);
  const transform = useCallback(async (change: (current: ReviewSessionState) => ReviewSessionState) => {
    const current = currentForAction();
    if (!current || current.stage !== 'attempt' || gradingRef.current || !ownerKey) return false;
    return commit(change(current), ownerKey, ownerEpoch);
  }, [commit, currentForAction, ownerKey, ownerEpoch]);

  const value = useMemo<ReviewContextValue>(
    () => ({
      ready: ready && ownerRef.current === ownerKey && workspaceReady,
      session: ownerRef.current === ownerKey && workspaceReady ? session : null,
      saveError: ownerRef.current === ownerKey ? saveError : null,
      retryRestore() {
        if (ownerKey && sameOwner(ownerKey, ownerEpoch) && (!lifecycle.current.ready || saveError)) setRestoreAttempt(value => value + 1);
      },
      blockedByFocus: Boolean(activeFocus),

      async startReview(input = {}) {
        if (!ownerKey || !sameOwner(ownerKey, ownerEpoch) || !lifecycle.current.ready ||
          !lifecycle.current.focusReady || lifecycle.current.activeFocus || gradingRef.current || sessionRef.current || session) return null;
        const currentWorkspace = readWorkspace(ownerKey);
        if (!currentWorkspace) return null;

        const queue = buildReviewQueue(currentWorkspace, {
          topicId: input.topicId,
          cardIds: input.cardIds,
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

        const saved = await commit(next, ownerKey, ownerEpoch);
        return saved && sameOwner(ownerKey, ownerEpoch) && (sessionRef.current as ReviewSessionState | null)?.id === next.id ? next : null;
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

      revealReference: () => transform(current => current.answerDraft.trim() ? { ...current, stage: 'reference' } : current),

      async gradeCurrent(choice, now = Date.now()) {
        const current = currentForAction();
        const currentWorkspace = ownerKey ? readWorkspace(ownerKey) : null;
        if (!current || !currentWorkspace || !ownerKey || current.stage !== 'reference' || gradingRef.current) return null;

        const item = current.queue[current.currentIndex];
        if (!item) return null;

        const topic = findTopic(currentWorkspace, item.topicId);
        const card = topic ? findQuestion(topic, item.cardId) : null;
        if (!topic || !card) return null;

        const schedule = scheduleReview(card, choice, now, { hintUsed: current.hintUsed });
        const recordedAttempt = currentWorkspace.history.find(
          (entry) => entry.reviewAttemptId === current.attemptId,
        );
        const alreadyRecorded = !!recordedAttempt;
        const effectiveGrade = recordedAttempt?.grade ?? schedule.grade;
        const answerDraft = current.answerDraft;
        const confidence = current.confidence;
        const hintUsed = current.hintUsed;
        const cardStartedAt = current.cardStartedAt;
        const prompt = card.prompt;

        const token = {};
        gradingRef.current = token;
        const stillCurrent = () => gradingRef.current === token && sameOwner(ownerKey, ownerEpoch) && currentForAction() === current;
        try {
          // Never grade an optimistic reference/draft whose own save is still pending.
          try { await saveQueue.current; } catch {
            // An explicit retry can re-save the retained reference after a failed advance/clear.
            if (!stillCurrent() || !await commit(current, ownerKey, ownerEpoch)) return null;
          }
          if (!stillCurrent()) return null;
          if (!alreadyRecorded) {
            const updated = updateWorkspace((draft) => {
              const targetTopic = findTopic(draft, item.topicId);
              const targetCard = targetTopic ? findQuestion(targetTopic, item.cardId) : null;
              if (!targetTopic || !targetCard) return;

              if (draft.history.some(entry => entry.reviewAttemptId === current.attemptId)) return;
              const elapsedDays = targetCard.lastReviewed ? Math.max(0, (now - targetCard.lastReviewed) / DAY_MS) : 0;
              const predictedRecall = retrievability(targetCard, now);
              applyReviewGrade(targetTopic, targetCard, choice, now, { hintUsed });

              if (choice === 'again' && targetCard.answer.trim()) {
                captureRecallMistake(draft, {
                  topicId: targetTopic.id,
                  cardId: targetCard.id,
                  prompt: targetCard.prompt,
                  response: answerDraft,
                  correction: targetCard.answer,
                  now,
                });
              }

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
                elapsedDays,
                ...(predictedRecall === null ? {} : { predictedRecall }),
                startedAt: cardStartedAt,
                endedAt: now,
              });
            }, { ownerKey, canApply: live => stillCurrent() &&
              !!findTopic(live, item.topicId)?.cards.some(c => c.id === item.cardId) &&
              !live.history.some(entry => entry.reviewAttemptId === current.attemptId) });
            if (!updated) return null;
          }
          try {
            await waitForSaves();
          } catch {
            // A second explicit grade press retries the existing evidence, not the grade mutation.
            if (!stillCurrent()) return null;
            if (!alreadyRecorded || !await retrySaves(ownerKey)) {
              if (stillCurrent()) setSaveError('Your grade could not be saved. Tap the grade again to retry; it will not be counted twice.');
              return null;
            }
          }
          if (!stillCurrent()) return null;
          const liveTopic = findTopic(readWorkspace(ownerKey)!, item.topicId);
          if (!liveTopic || !findQuestion(liveTopic, item.cardId)) return null;

          let queue = [...current.queue];

          const shouldRepeatAgain =
            (!alreadyRecorded && choice === 'again') ||
            (alreadyRecorded && effectiveGrade === 1);

          if (shouldRepeatAgain && queue.length < 100) {
            const repeat = {
              ...item,
              dueAt: alreadyRecorded ? card.dueAt : schedule.dueAt,
              reps: alreadyRecorded ? card.reps : item.reps + 1,
            };
            const insertAt = Math.min(queue.length, current.currentIndex + 3);
            queue.splice(insertAt, 0, repeat);
          }

          const nextIndex = current.currentIndex + 1;
          const queueSaveError = 'Your original grade is saved, but the queue could not be updated. Tap a grade again to retry; it will not be counted twice.';

          if (nextIndex >= queue.length) {
            if (!await commit(null, ownerKey, ownerEpoch, queueSaveError) || !sameOwner(ownerKey, ownerEpoch) || gradingRef.current !== token || sessionRef.current !== null) return null;
            return { completed: true, grade: effectiveGrade };
          }

          const advanced = await commit({
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
          }, ownerKey, ownerEpoch, queueSaveError);
          if (!advanced || !sameOwner(ownerKey, ownerEpoch) || gradingRef.current !== token || sessionRef.current?.id !== current.id) return null;
          return { completed: false, grade: effectiveGrade };
        } finally {
          if (gradingRef.current === token) gradingRef.current = null;
        }
      },

      async discardReview() {
        // Discard is allowed while Focus blocks review, but only for this exact attempt.
        const current = sessionRef.current;
        if (!ownerKey || !sameOwner(ownerKey, ownerEpoch) || !lifecycle.current.ready ||
          !current || current.id !== session?.id || current.attemptId !== session?.attemptId) return false;
        gradingRef.current = null;
        return commit(null, ownerKey, ownerEpoch);
      },
    }),
    [activeFocus, commit, ready, session, transform, updateWorkspace, waitForSaves, ownerKey, ownerEpoch, sameOwner, currentForAction, readWorkspace, retrySaves, saveError, workspaceReady],
  );

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReview() {
  const value = useContext(ReviewContext);
  if (!value) throw new Error('useReview must be used inside ReviewProvider.');
  return value;
}
