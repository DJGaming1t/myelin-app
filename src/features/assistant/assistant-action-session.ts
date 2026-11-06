import { WorkspaceState, cloneWorkspace } from '@/src/data/schema';
import { parseLocalDate } from '@/src/features/planning/commitment-dates';
import { createStudyTask } from '@/src/features/planning/task-engine';
import { createTopic } from '@/src/features/topics/topic-operations';
import { createExam } from '@/src/features/exams/exam-engine';
import {
  AssistantAction,
  AssistantActionBatch,
  AssistantActionResult,
  AssistantExamPlanSummary,
} from './ai-action-engine';

export type PreparedAssistantActionBatch = {
  confirmationKey: string;
  sourceRevision: number;
  batch: AssistantActionBatch;
  preview: {
    hasMutations: boolean;
    results: AssistantActionResult[];
  };
};

export function buildDefaultExamPlanSummary(
  workspace: WorkspaceState,
  now = Date.now(),
): AssistantExamPlanSummary {
  const dailyMin = workspace.settings.dailyMinutes || 90;
  const totalReq = workspace.topics.reduce(
    (sum, t) => sum + Math.max(5, Math.round(t.estimate || 45)),
    0,
  );
  const totalCap = dailyMin * 7;
  const overload = Math.max(0, totalReq - totalCap);

  return {
    examCount: workspace.exams.length,
    uniqueTopicCount: workspace.topics.length,
    strain: overload > 0 ? 'overloaded' : totalReq > totalCap * 0.8 ? 'tight' : 'balanced',
    bufferRatio: 0.15,
    capacity: {
      sustainableDailyMinutes: dailyMin,
      source: 'default',
      estimateMultiplier: 1,
      completionReliability: null,
      postponementPressure: 0,
    },
    workload: {
      taskRemainingMinutes: workspace.tasks
        .filter((t) => t.status === 'open')
        .reduce((s, t) => s + Math.max(0, t.estimatedMinutes - t.actualMinutes), 0),
      deduplicatedMinutes: 0,
    },
    feasibility: {
      totalRequiredMinutes: totalReq,
      totalCapacityMinutes: totalCap,
      totalOverloadMinutes: overload,
      firstOverloadedDeadline: null,
    },
    warnings: [],
    exams: workspace.exams.map((e) => ({
      examId: e.id,
      examName: e.name,
      examDate: e.date,
      topicCount: e.topicIds.length,
      preparationUnallocatedMinutes: 0,
      revisionUnallocatedMinutes: 0,
    })),
    days: [
      {
        day: now,
        usableCapacityMinutes: dailyMin,
        plannedPreparationMinutes: Math.min(dailyMin, totalReq),
        plannedRevisionMinutes: 0,
        strain: 'balanced',
        blocks: workspace.topics.slice(0, 3).map((t, idx) => ({
          id: `plan-block-${t.id}-${idx}`,
          kind: 'preparation',
          topicId: t.id,
          topicName: t.name,
          subject: t.subject,
          minutes: 35,
          reasons: ['Scheduled in preparation window'],
        })),
      },
    ],
  };
}

export function prepareAssistantActionBatch(
  workspace: WorkspaceState,
  actions: AssistantAction[],
  now = Date.now(),
): PreparedAssistantActionBatch {
  const results: AssistantActionResult[] = actions.map((action) => {
    if (action.type === 'create_task') {
      return {
        type: 'create_task',
        summary: `Add task “${action.title}”`,
      };
    }
    if (action.type === 'create_topic') {
      return {
        type: 'create_topic',
        summary: `Add topic “${action.name}” (${action.subject})`,
      };
    }
    if (action.type === 'create_exam') {
      return {
        type: 'create_exam',
        summary: `Add exam “${action.name}” on ${action.examDate}`,
      };
    }
    if (action.type === 'create_commitment') {
      return {
        type: 'create_commitment',
        summary: `Block commitment “${action.title}”`,
        data: { conflicts: [] },
      };
    }
    return {
      type: 'generate_exam_plan',
      summary: 'Calculate exam preparation plan',
      data: buildDefaultExamPlanSummary(workspace, now),
    };
  });

  const hasMutations = actions.some((a) => a.type !== 'generate_exam_plan');

  return {
    confirmationKey: `confirm_${workspace.revision}_${now.toString(36)}`,
    sourceRevision: workspace.revision,
    batch: { actions },
    preview: {
      hasMutations,
      results,
    },
  };
}

