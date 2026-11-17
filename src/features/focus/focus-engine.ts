import {
  FOCUS_SESSION_FORMAT,
  FOCUS_SESSION_VERSION,
  FocusLaunchMode,
  FocusTimerMode,
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
  timerMode?: FocusTimerMode;
  freeFocus?: boolean;
  breaksRemaining?: number;
  tinyStep: string;
  now?: number;
  id?: string;
}): FocusSessionState {
  const now = input.now ?? Date.now();
  const mode = input.launchMode === 'five-minute' ? 'countdown' : input.timerMode ?? 'countdown';
  const fullTargetMinutes = mode === 'stopwatch' ? 240 : clampMinutes(input.plannedMinutes, 5, 240);
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
    timerMode: mode,
    ...(input.freeFocus ? { freeFocus: true } : {}),
    ...(mode === 'pomodoro' && input.breaksRemaining != null ? { breaksRemaining: Math.max(0, Math.min(8, Math.round(input.breaksRemaining))) } : {}),
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

/** Extend a timed focus block without losing paused or completed elapsed time. */
export function extendFocusTimer(session: FocusSessionState, minutes = 5, now = Date.now()): FocusSessionState {
  if (session.phase !== 'focus' || session.timerMode === 'stopwatch' || session.launchMode === 'five-minute') return session;
  const increment = Math.max(0, Math.floor(minutes));
  const target = Math.min(240, session.plannedFocusMinutes + increment);
  if (target <= session.plannedFocusMinutes) return session;
  if (timerIsComplete(session, now)) {
    return { ...session, fullTargetMinutes: target, plannedFocusMinutes: target,
      elapsedMs: phaseDurationMs(session), runningSince: now };
  }
  return { ...session, fullTargetMinutes: target, plannedFocusMinutes: target };
}

/** Suggestions are based on elapsed focus, and never start or pause a break themselves. */
export function configureBreakReminders(session: FocusSessionState, intervalMinutes: number, count: number, now = Date.now()): FocusSessionState {
  if (session.phase !== 'focus' || session.timerMode !== 'stopwatch' || !Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 180 || !Number.isInteger(count) || count < 0 || count > 8) return session;
  return { ...session, breakReminder: { intervalMinutes, remaining: count,
    nextAtElapsedMs: Math.min(phaseDurationMs(session), timerElapsedMs(session, now)) + intervalMinutes * MINUTE } };
}

export function breakReminderDue(session: FocusSessionState, now = Date.now()) {
  const reminder = session.breakReminder;
  return session.phase === 'focus' && !!reminder && reminder.remaining > 0 && timerElapsedMs(session, now) >= reminder.nextAtElapsedMs;
}

export function acknowledgeBreakReminder(session: FocusSessionState, pause: boolean, now = Date.now()): FocusSessionState {
  if (!breakReminderDue(session, now) || !session.breakReminder) return session;
  const elapsed = Math.min(phaseDurationMs(session), timerElapsedMs(session, now));
  const current = pause ? pauseFocusTimer(session, now) : session;
  return { ...current, breakReminder: { ...session.breakReminder,
    remaining: session.breakReminder.remaining - 1,
    nextAtElapsedMs: elapsed + session.breakReminder.intervalMinutes * MINUTE } };
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
  const { breakReminder: _completedReminder, ...completedSession } = session;
  return {
    ...completedSession,
    phase: 'break',
    phaseStartedAt: now,
    elapsedMs: 0,
    runningSince: now,
    focusLogged: true,
    focusActualMinutes: Math.max(0, Math.round(actualMinutes)),
  };
}

/** Offer rest without starting the break clock. */
export function suggestBreak(session: FocusSessionState, actualMinutes: number, now = Date.now()): FocusSessionState {
  return { ...beginBreak(session, actualMinutes, now), runningSince: null, breakSuggested: true };
}

/** Start a suggested break at the moment the user chooses it. */
export function startSuggestedBreak(session: FocusSessionState, now = Date.now()): FocusSessionState {
  if (session.phase !== 'break' || !session.breakSuggested) return session;
  return { ...session, breakSuggested: false, phaseStartedAt: now, elapsedMs: 0, runningSince: now };
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
