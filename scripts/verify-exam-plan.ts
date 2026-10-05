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


{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;
  workspace.topics.push(makeTopic('pace', 'Quadratic Equations', 'Mathematics', 'learning', 60, 2));
  workspace.exams.push(
    createExam(
      {
        name: 'Pace-aware maths',
        date: addLocalDays(startOfLocalDay(now), 3) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['pace'],
      },
      now,
      'exam_pace',
    ),
  );

  for (let offset = 1; offset <= 4; offset += 1) {
    const at = addLocalDays(startOfLocalDay(now), -offset) + 17 * 60 * 60 * 1000;
    workspace.history.push({
      id: `paced-${offset}`,
      topicId: 'pace',
      at,
      kind: 'study',
      minutes: 45,
      grade: 0,
      effort: 3,
      prompt: '',
      response: '',
      confidence: 'partial',
      plannedMinutes: 30,
    });
  }

  const profile = buildExamCapacityProfile(workspace, now);
  assert.equal(profile.estimateSampleCount, 4);
  assert.equal(profile.estimateMultiplier, 1.35);
  const plan = buildExamPreparationPlan(workspace, 'exam_pace', now)!;
  const paced = plan.topics.find((topic) => topic.topicId === 'pace')!;
  assert.equal(paced.baseEstimatedMinutes, 60);
  assert.equal(paced.estimatedMinutes, 81);
  assert.ok(
    plan.warnings.some((warning) => /adjusted by about 35%/i.test(warning)),
    'Repeated underestimation should increase future workload estimates transparently.',
  );
}

