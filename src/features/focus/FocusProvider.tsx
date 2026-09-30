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
  topicId: string;
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

function historyId(now: number) {
  return `session_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function FocusProvider({ children }: PropsWithChildren) {
  const { ownerKey, workspace, updateWorkspace } = useWorkspace();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<FocusSessionState | null>(null);
  const sessionRef = useRef<FocusSessionState | null>(null);
  const ownerRef = useRef<string | null>(null);

  const commitSession = useCallback(
    async (next: FocusSessionState | null) => {
      const owner = ownerRef.current;
      sessionRef.current = next;
      setSession(next);
      if (!owner) return;
      if (next) await focusStorage.save(owner, next);
      else await focusStorage.clear(owner);
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

        if (stored && !findTopic(workspace, stored.topicId)) {
          await focusStorage.clear(ownerKey);
          stored = null;
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
    if (findTopic(workspace, current.topicId)) return;

    void commitSession(null);
  }, [commitSession, session?.topicId, workspace?.topics.length]);

  const start = useCallback(
    async (input: StartInput) => {
      if (!workspace || !ownerRef.current || sessionRef.current) return null;
      const topic = findTopic(workspace, input.topicId);
      if (!topic) return null;

      const next = createFocusSession({
        topicId: topic.id,
        topicName: topic.name,
        subject: topic.subject,
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

        updateWorkspace((draft) => {
          const topic = findTopic(draft, current.topicId);
          if (!topic) return;

          if (topic.status === 'new') topic.status = 'learning';

          draft.history.push({
            id: historyId(now),
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
        });

        await commitSession(beginBreak(current, actualMinutes, now));
      },

      async completeBreak(now = Date.now()) {
        const current = sessionRef.current;
        if (!current || current.phase !== 'break') return;

        const minutes = breakActualMinutes(current, now);
        if (minutes > 0) {
          updateWorkspace((draft) => {
            draft.breaks.push({ at: now, minutes });
          });
        }

        await commitSession(null);
      },

      async skipBreak(now = Date.now()) {
        const current = sessionRef.current;
        if (current?.phase === 'break') {
          const minutes = breakActualMinutes(current, now);
          if (minutes > 0) {
            updateWorkspace((draft) => {
              draft.breaks.push({ at: now, minutes });
            });
          }
        }
        await commitSession(null);
      },

      async discard() {
        await commitSession(null);
      },
    }),
    [commitSession, ready, session, start, transform, updateWorkspace],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider.');
  return value;
}
