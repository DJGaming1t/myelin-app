export const FOCUS_SESSION_FORMAT = 'myelin.native.focus' as const;
export const FOCUS_SESSION_VERSION = 1 as const;

export type FocusTimerMode = 'countdown' | 'pomodoro' | 'stopwatch';
export type FocusLaunchMode = 'full' | 'five-minute';
export type FocusPhase = 'focus' | 'break';

export type ParkedDistraction = {
  id: string;
  text: string;
  createdAt: number;
};

export type FocusSessionState = {
  format: typeof FOCUS_SESSION_FORMAT;
  version: typeof FOCUS_SESSION_VERSION;
  id: string;
  topicId?: string;
  taskId?: string;
  topicName: string;
  subject: string;
  phase: FocusPhase;
  launchMode: FocusLaunchMode;
  timerMode?: FocusTimerMode;
  breakSuggested?: boolean;
  freeFocus?: boolean;
  breaksRemaining?: number;
  breakReminder?: { intervalMinutes: number; remaining: number; nextAtElapsedMs: number };
  tinyStep: string;
  fullTargetMinutes: number;
  plannedFocusMinutes: number;
  breakMinutes: number;
  startedAt: number;
  phaseStartedAt: number;
  elapsedMs: number;
  runningSince: number | null;
  focusLogged: boolean;
  focusActualMinutes: number;
  distractions: ParkedDistraction[];
};
