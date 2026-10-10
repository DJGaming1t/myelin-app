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
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import { useOnboardingTransition } from '@/src/features/onboarding/OnboardingTransitionProvider';
import { timerRemainingMs } from '@/src/features/focus/focus-engine';

import {
  ExactReminderPreview,
  ReminderOpenPayload,
  ReminderPermission,
  cancelReminderIds,
  configureNotificationRuntime,
  consumeInitialReminderResponse,
  getLegacyOwnerlessReminderIds,
  getReminderPermission,
  getScheduledReminderAudit,
  requestReminderPermission,
  removeReminderPreview,
  scheduleReminderPlan,
  sendExactReminderPreview,
  sendReminderPreview,
  subscribeToReminderResponses,
} from './notification-runtime';
import {
  ReminderKind,
  ReminderSettings,
  buildReminderPlan,
  defaultReminderSettings,
  normalizeReminderSettings,
  reminderPlanSignature,
} from './reminder-engine';
import {
  ReminderDeviceState,
  reminderMigrationStorage,
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
  trackedScheduledCount: number;
  deviceScheduleChecked: boolean;
  plannedCount: number;
  message: string;
  updateSettings: (patch: Partial<ReminderSettings>) => Promise<void>;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  reschedule: () => Promise<void>;
  sendPreview: (kind?: ReminderKind) => Promise<void>;
  sendExactPreview: (preview: ExactReminderPreview) => Promise<void>;
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

const PENDING_REMINDER_TTL_MS = 30_000;
const EXPIRED_REMINDER_FALLBACK_TTL_MS = 120_000;

type ReminderRoutingGate = {
  authReady: boolean;
  authAllowsApp: boolean;
  workspaceStatus: 'idle' | 'loading' | 'ready' | 'error';
  ownerKey: string | null;
  hasWorkspace: boolean;
  onboardingReady: boolean;
  onboardingAllowsApp: boolean;
};

function canRouteReminderPayload(
  payload: ReminderOpenPayload,
  gate: ReminderRoutingGate,
) {
  return Boolean(
    gate.authReady &&
      gate.authAllowsApp &&
      gate.workspaceStatus === 'ready' &&
      gate.ownerKey &&
      gate.hasWorkspace &&
      gate.onboardingReady &&
      gate.onboardingAllowsApp &&
      (!payload.ownerKey ||
        payload.ownerKey === gate.ownerKey),
  );
}
function canRouteReminderFallback(
  ownerKey: string | undefined,
  gate: ReminderRoutingGate,
) {
  return Boolean(
    gate.authReady &&
      gate.authAllowsApp &&
      gate.workspaceStatus === 'ready' &&
      gate.ownerKey &&
      gate.hasWorkspace &&
      gate.onboardingReady &&
      gate.onboardingAllowsApp &&
      ownerKey === gate.ownerKey,
  );
}


export function ReminderProvider({ children }: PropsWithChildren) {
  const {
    ownerKey,
    workspace,
    status: workspaceStatus,
  } = useWorkspace();
  const {
    ready: authReady,
    user,
    localMode,
  } = useAuth();
  const {
    ready: onboardingReady,
    shouldShow: onboardingShouldShow,
  } = useOnboarding();
  const { transitionPending } =
    useOnboardingTransition();
  const { session: focusSession } = useFocus();

  const [state, setState] = useState<ReminderDeviceState>(freshState);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ReminderStatus>(
    Platform.OS === 'web' ? 'unsupported' : 'loading',
  );
  const [permission, setPermission] = useState<ReminderPermission>(
    Platform.OS === 'web' ? 'unsupported' : 'undetermined',
  );
  const [message, setMessage] = useState('');
  const [registeredCount, setRegisteredCount] =
    useState(0);
  const [
    deviceScheduleChecked,
    setDeviceScheduleChecked,
  ] = useState(false);

  const stateRef = useRef(state);
  const ownerRef = useRef<string | null>(null);
  const workspaceRef = useRef(workspace);
  const focusSessionRef = useRef(focusSession);
  const handledReminderResponsesRef = useRef<Set<string>>(
    new Set(),
  );
  const pendingReminderResponsesRef = useRef<
    Map<
      string,
      {
        payload: ReminderOpenPayload;
        queuedAt: number;
      }
    >
  >(new Map());
  const expiredReminderFallbacksRef = useRef<
    Map<
      string,
      {
        responseId: string;
        ownerKey?: string;
        kind: ReminderOpenPayload['kind'];
        queuedAt: number;
      }
    >
  >(new Map());
  const routingGateRef = useRef<ReminderRoutingGate>({
    authReady,
    authAllowsApp:
      localMode || Boolean(user?.emailVerified),
    workspaceStatus,
    ownerKey,
    hasWorkspace: Boolean(workspace),
    onboardingReady,
    onboardingAllowsApp:
      transitionPending || !onboardingShouldShow,
  });
  const scheduleQueue = useRef<Promise<unknown>>(Promise.resolve());
  const scheduleGenerationRef = useRef(0);
  const reminderActionGenerationRef = useRef(0);
  const latestOwnerKeyRef = useRef(ownerKey);
  const legacyOwnerlessCleanupRef =
    useRef<Promise<void> | null>(null);

  if (latestOwnerKeyRef.current !== ownerKey) {
    latestOwnerKeyRef.current = ownerKey;
    reminderActionGenerationRef.current += 1;
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    focusSessionRef.current = focusSession;
  }, [focusSession]);

  useEffect(() => {
    scheduleGenerationRef.current += 1;
  }, [
    ownerKey,
    workspace?.revision,
    focusSession?.phase,
    focusSession?.startedAt,
    focusSession?.topicId,
    focusSession?.runningSince,
    focusSession?.elapsedMs,
    focusSession?.plannedFocusMinutes,
  ]);

  const routeReminderNow = useCallback(
    (payload: ReminderOpenPayload) => {
      if (
        handledReminderResponsesRef.current.has(
          payload.responseId,
        )
      ) {
        return;
      }

      handledReminderResponsesRef.current.add(
        payload.responseId,
      );
      pendingReminderResponsesRef.current.delete(
        payload.responseId,
      );
      expiredReminderFallbacksRef.current.delete(
        payload.responseId,
      );

      if (payload.kind === 'review') {
        router.push('/(app)/review');
        return;
      }
      if (payload.kind === 'exam') {
        router.push('/(app)/exams');
        return;
      }
      if (
        payload.recovered &&
        payload.commitmentId &&
        payload.occurrenceDateKey
      ) {
        router.push({
          pathname: '/(app)/today/day-map',
          params: {
            recoveredCommitmentId: payload.commitmentId,
            recoveredOccurrenceDateKey:
              payload.occurrenceDateKey,
            ...(payload.topicId
              ? {
                  recoveredTopicId: payload.topicId,
                }
              : {}),
            ...(payload.scheduledStart != null
              ? {
                  recoveredStart: String(
                    payload.scheduledStart,
                  ),
                }
              : {}),
            ...(payload.scheduledEnd != null
              ? {
                  recoveredEnd: String(
                    payload.scheduledEnd,
                  ),
                }
              : {}),
            recoveredHandoff: 'notification',
          },
        });
        return;
      }

      router.push('/(app)/today/day-map');
    },
    [],
  );

  const queueOrRouteReminder = useCallback(
    (payload: ReminderOpenPayload) => {
      if (
        handledReminderResponsesRef.current.has(
          payload.responseId,
        ) ||
        expiredReminderFallbacksRef.current.has(
          payload.responseId,
        )
      ) {
        return;
      }

      const gate = routingGateRef.current;

      // Old MYELIN notifications can lack ownerKey. Never route those
      // directly into owner-specific destinations; degrade to a safe Today
      // handoff and bind it to the first known owner.
      if (!payload.ownerKey) {
        const fallbackOwner =
          gate.ownerKey ?? undefined;

        if (
          canRouteReminderFallback(
            fallbackOwner,
            gate,
          )
        ) {
          handledReminderResponsesRef.current.add(
            payload.responseId,
          );
          router.push({
            pathname: '/(app)/today',
            params: {
              reminderExpired: '1',
              reminderKind: payload.kind,
            },
          });
          return;
        }

        expiredReminderFallbacksRef.current.set(
          payload.responseId,
          {
            responseId: payload.responseId,
            ownerKey: fallbackOwner,
            kind: payload.kind,
            queuedAt: Date.now(),
          },
        );
        return;
      }

      if (canRouteReminderPayload(payload, gate)) {
        routeReminderNow(payload);
        return;
      }

      const existing =
        pendingReminderResponsesRef.current.get(
          payload.responseId,
        );
      pendingReminderResponsesRef.current.set(
        payload.responseId,
        {
          payload,
          // Duplicate delivery must never extend a stale cold-launch intent.
          // Keep the timestamp from the first time this response was seen.
          queuedAt:
            existing?.queuedAt ?? Date.now(),
        },
      );
    },
    [routeReminderNow],
  );

  const flushPendingReminderResponses =
    useCallback(() => {
      const now = Date.now();
      const gate = routingGateRef.current;

      for (const [
        responseId,
        pending,
      ] of pendingReminderResponsesRef.current) {
        const wrongOwner =
          Boolean(
            gate.ownerKey &&
              pending.payload.ownerKey &&
              pending.payload.ownerKey !==
                gate.ownerKey,
          );

        if (wrongOwner) {
          pendingReminderResponsesRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
          continue;
        }

        if (
          now - pending.queuedAt >
          PENDING_REMINDER_TTL_MS
        ) {
          pendingReminderResponsesRef.current.delete(
            responseId,
          );
          expiredReminderFallbacksRef.current.set(
            responseId,
            {
              responseId,
              ownerKey: pending.payload.ownerKey,
              kind: pending.payload.kind,
              queuedAt: pending.queuedAt,
            },
          );
          continue;
        }

        if (
          canRouteReminderPayload(
            pending.payload,
            gate,
          )
        ) {
          routeReminderNow(pending.payload);
        }
      }

      for (const [
        responseId,
        fallback,
      ] of expiredReminderFallbacksRef.current) {
        if (
          now - fallback.queuedAt >
          EXPIRED_REMINDER_FALLBACK_TTL_MS
        ) {
          expiredReminderFallbacksRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
          continue;
        }

        if (!fallback.ownerKey && gate.ownerKey) {
          fallback.ownerKey = gate.ownerKey;
        }

        const wrongOwner =
          Boolean(
            gate.ownerKey &&
              fallback.ownerKey &&
              fallback.ownerKey !== gate.ownerKey,
          );

        if (wrongOwner) {
          expiredReminderFallbacksRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
          continue;
        }

        if (
          canRouteReminderFallback(
            fallback.ownerKey,
            gate,
          )
        ) {
          expiredReminderFallbacksRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
          router.push({
            pathname: '/(app)/today',
            params: {
              reminderExpired: '1',
              reminderKind: fallback.kind,
            },
          });
        }
      }
    }, [routeReminderNow]);

  useEffect(() => {
    const previousOwner =
      routingGateRef.current.ownerKey;

    if (
      previousOwner &&
      previousOwner !== ownerKey
    ) {
      for (const [
        responseId,
        pending,
      ] of pendingReminderResponsesRef.current) {
        if (
          pending.payload.ownerKey ===
          previousOwner
        ) {
          pendingReminderResponsesRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
        }
      }

      for (const [
        responseId,
        fallback,
      ] of expiredReminderFallbacksRef.current) {
        if (fallback.ownerKey === previousOwner) {
          expiredReminderFallbacksRef.current.delete(
            responseId,
          );
          handledReminderResponsesRef.current.add(
            responseId,
          );
        }
      }
    }

    routingGateRef.current = {
      authReady,
      authAllowsApp:
        localMode || Boolean(user?.emailVerified),
      workspaceStatus,
      ownerKey,
      hasWorkspace: Boolean(workspace),
      onboardingReady,
      onboardingAllowsApp:
        transitionPending || !onboardingShouldShow,
    };

    flushPendingReminderResponses();
  }, [
    authReady,
    flushPendingReminderResponses,
    localMode,
    onboardingReady,
    onboardingShouldShow,
    ownerKey,
    transitionPending,
    user?.emailVerified,
    workspace,
    workspaceStatus,
  ]);

  const ensureLegacyOwnerlessCleanup =
    useCallback(async () => {
      if (Platform.OS === 'web') return;

      if (!legacyOwnerlessCleanupRef.current) {
        legacyOwnerlessCleanupRef.current =
          (async () => {
            const alreadyCompleted =
              await reminderMigrationStorage.legacyOwnerlessCleanupCompleted();
            if (alreadyCompleted) return;

            const legacyIds =
              await getLegacyOwnerlessReminderIds();
            await cancelReminderIds(legacyIds);

            const remainingLegacyIds =
              await getLegacyOwnerlessReminderIds();
            if (remainingLegacyIds.length) {
              throw new Error(
                'Legacy MYELIN reminders could not be fully cleaned up.',
              );
            }

            await reminderMigrationStorage.markLegacyOwnerlessCleanupCompleted();
          })().catch((error) => {
            legacyOwnerlessCleanupRef.current = null;
            throw error;
          });
      }

      await legacyOwnerlessCleanupRef.current;
    }, []);

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
      const audit =
        Platform.OS === 'web'
          ? null
          : await getScheduledReminderAudit(owner).catch(
              () => null,
            );
      const idsToCancel = Array.from(
        new Set([
          ...current.scheduledIds,
          ...(audit?.registeredIds ?? []),
        ]),
      );

      await cancelReminderIds(idsToCancel);
      await reminderStorage.clearSchedule(owner);
      return {
        ...current,
        scheduledIds: [],
        planSignature: '',
      };
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const previousOwner = ownerRef.current;
    const previousState = stateRef.current;

    scheduleGenerationRef.current += 1;
    reminderActionGenerationRef.current += 1;
    ownerRef.current = ownerKey;
    setReady(false);
    setMessage('');
    setRegisteredCount(0);
    setDeviceScheduleChecked(false);
    setState(freshState());
    stateRef.current = freshState();

    if (previousOwner && previousOwner !== ownerKey) {
      void cancelCurrentSchedule(
        previousOwner,
        previousState,
      ).catch(() => undefined);
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
      ensureLegacyOwnerlessCleanup(),
    ])
      .then(async ([loaded, nextPermission]) => {
        if (cancelled || ownerRef.current !== ownerKey) return;

        const audit =
          nextPermission === 'granted'
            ? await getScheduledReminderAudit(
                ownerKey,
              ).catch(() => null)
            : null;
        if (cancelled || ownerRef.current !== ownerKey) return;

        stateRef.current = loaded;
        setState(loaded);
        setPermission(nextPermission);
        setRegisteredCount(
          audit?.registeredCount ?? 0,
        );
        setDeviceScheduleChecked(
          nextPermission !== 'granted' ||
            audit != null,
        );
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
  }, [
    cancelCurrentSchedule,
    ensureLegacyOwnerlessCleanup,
    ownerKey,
    Boolean(workspace),
  ]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let unsubscribe: () => void = () => {};
    let active = true;

    const bootstrapReminderResponses = async () => {
      const initial =
        await consumeInitialReminderResponse().catch(
          () => null,
        );
      if (!active) return;

      const next =
        await subscribeToReminderResponses(
          queueOrRouteReminder,
        ).catch(() => null);
      if (!active) {
        next?.();
        return;
      }
      if (next) unsubscribe = next;

      // Cold-launch responses are already consumed from Expo storage here.
      // If auth/workspace/onboarding are still hydrating, keep the intent
      // in memory and route only after the correct app shell is ready.
      if (initial) queueOrRouteReminder(initial);
    };

    void bootstrapReminderResponses();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [queueOrRouteReminder]);

  const doReschedule = useCallback(async () => {
    const generation =
      scheduleGenerationRef.current;
    const owner = ownerRef.current;
    const currentWorkspace = workspaceRef.current;
    const current = stateRef.current;

    const isCurrentScheduleWork = () =>
      scheduleGenerationRef.current === generation &&
      ownerRef.current === owner &&
      workspaceRef.current === currentWorkspace;

    if (
      Platform.OS === 'web' ||
      !owner ||
      !currentWorkspace ||
      !current.settings.enabled
    ) {
      return;
    }

    const currentPermission = await getReminderPermission();
    if (!isCurrentScheduleWork()) return;
    setPermission(currentPermission);

    if (currentPermission !== 'granted') {
      try {
        const cleared = await cancelCurrentSchedule(owner, current);
        if (!isCurrentScheduleWork()) return;
        await persist(cleared, owner);
        if (!isCurrentScheduleWork()) return;
        setRegisteredCount(0);
        setDeviceScheduleChecked(true);
        setStatus(currentPermission === 'denied' ? 'blocked' : 'ready');
      } catch (error) {
        if (!isCurrentScheduleWork()) return;
        setDeviceScheduleChecked(false);
        setStatus('error');
        setMessage(runtimeError(error));
      }
      return;
    }

    const planNow = Date.now();
    const activeFocus = focusSessionRef.current;
    const activeFocusRemaining =
      activeFocus?.phase === 'focus'
        ? timerRemainingMs(activeFocus, planNow)
        : 0;
    const plan = buildReminderPlan(
      currentWorkspace,
      current.settings,
      planNow,
      {
        activeFocus:
          activeFocus && activeFocusRemaining > 0
            ? {
                topicId: activeFocus.topicId ?? null,
                startedAt: activeFocus.startedAt,
                unavailableUntil:
                  planNow + activeFocusRemaining,
              }
            : null,
      },
    );
    const signature = reminderPlanSignature(plan);

    const deviceAudit =
      await getScheduledReminderAudit(owner).catch(
        () => null,
      );
    if (!isCurrentScheduleWork()) return;
    if (deviceAudit) {
      setRegisteredCount(
        deviceAudit.registeredCount,
      );
      setDeviceScheduleChecked(true);
    } else {
      // Without a device readback, do not assume a cached signature means
      // notifications exist or blindly create replacements that may duplicate.
      setDeviceScheduleChecked(false);
      setStatus('error');
      setMessage('Could not verify reminders on this device. Saved reminders were left unchanged. Tap Refresh schedule to retry.');
      return;
    }

    const trackedIdsMatchDevice =
      deviceAudit != null &&
      deviceAudit.registeredIds.length ===
        current.scheduledIds.length &&
      current.scheduledIds.every((id) =>
        deviceAudit.registeredIds.includes(id),
      );

    if (
      signature === current.planSignature &&
      current.scheduledIds.length === plan.length &&
      trackedIdsMatchDevice
    ) {
      setStatus(plan.length ? 'active' : 'ready');
      return;
    }

    setStatus('scheduling');
    setMessage('');

    try {
      await cancelReminderIds(
        Array.from(
          new Set([
            ...current.scheduledIds,
            ...deviceAudit.registeredIds,
          ]),
        ),
      );
    } catch (error) {
      if (!isCurrentScheduleWork()) return;
      // The existing registration IDs and plan signature are still valid
      // recovery evidence. Never schedule replacements over stale alerts.
      setDeviceScheduleChecked(false);
      setStatus('error');
      setMessage(runtimeError(error));
      return;
    }
    if (!isCurrentScheduleWork()) return;

    try {
      const ids = await scheduleReminderPlan(
        plan,
        current.settings,
        owner,
      );
      if (!isCurrentScheduleWork()) {
        await cancelReminderIds(ids);
        return;
      }

      const readback =
        await getScheduledReminderAudit(owner).catch(
          () => null,
        );
      if (!isCurrentScheduleWork()) {
        await cancelReminderIds(ids);
        return;
      }
      const registered =
        readback?.registeredCount ?? ids.length;
      const readbackMatches =
        readback == null ||
        (readback.registeredIds.length ===
          ids.length &&
          ids.every((id) =>
            readback.registeredIds.includes(id),
          ));

      const next = {
        ...current,
        scheduledIds: ids,
        planSignature: readbackMatches
          ? signature
          : '',
      };
      if (!isCurrentScheduleWork()) {
        await cancelReminderIds(ids);
        return;
      }
      await persist(next, owner);
      if (!isCurrentScheduleWork()) {
        await cancelReminderIds(ids);
        return;
      }
      setRegisteredCount(registered);
      setDeviceScheduleChecked(readback != null);
      setStatus(
        readbackMatches
          ? ids.length
            ? 'active'
            : 'ready'
          : 'error',
      );
      setMessage(
        !readbackMatches
          ? `MYELIN planned ${plan.length}, but the device reports ${registered} registered. Refresh schedule to repair the difference.`
          : ids.length
            ? `${ids.length} reminder${ids.length === 1 ? '' : 's'} scheduled and verified on this device.`
            : 'Reminders are on, but nothing currently needs a notification.',
      );
    } catch (error) {
      if (!isCurrentScheduleWork()) return;
      const next = {
        ...current,
        scheduledIds: [],
        planSignature: '',
      };
      await persist(next, owner);
      if (!isCurrentScheduleWork()) return;
      setRegisteredCount(0);
      setDeviceScheduleChecked(false);
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
    focusSession?.phase,
    focusSession?.startedAt,
    focusSession?.topicId,
    focusSession?.runningSince,
    focusSession?.elapsedMs,
    focusSession?.plannedFocusMinutes,
  ]);

  const beginReminderAction = useCallback(() => {
    const owner = ownerRef.current;
    if (
      !owner ||
      latestOwnerKeyRef.current !== owner
    ) {
      return null;
    }

    reminderActionGenerationRef.current += 1;
    return {
      owner,
      generation:
        reminderActionGenerationRef.current,
    };
  }, []);

  const isCurrentReminderAction = useCallback(
    (action: {
      owner: string;
      generation: number;
    }) =>
      reminderActionGenerationRef.current ===
        action.generation &&
      latestOwnerKeyRef.current === action.owner &&
      ownerRef.current === action.owner,
    [],
  );

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

      scheduleGenerationRef.current += 1;
      await persist(next, owner);
      if (!settings.enabled) setStatus('off');
    },
    [persist],
  );

  const enable = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    const action = beginReminderAction();
    if (!action) return false;
    const { owner } = action;

    setStatus('scheduling');
    setMessage('');

    try {
      const nextPermission = await requestReminderPermission();
      if (!isCurrentReminderAction(action)) {
        return false;
      }
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
        scheduleGenerationRef.current += 1;
        await persist(next, owner);
        if (!isCurrentReminderAction(action)) {
          return false;
        }
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
      scheduleGenerationRef.current += 1;
      await persist(next, owner);
      if (!isCurrentReminderAction(action)) {
        return false;
      }
      await doReschedule();
      return isCurrentReminderAction(action);
    } catch (error) {
      if (!isCurrentReminderAction(action)) {
        return false;
      }
      setStatus('error');
      setMessage(runtimeError(error));
      return false;
    }
  }, [
    beginReminderAction,
    doReschedule,
    isCurrentReminderAction,
    persist,
  ]);

  const disable = useCallback(async () => {
    const action = beginReminderAction();
    if (!action) return;
    const { owner } = action;

    scheduleGenerationRef.current += 1;
    const current = stateRef.current;
    try {
      const cleared = await cancelCurrentSchedule(owner, current);
      if (!isCurrentReminderAction(action)) return;

      const next = {
        ...cleared,
        settings: {
          ...cleared.settings,
          enabled: false,
        },
      };

      await persist(next, owner);
      if (!isCurrentReminderAction(action)) return;
      setRegisteredCount(0);
      setDeviceScheduleChecked(true);
      setStatus('off');
      setMessage('Reminders are off. Your reminder style and times are still saved.');
    } catch (error) {
      if (!isCurrentReminderAction(action)) return;
      // Keep enabled and retain saved IDs: the old alerts may still exist.
      setDeviceScheduleChecked(false);
      setStatus('error');
      setMessage('Could not turn reminders off safely. ' + runtimeError(error));
    }
  }, [
    beginReminderAction,
    cancelCurrentSchedule,
    isCurrentReminderAction,
    persist,
  ]);

  const sendPreview = useCallback(
    async (kind: ReminderKind = 'review') => {
      if (Platform.OS === 'web') return;
      const action = beginReminderAction();
      if (!action) return;
      const { owner } = action;
      let previewId: string | null = null;

      try {
        const nextPermission =
          await getReminderPermission();
        if (!isCurrentReminderAction(action)) return;
        setPermission(nextPermission);

        if (nextPermission !== 'granted') {
          setStatus(
            nextPermission === 'denied'
              ? 'blocked'
              : 'ready',
          );
          setMessage(
            'Enable reminders first to send a real device preview.',
          );
          return;
        }

        await configureNotificationRuntime();
        if (!isCurrentReminderAction(action)) return;

        previewId =
          (await sendReminderPreview(
            stateRef.current.settings,
            kind,
            owner,
          )) ?? null;
        if (!isCurrentReminderAction(action)) {
          await removeReminderPreview(previewId);
          return;
        }

        setMessage(
          `${kind === 'review' ? 'Review' : kind === 'exam' ? 'Exam' : 'Study'} preview sent with your current personality, detail and sound.`,
        );
      } catch (error) {
        if (previewId && !isCurrentReminderAction(action)) {
          await removeReminderPreview(previewId);
          return;
        }
        if (!isCurrentReminderAction(action)) return;
        setStatus('error');
        setMessage(runtimeError(error));
      }
    },
    [
      beginReminderAction,
      isCurrentReminderAction,
    ],
  );

  const sendExactPreview = useCallback(
    async (preview: ExactReminderPreview) => {
      if (Platform.OS === 'web') return;
      const action = beginReminderAction();
      if (!action) return;
      const { owner } = action;
      let previewId: string | null = null;

      try {
        const nextPermission =
          await getReminderPermission();
        if (!isCurrentReminderAction(action)) return;
        setPermission(nextPermission);

        if (nextPermission !== 'granted') {
          setStatus(
            nextPermission === 'denied'
              ? 'blocked'
              : 'ready',
          );
          setMessage(
            'Enable reminders first to send a real device preview.',
          );
          return;
        }

        previewId =
          (await sendExactReminderPreview(
            stateRef.current.settings,
            preview,
            owner,
          )) ?? null;
        if (!isCurrentReminderAction(action)) {
          await removeReminderPreview(previewId);
          return;
        }

        setMessage(
          'Exact recovered reminder preview sent with the current personality, detail and sound.',
        );
      } catch (error) {
        if (previewId && !isCurrentReminderAction(action)) {
          await removeReminderPreview(previewId);
          return;
        }
        if (!isCurrentReminderAction(action)) return;
        setStatus('error');
        setMessage(runtimeError(error));
      }
    },
    [
      beginReminderAction,
      isCurrentReminderAction,
    ],
  );

  const refreshPermission = useCallback(async () => {
    const action = beginReminderAction();
    if (!action) {
      return getReminderPermission();
    }

    const next = await getReminderPermission();
    if (!isCurrentReminderAction(action)) {
      return next;
    }
    setPermission(next);

    if (stateRef.current.settings.enabled) {
      setStatus(
        next === 'granted'
          ? 'ready'
          : next === 'denied'
            ? 'blocked'
            : 'ready',
      );
      if (next === 'granted') {
        void reschedule();
      }
    }

    return next;
  }, [
    beginReminderAction,
    isCurrentReminderAction,
    reschedule,
  ]);

  const plannedCount = useMemo(() => {
    if (!workspace) return 0;
    const planNow = Date.now();
    const activeFocusRemaining =
      focusSession?.phase === 'focus'
        ? timerRemainingMs(focusSession, planNow)
        : 0;
    return buildReminderPlan(
      workspace,
      { ...state.settings, enabled: true },
      planNow,
      {
        activeFocus:
          focusSession && activeFocusRemaining > 0
            ? {
                topicId: focusSession.topicId ?? null,
                startedAt: focusSession.startedAt,
                unavailableUntil:
                  planNow + activeFocusRemaining,
              }
            : null,
      },
    ).length;
  }, [
    focusSession?.phase,
    focusSession?.startedAt,
    focusSession?.topicId,
    focusSession?.runningSince,
    focusSession?.elapsedMs,
    focusSession?.plannedFocusMinutes,
    state.settings,
    workspace,
  ]);

  const value = useMemo<ReminderContextValue>(
    () => ({
      ready,
      status,
      permission,
      settings: state.settings,
      scheduledCount: registeredCount,
      trackedScheduledCount:
        state.scheduledIds.length,
      deviceScheduleChecked,
      plannedCount,
      message,
      updateSettings,
      enable,
      disable,
      reschedule,
      sendPreview,
      sendExactPreview,
      refreshPermission,
    }),
    [
      disable,
      enable,
      message,
      permission,
      plannedCount,
      registeredCount,
      deviceScheduleChecked,
      ready,
      refreshPermission,
      reschedule,
      sendExactPreview,
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
