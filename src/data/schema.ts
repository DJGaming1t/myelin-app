export const WORKSPACE_FORMAT = 'myelin.native.workspace' as const;
export const CURRENT_SCHEMA_VERSION = 2 as const;

export type TopicStatus = 'new' | 'learning' | 'review';
export type Priority = 1 | 2 | 3;
export type ReviewGrade = 0 | 1 | 2 | 3;
export type Confidence = 'sure' | 'partial' | 'unsure';
export type SessionKind = 'study' | 'review';
export type MistakeReason = 'concept' | 'calculation' | 'recall' | 'application';
export type EnergyLevel = 'low' | 'normal';
export type StudyTaskType = 'homework' | 'revision' | 'practice' | 'assignment' | 'personal';
export type StudyTaskStatus = 'open' | 'completed';
export type StudyTaskPlanState = 'inbox' | 'today' | 'scheduled' | 'postponed';
export type CommitmentKind = 'school' | 'tuition' | 'coaching' | 'meal' | 'commute' | 'sleep' | 'appointment' | 'other';

export type StudyTask = {
  id: string;
  title: string;
  subject: string;
  topicId: string | null;
  examId: string | null;
  type: StudyTaskType;
  status: StudyTaskStatus;
  planState: StudyTaskPlanState;
  dueAt: number;
  estimatedMinutes: number;
  actualMinutes: number;
  priority: Priority;
  notes: string;
  scheduledStart: number;
  scheduledEnd: number;
  postponedUntil: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
};

export type Commitment = {
  id: string;
  title: string;
  kind: CommitmentKind;
  startAt: number;
  endAt: number;
  recurrenceDays: number[];
  createdAt: number;
  updatedAt: number;
};

export type RecallQuestion = {
  id: string;
  prompt: string;
  answer: string;
  hint: string;
  dueAt: number;
  intervalDays: number;
  lastGrade: ReviewGrade;
  lastReviewed: number;
  reps: number;
};

export type Topic = {
  id: string;
  name: string;
  subject: string;
  createdAt: number;
  status: TopicStatus;
  priority: Priority;
  estimate: number;
  notes: string;
  dueAt: number;
  intervalDays: number;
  lastGrade: ReviewGrade;
  lastReviewed: number;
  snoozeUntil: number;
  cards: RecallQuestion[];
};

export type Exam = {
  id: string;
  name: string;
  date: number;
  subjects: string[];
  scope: 'subjects' | 'topics';
  topicIds: string[];
};

export type Mistake = {
  id: string;
  topicId: string;
  cardId: string | null;
  prompt: string;
  detail: string;
  correction: string;
  reason: MistakeReason;
  createdAt: number;
  dueAt: number;
  resolvedAt: number;
  wins: number;
  lastWinDay: string;
  intervalDays: number;
};

export type StudySession = {
  id: string;
  topicId: string;
  cardId?: string;
  mistakeId?: string;
  at: number;
  kind: SessionKind;
  minutes: number;
  grade: ReviewGrade;
  effort: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  response: string;
  confidence: Confidence;
  plannedMinutes?: number;
  startedAt?: number;
  endedAt?: number;
  launchMode?: 'full' | 'five-minute';
  tinyStep?: string;
  hintUsed?: boolean;
  reviewAttemptId?: string;
};

export type BreakLog = {
  at: number;
  minutes: number;
};

export type WorkspaceSettings = {
  dailyMinutes: number;
  focusMinutes: number;
  breakMinutes: number;
  energy: EnergyLevel;
  reduceMotion: boolean;
};

export type WorkspaceState = {
  format: typeof WORKSPACE_FORMAT;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  revision: number;
  updatedAt: number;
  topics: Topic[];
  exams: Exam[];
  mistakes: Mistake[];
  history: StudySession[];
  breaks: BreakLog[];
  tasks: StudyTask[];
  commitments: Commitment[];
  settings: WorkspaceSettings;
};

export const defaultWorkspaceSettings = (): WorkspaceSettings => ({
  dailyMinutes: 90,
  focusMinutes: 45,
  breakMinutes: 10,
  energy: 'normal',
  reduceMotion: false,
});

export function createEmptyWorkspace(now = Date.now()): WorkspaceState {
  return {
    format: WORKSPACE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    topics: [],
    exams: [],
    mistakes: [],
    history: [],
    breaks: [],
    tasks: [],
    commitments: [],
    settings: defaultWorkspaceSettings(),
  };
}

export function cloneWorkspace(workspace: WorkspaceState): WorkspaceState {
  return JSON.parse(JSON.stringify(workspace)) as WorkspaceState;
}
