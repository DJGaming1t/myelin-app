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
import { createStudyTask } from '../src/features/planning/task-engine';
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
console.log('✓ Today uses the shared feasibility engine for near-term task deadlines');
console.log('✓ Exam Planner uses the same feasibility engine for exam workload');
