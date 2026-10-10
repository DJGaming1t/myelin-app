/// <reference types="node" />
import assert from 'node:assert/strict';

import { cloneWorkspace, createEmptyWorkspace, Topic } from '../src/data/schema';
import { createExam } from '../src/features/exams/exam-engine';
import {
  buildExamCapacityProfile,
  buildExamPreparationPlan,
  buildJointExamPreparationPlan,
  examPlanTopicRemainingMinutes,
} from '../src/features/exams/exam-plan-engine';
import {
  addLocalDays,
  localDayKey,
  startOfLocalDay,
} from '../src/features/planning/day-engine';
import { createStudyTask, scheduleTask } from '../src/features/planning/task-engine';
import {
  buildAutopilotReflowSummary,
  hasMeaningfulAutopilotReflow,
} from '../src/features/exams/autopilot-reflow';
import {
  applyAutopilotRecoveryOption,
  buildAppliedReclaimedWindows,
  buildAutopilotRecoveryOptions,
  resolveRecoveredReminderHandoff,
  undoAutopilotRecovery,
} from '../src/features/exams/autopilot-recovery';

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
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 40;
  workspace.topics.push(
    makeTopic('feedback-exam', 'Quadratic Equations', 'Mathematics', 'learning', 60, 2),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Feedback-aware maths',
        date: addLocalDays(startOfLocalDay(now), 5) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['feedback-exam'],
      },
      now,
      'exam_feedback',
    ),
  );

  const previous = addLocalDays(startOfLocalDay(now), -1);
  workspace.history.push(
    {
      id: 'feedback-exam-focus',
      topicId: 'feedback-exam',
      at: previous + 16 * 60 * 60 * 1000,
      kind: 'study',
      minutes: 40,
      grade: 0,
      effort: 5,
      prompt: '',
      response: '',
      confidence: 'partial',
      plannedMinutes: 30,
    },
    {
      id: 'feedback-exam-recall',
      topicId: 'feedback-exam',
      at: previous + 17 * 60 * 60 * 1000,
      kind: 'review',
      minutes: 3,
      grade: 1,
      effort: 3,
      prompt: 'Recall',
      response: 'Missed',
      confidence: 'unsure',
    },
  );

  const plan = buildExamPreparationPlan(workspace, 'exam_feedback', now)!;
  const adapted = plan.topics.find((topic) => topic.topicId === 'feedback-exam')!;
  assert.equal(adapted.baseEstimatedMinutes, 60);
  assert.ok(
    adapted.estimatedMinutes > 60,
    'Repeated topic difficulty should increase that topic workload without rewriting its stored estimate.',
  );
  assert.equal(adapted.difficulty, 3);
  assert.ok(adapted.retrievalReserveMinutes >= 15);
  assert.ok(
    adapted.reasons.some((reason) => /demanding|reinforcement/i.test(reason)),
    'Exam Autopilot should explain when topic feedback changes the workload.',
  );
  assert.equal(
    workspace.topics[0]!.estimate,
    60,
    'Feedback adaptation must remain derived and must not silently rewrite the user estimate.',
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
    plan.warnings.some((warning) => /other current or upcoming exam/i.test(warning)),
    'Competing exam capacity should be explained to the user.',
  );

  // Competing exams use calendar dates, not a noon timestamp. The summary
  // must include today's exam after noon but MUST NOT allocate study on its
  // exam day. Past exams are excluded; tomorrow's exam still reserves time.
  const currentCompeting = cloneWorkspace(workspace);
  const competing = currentCompeting.exams.find((exam) => exam.id === 'exam_competitor')!;
  competing.date = local(2026, 10, 5, 8, 0);
  const todayCompetition = buildExamPreparationPlan(currentCompeting, 'exam_target', now)!;
  assert.equal(todayCompetition.competingExams.length, 1,
    'Current-day exam cannot disappear merely because its stored time has passed');
  assert.equal(todayCompetition.competingExams[0]!.examId, 'exam_competitor');
  assert.equal(todayCompetition.days.reduce((sum, day) => sum + day.competingExamReserveMinutes, 0), 0,
    'Never reserve afternoon work for an exam whose date is today');
  assert.match(todayCompetition.warnings.join(' '), /current or upcoming/);

  competing.date = local(2026, 10, 4, 12, 0);
  assert.equal(buildExamPreparationPlan(currentCompeting, 'exam_target', now)!.competingExams.length, 0,
    'A genuinely past competing exam cannot consume today/future prep capacity');
  competing.date = local(2026, 10, 6, 12, 0);
  const tomorrowCompetition = buildExamPreparationPlan(currentCompeting, 'exam_target', now)!;
  assert.equal(tomorrowCompetition.competingExams.length, 1);
  assert.ok(tomorrowCompetition.days.some(day => day.competingExamReserveMinutes > 0),
    'An upcoming competing exam still reduces available study capacity before its date');

  // Horizon uses the local start of each exam date, not the arbitrary clock
  // time in an exam record (the stored time is typically local noon).
  competing.date = local(2026, 10, 15, 12, 0);
  assert.equal(buildExamPreparationPlan(currentCompeting, 'exam_target', now)!.competingExams.length, 1,
    'Include exams inside the seven-local-day competition horizon');
  competing.date = local(2026, 10, 16, 12, 0);
  assert.equal(buildExamPreparationPlan(currentCompeting, 'exam_target', now)!.competingExams.length, 0,
    'The horizon end is exclusive, even when exam time is noon');
}


