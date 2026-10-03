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
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<FocusSessionState | null>(null);
  const sessionRef = useRef<FocusSessionState | null>(null);
  const ownerRef = useRef<string | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const commitSession = useCallback(
    async (next: FocusSessionState | null) => {
      const owner = ownerRef.current;
      sessionRef.current = next;
      setSession(next);
      if (!owner) return;

      saveQueue.current = saveQueue.current
        .then(async () => {
          if (next) await focusStorage.save(owner, next);
          else await focusStorage.clear(owner);
        })
        .catch(() => undefined);

      await saveQueue.current;
    },
    [],
  );

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
      return next;
    },
    [commitSession, workspace],
  );

  const transform = useCallback(
    async (change: (current: FocusSessionState) => FocusSessionState) => {
      const current = sessionRef.current;
      if (!current) return;
      await commitSession(change(current));
    },
    [commitSession],
  );

  const value = useMemo<FocusContextValue>(
    () => ({
      ready,
      session,

      start,

      pause: () => transform((current) => pauseFocusTimer(current)),
      resume: () => transform((current) => resumeFocusTimer(current)),
      extendLaunch: () => transform((current) => extendFiveMinuteLaunch(current)),
      park: (text) => transform((current) => addParkedDistraction(current, text)),
      removeParked: (id) =>
        transform((current) => removeParkedDistraction(current, id)),

      async completeFocus(effort, now = Date.now()) {
        const current = sessionRef.current;
        if (!current || current.phase !== 'focus' || current.focusLogged) return;

        const actualMinutes = focusActualMinutes(current, now);

        let completionApplied = false;
        const updated = updateWorkspace((draft) => {
          if (current.topicId) {
            const stableHistoryId = historyId(current.id);
            if (draft.history.some((entry) => entry.id === stableHistoryId)) {
              completionApplied = true;
              return;
            }

            const topic = findTopic(draft, current.topicId);
            if (!topic) return;

            if (topic.status === 'new') topic.status = 'learning';

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
              if (task && task.status === 'open') {
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

            if (task.status === 'open') {
              recordTaskMinutes(task, actualMinutes, now);
            }

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
        await commitSession(null);
      },
    }),
    [commitSession, ready, session, start, transform, updateWorkspace, waitForSaves],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider.');
  return value;
}
