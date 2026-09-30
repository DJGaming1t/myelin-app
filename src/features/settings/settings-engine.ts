import { WorkspaceSettings, WorkspaceState } from '@/src/data/schema';

export type StudyDefaultsInput = {
  dailyMinutes: number;
  focusMinutes: number;
  breakMinutes: number;
};

export type WorkspaceDataSummary = {
  topics: number;
  questions: number;
  exams: number;
  mistakes: number;
  sessions: number;
  breaks: number;
};

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function applyStudyDefaults(
  settings: WorkspaceSettings,
  input: StudyDefaultsInput,
) {
  settings.dailyMinutes = clampInt(input.dailyMinutes, 10, 720);
  settings.focusMinutes = clampInt(input.focusMinutes, 5, 90);
  settings.breakMinutes = clampInt(input.breakMinutes, 1, 30);
}

export function workspaceDataSummary(
  workspace: WorkspaceState,
): WorkspaceDataSummary {
  return {
    topics: workspace.topics.length,
    questions: workspace.topics.reduce(
      (sum, topic) => sum + topic.cards.length,
      0,
    ),
    exams: workspace.exams.length,
    mistakes: workspace.mistakes.length,
    sessions: workspace.history.length,
    breaks: workspace.breaks.length,
  };
}

export function providerLabels(providerIds: string[]) {
  const labels = [...new Set(providerIds)].map((providerId) => {
    if (providerId === 'password') return 'Email & password';
    if (providerId === 'google.com') return 'Google';
    return providerId;
  });

  return labels.length ? labels : ['Firebase account'];
}