{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 150;
  workspace.settings.focusMinutes = 45;

  const shared = makeTopic('shared', 'Trigonometry', 'Mathematics', 'learning', 90, 3);
  const physics = makeTopic('physics-joint', 'Electricity', 'Physics', 'learning', 90, 2);
  const chemistry = makeTopic('chem-joint', 'Acids Bases and Salts', 'Chemistry', 'learning', 75, 2);
  workspace.topics.push(shared, physics, chemistry);

  const mathsExamDate = addLocalDays(startOfLocalDay(now), 3) + 12 * 60 * 60 * 1000;
  const physicsExamDate = addLocalDays(startOfLocalDay(now), 5) + 12 * 60 * 60 * 1000;
  const chemExamDate = addLocalDays(startOfLocalDay(now), 6) + 12 * 60 * 60 * 1000;

  workspace.exams.push(
    createExam(
      {
        name: 'Maths exam',
        date: mathsExamDate,
        scope: 'topics',
        subjects: [],
        topicIds: ['shared'],
      },
      now,
      'joint_math',
    ),
    createExam(
      {
        name: 'Physics exam',
        date: physicsExamDate,
        scope: 'topics',
        subjects: [],
        topicIds: ['shared', 'physics-joint'],
      },
      now,
      'joint_physics',
    ),
    createExam(
      {
        name: 'Chemistry exam',
        date: chemExamDate,
        scope: 'topics',
        subjects: [],
        topicIds: ['chem-joint'],
      },
      now,
      'joint_chem',
    ),
  );

  const joint = buildJointExamPreparationPlan(workspace, now, {
    revisionRatio: 0.2,
    revisionLeadDays: 2,
  });

  assert.equal(joint.exams.length, 3);
  assert.equal(joint.uniqueTopicCount, 3, 'Shared syllabus must be represented by one joint topic demand.');
  assert.equal(
    joint.days
      .flatMap((day) => day.blocks)
      .filter((block) => block.kind === 'preparation' && block.topicId === 'shared')
      .reduce((sum, block) => sum + block.minutes, 0),
    joint.totalPreparationRequiredMinutes -
      joint.days
        .flatMap((day) => day.blocks)
        .filter((block) => block.kind === 'preparation' && block.topicId !== 'shared')
        .reduce((sum, block) => sum + block.minutes, 0),
    'A shared topic must not be duplicated just because two exams include it.',
  );
  assert.ok(
    joint.days
      .flatMap((day) => day.blocks)
      .filter((block) => block.kind === 'preparation' && block.topicId === 'shared')
      .every((block) => block.day < startOfLocalDay(mathsExamDate)),
    'Shared preparation must obey the earliest matching exam deadline.',
  );
  assert.ok(
    joint.days.every(
      (day) =>
        day.plannedPreparationMinutes + day.plannedRevisionMinutes <=
        day.usableCapacityMinutes,
    ),
    'Joint preparation and revision blocks must stay inside safe daily capacity.',
  );
  assert.ok(
    joint.warnings.some((warning) => /shared topics are planned once/i.test(warning)),
    'The joint planner should explain deduplication instead of hiding it.',
  );

  // A task explicitly linked to the LATER shared-topic exam must not hide the
  // EARLIER exam. Both the joint schedule and unified workload ledger need the
  // same earliest hard cutoff, without counting task minutes twice.
  const linkedLater = cloneWorkspace(workspace);
  const coverShared = createStudyTask({
    title: 'Trigonometry exercise for both exams',
    topicId: 'shared',
    examId: 'joint_physics',
    estimatedMinutes: 30,
    type: 'homework',
    now,
  });
  linkedLater.tasks.push(coverShared);
  const linkedBefore = cloneWorkspace(linkedLater);
  const linkedJoint = buildJointExamPreparationPlan(linkedLater, now, {
    revisionRatio: 0.2,
    revisionLeadDays: 2,
  });
  const sharedTaskDemand = linkedJoint.workloadLedger.demands.find(d =>
    d.taskId === coverShared.id && d.segment === 'remaining');
  assert.equal(sharedTaskDemand?.capacityUntil, startOfLocalDay(mathsExamDate),
    'A task linked to later Physics must also respect the earlier shared Maths exam');
  assert.equal(sharedTaskDemand?.deadlineAt, mathsExamDate);
  const coverage = linkedJoint.workloadLedger.coverage.filter(c =>
    c.taskId === coverShared.id && c.examDemandId === 'joint-prep:shared');
  assert.equal(coverage.length, 1, 'One shared task must cover the joint preparation demand only once');
  assert.equal(coverage[0]!.minutes, 30,
    'Recorded shared-task minutes should reduce the outstanding joint exam demand exactly once');
  assert.ok(linkedJoint.workloadLedger.deduplicatedMinutes >= 30);
  assert.equal(linkedJoint.uniqueTopicCount, 3);
  assert.equal(linkedJoint.totalPreparationRequiredMinutes, joint.totalPreparationRequiredMinutes,
    'Linking an existing task must not synthesize a second topic estimate');
  assert.ok(linkedJoint.days.flatMap(day => day.blocks)
    .filter(block => block.kind === 'preparation' && block.topicId === 'shared')
    .every(block => block.day < startOfLocalDay(mathsExamDate)));
  assert.deepEqual(linkedLater, linkedBefore, 'Read-only planning must never modify task or exam records');

  // Multiple same-day exams stored at different clock times must be associated
  // by calendar date; a past exam must stop setting the hard deadline.
  const sameDayWorkspace = cloneWorkspace(linkedLater);
  sameDayWorkspace.exams.find(exam => exam.id === 'joint_math')!.date =
    new Date(now).setHours(8, 0, 0, 0);
  const sameDayJoint = buildJointExamPreparationPlan(sameDayWorkspace, now);
  assert.equal(sameDayJoint.workloadLedger.demands.find(d =>
    d.taskId === coverShared.id && d.segment === 'remaining')?.capacityUntil,
    startOfLocalDay(now),
    'An earlier-today shared exam cannot be ignored after its stored clock timestamp');
  sameDayWorkspace.exams.find(exam => exam.id === 'joint_math')!.date =
    addLocalDays(startOfLocalDay(now), -1) + 12 * 60 * 60 * 1000;
  const pastSameDayJoint = buildJointExamPreparationPlan(sameDayWorkspace, now);
  assert.equal(pastSameDayJoint.workloadLedger.demands.find(d =>
    d.taskId === coverShared.id && d.segment === 'remaining')?.capacityUntil,
    startOfLocalDay(physicsExamDate),
    'Past shared exams must not impose a future task deadline');

}

