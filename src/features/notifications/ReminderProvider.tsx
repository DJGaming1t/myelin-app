import { router } from 'expo-router';
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
import { Platform } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';

import {
  ReminderPermission,
  cancelReminderIds,
  configureNotificationRuntime,
  getReminderPermission,
  requestReminderPermission,
  scheduleReminderPlan,
  sendReminderPreview,
  subscribeToReminderResponses,
} from './notification-runtime';
import {
  ReminderSettings,
  buildReminderPlan,
  defaultReminderSettings,
  normalizeReminderSettings,
  reminderPlanSignature,
} from './reminder-engine';
import {
  ReminderDeviceState,
  reminderStorage,
} from './reminder-storage';

export type ReminderStatus =
  | 'unsupported'
  | 'loading'
  | 'off'
  | 'ready'
  | 'scheduling'
  | 'active'
  | 'blocked'
  | 'error';

type ReminderContextValue = {
  ready: boolean;
  status: ReminderStatus;
  permission: ReminderPermission;
  settings: ReminderSettings;
  scheduledCount: number;
  plannedCount: number;
  message: string;
  updateSettings: (patch: Partial<ReminderSettings>) => Promise<void>;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  reschedule: () => Promise<void>;
  sendPreview: () => Promise<void>;
  refreshPermission: () => Promise<ReminderPermission>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

function freshState(): ReminderDeviceState {
  return {
    settings: defaultReminderSettings(),
    scheduledIds: [],
    planSignature: '',
  };
}

function runtimeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.toLowerCase().includes('permission')) {
    return 'Notification permission is not available. Your reminder settings are still saved.';
  }
  if (message) return message;
  return 'Reminders could not be scheduled right now.';
}

