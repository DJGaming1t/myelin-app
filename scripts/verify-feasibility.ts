/// <reference types="node" />
import assert from 'node:assert/strict';

import { createEmptyWorkspace, Topic } from '../src/data/schema';
import { createExam } from '../src/features/exams/exam-engine';
import { buildJointExamPreparationPlan } from '../src/features/exams/exam-plan-engine';
import {
  analyzeCapacityFeasibility,
  CapacityFeasibilityDemand,
} from '../src/features/planning/capacity-feasibility';
import {
  addLocalDays,
  startOfLocalDay,
} from '../src/features/planning/day-engine';
import {
  createStudyTask,
  scheduleTask,
} from '../src/features/planning/task-engine';
import { buildUnifiedWorkloadLedger } from '../src/features/planning/workload-ledger';
import { buildTodayPlan } from '../src/features/today/planner';

function local(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

function makeTopic(
  id: string,
  name: string,
  subject: string,
  estimate: number,
  priority: 1 | 2 | 3 = 2,
): Topic {
  return {
    id,
    name,
    subject,
    createdAt: 1,
    status: 'new',
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

const now = local(2026, 10, 5, 15);
const day0 = startOfLocalDay(now);
const day1 = addLocalDays(day0, 1);
const day2 = addLocalDays(day0, 2);
const day3 = addLocalDays(day0, 3);

{
  const analysis = analyzeCapacityFeasibility(
    [
      {
        id: 'early',
        label: 'Early deadline',
        kind: 'task',
        requiredMinutes: 90,
        priority: 3,
        availableFrom: day0,
        deadlineAt: day1,
        capacityUntil: day1,
        movable: false,
      },
      {
        id: 'later',
        label: 'Later deadline',
        kind: 'task',
        requiredMinutes: 30,
        priority: 1,
        availableFrom: day0,
        deadlineAt: day3,
        capacityUntil: day3,
      },
    ],
    [
      { day: day0, usableMinutes: 60 },
      { day: day1, usableMinutes: 60 },
      { day: day2, usableMinutes: 60 },
    ],
  );

  assert.equal(analysis.feasible, false);
  assert.equal(analysis.totalRequiredMinutes, 120);
  assert.equal(analysis.totalCapacityMinutes, 180);
  assert.equal(
    analysis.firstOverloadedDeadline?.deadlineAt,
    day1,
    'An early deadline must fail even when enough capacity exists later.',
  );
  assert.equal(analysis.firstOverloadedDeadline?.overloadMinutes, 30);
}

{
  const analysis = analyzeCapacityFeasibility(
    [
      {
        id: 'late-release',
        label: 'Final revision',
        kind: 'exam-revision',
        requiredMinutes: 70,
        priority: 3,
        availableFrom: day2,
        deadlineAt: day3,
        capacityUntil: day3,
        movable: false,
      },
    ],
    [
      { day: day0, usableMinutes: 40 },
      { day: day1, usableMinutes: 40 },
      { day: day2, usableMinutes: 40 },
    ],
  );

  assert.equal(analysis.feasible, false);
  assert.equal(analysis.firstOverloadedDeadline?.intervalStart, day2);
  assert.equal(analysis.firstOverloadedDeadline?.capacityMinutes, 40);
  assert.equal(analysis.firstOverloadedDeadline?.overloadMinutes, 30);
  assert.equal(
    analysis.firstOverloadedDeadline?.extraMinutesPerAvailableDay,
    30,
    'Late-release work must be checked against its actual available window.',
  );
}

{
  const demands: CapacityFeasibilityDemand[] = [
    {
      id: 'low',
      label: 'Optional worksheet',
      kind: 'task',
      requiredMinutes: 40,
      priority: 1,
      availableFrom: day0,
      deadlineAt: day1,
      capacityUntil: day1,
      movable: true,
    },
    {
      id: 'high',
      label: 'Core exam preparation',
      kind: 'exam-preparation',
      requiredMinutes: 100,
      priority: 3,
      availableFrom: day0,
      deadlineAt: day1,
      capacityUntil: day1,
      movable: false,
    },
  ];
  const analysis = analyzeCapacityFeasibility(
    demands,
    [{ day: day0, usableMinutes: 70 }],
  );
  const relief = analysis.firstOverloadedDeadline?.reliefCandidates ?? [];

  assert.equal(analysis.firstOverloadedDeadline?.overloadMinutes, 70);
  assert.equal(relief[0]?.demandId, 'low');
  assert.equal(relief[0]?.suggestedMinutes, 40);
  assert.equal(relief[1]?.demandId, 'high');
  assert.equal(relief[1]?.suggestedMinutes, 30);
}

{
  const analysis = analyzeCapacityFeasibility(
    [
      {
        id: 'missed',
        label: 'Already impossible',
        kind: 'task',
        requiredMinutes: 25,
        priority: 2,
        availableFrom: day1,
        deadlineAt: day0,
        capacityUntil: day0,
      },
    ],
    [],
  );

  assert.equal(analysis.feasible, false);
  assert.equal(analysis.firstOverloadedDeadline?.capacityMinutes, 0);
  assert.equal(analysis.firstOverloadedDeadline?.overloadMinutes, 25);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 100;
  workspace.topics.push(
    makeTopic('ledger-topic', 'Electricity', 'Physics', 100, 3),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Physics exam',
        date: day3 + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['ledger-topic'],
      },
      now,
      'ledger-exam',
    ),
  );
  workspace.tasks.push(
    createStudyTask({
      title: 'Electricity numericals',
      subject: 'Physics',
      topicId: 'ledger-topic',
      examId: 'ledger-exam',
      type: 'practice',
      dueAt: day2 + 20 * 60 * 60 * 1000,
      estimatedMinutes: 40,
      priority: 2,
      now,
    }),
  );

  const ledger = buildUnifiedWorkloadLedger(workspace, now, {
    sustainableDailyMinutes: 100,
    bufferRatio: 0,
    horizonDays: 4,
    examDemands: [
      {
        id: 'prep:ledger-topic',
        label: 'Electricity',
        kind: 'exam-preparation',
        requiredMinutes: 100,
        priority: 3,
        availableFrom: day0,
        deadlineAt: workspace.exams[0]!.date,
        capacityUntil: day3,
        movable: false,
        topicId: 'ledger-topic',
        examId: 'ledger-exam',
        examIds: ['ledger-exam'],
      },
    ],
  });

  assert.equal(ledger.taskRemainingMinutes, 40);
  assert.equal(ledger.examPreparationMinutes, 100);
  assert.equal(ledger.deduplicatedMinutes, 40);
  assert.equal(ledger.feasibility.totalRequiredMinutes, 100);
  assert.equal(
    ledger.demands
      .filter((demand) => demand.source === 'exam-preparation')
      .reduce((sum, demand) => sum + demand.requiredMinutes, 0),
    60,
    'A linked task should replace equivalent exam-preparation minutes instead of duplicating them.',
  );
  assert.equal(
    ledger.coverage[0]?.reason,
    'task-covers-preparation',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 100;
  workspace.topics.push(
    makeTopic('scheduled-topic', 'Quadratics', 'Mathematics', 100, 3),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Maths exam',
        date: day3 + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['scheduled-topic'],
      },
      now,
      'scheduled-exam',
    ),
  );
  const task = createStudyTask({
    title: 'Quadratics practice',
    subject: 'Mathematics',
    topicId: 'scheduled-topic',
    examId: 'scheduled-exam',
    type: 'practice',
    dueAt: day2 + 20 * 60 * 60 * 1000,
    estimatedMinutes: 40,
    priority: 2,
    now,
  });
  scheduleTask(
    task,
    day1 + 17 * 60 * 60 * 1000,
    day1 + 17 * 60 * 60 * 1000 + 40 * 60 * 1000,
    now,
  );
  workspace.tasks.push(task);

  const ledger = buildUnifiedWorkloadLedger(workspace, now, {
    sustainableDailyMinutes: 100,
    bufferRatio: 0,
    horizonDays: 4,
    examDemands: [
      {
        id: 'prep:scheduled-topic',
        label: 'Quadratics',
        kind: 'exam-preparation',
        requiredMinutes: 100,
        priority: 3,
        availableFrom: day0,
        deadlineAt: workspace.exams[0]!.date,
        capacityUntil: day3,
        movable: false,
        topicId: 'scheduled-topic',
        examId: 'scheduled-exam',
        examIds: ['scheduled-exam'],
      },
    ],
  });

  assert.equal(ledger.scheduledTaskMinutes, 40);
  assert.equal(ledger.unscheduledTaskMinutes, 0);
  assert.equal(ledger.deduplicatedMinutes, 40);
  assert.equal(ledger.feasibility.totalRequiredMinutes, 100);
  assert.equal(
    ledger.demands.filter(
      (demand) =>
        demand.source === 'task' &&
        demand.segment === 'scheduled',
    ).length,
    1,
  );
  assert.equal(
    ledger.capacityDays.find((day) => day.day === day1)?.usableMinutes,
    100,
    'Scheduled work should remain visible as a workload demand instead of also being silently removed from ledger capacity.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 100;
  workspace.topics.push(
    makeTopic('standalone-topic', 'Metals', 'Chemistry', 80, 2),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Chemistry exam',
        date: day3 + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['standalone-topic'],
      },
      now,
      'standalone-exam',
    ),
  );
  workspace.tasks.push(
    createStudyTask({
      title: 'English homework',
      subject: 'English',
      type: 'homework',
      dueAt: day2 + 20 * 60 * 60 * 1000,
      estimatedMinutes: 30,
      priority: 2,
      now,
    }),
  );

  const ledger = buildUnifiedWorkloadLedger(workspace, now, {
    sustainableDailyMinutes: 100,
    bufferRatio: 0,
    horizonDays: 4,
    examDemands: [
      {
        id: 'prep:standalone-topic',
        label: 'Metals',
        kind: 'exam-preparation',
        requiredMinutes: 80,
        priority: 2,
        availableFrom: day0,
        deadlineAt: workspace.exams[0]!.date,
        capacityUntil: day3,
        topicId: 'standalone-topic',
        examId: 'standalone-exam',
        examIds: ['standalone-exam'],
      },
    ],
  });

  assert.equal(ledger.deduplicatedMinutes, 0);
  assert.equal(ledger.feasibility.totalRequiredMinutes, 110);
  assert.ok(
    ledger.demands.some(
      (demand) =>
        demand.source === 'task' &&
        demand.label === 'English homework',
    ),
    'Unrelated homework must compete with exam preparation for the same mileage.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 100;
  workspace.exams.push(
    createExam(
      {
        name: 'Revision exam',
        date: day3 + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [],
      },
      now,
      'revision-exam',
    ),
  );
  workspace.tasks.push(
    createStudyTask({
      title: 'Final recall pass',
      subject: 'Science',
      examId: 'revision-exam',
      type: 'revision',
      dueAt: day2 + 20 * 60 * 60 * 1000,
      estimatedMinutes: 20,
      priority: 3,
      now,
    }),
  );

  const ledger = buildUnifiedWorkloadLedger(workspace, now, {
    sustainableDailyMinutes: 100,
    bufferRatio: 0,
    horizonDays: 4,
    examDemands: [
      {
        id: 'revision:revision-exam',
        label: 'Final revision · Revision exam',
        kind: 'exam-revision',
        requiredMinutes: 30,
        priority: 3,
        availableFrom: day2,
        deadlineAt: workspace.exams[0]!.date,
        capacityUntil: day3,
        movable: false,
        examId: 'revision-exam',
      },
    ],
  });

  assert.equal(ledger.deduplicatedMinutes, 20);
  assert.equal(
    ledger.coverage[0]?.reason,
    'revision-task-covers-revision',
  );
  assert.equal(ledger.feasibility.totalRequiredMinutes, 30);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 30;
  workspace.settings.focusMinutes = 20;
  workspace.tasks.push(
    createStudyTask({
      title: 'Large assignment due today',
      subject: 'Science',
      dueAt: local(2026, 10, 5, 23),
      estimatedMinutes: 120,
      priority: 2,
      now,
    }),
  );

  const today = buildTodayPlan(workspace, now);
  const firstBreak = today.deadlineFeasibility.firstOverloadedDeadline;
  assert.ok(firstBreak, 'Today should expose deadline feasibility for near-term tasks.');
  assert.ok(firstBreak!.overloadMinutes > 0);
  assert.equal(firstBreak!.reliefCandidates[0]?.label, 'Large assignment due today');
  assert.equal(firstBreak!.reliefCandidates[0]?.kind, 'task');
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 45;
  workspace.settings.focusMinutes = 30;
  workspace.topics.push(
    makeTopic('physics', 'Magnetic Effects', 'Physics', 300, 3),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Physics soon',
        date: addLocalDays(day0, 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['physics'],
      },
      now,
      'exam_physics_soon',
    ),
  );

  const plan = buildJointExamPreparationPlan(workspace, now);
  assert.equal(plan.feasibility.feasible, false);
  assert.ok(plan.feasibility.firstOverloadedDeadline);
  assert.ok(plan.feasibility.firstOverloadedDeadline!.overloadMinutes > 0);
  assert.ok(
    plan.feasibility.firstOverloadedDeadline!.reliefCandidates.some(
      (candidate) => candidate.label === 'Magnetic Effects',
    ),
    'Exam Planner should use the same feasibility engine and name the work creating pressure.',
  );
}

console.log('✓ early deadlines fail even when later total capacity would be enough');
console.log('✓ release windows detect late revision overload');
console.log('✓ relief candidates quantify exact minutes and protect higher-priority work');
console.log('✓ zero-window and already-missed deadlines are reported as overload');
console.log('✓ linked tasks replace matching exam work instead of inflating total mileage');
console.log('✓ scheduled linked tasks consume mileage exactly once');
console.log('✓ unrelated homework still competes with exam preparation');
console.log('✓ explicit revision tasks replace matching final-revision demand');
console.log('✓ Today uses the shared feasibility engine for near-term task deadlines');
console.log('✓ Exam Planner uses the same feasibility engine for exam workload');
