import {
  FOCUS_SESSION_FORMAT,
  FOCUS_SESSION_VERSION,
  FocusLaunchMode,
  FocusSessionState,
  ParkedDistraction,
} from './types';

const MINUTE = 60_000;

function clampMinutes(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function id(prefix: string, now: number) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createFocusSession(input: {
  topicId?: string;
  taskId?: string;
  topicName: string;
  subject: string;
  plannedMinutes: number;
  breakMinutes: number;
  launchMode: FocusLaunchMode;
  tinyStep: string;
  now?: number;
  id?: string;
}): FocusSessionState {
  const now = input.now ?? Date.now();
  const fullTargetMinutes = clampMinutes(input.plannedMinutes, 5, 240);
  const plannedFocusMinutes = input.launchMode === 'five-minute' ? 5 : fullTargetMinutes;

  return {
    format: FOCUS_SESSION_FORMAT,
    version: FOCUS_SESSION_VERSION,
    id: input.id ?? id('focus', now),
    ...(input.topicId ? { topicId: input.topicId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    topicName: input.topicName,
    subject: input.subject,
    phase: 'focus',
    launchMode: input.launchMode,
    tinyStep: input.tinyStep.trim(),
    fullTargetMinutes,
    plannedFocusMinutes,
    breakMinutes: clampMinutes(input.breakMinutes, 1, 30),
    startedAt: now,
    phaseStartedAt: now,
    elapsedMs: 0,
    runningSince: now,
    focusLogged: false,
    focusActualMinutes: 0,
    distractions: [],
  };
}

export function phaseDurationMs(session: FocusSessionState) {
  const minutes = session.phase === 'focus' ? session.plannedFocusMinutes : session.breakMinutes;
  return minutes * MINUTE;
}

export function timerElapsedMs(session: FocusSessionState, now = Date.now()) {
  const live = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince);
  return Math.max(0, session.elapsedMs + live);
}

export function timerRemainingMs(session: FocusSessionState, now = Date.now()) {
  return Math.max(0, phaseDurationMs(session) - timerElapsedMs(session, now));
}

export function timerIsComplete(session: FocusSessionState, now = Date.now()) {
  return timerRemainingMs(session, now) <= 0;
}

export function pauseFocusTimer(session: FocusSessionState, now = Date.now()): FocusSessionState {
  if (session.runningSince === null) return session;
  return {
    ...session,
    elapsedMs: Math.min(phaseDurationMs(session), timerElapsedMs(session, now)),
    runningSince: null,
  };
}

export function resumeFocusTimer(session: FocusSessionState, now = Date.now()): FocusSessionState {
  if (session.runningSince !== null || timerIsComplete(session, now)) return session;
  return { ...session, runningSince: now };
}

export function extendFiveMinuteLaunch(
  session: FocusSessionState,
  now = Date.now(),
): FocusSessionState {
  if (
    session.phase !== 'focus' ||
    session.launchMode !== 'five-minute' ||
    session.fullTargetMinutes <= session.plannedFocusMinutes
  ) {
    return session;
  }

  const elapsed = Math.min(phaseDurationMs(session), timerElapsedMs(session, now));

  return {
    ...session,
    launchMode: 'full',
    plannedFocusMinutes: session.fullTargetMinutes,
    elapsedMs: elapsed,
    runningSince: now,
  };
}

export function addParkedDistraction(
  session: FocusSessionState,
  text: string,
  now = Date.now(),
): FocusSessionState {
  const clean = text.trim().slice(0, 240);
  if (!clean || session.distractions.length >= 30) return session;

  const distraction: ParkedDistraction = {
    id: id('park', now),
    text: clean,
    createdAt: now,
  };

  return {
    ...session,
    distractions: [...session.distractions, distraction],
  };
}

export function removeParkedDistraction(
  session: FocusSessionState,
  distractionId: string,
): FocusSessionState {
  return {
    ...session,
    distractions: session.distractions.filter((item) => item.id !== distractionId),
  };
}

export function focusActualMinutes(session: FocusSessionState, now = Date.now()) {
  const elapsed = Math.min(phaseDurationMs(session), timerElapsedMs(session, now));
  return Math.max(0, Math.round(elapsed / MINUTE));
}

export function beginBreak(
  session: FocusSessionState,
  actualMinutes: number,
  now = Date.now(),
): FocusSessionState {
  return {
    ...session,
    phase: 'break',
    phaseStartedAt: now,
    elapsedMs: 0,
    runningSince: now,
    focusLogged: true,
    focusActualMinutes: Math.max(0, Math.round(actualMinutes)),
  };
}

export function breakActualMinutes(session: FocusSessionState, now = Date.now()) {
  if (session.phase !== 'break') return 0;
  const elapsed = Math.min(phaseDurationMs(session), timerElapsedMs(session, now));
  return Math.max(0, Math.round(elapsed / MINUTE));
}

export function formatTimer(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