{
  function feedbackRedistributionWorkspace(withFeedback: boolean) {
    const workspace = createEmptyWorkspace(now);
    workspace.settings.dailyMinutes = 45;
    workspace.settings.focusMinutes = 45;

    const competitor = makeTopic(
      'redistribute-competitor',
      'A competing topic',
      'Physics',
      'learning',
      120,
      2,
    );
    const weak = makeTopic(
      'redistribute-weak',
      'Z weak topic',
      'Mathematics',
      'learning',
      120,
      2,
    );
    workspace.topics.push(competitor, weak);
    workspace.exams.push(
      createExam(
        {
          name: 'Combined exam',
          date: addLocalDays(startOfLocalDay(now), 4) + 12 * 60 * 60 * 1000,
          scope: 'topics',
          subjects: [],
          topicIds: [competitor.id, weak.id],
        },
        now,
        'redistribution_exam',
      ),
    );

    if (withFeedback) {
      const previous = addLocalDays(startOfLocalDay(now), -1);
      workspace.history.push(
        {
          id: 'redistribution-hard-focus',
          topicId: weak.id,
          at: previous + 17 * 60 * 60 * 1000,
          kind: 'study',
          minutes: 35,
          grade: 0,
          effort: 5,
          prompt: '',
          response: '',
          confidence: 'partial',
          plannedMinutes: 25,
        },
        {
          id: 'redistribution-weak-recall',
          topicId: weak.id,
          at: previous + 18 * 60 * 60 * 1000,
          kind: 'review',
          minutes: 3,
          grade: 1,
          effort: 3,
          prompt: 'Recall',
          response: 'Missed',
          confidence: 'unsure',
        },
      );
    }

    return workspace;
  }

  const baseline = buildJointExamPreparationPlan(
    feedbackRedistributionWorkspace(false),
    now,
  );
  const adapted = buildJointExamPreparationPlan(
    feedbackRedistributionWorkspace(true),
    now,
  );

  const tomorrow = addLocalDays(startOfLocalDay(now), 1);
  const baselineTomorrow = baseline.days.find((day) => day.day === tomorrow)!;
  const adaptedTomorrow = adapted.days.find((day) => day.day === tomorrow)!;

  const baselineWeak = baselineTomorrow.blocks
    .filter(
      (block) =>
        block.kind === 'preparation' &&
        block.topicId === 'redistribute-weak',
    )
    .reduce((sum, block) => sum + block.minutes, 0);
  const adaptedWeak = adaptedTomorrow.blocks
    .filter(
      (block) =>
        block.kind === 'preparation' &&
        block.topicId === 'redistribute-weak',
    )
    .reduce((sum, block) => sum + block.minutes, 0);
  const adaptedCompetitor = adaptedTomorrow.blocks
    .filter(
      (block) =>
        block.kind === 'preparation' &&
        block.topicId === 'redistribute-competitor',
    )
    .reduce((sum, block) => sum + block.minutes, 0);

  assert.ok(
    adaptedWeak > baselineWeak,
    'New topic feedback should immediately move more of tomorrow\'s limited Mileage toward the weaker topic.',
  );
  assert.ok(
    adaptedCompetitor >= 5,
    'Feedback redistribution must preserve minimum coverage for another active exam topic when capacity allows it.',
  );
  assert.ok(
    adapted.warnings.some((warning) => /feedback is reshaping the order/i.test(warning)),
    'The joint planner should explain when feedback changes future allocation.',
  );
  assert.ok(
    adapted.days.every(
      (day) =>
        day.plannedPreparationMinutes + day.plannedRevisionMinutes <=
        day.usableCapacityMinutes,
    ),
    'Feedback redistribution must stay inside the same safe daily Mileage capacity.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 180;
  workspace.settings.focusMinutes = 45;

  const history = makeTopic('joint-history', 'Nationalism in India', 'History', 'learning', 60, 2);
  const geography = makeTopic('joint-geography', 'Resources and Development', 'Geography', 'learning', 60, 2);
  workspace.topics.push(history, geography);

  const examDate = addLocalDays(startOfLocalDay(now), 5) + 12 * 60 * 60 * 1000;
  workspace.exams.push(
    createExam(
      {
        name: 'Social Science exam',
        date: examDate,
        scope: 'topics',
        subjects: [],
        topicIds: ['joint-history', 'joint-geography'],
      },
      now,
      'joint_revision_exam',
    ),
  );

  const joint = buildJointExamPreparationPlan(workspace, now, {
    revisionRatio: 0.25,
    revisionLeadDays: 2,
    minRevisionMinutes: 30,
  });

  const revisionBlocks = joint.days
    .flatMap((day) => day.blocks)
    .filter((block) => block.kind === 'revision');
  assert.ok(revisionBlocks.length > 0, 'A feasible plan should include explicit final revision blocks.');

  const revisionStart = addLocalDays(startOfLocalDay(examDate), -2);
  assert.ok(
    revisionBlocks.every(
      (block) =>
        block.day >= revisionStart &&
        block.day < startOfLocalDay(examDate),
    ),
    'Final revision must stay inside the configured pre-exam revision window.',
  );

  for (const block of revisionBlocks) {
    const earlierPreparation = joint.days
      .flatMap((day) => day.blocks)
      .filter(
        (candidate) =>
          candidate.kind === 'preparation' &&
          candidate.topicId === block.topicId &&
          candidate.day < block.day,
      )
      .reduce((sum, candidate) => sum + candidate.minutes, 0);
    assert.ok(
      earlierPreparation > 0,
      'Revision must not be scheduled before the topic has had preparation on an earlier day.',
    );
  }

  const examSummary = joint.exams.find((exam) => exam.examId === 'joint_revision_exam')!;
  assert.equal(examSummary.revisionUnallocatedMinutes, 0);
  assert.equal(
    examSummary.revisionPlannedMinutes,
    examSummary.revisionRequiredMinutes,
    'A feasible plan should protect the full requested revision buffer.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 45;
  workspace.settings.focusMinutes = 30;

  workspace.topics.push(
    makeTopic('joint-over-a', 'Magnetic Effects', 'Physics', 'new', 240, 3),
    makeTopic('joint-over-b', 'Carbon and Compounds', 'Chemistry', 'new', 240, 3),
  );
  workspace.exams.push(
    createExam(
      {
        name: 'Physics soon',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['joint-over-a'],
      },
      now,
      'joint_over_a',
    ),
    createExam(
      {
        name: 'Chemistry soon',
        date: addLocalDays(startOfLocalDay(now), 3) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: ['joint-over-b'],
      },
      now,
      'joint_over_b',
    ),
  );

  const joint = buildJointExamPreparationPlan(workspace, now);
  assert.equal(joint.strain, 'overloaded');
  assert.ok(joint.unallocatedPreparationMinutes > 0);
  assert.ok(
    joint.warnings.some((warning) => /cannot fit before the relevant exam deadlines/i.test(warning)),
    'The joint planner must surface cross-exam overload instead of silently dropping work.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 45;
  const topic = makeTopic(
    'progress-topic',
    'Polynomials',
    'Mathematics',
    'learning',
    90,
    2,
  );
  topic.createdAt = addLocalDays(startOfLocalDay(now), -10);
  workspace.topics.push(topic);
  workspace.exams.push(
    createExam(
      {
        name: 'Maths exam',
        date: addLocalDays(startOfLocalDay(now), 4) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [topic.id],
      },
      now,
      'progress_exam',
    ),
  );

  const baseline = buildExamPreparationPlan(workspace, 'progress_exam', now)!;
  assert.equal(
    baseline.topics[0]!.remainingPreparationMinutes,
    baseline.topics[0]!.estimatedMinutes,
  );

  workspace.history.push({
    id: 'progress-focus',
    topicId: topic.id,
    at: addLocalDays(startOfLocalDay(now), -1) + 17 * 60 * 60 * 1000,
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'partial',
    plannedMinutes: 30,
  });

  const afterFocus = buildExamPreparationPlan(workspace, 'progress_exam', now)!;
  assert.equal(afterFocus.topics[0]!.completedPreparationMinutes, 30);
  assert.equal(
    afterFocus.topics[0]!.remainingPreparationMinutes,
    Math.max(0, afterFocus.topics[0]!.estimatedMinutes - 30),
  );
  assert.ok(
    afterFocus.totalRequiredMinutes < baseline.totalRequiredMinutes,
    'Completed Focus must reduce remaining exam preparation instead of being planned again.',
  );
}

{
  // A partly elapsed scheduled block is not two separate commitments:
  // completed Focus/history uses the elapsed time, and only its future
  // portion remains reserved. Single and joint plans must agree.
  const capacityWorkspace = createEmptyWorkspace(now);
  capacityWorkspace.settings.sleepEnabled = false;
  capacityWorkspace.settings.dailyMinutes = 180;
  capacityWorkspace.settings.focusMinutes = 45;
  const capacityTopic = makeTopic(
    'capacity-study', 'Electricity', 'Physics', 'learning', 180, 2,
  );
  capacityTopic.createdAt = addLocalDays(startOfLocalDay(now), -10);
  capacityWorkspace.topics.push(capacityTopic);
  capacityWorkspace.exams.push(
    createExam({
      name: 'Electricity test',
      date: addLocalDays(startOfLocalDay(now), 3) + 12 * 60 * 60 * 1000,
      scope: 'topics',
      subjects: [],
      topicIds: [capacityTopic.id],
    }, now, 'capacity-exam'),
  );
  const reservedTask = createStudyTask({
    title: 'Separate scheduled work',
    subject: 'English',
    estimatedMinutes: 120,
    now,
  });
  capacityWorkspace.tasks.push(reservedTask);
  scheduleTask(reservedTask, local(2026, 10, 5, 14), local(2026, 10, 5, 16), now);
  capacityWorkspace.history.push({
    id: 'capacity-completed-focus',
    topicId: capacityTopic.id,
    at: local(2026, 10, 5, 14, 30),
    kind: 'study',
    minutes: 30,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'partial',
  });
  const unchanged = cloneWorkspace(capacityWorkspace);
  const single = buildExamPreparationPlan(capacityWorkspace, 'capacity-exam', now)!;
  const joint = buildJointExamPreparationPlan(capacityWorkspace, now);
  assert.equal(single.days[0]!.existingStudyMinutes, 30);
  assert.equal(joint.days[0]!.existingStudyMinutes, 30);
  assert.equal(single.days[0]!.scheduledStudyMinutes, 60,
    'Single exam plan must reserve only 15:00–16:00, not the 14:00–16:00 original block');
  assert.equal(joint.days[0]!.scheduledStudyMinutes, 60,
    'Joint exam plan must use the same remaining scheduled time');
  assert.equal(single.topics[0]!.completedPreparationMinutes, 30,
    'Finished study counts as preparation progress');
  assert.equal(single.days[0]!.totalStudyLoadMinutes,
    single.days[0]!.existingStudyMinutes + single.days[0]!.scheduledStudyMinutes +
      single.days[0]!.plannedMinutes,
    'Single plan cannot account for elapsed scheduled minutes twice');
  assert.deepEqual(capacityWorkspace, unchanged,
    'Read-only exam planning must not mutate recorded work or schedules');

  const pastSchedule = cloneWorkspace(capacityWorkspace);
  scheduleTask(pastSchedule.tasks[0]!,
    local(2026, 10, 5, 13), local(2026, 10, 5, 14), now);
  const pastSingle = buildExamPreparationPlan(pastSchedule, 'capacity-exam', now)!;
  const pastJoint = buildJointExamPreparationPlan(pastSchedule, now);
  assert.equal(pastSingle.days[0]!.scheduledStudyMinutes, 0,
    'Expired study reservations are not future commitments');
  assert.equal(pastJoint.days[0]!.scheduledStudyMinutes, 0);
  assert.equal(pastSingle.days[0]!.existingStudyMinutes, 30,
    'An expired reservation must not erase actual completed study');

  const futureSchedule = cloneWorkspace(capacityWorkspace);
  scheduleTask(futureSchedule.tasks[0]!,
    local(2026, 10, 6, 17), local(2026, 10, 6, 18), now);
  const futureSingle = buildExamPreparationPlan(futureSchedule, 'capacity-exam', now)!;
  const futureJoint = buildJointExamPreparationPlan(futureSchedule, now);
  assert.equal(futureSingle.days[0]!.scheduledStudyMinutes, 0);
  assert.equal(futureJoint.days[0]!.scheduledStudyMinutes, 0);
  assert.equal(futureSingle.days[1]!.scheduledStudyMinutes, 60,
    'Tomorrow retains all 60 scheduled minutes');
  assert.equal(futureJoint.days[1]!.scheduledStudyMinutes, 60);
  assert.equal(futureSingle.days[1]!.existingStudyMinutes, 0,
    'A future scheduled session must not be credited as completed preparation');
}

{

  // Regression: elapsed scheduled minutes should not be counted again as
  // reserved study when completed work has already consumed daily capacity.
  const partial = createEmptyWorkspace(now);
  partial.settings.sleepEnabled = false;
  partial.settings.dailyMinutes = 120;
  partial.settings.focusMinutes = 30;
  const subjectTopic = makeTopic('time-credit-topic', 'Circles', 'Mathematics', 'learning', 120, 2);
  subjectTopic.createdAt = addLocalDays(startOfLocalDay(now), -10);
  partial.topics.push(subjectTopic);
  partial.exams.push(createExam({
    name: 'Maths test', date: local(2026, 10, 9, 12),
    scope: 'topics', subjects: [], topicIds: [subjectTopic.id],
  }, now, 'time-credit-exam'));
  const scheduledTask = createStudyTask({
    title: 'Circles practice', topicId: subjectTopic.id,
    examId: 'time-credit-exam', estimatedMinutes: 90, now,
  });
  scheduleTask(scheduledTask, local(2026, 10, 5, 14, 30), local(2026, 10, 5, 15, 30), now);
  scheduledTask.actualMinutes = 30;
  partial.tasks.push(scheduledTask);
  partial.history.push({
    id: 'completed-study-30', topicId: subjectTopic.id,
    at: local(2026, 10, 5, 14, 55), kind: 'study',
    minutes: 30, grade: 0, effort: 3, prompt: '', response: '',
    confidence: 'partial', plannedMinutes: 30,
  });
  const snapshot = cloneWorkspace(partial);
  const solo = buildExamPreparationPlan(partial, 'time-credit-exam', now)!;
  const jointPart = buildJointExamPreparationPlan(partial, now);
  assert.equal(solo.days[0]!.scheduledStudyMinutes, 30);
  assert.equal(jointPart.days[0]!.scheduledStudyMinutes, 30);
  assert.equal(solo.days[0]!.existingStudyMinutes, 30);
  assert.equal(jointPart.days[0]!.existingStudyMinutes, 30);
  assert.equal(solo.days[0]!.sustainableRemainingMinutes, 60);
  assert.equal(jointPart.days[0]!.sustainableRemainingMinutes, 60);
  assert.equal(solo.topics[0]!.completedPreparationMinutes, 30);
  assert.equal(solo.topics[0]!.totalRequiredMinutes, jointPart.totalPreparationRequiredMinutes);
  assert.deepEqual(partial, snapshot);

  const futureOnly = cloneWorkspace(partial);
  futureOnly.history = [];
  futureOnly.tasks[0]!.actualMinutes = 0;
  assert.equal(buildExamPreparationPlan(futureOnly, 'time-credit-exam', local(2026, 10, 5, 14))!
    .days[0]!.scheduledStudyMinutes, 60, 'Future planned work remains fully reserved');
  assert.equal(buildJointExamPreparationPlan(partial, local(2026, 10, 5, 16))
    .days[0]!.scheduledStudyMinutes, 0, 'Past scheduled work must not reserve future time');

  const finishedTaskFocus = cloneWorkspace(partial);
  finishedTaskFocus.focusOutcomes!.push({
    id: 'finished-standalone', startedAt: local(2026, 10, 5, 13),
    endedAt: local(2026, 10, 5, 13, 20), status: 'finished',
    plannedMinutes: 20, minutes: 20, launchMode: 'full',
    taskOnly: true, overdue: false,
  });
  const withOutcome = buildJointExamPreparationPlan(finishedTaskFocus, now);
  assert.equal(withOutcome.days[0]!.existingStudyMinutes, 50);
  assert.equal(withOutcome.days[0]!.scheduledStudyMinutes, 30);
  assert.equal(withOutcome.days[0]!.sustainableRemainingMinutes, 40);
}

{
  const before = createEmptyWorkspace(now);
  before.settings.dailyMinutes = 60;
  before.settings.focusMinutes = 45;
  const first = makeTopic(
    'reflow-a',
    'Algebra',
    'Mathematics',
    'learning',
    90,
    2,
  );
  const second = makeTopic(
    'reflow-b',
    'Electricity',
    'Physics',
    'learning',
    90,
    2,
  );
  first.createdAt = second.createdAt = addLocalDays(startOfLocalDay(now), -5);
  before.topics.push(first, second);
  before.exams.push(
    createExam(
      {
        name: 'Combined test',
        date: addLocalDays(startOfLocalDay(now), 4) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [first.id, second.id],
      },
      now,
      'reflow_exam',
    ),
  );

  const after = cloneWorkspace(before);
  after.topics.find((topic) => topic.id === first.id)!.snoozeUntil =
    addLocalDays(startOfLocalDay(now), 1);

  const reflow = buildAutopilotReflowSummary(before, after, now)!;
  assert.ok(hasMeaningfulAutopilotReflow(reflow));
  assert.ok(
    reflow.movedLaterMinutes > 0,
    'Snoozing tonight\'s exam work should move some planned work to a later day.',
  );
  assert.ok(
    reflow.moves.some((move) => move.topicId === first.id && move.toDay > move.fromDay),
    'The reflow summary should name the topic that moved later.',
  );
}

{
  const before = createEmptyWorkspace(now);
  before.settings.dailyMinutes = 60;
  before.settings.focusMinutes = 45;
  const topic = makeTopic(
    'capacity-loss',
    'Light',
    'Science',
    'learning',
    90,
    3,
  );
  topic.createdAt = addLocalDays(startOfLocalDay(now), -5);
  before.topics.push(topic);
  before.exams.push(
    createExam(
      {
        name: 'Science exam',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [topic.id],
      },
      now,
      'capacity_loss_exam',
    ),
  );

  const after = cloneWorkspace(before);
  const tomorrow = addLocalDays(startOfLocalDay(now), 1);
  after.commitments.push({
    id: 'lost-day',
    title: 'Unexpected school event',
    kind: 'school',
    startAt: tomorrow + 7 * 60 * 60 * 1000,
    endAt: tomorrow + 22 * 60 * 60 * 1000 + 30 * 60 * 1000,
    startMinutes: 7 * 60,
    endMinutes: 22 * 60 + 30,
    recurrenceDays: [],
    skippedDates: [],
    createdAt: now,
    updatedAt: now,
  });

  const reflow = buildAutopilotReflowSummary(before, after, now)!;
  assert.ok(
    reflow.capacityDeltaMinutes < 0,
    'A new fixed commitment must reduce safe exam-plan capacity.',
  );
  assert.ok(
    reflow.movedLaterMinutes > 0 || reflow.newlyUnallocatedMinutes > 0,
    'Lost capacity must either move unfinished work later or surface it as unallocated.',
  );
  assert.ok(
    reflow.becameImpossible || reflow.newlyUnallocatedMinutes > 0,
    'When the remaining deadline window cannot absorb the lost day, Autopilot must surface the break instead of hiding it.',
  );
  assert.ok(reflow.firstBrokenDeadline !== null);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 45;
  workspace.settings.focusMinutes = 30;

  const examTopic = makeTopic(
    'recover-task-exam-topic',
    'Quadratics',
    'Mathematics',
    'learning',
    90,
    3,
  );
  examTopic.createdAt = addLocalDays(startOfLocalDay(now), -4);
  workspace.topics.push(examTopic);
  workspace.exams.push(
    createExam(
      {
        name: 'Maths recovery test',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [examTopic.id],
      },
      now,
      'recover_task_exam',
    ),
  );

  const movable = createStudyTask({
    title: 'Decorate project cover',
    type: 'personal',
    planState: 'scheduled',
    dueAt: addLocalDays(startOfLocalDay(now), 6) + 20 * 60 * 60 * 1000,
    estimatedMinutes: 30,
    priority: 1,
    now,
  });
  scheduleTask(
    movable,
    now + 60 * 60 * 1000,
    now + 90 * 60 * 1000,
    now,
  );
  workspace.tasks.push(movable);

  const options = buildAutopilotRecoveryOptions(workspace, now, 4);
  const taskOption = options.find(
    (option) =>
      option.kind === 'defer-task' &&
      option.taskId === movable.id,
  );
  assert.ok(
    taskOption,
    'Recovery should offer moving a lower-priority non-urgent scheduled task when it improves a broken exam window.',
  );
  assert.ok(
    taskOption!.effect.feasibleAfter ||
      taskOption!.effect.overloadReducedMinutes > 0 ||
      taskOption!.effect.unallocatedReducedMinutes > 0,
    'Every shown task recovery must have a simulated positive effect.',
  );

  const previewWorkspace = cloneWorkspace(workspace);
  const taskUndo = applyAutopilotRecoveryOption(
    previewWorkspace,
    taskOption!,
    now,
  );
  assert.ok(taskUndo);
  const movedTask = previewWorkspace.tasks.find(
    (task) => task.id === movable.id,
  )!;
  assert.equal(movedTask.planState, 'postponed');
  assert.ok(
    movedTask.postponedUntil >
      startOfLocalDay(workspace.exams[0]!.date),
  );
  assert.equal(
    workspace.tasks.find((task) => task.id === movable.id)!.planState,
    'scheduled',
    'Preview/apply testing must not mutate the source workspace.',
  );
  assert.equal(
    undoAutopilotRecovery(previewWorkspace, taskUndo!),
    true,
  );
  const restoredTask = previewWorkspace.tasks.find(
    (task) => task.id === movable.id,
  )!;
  assert.equal(restoredTask.planState, movable.planState);
  assert.equal(restoredTask.scheduledStart, movable.scheduledStart);
  assert.equal(restoredTask.scheduledEnd, movable.scheduledEnd);
  assert.equal(restoredTask.postponedUntil, movable.postponedUntil);
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 35;
  workspace.settings.focusMinutes = 30;

  const essential = makeTopic(
    'recover-essential',
    'Light',
    'Science',
    'learning',
    90,
    3,
  );
  const movableTopic = makeTopic(
    'recover-movable',
    'Extra worksheet',
    'Science',
    'learning',
    90,
    1,
  );
  essential.createdAt = movableTopic.createdAt =
    addLocalDays(startOfLocalDay(now), -5);
  workspace.topics.push(essential, movableTopic);
  workspace.exams.push(
    createExam(
      {
        name: 'Science scope recovery',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [essential.id, movableTopic.id],
      },
      now,
      'recover_scope_exam',
    ),
  );

  const options = buildAutopilotRecoveryOptions(workspace, now, 4);
  const scopeOption = options.find(
    (option) =>
      option.kind === 'reduce-exam-scope' &&
      option.topicId === movableTopic.id,
  );
  assert.ok(
    scopeOption,
    'Explicit multi-topic exams may offer a low-priority scope reduction when simulation shows it helps.',
  );

  const previewWorkspace = cloneWorkspace(workspace);
  const scopeUndo = applyAutopilotRecoveryOption(
    previewWorkspace,
    scopeOption!,
    now,
  );
  assert.ok(scopeUndo);
  assert.deepEqual(
    previewWorkspace.exams[0]!.topicIds,
    [essential.id],
  );
  assert.equal(
    workspace.exams[0]!.topicIds.length,
    2,
    'Recovery scope preview must not mutate the original exam.',
  );
  assert.equal(
    undoAutopilotRecovery(previewWorkspace, scopeUndo!),
    true,
  );
  assert.deepEqual(
    previewWorkspace.exams[0]!.topicIds,
    [essential.id, movableTopic.id],
    'Undo must restore the original explicit exam topic order.',
  );

  const subjectScoped = cloneWorkspace(workspace);
  subjectScoped.exams[0]!.scope = 'subjects';
  subjectScoped.exams[0]!.subjects = ['Science'];
  subjectScoped.exams[0]!.topicIds = [];
  assert.equal(
    buildAutopilotRecoveryOptions(subjectScoped, now, 4).some(
      (option) => option.kind === 'reduce-exam-scope',
    ),
    false,
    'MYELIN must not silently invent topic exclusions for subject-scoped exams.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 30;
  workspace.settings.focusMinutes = 45;

  const heavy = makeTopic(
    'recover-split-heavy',
    'Organic chemistry',
    'Chemistry',
    'learning',
    140,
    2,
  );
  heavy.createdAt = addLocalDays(startOfLocalDay(now), -4);
  workspace.topics.push(heavy);
  workspace.exams.push(
    createExam(
      {
        name: 'Chemistry recovery',
        date: addLocalDays(startOfLocalDay(now), 2) + 12 * 60 * 60 * 1000,
        scope: 'topics',
        subjects: [],
        topicIds: [heavy.id],
      },
      now,
      'recover_split_exam',
    ),
  );

  const beforePlan = buildJointExamPreparationPlan(workspace, now, {
    maxDays: 120,
  });
  const options = buildAutopilotRecoveryOptions(workspace, now, 4);
  const splitOption = options.find(
    (option) =>
      option.kind === 'split-topic' &&
      option.topicId === heavy.id,
  );
  assert.ok(
    splitOption,
    'A heavy topic in a broken plan should offer smaller future blocks without changing scope.',
  );

  const previewWorkspace = cloneWorkspace(workspace);
  const splitUndo = applyAutopilotRecoveryOption(
    previewWorkspace,
    splitOption!,
    now,
  );
  assert.ok(splitUndo);
  assert.equal(
    previewWorkspace.topics[0]!.preferredBlockMinutes,
    splitOption!.kind === 'split-topic'
      ? splitOption!.targetBlockMinutes
      : -1,
  );
  assert.equal(
    previewWorkspace.topics[0]!.estimate,
    workspace.topics[0]!.estimate,
    'Split recovery must not rewrite the saved workload estimate.',
  );
  assert.deepEqual(
    previewWorkspace.exams[0]!.topicIds,
    workspace.exams[0]!.topicIds,
    'Split recovery must not alter exam scope.',
  );

  const afterPlan = buildJointExamPreparationPlan(
    previewWorkspace,
    now,
    { maxDays: 120 },
  );
  assert.equal(
    afterPlan.totalPreparationRequiredMinutes,
    beforePlan.totalPreparationRequiredMinutes,
    'Smaller blocks must not pretend the topic needs less total work.',
  );
  const target =
    splitOption!.kind === 'split-topic'
      ? splitOption!.targetBlockMinutes
      : 90;
  assert.ok(
    afterPlan.days
      .flatMap((day) => day.blocks)
      .filter(
        (block) =>
          block.kind === 'preparation' &&
          block.topicId === heavy.id,
      )
      .every((block) => block.minutes <= target),
    'Autopilot must respect the smaller recovery block cap.',
  );
  assert.equal(
    undoAutopilotRecovery(previewWorkspace, splitUndo!),
    true,
  );
  assert.equal(
    previewWorkspace.topics[0]!.preferredBlockMinutes,
    undefined,
    'Undo must remove a recovery block preference that did not exist before.',
  );
}

{
  const workspace = createEmptyWorkspace(now);
  workspace.settings.dailyMinutes = 120;
  workspace.settings.focusMinutes = 45;

  const topic = makeTopic(
    'recover-reclaim-topic',
    'Electricity',
    'Science',
    'learning',
    240,
    3,
  );
  topic.createdAt = addLocalDays(startOfLocalDay(now), -5);
  workspace.topics.push(topic);

  const examDate =
    addLocalDays(startOfLocalDay(now), 2) +
    12 * 60 * 60 * 1000;
  workspace.exams.push(
    createExam(
      {
        name: 'Science reclaim test',
        date: examDate,
        scope: 'topics',
        subjects: [],
        topicIds: [topic.id],
      },
      now,
      'recover_reclaim_exam',
    ),
  );

  const tomorrow = addLocalDays(startOfLocalDay(now), 1);
  const tomorrowDate = new Date(tomorrow);
  const tomorrowWeekday = tomorrowDate.getDay();
  const occurrenceKey = localDayKey(tomorrow);

  workspace.commitments.push(
    {
      id: 'school-fixed-reclaim-test',
      title: 'School',
      kind: 'school',
      startAt: tomorrow + 6 * 60 * 60 * 1000,
      endAt: tomorrow + 16 * 60 * 60 * 1000,
      startMinutes: 6 * 60,
      endMinutes: 16 * 60,
      recurrenceDays: [],
      skippedDates: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tuition-reclaim-test',
      title: 'Maths tuition',
      kind: 'tuition',
      startAt: tomorrow + 16 * 60 * 60 * 1000,
      endAt: tomorrow + 22 * 60 * 60 * 1000,
      startMinutes: 16 * 60,
      endMinutes: 22 * 60,
      recurrenceDays: [tomorrowWeekday],
      skippedDates: [],
      createdAt: now,
      updatedAt: now,
    },
  );

  const baseline = buildJointExamPreparationPlan(
    workspace,
    now,
    { maxDays: 120 },
  );
  assert.ok(
    !baseline.feasibility.feasible ||
      baseline.unallocatedPreparationMinutes > 0,
    'The reclaim test must begin with a genuinely broken exam plan.',
  );

  const options = buildAutopilotRecoveryOptions(
    workspace,
    now,
    4,
  );
  const reclaim = options.find(
    (option) =>
      option.kind === 'reclaim-commitment' &&
      option.commitmentId === 'tuition-reclaim-test' &&
      option.occurrenceDateKey === occurrenceKey,
  );
  assert.ok(
    reclaim,
    'A recurring tuition occurrence should be previewed as reclaimable when skipping it creates real safe capacity.',
  );
  assert.ok(
    reclaim!.effect.capacityGainedMinutes > 0,
    'Reclaim preview must report actual safe capacity gained, not only raw clock duration.',
  );
  assert.ok(
    reclaim!.kind === 'reclaim-commitment' &&
      reclaim!.reclaimedClockMinutes >
        reclaim!.effect.capacityGainedMinutes,
    'When sustainable capacity caps the gain, MYELIN should distinguish reclaimed clock time from usable study capacity.',
  );
  assert.ok(
    reclaim!.kind === 'reclaim-commitment' &&
      reclaim!.placements.length > 0,
    'Reclaim preview should show which Autopilot blocks would actually use the recovered window.',
  );
  const placedMinutes =
    reclaim!.kind === 'reclaim-commitment'
      ? reclaim!.placements.reduce(
          (sum, placement) => sum + placement.minutes,
          0,
        )
      : 0;
  assert.ok(
    placedMinutes <= reclaim!.effect.capacityGainedMinutes,
    'Placed study must never exceed the safe capacity actually gained.',
  );
  if (reclaim!.kind === 'reclaim-commitment') {
    assert.ok(
      reclaim!.placements.every(
        (placement) =>
          placement.start >= reclaim!.occurrenceStart &&
          placement.end <= reclaim!.occurrenceEnd &&
          placement.end - placement.start ===
            placement.minutes * 60_000,
      ),
      'Every suggested block must stay inside the exact cancelled commitment window.',
    );
    assert.ok(
      reclaim!.placements.every(
        (placement) =>
          placement.topicId === topic.id &&
          placement.minutes >= 5,
      ),
      'The recovered window should contain real exam-plan work, not synthetic filler.',
    );
  }
  assert.equal(
    options.some(
      (option) =>
        option.kind === 'reclaim-commitment' &&
        option.commitmentId === 'school-fixed-reclaim-test',
    ),
    false,
    'School time must never be proposed as automatically reclaimable.',
  );

  const previewWorkspace = cloneWorkspace(workspace);
  const taskCountBeforeRecovery = previewWorkspace.tasks.length;
  const undo = applyAutopilotRecoveryOption(
    previewWorkspace,
    reclaim!,
    now,
  );
  assert.ok(undo);
  assert.deepEqual(
    previewWorkspace.commitments.find(
      (item) => item.id === 'tuition-reclaim-test',
    )!.skippedDates,
    [occurrenceKey],
    'Applying reclaim must skip only the specific recurring occurrence.',
  );
  assert.equal(
    previewWorkspace.tasks.length,
    taskCountBeforeRecovery,
    'Applying reclaimed-window recovery must not create duplicate synthetic task records.',
  );

  const conflictStart = tomorrow + 16 * 60 * 60 * 1000 + 20 * 60 * 1000;
  const conflictEnd = tomorrow + 17 * 60 * 60 * 1000;
  previewWorkspace.commitments.push({
    id: 'later-fixed-conflict',
    title: 'Unexpected appointment',
    kind: 'other',
    startAt: conflictStart,
    endAt: conflictEnd,
    startMinutes: 16 * 60 + 20,
    endMinutes: 17 * 60,
    recurrenceDays: [],
    skippedDates: [],
    createdAt: now + 1,
    updatedAt: now + 1,
  });

  const reservationNow = tomorrow + 15 * 60 * 60 * 1000;
  const liveReservations = buildAppliedReclaimedWindows(
    previewWorkspace,
    reservationNow,
  );
  const liveReservation = liveReservations.find(
    (window) =>
      window.commitmentId === 'tuition-reclaim-test' &&
      window.occurrenceDateKey === occurrenceKey,
  );
  assert.ok(
    liveReservation,
    'After Apply, Day Map should be able to reconstruct the recovered Autopilot reservation from the skipped occurrence itself.',
  );
  assert.ok(
    liveReservation!.placements.length > 0,
    'A live recovered window should retain concrete Autopilot study placements.',
  );
  assert.ok(
    liveReservation!.placements.every(
      (placement) =>
        placement.start >= liveReservation!.start &&
        placement.end <= liveReservation!.end,
    ),
    'Live recovered reservations must remain inside the cancelled clock window.',
  );
  assert.ok(
    liveReservation!.placements.every(
      (placement) =>
        placement.end <= conflictStart ||
        placement.start >= conflictEnd,
    ),
    'Recovered Autopilot blocks must never overlap a later fixed commitment.',
  );
  assert.ok(
    liveReservation!.placements.some(
      (placement) => placement.end <= conflictStart,
    ) &&
      liveReservation!.placements.some(
        (placement) => placement.start >= conflictEnd,
      ),
    'A later fixed commitment inside the recovered window should split and reflow study around the conflict.',
  );
  assert.equal(
    liveReservation!.protection?.reason,
    'schedule-change',
    'A later fixed commitment that reshapes the recovered window should be surfaced as pre-miss protection rather than waiting for a miss.',
  );
  assert.equal(
    liveReservation!.missed,
    null,
    'Schedule protection before a recovered slot passes must not be recorded as a miss.',
  );

  const reminderBlock = liveReservation!.placements[0]!;
  const reminderHandoff = {
    commitmentId: 'tuition-reclaim-test',
    occurrenceDateKey: occurrenceKey,
    topicId: reminderBlock.topicId,
    scheduledStart: reminderBlock.start,
    scheduledEnd: reminderBlock.end,
  };
  const exactReminderResolution =
    resolveRecoveredReminderHandoff(
      liveReservations,
      reminderHandoff,
      reservationNow,
    );
  assert.equal(
    exactReminderResolution.status,
    'exact',
    'A notification that still matches the live recovered block should remain an exact handoff.',
  );
  assert.equal(
    exactReminderResolution.placement?.start,
    reminderBlock.start,
  );

  const movedWindow = {
    ...liveReservation!,
    placements: liveReservation!.placements.map(
      (placement, index) =>
        index === 0
          ? {
              ...placement,
              start: placement.start + 10 * 60_000,
              end: placement.end + 10 * 60_000,
            }
          : placement,
    ),
  };
  const movedReminderResolution =
    resolveRecoveredReminderHandoff(
      [movedWindow],
      reminderHandoff,
      reservationNow,
    );
  assert.equal(
    movedReminderResolution.status,
    'updated',
  );
  assert.equal(
    movedReminderResolution.reason,
    'reflowed',
    'A recovered block moved by more than the handoff tolerance should be treated as a plan update, not as the old exact notification slot.',
  );
  assert.equal(
    movedReminderResolution.placement?.start,
    reminderBlock.start + 10 * 60_000,
  );

  const preMissNow = tomorrow + 15 * 60 * 60 * 1000 + 55 * 60 * 1000;
  const activeFocusUntil =
    tomorrow + 16 * 60 * 60 * 1000 + 15 * 60 * 1000;
  const protectedByFocus = buildAppliedReclaimedWindows(
    previewWorkspace,
    preMissNow,
    {
      unavailableUntil: activeFocusUntil,
      activeFocusTopicId: 'another-focus-topic',
      activeFocusStartedAt: preMissNow - 10 * 60 * 1000,
      protectionLeadMinutes: 10,
    },
  ).find(
    (window) =>
      window.commitmentId === 'tuition-reclaim-test' &&
      window.occurrenceDateKey === occurrenceKey,
  );
  assert.equal(
    protectedByFocus?.protection?.reason,
    'active-focus',
    'An already-running Focus session near the next recovered block should proactively protect and reflow the reservation.',
  );
  assert.equal(
    protectedByFocus?.missed,
    null,
    'Pre-miss protection caused by another Focus session must not be labeled as a miss.',
  );
  assert.ok(
    (protectedByFocus?.placements ?? []).every(
      (placement) => placement.start >= activeFocusUntil,
    ),
    'Recovered blocks should be repacked only after the current Focus session is expected to finish.',
  );
  assert.ok(
    liveReservation!.placements.length >= 2,
    'The live-window test needs multiple recovered blocks so completion can reflow the remainder.',
  );

  const firstRecoveredBlock = liveReservation!.placements[0]!;
  const beforeRemainingMinutes = liveReservation!.placements.reduce(
    (sum, placement) => sum + placement.minutes,
    0,
  );
  previewWorkspace.history.push({
    id: 'reclaimed-focus-complete',
    topicId: firstRecoveredBlock.topicId,
    at: firstRecoveredBlock.end,
    kind: 'study',
    minutes: firstRecoveredBlock.minutes,
    grade: 0,
    effort: 3,
    prompt: '',
    response: '',
    confidence: 'unsure',
    plannedMinutes: firstRecoveredBlock.minutes,
    startedAt: firstRecoveredBlock.start,
    endedAt: firstRecoveredBlock.end,
    launchMode: 'full',
    tinyStep: '',
  });

  const afterFocusNow = firstRecoveredBlock.end + 60_000;
  const afterFocusReservations = buildAppliedReclaimedWindows(
    previewWorkspace,
    afterFocusNow,
  );
  const afterFocusReservation = afterFocusReservations.find(
    (window) =>
      window.commitmentId === 'tuition-reclaim-test' &&
      window.occurrenceDateKey === occurrenceKey,
  );
  const afterRemainingMinutes =
    afterFocusReservation?.placements.reduce(
      (sum, placement) => sum + placement.minutes,
      0,
    ) ?? 0;

  assert.ok(
    afterRemainingMinutes < beforeRemainingMinutes,
    'Completing a recovered Focus block must reduce the remaining live reservation.',
  );
  assert.ok(
    (afterFocusReservation?.placements ?? []).every(
      (placement) => placement.start >= afterFocusNow,
    ),
    'After completion, remaining recovered blocks must reflow from the current time and never reappear in the past.',
  );
  assert.ok(
    (afterFocusReservation?.placements ?? []).every(
      (placement) =>
        placement.end <= conflictStart ||
        placement.start >= conflictEnd,
    ),
    'Completion reflow must continue respecting schedule conflicts added after the original recovery.',
  );
  assert.ok(
    (afterFocusReservation?.placements[0]?.start ?? conflictEnd) >=
      conflictEnd,
    'If Focus finishes while a new commitment is active, the next recovered block must resume only after that commitment ends.',
  );
  assert.equal(
    (afterFocusReservation?.placements ?? []).some(
      (placement) =>
        placement.start === firstRecoveredBlock.start &&
        placement.topicId === firstRecoveredBlock.topicId,
    ),
    false,
    'The completed recovered block must disappear from the remaining reservation.',
  );

  const completedReminderResolution =
    resolveRecoveredReminderHandoff(
      afterFocusReservations,
      {
        commitmentId: 'tuition-reclaim-test',
        occurrenceDateKey: occurrenceKey,
        topicId: firstRecoveredBlock.topicId,
        scheduledStart: firstRecoveredBlock.start,
        scheduledEnd: firstRecoveredBlock.end,
      },
      afterFocusNow,
    );
  assert.equal(
    completedReminderResolution.status,
    'updated',
  );
  assert.equal(
    completedReminderResolution.reason,
    'passed',
    'A notification for a completed/passed recovered block should redirect to the latest live block instead of failing.',
  );
  assert.ok(
    completedReminderResolution.placement,
    'A completed stale reminder should resolve to the best remaining live recovered action when one exists.',
  );

  const missedTarget = afterFocusReservation?.placements[0];
  assert.ok(
    missedTarget,
    'The miss test needs a remaining recovered block after the completed first block.',
  );
  const missedNow = missedTarget!.end + 60_000;
  const afterMissWindows = buildAppliedReclaimedWindows(
    previewWorkspace,
    missedNow,
  );
  const afterMissWindow = afterMissWindows.find(
    (window) =>
      window.commitmentId === 'tuition-reclaim-test' &&
      window.occurrenceDateKey === occurrenceKey,
  );
  assert.ok(
    afterMissWindow?.missed,
    'A recovered block whose time passes without Focus must be surfaced as missed.',
  );
  assert.ok(
    afterMissWindow!.missed!.missedMinutes >=
      missedTarget!.minutes,
    'Missed recovered minutes must include the expired reserved block.',
  );
  assert.equal(
    afterMissWindow!.missed!.reflowedMinutes +
      afterMissWindow!.missed!.newlyUnallocatedMinutes,
    afterMissWindow!.missed!.missedMinutes,
    'Every missed recovered minute must be explained as either reflowed later or no longer fitting before the deadline.',
  );
  assert.ok(
    afterMissWindow!.placements.every(
      (placement) => placement.start >= missedNow,
    ),
    'After a recovered miss, only future reflowed blocks may remain visible.',
  );
  assert.ok(
    afterMissWindow!.placements.every(
      (placement) =>
        placement.end <= conflictStart ||
        placement.start >= conflictEnd,
    ),
    'Miss reflow must continue respecting later fixed commitments.',
  );
  assert.equal(
    afterMissWindow!.missed!.deadlineTightened,
    afterMissWindow!.missed!.becameImpossible ||
      afterMissWindow!.missed!.newlyUnallocatedMinutes > 0 ||
      afterMissWindow!.missed!.addedOverloadMinutes > 0 ||
      afterMissWindow!.missed!.strainBeforeMiss !==
        afterMissWindow!.missed!.strainAfterMiss,
    'The deadline-tightened flag must be derived from measurable feasibility/strain consequences.',
  );

  const missedReminderResolution =
    resolveRecoveredReminderHandoff(
      afterMissWindows,
      {
        commitmentId: 'tuition-reclaim-test',
        occurrenceDateKey: occurrenceKey,
        topicId: missedTarget!.topicId,
        scheduledStart: missedTarget!.start,
        scheduledEnd: missedTarget!.end,
      },
      missedNow,
    );
  assert.equal(
    missedReminderResolution.status,
    'updated',
  );
  assert.equal(
    missedReminderResolution.reason,
    'missed',
    'A notification whose recovered slot was missed should explicitly resolve as missed while pointing at the latest action.',
  );

  const nextWindow = {
    ...liveReservation!,
    commitmentId: 'another-recovered-window',
    occurrenceDateKey: '2099-01-02',
    start: liveReservation!.start + 86_400_000,
    end: liveReservation!.end + 86_400_000,
    placements: liveReservation!.placements.map(
      (placement) => ({
        ...placement,
        start: placement.start + 86_400_000,
        end: placement.end + 86_400_000,
      }),
    ),
    missed: null,
    protection: null,
  };
  const nextWindowResolution =
    resolveRecoveredReminderHandoff(
      [nextWindow],
      reminderHandoff,
      reservationNow,
    );
  assert.equal(
    nextWindowResolution.reason,
    'next-window',
    'If the original recovered window is gone, a stale notification should fall forward to the next live recovered window.',
  );
  assert.equal(
    nextWindowResolution.window?.commitmentId,
    'another-recovered-window',
  );

  const finishedReminderResolution =
    resolveRecoveredReminderHandoff(
      [],
      reminderHandoff,
      missedNow,
    );
  assert.equal(
    finishedReminderResolution.status,
    'updated',
  );
  assert.equal(
    finishedReminderResolution.reason,
    'window-finished',
  );
  assert.equal(
    finishedReminderResolution.placement,
    null,
    'When no recovered work remains, the resolver should explicitly return no recovered placement so Day Map can fall back to Today.',
  );

  assert.equal(
    previewWorkspace.tasks.length,
    taskCountBeforeRecovery,
    'Reconstructing, completing, and missing recovered reservations must remain projection-only and create no task records.',
  );
  assert.deepEqual(
    workspace.commitments.find(
      (item) => item.id === 'tuition-reclaim-test',
    )!.skippedDates,
    [],
    'Recovery preview/apply must not mutate the source workspace.',
  );
  assert.equal(
    undoAutopilotRecovery(previewWorkspace, undo!),
    true,
  );
  assert.deepEqual(
    previewWorkspace.commitments.find(
      (item) => item.id === 'tuition-reclaim-test',
    )!.skippedDates,
    [],
    'Undo must restore the commitment occurrence exactly.',
  );
}

console.log('✓ exam scope limits planning to included topics');
console.log('✓ per-exam workload estimates override generic Topic estimates');
console.log('✓ feasible workload is split into focus-sized blocks within safe daily capacity');
console.log('✓ enough study history personalizes sustainable daily capacity');
console.log('✓ planned-vs-actual pace corrects future topic estimates');
console.log('✓ per-topic effort + recall feedback increases workload and retrieval reserve without rewriting estimates');
console.log('✓ completion reliability and postponements make capacity more conservative');
console.log('✓ high-effort topics are spread with a daily fatigue guardrail');
console.log('✓ nearby exams reserve capacity without double-counting shared topics');
console.log('✓ joint multi-exam planning creates real blocks for every exam');
console.log('✓ new topic feedback redistributes tomorrow\'s limited Mileage without starving competing exam work');
console.log('✓ shared syllabus is deduplicated and obeys the earliest deadline');
console.log('✓ explicit revision buffers are scheduled only after earlier preparation');
console.log('✓ joint overload is surfaced instead of silently dropping exam work');
console.log('✓ completed Focus reduces remaining exam preparation demand');
console.log('✓ snoozed exam work reflows to later days instead of staying on today');
console.log('✓ new commitments reflow unfinished work and surface newly impossible deadlines');
console.log('✓ recovery previews can move safe low-priority tasks without touching urgent exam work');
console.log('✓ scope recovery is previewed only for explicit multi-topic exams and never invented for subject scope');
console.log('✓ recovery actions undo their targeted changes without restoring an entire stale workspace');
console.log('✓ heavy-topic recovery can split future blocks without changing scope, estimate, or total workload');
console.log('✓ recurring tuition/coaching recovery previews real safe capacity gain and stays fully undoable');
console.log('✓ reclaimed windows preview exact exam blocks inside the freed clock time without synthetic tasks');
console.log('✓ applied reclaimed windows reconstruct as live Day Map reservations without persisted task duplicates');
console.log('✓ completing a recovered Focus block removes it and reflows the remaining window from the current time');
console.log('✓ later fixed commitments split recovered windows and remain respected after Focus completion');
console.log('✓ pre-miss protection reflows recovered windows around later schedule edits and active Focus before a slot expires');
console.log('✓ expired recovered blocks are marked missed, reflowed forward, and report any renewed deadline pressure');
console.log('✓ stale recovered reminder handoffs resolve to exact, reflowed, missed, next-window, or finished states deterministically');
console.log('✓ existing scheduled study reduces future exam capacity');
console.log('✓ impossible workloads are reported as strain instead of being overbooked');
console.log('✓ past exams do not produce preparation plans');
