import { Topic, WorkspaceState } from '@/src/data/schema';

export const ONBOARDING_VERSION = 1 as const;
export const DAILY_CAPACITY_OPTIONS = [45, 60, 90, 120] as const;

export type OnboardingOutcome = 'completed' | 'skipped' | 'existing-data';

export type OnboardingRecord = {
  version: typeof ONBOARDING_VERSION;
  outcome: OnboardingOutcome;
  finishedAt: number;
};

export function normalizeDailyCapacity(value: number) {
  if (!Number.isFinite(value)) return 90;
  const rounded = Math.round(value / 5) * 5;
  return Math.max(30, Math.min(240, rounded));
}

export function hasMeaningfulWorkspaceData(workspace: WorkspaceState) {
  return (
    workspace.topics.length > 0 ||
    workspace.tasks.length > 0 ||
    workspace.commitments.length > 0 ||
    workspace.exams.length > 0 ||
    workspace.mistakes.length > 0 ||
    workspace.history.length > 0 ||
    workspace.breaks.length > 0 ||
    (workspace.focusOutcomes?.length ?? 0) > 0
  );
}

export function createOnboardingRecord(
  outcome: OnboardingOutcome,
  now = Date.now(),
): OnboardingRecord {
  return {
    version: ONBOARDING_VERSION,
    outcome,
    finishedAt: now,
  };
}

export function normalizeOnboardingRecord(value: unknown): OnboardingRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  if (raw.version !== ONBOARDING_VERSION) return null;
  if (
    raw.outcome !== 'completed' &&
    raw.outcome !== 'skipped' &&
    raw.outcome !== 'existing-data'
  ) {
    return null;
  }
  if (
    typeof raw.finishedAt !== 'number' ||
    !Number.isFinite(raw.finishedAt) ||
    raw.finishedAt <= 0
  ) {
    return null;
  }

  return {
    version: ONBOARDING_VERSION,
    outcome: raw.outcome,
    finishedAt: raw.finishedAt,
  };
}

export function shouldShowOnboarding(
  workspace: WorkspaceState,
  record: OnboardingRecord | null,
) {
  if (record) return false;
  return !hasMeaningfulWorkspaceData(workspace);
}

export function applyOnboardingSetup(
  workspace: WorkspaceState,
  dailyMinutes: number,
  firstTopic?: Topic,
) {
  workspace.settings.dailyMinutes = normalizeDailyCapacity(dailyMinutes);

  if (
    firstTopic &&
    !workspace.topics.some((topic) => topic.id === firstTopic.id)
  ) {
    workspace.topics.push(firstTopic);
  }

  return workspace;
}