{
  const reliable = createEmptyWorkspace(now);
  const unreliable = createEmptyWorkspace(now);
  reliable.settings.dailyMinutes = 120;
  unreliable.settings.dailyMinutes = 120;
  const day = addLocalDays(startOfLocalDay(now), -1);

  for (let index = 0; index < 4; index += 1) {
    const startedAt = day + (16 * 60 + index * 35) * 60 * 1000;
    reliable.focusOutcomes!.push({
      id: `reliable-${index}`,
      startedAt,
      endedAt: startedAt + 30 * 60 * 1000,
      status: 'finished',
      plannedMinutes: 30,
      minutes: 30,
      launchMode: 'full',
      taskOnly: true,
      overdue: false,
    });
    unreliable.focusOutcomes!.push({
      id: `unreliable-${index}`,
      startedAt,
      endedAt: startedAt + 30 * 60 * 1000,
      status: index < 2 ? 'finished' : 'abandoned',
      plannedMinutes: 30,
      minutes: index < 2 ? 30 : 5,
      launchMode: 'full',
      taskOnly: true,
      overdue: false,
    });
  }

  const reliableProfile = buildExamCapacityProfile(reliable, now);
  const unreliableProfile = buildExamCapacityProfile(unreliable, now);
  assert.equal(reliableProfile.completionReliability, 1);
  assert.equal(unreliableProfile.completionReliability, 0.5);
  assert.ok(
    unreliableProfile.sustainableDailyMinutes < reliableProfile.sustainableDailyMinutes,
    'Repeated abandoned sessions should make capacity more conservative.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 100;

  for (let index = 0; index < 2; index += 1) {
    const task = createStudyTask({
      title: `Frequently postponed ${index}`,
      type: 'revision',
      estimatedMinutes: 30,
      now,
    });
    task.postponements = 3;
    task.lastPostponedAt = now - 60 * 60 * 1000;
    workspace.tasks.push(task);
  }

  const profile = buildExamCapacityProfile(workspace, now);
  assert.equal(profile.source, 'personalized');
  assert.equal(profile.postponementPressure, 1);
  assert.ok(
    profile.sustainableDailyMinutes < workspace.settings.dailyMinutes,
    'Repeated postponement should lower the amount MYELIN assumes can be sustainably planned.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;
  workspace.topics.push(
    makeTopic('hard-a', 'Trigonometry', 'Mathematics', 'new', 140, 3),
    makeTopic('hard-b', 'Statistics', 'Mathematics', 'new', 140, 3),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Hard maths exam',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['hard-a', 'hard-b'],
      },
      now,
      'exam_hard',
    ),
  );

  const previous = addLocalDays(startOfLocalDay(now), -1);
  for (let index = 0; index < 4; index += 1) {
    workspace.history.push({
      id: `effort-${index}`,
      topicId: 'hard-a',
      at: previous + (15 * 60 + index * 25) * 60 * 1000,
      kind: 'study',
      minutes: 20,
      grade: 0,
      effort: 5,
      prompt: '',
      response: '',
      confidence: 'partial',
    });
  }

  const plan = buildExamPreparationPlan(workspace, 'exam_hard', now)!;
  assert.ok(plan.capacityProfile.highEffortShare > 0.9);
  assert.ok(plan.capacityProfile.hardStudyShareLimit <= 0.5);
  assert.ok(
    plan.days.every((day) => day.hardStudyMinutes <= day.hardStudyLimitMinutes),
    'High-effort work must respect the daily fatigue guardrail.',
  );
  assert.ok(
    plan.warnings.some((warning) => /spread out instead of being packed/i.test(warning)),
    'The user should be told when difficult work is intentionally spread across days.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;
  const maths = makeTopic('target-maths', 'Quadratics', 'Mathematics', 'learning', 120, 3);
  const physics = makeTopic('competitor-physics', 'Electricity', 'Physics', 'learning', 120, 3);
  workspace.topics.push(maths, physics);

  workspace.exams.push(
    createExam(
      {
        name: 'Maths exam',
        date: addLocalDays(startOfLocalDay(now), 4) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['target-maths'],
      },
      now,
      'exam_target',
    ),
    createExam(
      {
        name: 'Physics exam',
        date: addLocalDays(startOfLocalDay(now), 3) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['competitor-physics'],
      },
      now,
      'exam_competitor',
    ),
    createExam(
      {
        name: 'Shared-topic quiz',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['target-maths'],
      },
      now,
      'exam_shared',
    ),
  );

  const plan = buildExamPreparationPlan(workspace, 'exam_target', now)!;
  assert.equal(plan.competingExams.length, 1, 'Shared material must not be double-counted as competing work.');
  assert.equal(plan.competingExams[0]!.examId, 'exam_competitor');
  assert.ok(
    plan.days.reduce((sum, day) => sum + day.competingExamReserveMinutes, 0) > 0,
    'A separate nearby exam should reserve some weekly capacity.',
  );
  const sharedDeadline = workspace.exams.find((exam) => exam.id === 'exam_shared')!.date;
  const targetBlocks = plan.days
    .flatMap((day) => day.blocks)
    .filter((block) => block.topicId === 'target-maths');
  assert.ok(targetBlocks.length > 0);
  assert.ok(
    targetBlocks.every((block) => block.day < startOfLocalDay(sharedDeadline)),
    'A topic shared with an earlier exam must be scheduled before that earlier exam, not the later target exam.',
  );
  assert.ok(
    plan.warnings.some((warning) => /other upcoming exam/i.test(warning)),
    'Competing exam capacity should be explained to the user.',
  );
}

console.log('✓ exam scope limits planning to included topics');
console.log('✓ per-exam workload estimates override generic Topic estimates');
console.log('✓ feasible workload is split into focus-sized blocks within safe daily capacity');
console.log('✓ enough study history personalizes sustainable daily capacity');
console.log('✓ planned-vs-actual pace corrects future topic estimates');
console.log('✓ completion reliability and postponements make capacity more conservative');
console.log('✓ high-effort topics are spread with a daily fatigue guardrail');
console.log('✓ nearby exams reserve capacity without double-counting shared topics');
console.log('✓ existing scheduled study reduces future exam capacity');
console.log('✓ impossible workloads are reported as strain instead of being overbooked');
console.log('✓ past exams do not produce preparation plans');