export function applyPreparedAssistantActionBatch(
  workspace: WorkspaceState,
  prepared: PreparedAssistantActionBatch,
  confirmationKey: string,
  now = Date.now(),
): {
  nextWorkspace: WorkspaceState;
  results: AssistantActionResult[];
} {
  if (confirmationKey !== prepared.confirmationKey) {
    throw new Error('Confirmation key mismatch. Generate a fresh preview first.');
  }
  if (workspace.revision !== prepared.sourceRevision) {
    throw new Error('Your workspace changed since this preview was generated.');
  }

  const next = cloneWorkspace(workspace);
  const createdTopicIdsByName = new Map<string, string>();
  for (const t of next.topics) {
    createdTopicIdsByName.set(`${t.subject.toLowerCase()}::${t.name.toLowerCase()}`, t.id);
    createdTopicIdsByName.set(t.name.toLowerCase(), t.id);
  }

  for (const action of prepared.batch.actions) {
    if (action.type === 'create_task') {
      const dueMs = action.dueDate ? parseLocalDate(action.dueDate) ?? 0 : 0;
      const dueAt =
        dueMs > 0
          ? new Date(
              new Date(dueMs).getFullYear(),
              new Date(dueMs).getMonth(),
              new Date(dueMs).getDate(),
              23,
              59,
              0,
              0,
            ).getTime()
          : 0;
      next.tasks.push(
        createStudyTask({
          title: action.title,
          subject: action.subject ?? '',
          type: action.taskType,
          planState: 'today',
          dueAt,
          estimatedMinutes: action.estimatedMinutes ?? 35,
          priority: action.priority ?? 2,
          notes: action.notes ?? '',
          now,
        }),
      );
    } else if (action.type === 'create_topic') {
      const key = `${action.subject.toLowerCase()}::${action.name.toLowerCase()}`;
      if (!createdTopicIdsByName.has(key)) {
        const topic = createTopic(
          {
            name: action.name,
            subject: action.subject,
            status: action.status ?? 'new',
            priority: action.priority ?? 2,
            estimate: Math.max(5, Math.min(240, Math.round((action.estimatedHours ?? 0.75) * 60))),
            notes: '',
          },
          now,
        );
        next.topics.push(topic);
        createdTopicIdsByName.set(key, topic.id);
        createdTopicIdsByName.set(action.name.toLowerCase(), topic.id);
      }
    } else if (action.type === 'create_exam') {
      const examDateMs = parseLocalDate(action.examDate) ?? now + 7 * 86_400_000;
      const topicIds = (action.topicNames ?? [])
        .map((n) => createdTopicIdsByName.get(n.toLowerCase()))
        .filter((id): id is string => Boolean(id));
      next.exams.push(
        createExam(
          {
            name: action.name,
            date: examDateMs,
            scope: topicIds.length ? 'topics' : 'subjects',
            subjects: action.subject ? [action.subject] : [],
            topicIds,
          },
          now,
        ),
      );
    } else if (action.type === 'create_commitment') {
      next.commitments.push({
        id: `commit_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: action.title,
        kind: 'other',
        startAt: now,
        endAt: now + 3_600_000,
        startMinutes: action.startMinutes,
        endMinutes: action.endMinutes,
        recurrenceDays: action.recurrenceDays,
        skippedDates: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  next.revision += 1;
  next.updatedAt = now;

  return {
    nextWorkspace: next,
    results: prepared.preview.results,
  };
}
