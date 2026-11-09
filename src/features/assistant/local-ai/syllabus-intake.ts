import { Priority, TopicStatus, WorkspaceState } from '@/src/data/schema';
import {
  AssistantAction,
  AssistantExamPlanSummary,
} from '../ai-action-engine';
import {
  PreparedAssistantActionBatch,
  buildDefaultExamPlanSummary,
  prepareAssistantActionBatch,
} from '../assistant-action-session';

export type SyllabusPriority = Priority;
export type SyllabusTopicStatus = TopicStatus;

export type SyllabusReviewTopicDraft = {
  subject: string;
  name: string;
  estimatedMinutes: number | null;
  priority: SyllabusPriority | null;
  status: SyllabusTopicStatus | null;
};

export type SyllabusAutopilotPlan = {
  strain: AssistantExamPlanSummary['strain'];
  capacityProfile: AssistantExamPlanSummary['capacity'];
  workloadLedger: AssistantExamPlanSummary['workload'];
  feasibility: AssistantExamPlanSummary['feasibility'];
  exams: AssistantExamPlanSummary['exams'];
  days: AssistantExamPlanSummary['days'];
};

export type PreparedSyllabusImport = {
  examName: string;
  examDate: string;
  sourceChunkCount: number;
  newTopicCount: number;
  existingTopicCount: number;
  warnings: string[];
  subjects: Array<{
    name: string;
    topics: Array<{
      name: string;
      estimatedMinutes: number | null;
      priority: SyllabusPriority | null;
      status: SyllabusTopicStatus | null;
    }>;
  }>;
  autopilotPlan: SyllabusAutopilotPlan;
  prepared: PreparedAssistantActionBatch;
};

function buildSyllabusAutopilotPlan(workspace: WorkspaceState): SyllabusAutopilotPlan {
  const base = buildDefaultExamPlanSummary(workspace, Date.now());
  return {
    strain: base.strain,
    capacityProfile: base.capacity,
    workloadLedger: base.workload,
    feasibility: base.feasibility,
    exams: base.exams,
    days: base.days,
  };
}

export function prepareReviewedSyllabusImport({
  workspace,
  examName,
  examDate,
  sourceChunkCount,
  topics,
}: {
  workspace: WorkspaceState;
  examName: string;
  examDate: string;
  sourceChunkCount: number;
  topics: SyllabusReviewTopicDraft[];
}): PreparedSyllabusImport {
  const cleanExam = examName.trim();
  const cleanDate = examDate.trim();
  if (!cleanExam) throw new Error('Enter an exam name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    throw new Error('Use YYYY-MM-DD format for the exam date.');
  }

  const validTopics = topics
    .map((t) => ({
      subject: t.subject.trim() || 'General',
      name: t.name.trim(),
      estimatedMinutes:
        t.estimatedMinutes == null
          ? 45
          : Math.max(5, Math.min(240, Math.round(t.estimatedMinutes))),
      priority: t.priority ?? 2,
      status: t.status ?? 'new',
    }))
    .filter((t) => t.name.length > 0);

  if (validTopics.length === 0) {
    throw new Error('Add at least one valid topic before importing.');
  }

  const bySubject = new Map<string, typeof validTopics>();
  for (const t of validTopics) {
    const list = bySubject.get(t.subject) ?? [];
    list.push(t);
    bySubject.set(t.subject, list);
  }

  let newTopicCount = 0;
  let existingTopicCount = 0;
  const actions: AssistantAction[] = [];

  for (const t of validTopics) {
    const exists = workspace.topics.some(
      (existing) =>
        existing.name.toLowerCase() === t.name.toLowerCase() &&
        existing.subject.toLowerCase() === t.subject.toLowerCase(),
    );
    if (exists) {
      existingTopicCount += 1;
    } else {
      newTopicCount += 1;
      actions.push({
        type: 'create_topic',
        name: t.name,
        subject: t.subject,
        estimatedHours: Math.max(0.25, Number((t.estimatedMinutes / 60).toFixed(2))),
        priority: t.priority,
        status: t.status,
      });
    }
  }

  actions.push({
    type: 'create_exam',
    name: cleanExam,
    examDate: cleanDate,
    subject: validTopics[0]?.subject ?? 'General',
    topicNames: validTopics.map((t) => t.name),
  });

  const prepared = prepareAssistantActionBatch(workspace, actions);

  return {
    examName: cleanExam,
    examDate: cleanDate,
    sourceChunkCount: Math.max(1, sourceChunkCount),
    newTopicCount,
    existingTopicCount,
    warnings: [],
    subjects: Array.from(bySubject.entries()).map(([name, list]) => ({
      name,
      topics: list,
    })),
    autopilotPlan: buildSyllabusAutopilotPlan(workspace),
    prepared,
  };
}

export function extractSyllabusDraftsFromText(sourceText: string): SyllabusReviewTopicDraft[] {
  const lines = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let currentSubject = 'General';
  const drafts: SyllabusReviewTopicDraft[] = [];

  for (const line of lines) {
    if (line.length < 32 && !line.includes(':') && /^[A-Z][A-Za-z0-9\s&-]+$/.test(line) && drafts.length === 0) {
      currentSubject = line;
      continue;
    }
    drafts.push({
      subject: currentSubject,
      name: line.replace(/^[-*•\d.)\s]+/, '').trim(),
      estimatedMinutes: 45,
      priority: 2,
      status: 'new',
    });
  }

  if (drafts.length === 0 && lines.length > 0) {
    drafts.push({
      subject: 'General',
      name: lines[0].slice(0, 120),
      estimatedMinutes: 45,
      priority: 2,
      status: 'new',
    });
  }
  return drafts;
}
