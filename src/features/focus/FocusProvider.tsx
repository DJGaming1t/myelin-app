import { recordFocusOutcome } from '@/src/features/adaptive/outcome-engine';
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

import { useAchievement } from '@/src/features/achievement/AchievementProvider';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { recordTaskMinutes, taskById } from '@/src/features/planning/task-engine';
import { findTopic } from '@/src/features/topics/topic-operations';

import {
  addParkedDistraction,
  beginBreak,
  breakActualMinutes,
  createFocusSession,
  extendFiveMinuteLaunch,
  focusActualMinutes,
  pauseFocusTimer,
  removeParkedDistraction,
  resumeFocusTimer,
} from './focus-engine';
import { focusStorage } from './focus-storage';
import { createFocusWriteQueue } from './focus-write-queue';
import { FocusLaunchMode, FocusSessionState } from './types';

type StartInput = {
  topicId?: string;
  taskId?: string;
  plannedMinutes: number;
  breakMinutes: number;
  launchMode: FocusLaunchMode;
  tinyStep: string;
};

type FocusContextValue = {
  ready: boolean;
  session: FocusSessionState | null;
  saveError: string | null;
  start: (input: StartInput) => Promise<FocusSessionState | null>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  extendLaunch: () => Promise<void>;
  park: (text: string) => Promise<void>;
  removeParked: (id: string) => Promise<void>;
  completeFocus: (effort: 1 | 2 | 3 | 4 | 5, now?: number) => Promise<void>;
  completeBreak: (now?: number) => Promise<void>;
  skipBreak: (now?: number) => Promise<void>;
  discard: () => Promise<void>;
};

const FocusContext = createContext<FocusContextValue | null>(null);

function historyId(focusSessionId: string) {
  return `session_${focusSessionId}`;
}

