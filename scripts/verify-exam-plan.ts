/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace, Topic } from '../src/data/schema';
import { createExam } from '../src/features/exams/exam-engine';
import {
  buildExamCapacityProfile,
  buildExamPreparationPlan,
  examPlanTopicRemainingMinutes,
} from '../src/features/exams/exam-plan-engine';
import { addLocalDays, startOfLocalDay } from '../src/features/planning/day-engine';
import { createStudyTask, scheduleTask } from '../src/features/planning/task-engine';

function local(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function makeTopic(
  id: string,
  name: string,
  subject: string,
  status: Topic['status'] = 'learning',
  estimate = 45,
  priority: Topic['priority'] = 2,
): Topic {
  return {
    id,
    name,
    subject,
    createdAt: Date.now(),
    status,
    priority,
    estimate,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  };
}

const now = local(2026, 10, 5, 15, 0);

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;

  const trig = makeTopic('trig', 'Trigonometry', 'Mathematics', 'learning', 60, 3);
  const stats = makeTopic('stats', 'Statistics', 'Mathematics', 'new', 80, 2);
  const unrelated = makeTopic('bio', 'Life Processes', 'Biology', 'learning', 200, 3);
  workspace.topics.push(trig, stats, unrelated);

  workspace.exams.push(
    createExam(
      {
        name: 'Maths exam',
        date: addLocalDays(startOfLocalDay(now), 4) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['trig', 'stats'],
      },
      now,
      'exam_math',
    ),
  );

  const plan = buildExamPreparationPlan(workspace, 'exam_math', now, {
    topicOverrides: [
      { topicId: 'trig', estimatedMinutes: 100, difficulty: 3, importance: 3 },
      { topicId: 'stats', estimatedMinutes: 70, difficulty: 2, importance: 2 },
    ],
  });

  assert.ok(plan);
  assert.equal(plan!.daysAvailable, 4);
  assert.equal(plan!.capacityProfile.source, 'default');
  assert.equal(plan!.topics.length, 2, 'Only exam-scoped topics should be planned.');
  assert.equal(plan!.topics.some((topic) => topic.topicId === 'bio'), false);
  assert.equal(
    plan!.topics.find((topic) => topic.topicId === 'trig')!.estimatedMinutes,
    100,
    'Per-exam user/AI estimates must override the generic Topic estimate.',
  );
  assert.equal(plan!.unallocatedMinutes, 0, 'A feasible exam should fit without hidden overflow.');
  assert.equal(plan!.plannedMinutes, plan!.totalRequiredMinutes);
  assert.ok(plan!.days.every((day) => day.plannedMinutes <= day.usableCapacityMinutes));
  assert.ok(
    plan!.days
      .flatMap((day) => day.blocks)
      .every((block) => block.minutes <= workspace.settings.focusMinutes),
    'The engine should split work into focus-sized chunks.',
  );
  assert.ok(
    plan!.days.every((day) => day.day < workspace.exams[0]!.date),
    'Normal exam prep should stay before the exam date.',
  );
  assert.equal(examPlanTopicRemainingMinutes(plan!, 'trig'), 0);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;

  for (let offset = 1; offset <= 4; offset += 1) {
    const day = addLocalDays(startOfLocalDay(now), -offset);
    workspace.focusOutcomes!.push({
      id: `history-${offset}`,
      startedAt: day + 17 * 60 * 60 * 1000,
      endedAt: day + 17 * 60 * 60 * 1000 + 40 * 60 * 1000,
      status: 'finished',
      plannedMinutes: 45,
      minutes: 40,
      launchMode: 'full',
      taskOnly: true,
      overdue: false,
    });
  }

  const profile = buildExamCapacityProfile(workspace, now);
  assert.equal(profile.source, 'personalized');
  assert.equal(profile.historyActiveDays, 4);
  assert.equal(profile.historicalMedianMinutes, 40);
  assert.ok(
    profile.sustainableDailyMinutes < workspace.settings.dailyMinutes,
    'Enough lower-volume history should make future plans more conservative.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;
  workspace.topics.push(makeTopic('physics', 'Electricity', 'Physics', 'new', 90, 3));
  workspace.exams.push(
    createExam(
      {
        name: 'Physics test',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['physics'],
      },
      now,
      'exam_physics',
    ),
  );

  const existing = createStudyTask({
    title: 'Existing homework',
    subject: 'Mathematics',
    type: 'homework',
    planState: 'today',
    estimatedMinutes: 50,
    priority: 2,
    now,
  });
  workspace.tasks.push(existing);
  scheduleTask(
    existing,
    local(2026, 10, 6, 18, 0),
    local(2026, 10, 6, 18, 50),
    now,
  );

  const plan = buildExamPreparationPlan(workspace, 'exam_physics', now)!;
  const tomorrow = plan.days.find(
    (day) => day.day === startOfLocalDay(local(2026, 10, 6, 12, 0)),
  );
  assert.ok(tomorrow);
  assert.ok(tomorrow!.scheduledStudyMinutes >= 50);
  assert.ok(
    tomorrow!.usableCapacityMinutes < workspace.settings.dailyMinutes,
    'Existing scheduled study must consume both clock time and cognitive capacity.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 60;
  workspace.settings.focusMinutes = 30;
  workspace.topics.push(makeTopic('chem', 'Metals and Non-metals', 'Chemistry', 'new', 600, 3));
  workspace.exams.push(
    createExam(
      {
        name: 'Chemistry tomorrow',
        date: addLocalDays(startOfLocalDay(now), 1) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['chem'],
      },
      now,
      'exam_chem',
    ),
  );

  const plan = buildExamPreparationPlan(workspace, 'exam_chem', now, {
    topicOverrides: [{ topicId: 'chem', estimatedMinutes: 600, difficulty: 3, importance: 3 }],
  })!;

  assert.equal(plan.daysAvailable, 1);
  assert.equal(plan.strain, 'overloaded');
  assert.ok(plan.unallocatedMinutes > 0);
  assert.ok(
    plan.warnings.some((warning) => /exceeds sustainable capacity/i.test(warning)),
    'Unrealistic workloads should be surfaced as capacity strain, not silently overbooked.',
  );
  assert.ok(plan.plannedMinutes <= plan.totalUsableCapacityMinutes);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 90;
  workspace.topics.push(makeTopic('history', 'Nationalism in India', 'History', 'learning', 90));
  workspace.exams.push(
    createExam(
      {
        name: 'Past exam',
        date: addLocalDays(startOfLocalDay(now), -1),
        scope: 'topics',
        subjects: [],
        topicIds: ['history'],
      },
      now,
      'exam_past',
    ),
  );

  assert.equal(
    buildExamPreparationPlan(workspace, 'exam_past', now),
    null,
    'Past exams must not generate a new preparation plan.',
  );
}

console.log('✓ exam scope limits planning to included topics');
console.log('✓ per-exam workload estimates override generic Topic estimates');
console.log('✓ feasible workload is split into focus-sized blocks within safe daily capacity');
console.log('✓ enough study history personalizes sustainable daily capacity');
console.log('✓ existing scheduled study reduces future exam capacity');
console.log('✓ impossible workloads are reported as strain instead of being overbooked');
console.log('✓ past exams do not produce preparation plans');
