// A background or intentionally paused visual is not a failed startup.
export function startupRecoveryAction({ active, focused, paused, attempts }) {
  if (!active || !focused || paused) return 'wait';
  return attempts < 1 ? 'retry' : 'error';
}