export function FocusProvider({ children }: PropsWithChildren) {
  const { ownerKey, workspace, updateWorkspace, waitForSaves } = useWorkspace();
  const celebrate = useAchievement();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<FocusSessionState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionRef = useRef<FocusSessionState | null>(null);
  const ownerRef = useRef<string | null>(null);
  const saveQueue = useRef(createFocusWriteQueue<FocusSessionState>(async (owner, next) => {
    if (next) await focusStorage.save(owner, next);
    else await focusStorage.clear(owner);
  }));

  const commitSession = useCallback(
    async (next: FocusSessionState | null) => {
      const owner = ownerRef.current;
      const previous = sessionRef.current;
      sessionRef.current = next;
      setSession(next);
      if (!owner) return;

      try {
        // Keep optimistic timer feedback while saving, but never treat a
        // rejected storage write as durable. Restore the last known state so
        // the user can retry the action after storage recovers.
        await saveQueue.current.write(owner, next);
        if (ownerRef.current === owner && sessionRef.current === next) {
          setSaveError(null);
        }
      } catch (error) {
        if (ownerRef.current === owner && sessionRef.current === next) {
          sessionRef.current = previous;
          setSession(previous);
          setSaveError('Focus changes could not be saved. The last change was reversed. Try again.');
        }
        throw error;
      }
    },
    [],
  );

  const workspaceReady = Boolean(workspace);

  useEffect(() => {
    let cancelled = false;
    ownerRef.current = ownerKey;
    sessionRef.current = null;
    setSession(null);
    setSaveError(null);

    if (!ownerKey || !workspace) {
      setReady(false);
      return () => {
        cancelled = true;
      };
    }

    setReady(false);

    focusStorage
      .load(ownerKey)
      .then(async (stored) => {
        if (cancelled || ownerRef.current !== ownerKey) return;

        if (stored) {
          const missingTopic = stored.topicId
            ? !findTopic(workspace, stored.topicId)
            : false;
          const missingTask = stored.taskId
            ? !taskById(workspace, stored.taskId)
            : false;
          if ((!stored.topicId && !stored.taskId) || missingTopic || missingTask) {
            await focusStorage.clear(ownerKey);
            stored = null;
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

    const missingTopic = current.topicId
      ? !findTopic(workspace, current.topicId)
      : false;
    const missingTask = current.taskId
      ? !taskById(workspace, current.taskId)
      : false;
    if (!missingTopic && !missingTask && (current.topicId || current.taskId)) return;

    void commitSession(null);
  }, [
    commitSession,
    session?.topicId,
    session?.taskId,
    workspace?.topics.length,
    workspace?.tasks.length,
  ]);

  const start = useCallback(
    async (input: StartInput) => {
      if (!workspace || !ownerRef.current || sessionRef.current) return null;

      const task = input.taskId ? taskById(workspace, input.taskId) : null;
      if (input.taskId && (!task || task.status !== 'open')) return null;

      const requestedTopic = input.topicId ? findTopic(workspace, input.topicId) : null;
      if (input.topicId && !requestedTopic) return null;
      if (task?.topicId && input.topicId && task.topicId !== input.topicId) return null;

      const topic =
        requestedTopic ??
        (task?.topicId ? findTopic(workspace, task.topicId) : null);
      if (!topic && !task) return null;

      const next = createFocusSession({
        ...(topic ? { topicId: topic.id } : {}),
        ...(task ? { taskId: task.id } : {}),
        topicName: task?.title || topic!.name,
        subject: task?.subject || topic?.subject || 'Study task',
        plannedMinutes: input.plannedMinutes,
        breakMinutes: input.breakMinutes,
        launchMode: input.launchMode,
        tinyStep: input.tinyStep,
      });

      await commitSession(next);
      updateWorkspace(draft => recordFocusOutcome(draft, next, 'started'));
      return next;
    },
    [commitSession, workspace, updateWorkspace],
  );

  const transform = useCallback(
    async (change: (current: FocusSessionState) => FocusSessionState) => {
      const current = sessionRef.current;
      if (!current) return;
      try {
        await commitSession(change(current));
      } catch {
        // Focus controls are often fire-and-forget presses. commitSession
        // restores the last known session and surfaces its saveError.
      }
    },
    [commitSession],
  );

  const value = useMemo<FocusContextValue>(
    () => ({
      ready,
      session,
      saveError,

      start,

      pause: () => transform((current) => pauseFocusTimer(current)),
      resume: () => transform((current) => resumeFocusTimer(current)),
      extendLaunch: () => transform((current) => extendFiveMinuteLaunch(current)),
      park: async (text) => {
        const current = sessionRef.current;
        if (!current) return;
        // The distraction input is cleared only after this write succeeds.
        // If device storage fails, its text stays available for a retry.
        await commitSession(addParkedDistraction(current, text));
      },
      removeParked: (id) =>
        transform((current) => removeParkedDistraction(current, id)),

      async completeFocus(effort, now = Date.now()) {
        const current = sessionRef.current;
        if (!current || current.phase !== 'focus' || current.focusLogged) return;

        const actualMinutes = focusActualMinutes(current, now);

        let completionApplied = false;
        const updated = updateWorkspace((draft) => {
          recordFocusOutcome(draft, current, 'finished', actualMinutes, now);
          if (current.topicId) {
            const stableHistoryId = historyId(current.id);
            if (draft.history.some((entry) => entry.id === stableHistoryId)) {
              completionApplied = true;
              return;
            }

            const topic = findTopic(draft, current.topicId);
            if (!topic) return;

            if (topic.status === 'new') topic.status = 'learning';
            if (actualMinutes >= 5) topic.postponements = 0;

            draft.history.push({
              id: stableHistoryId,
              topicId: current.topicId,
              at: now,
              kind: 'study',
              minutes: actualMinutes,
              grade: 0,
              effort,
              prompt: '',
              response: '',
              confidence: 'unsure',
              plannedMinutes: current.plannedFocusMinutes,
              startedAt: current.startedAt,
              endedAt: now,
              launchMode: current.launchMode,
              tinyStep: current.tinyStep,
            });

            if (current.taskId) {
              const task = taskById(draft, current.taskId);
              if (task) {
                recordTaskMinutes(task, actualMinutes, now);
              }
            }

            completionApplied = true;
            return;
          }

          if (current.taskId) {
            const task = taskById(draft, current.taskId);
            if (!task) return;

            if (task.lastFocusSessionId === current.id) {
              completionApplied = true;
              return;
            }

            recordTaskMinutes(task, actualMinutes, now);

            const focusDate = new Date(now);
            const focusDayKey = [
              focusDate.getFullYear(),
              String(focusDate.getMonth() + 1).padStart(2, '0'),
              String(focusDate.getDate()).padStart(2, '0'),
            ].join('-');
            task.focusMinutesForDay =
              task.focusDayKey === focusDayKey
                ? Math.min(1440, (task.focusMinutesForDay ?? 0) + actualMinutes)
                : Math.min(1440, actualMinutes);
            task.focusDayKey = focusDayKey;
            task.lastFocusSessionId = current.id;
            task.updatedAt = now;
            completionApplied = true;
          }
        });

        if (!updated || !completionApplied) {
          await commitSession(null);
          return;
        }

        // The durable workspace write must win before the recoverable focus
        // session advances to break. Topic sessions write history; standalone
        // task sessions update task minutes with an idempotency marker.
        await waitForSaves();
        await commitSession(beginBreak(current, actualMinutes, now));
        celebrate({ title: 'Focus complete!', detail: `${actualMinutes} focused minutes · ${current.topicName}` });
      },

      async completeBreak(now = Date.now()) {
        const current = sessionRef.current;
        if (!current || current.phase !== 'break') return;

        const minutes = breakActualMinutes(current, now);
        if (minutes > 0) {
          updateWorkspace((draft) => {
            const stableBreakAt = current.phaseStartedAt;
            const existing = draft.breaks.find((item) => item.at === stableBreakAt);
            if (existing) {
              existing.minutes = Math.max(existing.minutes, minutes);
              return;
            }
            draft.breaks.push({ at: stableBreakAt, minutes });
          });
          await waitForSaves();
        }

        await commitSession(null);
      },

      async skipBreak(now = Date.now()) {
        const current = sessionRef.current;
        if (current?.phase === 'break') {
          const minutes = breakActualMinutes(current, now);
          if (minutes > 0) {
            updateWorkspace((draft) => {
              const stableBreakAt = current.phaseStartedAt;
              const existing = draft.breaks.find((item) => item.at === stableBreakAt);
              if (existing) {
                existing.minutes = Math.max(existing.minutes, minutes);
                return;
              }
              draft.breaks.push({ at: stableBreakAt, minutes });
            });
            await waitForSaves();
          }
        }
        await commitSession(null);
      },

      async discard() {
        const current = sessionRef.current;
        if (current?.phase === 'focus') updateWorkspace(draft => recordFocusOutcome(draft, current, 'abandoned'));
        await commitSession(null);
      },
    }),
    [celebrate, commitSession, ready, saveError, session, start, transform, updateWorkspace, waitForSaves],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider.');
  return value;
}