export function ReminderProvider({ children }: PropsWithChildren) {
  const { ownerKey, workspace } = useWorkspace();

  const [state, setState] = useState<ReminderDeviceState>(freshState);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ReminderStatus>(
    Platform.OS === 'web' ? 'unsupported' : 'loading',
  );
  const [permission, setPermission] = useState<ReminderPermission>(
    Platform.OS === 'web' ? 'unsupported' : 'undetermined',
  );
  const [message, setMessage] = useState('');

  const stateRef = useRef(state);
  const ownerRef = useRef<string | null>(null);
  const workspaceRef = useRef(workspace);
  const scheduleQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const persist = useCallback(
    async (next: ReminderDeviceState, owner = ownerRef.current) => {
      stateRef.current = next;
      setState(next);
      if (owner) await reminderStorage.save(owner, next);
    },
    [],
  );

  const cancelCurrentSchedule = useCallback(
    async (owner: string, current: ReminderDeviceState) => {
      await cancelReminderIds(current.scheduledIds);
      const cleared = {
        ...current,
        scheduledIds: [],
        planSignature: '',
      };
      await reminderStorage.save(owner, cleared);
      return cleared;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const previousOwner = ownerRef.current;
    const previousState = stateRef.current;

    ownerRef.current = ownerKey;
    setReady(false);
    setMessage('');
    setState(freshState());
    stateRef.current = freshState();

    if (previousOwner && previousOwner !== ownerKey) {
      void cancelCurrentSchedule(previousOwner, previousState);
    }

    if (!ownerKey || !workspace) {
      setStatus(Platform.OS === 'web' ? 'unsupported' : 'off');
      setReady(Boolean(ownerKey === null));
      return () => {
        cancelled = true;
      };
    }

    if (Platform.OS === 'web') {
      setStatus('unsupported');
      setPermission('unsupported');
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      reminderStorage.load(ownerKey),
      getReminderPermission(),
      configureNotificationRuntime(),
    ])
      .then(([loaded, nextPermission]) => {
        if (cancelled || ownerRef.current !== ownerKey) return;
        stateRef.current = loaded;
        setState(loaded);
        setPermission(nextPermission);
        setStatus(
          !loaded.settings.enabled
            ? 'off'
            : nextPermission === 'granted'
              ? 'ready'
              : nextPermission === 'denied'
                ? 'blocked'
                : 'ready',
        );
        setReady(true);
      })
      .catch((error) => {
        if (cancelled || ownerRef.current !== ownerKey) return;
        setStatus('error');
        setMessage(runtimeError(error));
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cancelCurrentSchedule, ownerKey, Boolean(workspace)]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let unsubscribe: () => void = () => {};
    let active = true;

    subscribeToReminderResponses((kind) => {
      if (kind === 'review') router.push('/(app)/review');
      else router.push('/(app)/exams');
    })
      .then((next) => {
        if (!active) {
          next();
          return;
        }
        unsubscribe = next;
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const doReschedule = useCallback(async () => {
    const owner = ownerRef.current;
    const currentWorkspace = workspaceRef.current;
    const current = stateRef.current;

    if (
      Platform.OS === 'web' ||
      !owner ||
      !currentWorkspace ||
      !current.settings.enabled
    ) {
      return;
    }

    const currentPermission = await getReminderPermission();
    setPermission(currentPermission);

    if (currentPermission !== 'granted') {
      if (current.scheduledIds.length) {
        const cleared = await cancelCurrentSchedule(owner, current);
        await persist(cleared, owner);
      }
      setStatus(currentPermission === 'denied' ? 'blocked' : 'ready');
      return;
    }

    const plan = buildReminderPlan(
      currentWorkspace,
      current.settings,
      Date.now(),
    );
    const signature = reminderPlanSignature(plan);

    if (
      signature === current.planSignature &&
      current.scheduledIds.length === plan.length
    ) {
      setStatus(plan.length ? 'active' : 'ready');
      return;
    }

    setStatus('scheduling');
    setMessage('');

    await cancelReminderIds(current.scheduledIds);

    try {
      const ids = await scheduleReminderPlan(plan, current.settings);
      const next = {
        ...current,
        scheduledIds: ids,
        planSignature: signature,
      };
      await persist(next, owner);
      setStatus(ids.length ? 'active' : 'ready');
      setMessage(
        ids.length
          ? `${ids.length} reminder${ids.length === 1 ? '' : 's'} scheduled from your current study data.`
          : 'Reminders are on, but nothing currently needs a notification.',
      );
    } catch (error) {
      const next = {
        ...current,
        scheduledIds: [],
        planSignature: '',
      };
      await persist(next, owner);
      setStatus('error');
      setMessage(runtimeError(error));
    }
  }, [cancelCurrentSchedule, persist]);

  const reschedule = useCallback(async () => {
    scheduleQueue.current = scheduleQueue.current
      .then(() => doReschedule())
      .catch(() => undefined);
    await scheduleQueue.current;
  }, [doReschedule]);

  useEffect(() => {
    if (
      !ready ||
      Platform.OS === 'web' ||
      !state.settings.enabled ||
      permission !== 'granted' ||
      !workspace
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void reschedule();
    }, 900);

    return () => clearTimeout(timer);
  }, [
    permission,
    ready,
    reschedule,
    state.settings,
    workspace?.revision,
  ]);

  const updateSettings = useCallback(
    async (patch: Partial<ReminderSettings>) => {
      const owner = ownerRef.current;
      if (!owner) return;

      const current = stateRef.current;
      const settings = normalizeReminderSettings({
        ...current.settings,
        ...patch,
      });

      const next = {
        ...current,
        settings,
        planSignature: '',
      };

      await persist(next, owner);
      if (!settings.enabled) setStatus('off');
    },
    [persist],
  );

  const enable = useCallback(async () => {
    const owner = ownerRef.current;
    if (!owner || Platform.OS === 'web') return false;

    setStatus('scheduling');
    setMessage('');

    try {
      const nextPermission = await requestReminderPermission();
      setPermission(nextPermission);

      if (nextPermission !== 'granted') {
        const next = {
          ...stateRef.current,
          settings: {
            ...stateRef.current.settings,
            enabled: false,
          },
          planSignature: '',
        };
        await persist(next, owner);
        setStatus(nextPermission === 'denied' ? 'blocked' : 'off');
        setMessage(
          nextPermission === 'denied'
            ? 'Notifications are blocked by the device. You can change this in system settings.'
            : 'Notification permission was not granted.',
        );
        return false;
      }

      const next = {
        ...stateRef.current,
        settings: {
          ...stateRef.current.settings,
          enabled: true,
        },
        planSignature: '',
      };
      await persist(next, owner);
      await doReschedule();
      return true;
    } catch (error) {
      setStatus('error');
      setMessage(runtimeError(error));
      return false;
    }
  }, [doReschedule, persist]);

  const disable = useCallback(async () => {
    const owner = ownerRef.current;
    if (!owner) return;

    const current = stateRef.current;
    await cancelReminderIds(current.scheduledIds);

    const next = {
      ...current,
      settings: {
        ...current.settings,
        enabled: false,
      },
      scheduledIds: [],
      planSignature: '',
    };

    await persist(next, owner);
    setStatus('off');
    setMessage('Reminders are off. Your reminder style and times are still saved.');
  }, [persist]);

  const sendPreview = useCallback(async () => {
    if (Platform.OS === 'web') return;

    const nextPermission = await getReminderPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'granted') {
      setStatus(nextPermission === 'denied' ? 'blocked' : 'ready');
      setMessage('Enable reminders first to send a real device preview.');
      return;
    }

    try {
      await configureNotificationRuntime();
      await sendReminderPreview(stateRef.current.settings);
      setMessage('Preview sent. It uses your current reminder personality and sound choice.');
    } catch (error) {
      setStatus('error');
      setMessage(runtimeError(error));
    }
  }, []);

  const refreshPermission = useCallback(async () => {
    const next = await getReminderPermission();
    setPermission(next);

    if (stateRef.current.settings.enabled) {
      setStatus(
        next === 'granted'
          ? 'ready'
          : next === 'denied'
            ? 'blocked'
            : 'ready',
      );
      if (next === 'granted') void reschedule();
    }

    return next;
  }, [reschedule]);

  const plannedCount = useMemo(() => {
    if (!workspace) return 0;
    return buildReminderPlan(
      workspace,
      { ...state.settings, enabled: true },
      Date.now(),
    ).length;
  }, [state.settings, workspace]);

  const value = useMemo<ReminderContextValue>(
    () => ({
      ready,
      status,
      permission,
      settings: state.settings,
      scheduledCount: state.scheduledIds.length,
      plannedCount,
      message,
      updateSettings,
      enable,
      disable,
      reschedule,
      sendPreview,
      refreshPermission,
    }),
    [
      disable,
      enable,
      message,
      permission,
      plannedCount,
      ready,
      refreshPermission,
      reschedule,
      sendPreview,
      state.scheduledIds.length,
      state.settings,
      status,
      updateSettings,
    ],
  );

  return (
    <ReminderContext.Provider value={value}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const value = useContext(ReminderContext);
  if (!value) throw new Error('useReminders must be used inside ReminderProvider.');
  return value;
}
