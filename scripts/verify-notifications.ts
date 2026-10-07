/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  MAX_REMINDERS_PER_DAY,
  MAX_SCHEDULED_REMINDERS,
  REVIEW_HORIZON_DAYS,
  buildReminderPlan,
  defaultReminderSettings,
  examReminderCopy,
  formatTimeMinutes,
  sampleReminderCopy,
  studyReminderCopy,
  isInQuietHours,
  moveOutOfQuietHours,
  normalizeReminderSettings,
  reminderPlanSignature,
  reviewReminderCopy,
} from '../src/features/notifications/reminder-engine';

function local(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function makeDueWorkspace(now: number) {
  const workspace = createEmptyWorkspace(now - 100_000);
  workspace.topics.push({
    id: 'topic_refraction',
    name: 'Refraction',
    subject: 'Physics',
    createdAt: now - 100_000,
    status: 'review',
    priority: 3,
    estimate: 45,
    notes: '',
    dueAt: now - 60_000,
    intervalDays: 1,
    lastGrade: 2,
    lastReviewed: now - 86_400_000,
    snoozeUntil: 0,
    cards: [
      {
        id: 'card_refraction',
        prompt: 'Why does light bend?',
        answer: 'Its speed changes between media.',
        hint: '',
        dueAt: now - 60_000,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 86_400_000,
        reps: 2,
      },
    ],
  });
  return workspace;
}

function main() {
  const now = local(2026, 9, 30, 12, 0);
  const defaults = defaultReminderSettings();
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.sound, false);
  assert.equal(defaults.studyBlockEnabled, true);
  assert.equal(defaults.studyLeadMinutes, 10);
  assert.equal(defaults.detail, 'guided');
  assert.equal(REVIEW_HORIZON_DAYS, 7);

  const settings = {
    ...defaults,
    enabled: true,
    reviewTimeMinutes: 19 * 60 + 15,
    examTimeMinutes: 18 * 60 + 30,
    quietStartMinutes: 21 * 60 + 30,
    quietEndMinutes: 7 * 60,
  };

  const empty = createEmptyWorkspace(now);
  assert.deepEqual(buildReminderPlan(empty, settings, now), []);

  const due = makeDueWorkspace(now);
  const duePlan = buildReminderPlan(due, settings, now);
  const reviews = duePlan.filter((item) => item.kind === 'review');
  assert.ok(reviews.length > 0);
  assert.equal(new Date(reviews[0]!.at).getHours(), 19);
  assert.equal(new Date(reviews[0]!.at).getMinutes(), 15);
  assert.equal(reviews[0]!.data.dueCount, 1);

  const notReady = createEmptyWorkspace(now);
  notReady.topics.push({
    id: 'new_topic',
    name: 'New topic',
    subject: 'Science',
    createdAt: now,
    status: 'new',
    priority: 2,
    estimate: 30,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'new_card',
        prompt: 'New question',
        answer: 'New answer',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
    ],
  });
  assert.equal(
    buildReminderPlan(notReady, settings, now).some(
      (item) => item.kind === 'review',
    ),
    false,
    'A brand-new untouched topic must not create a fake due-review reminder.',
  );

  const late = local(2026, 9, 30, 22, 0);
  assert.equal(isInQuietHours(late, 21 * 60 + 30, 7 * 60), true);
  assert.equal(
    moveOutOfQuietHours(late, 21 * 60 + 30, 7 * 60),
    local(2026, 10, 1, 7, 0),
  );

  const early = local(2026, 9, 30, 6, 30);
  assert.equal(isInQuietHours(early, 21 * 60 + 30, 7 * 60), true);
  assert.equal(
    moveOutOfQuietHours(early, 21 * 60 + 30, 7 * 60),
    local(2026, 9, 30, 7, 0),
  );

  const noon = local(2026, 9, 30, 12, 0);
  assert.equal(
    moveOutOfQuietHours(noon, 21 * 60 + 30, 7 * 60),
    noon,
  );

  const examWorkspace = createEmptyWorkspace(now);
  examWorkspace.exams.push({
    id: 'exam_math',
    name: 'Mathematics test',
    date: local(2026, 10, 10, 12, 0),
    subjects: ['Mathematics'],
    scope: 'subjects',
    topicIds: [],
  });

  const examPlan = buildReminderPlan(
    examWorkspace,
    {
      ...settings,
      reviewEnabled: false,
      examOffsets: [7, 3, 1],
    },
    now,
  ).filter((item) => item.kind === 'exam');

  assert.equal(examPlan.length, 3);
  assert.deepEqual(
    examPlan.map((item) => item.data.days).sort((a, b) => Number(b) - Number(a)),
    [7, 3, 1],
  );
  examPlan.forEach((item) => {
    assert.equal(new Date(item.at).getHours(), 18);
    assert.equal(new Date(item.at).getMinutes(), 30);
    assert.ok(item.at < examWorkspace.exams[0]!.date);
  });

  const studyWorkspace = createEmptyWorkspace(now);
  studyWorkspace.tasks.push({
    id: 'task_math_homework',
    title: 'Finish Maths Exercise 5.2',
    subject: 'Mathematics',
    topicId: null,
    examId: null,
    type: 'homework',
    status: 'open',
    planState: 'scheduled',
    dueAt: 0,
    estimatedMinutes: 35,
    actualMinutes: 0,
    priority: 2,
    notes: '',
    scheduledStart: local(2026, 9, 30, 16, 0),
    scheduledEnd: local(2026, 9, 30, 16, 35),
    postponedUntil: 0,
    createdAt: now - 1000,
    updatedAt: now - 1000,
    completedAt: 0,
  });
  const studyPlan = buildReminderPlan(studyWorkspace, settings, now);
  const studyReminder = studyPlan.find((item) => item.kind === 'study');
  assert.ok(studyReminder);
  assert.equal(studyReminder!.at, local(2026, 9, 30, 15, 50));
  assert.equal(studyReminder!.href, '/(app)/today/day-map');
  assert.equal(studyReminder!.data.taskId, 'task_math_homework');

  const recoveredWorkspace = createEmptyWorkspace(now);
  recoveredWorkspace.settings.dailyMinutes = 120;
  recoveredWorkspace.settings.focusMinutes = 45;
  recoveredWorkspace.topics.push({
    id: 'recovered_topic',
    name: 'Quadratics',
    subject: 'Mathematics',
    createdAt: now - 86_400_000,
    status: 'learning',
    priority: 3,
    estimate: 240,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  });
  recoveredWorkspace.exams.push({
    id: 'recovered_exam',
    name: 'Recovered-window exam',
    date: local(2026, 10, 2, 12, 0),
    subjects: [],
    scope: 'topics',
    topicIds: ['recovered_topic'],
  });
  recoveredWorkspace.commitments.push(
    {
      id: 'recovered_school',
      title: 'School',
      kind: 'school',
      startAt: local(2026, 10, 1, 6, 0),
      endAt: local(2026, 10, 1, 16, 0),
      startMinutes: 6 * 60,
      endMinutes: 16 * 60,
      recurrenceDays: [],
      skippedDates: [],
      createdAt: now - 5000,
      updatedAt: now - 5000,
    },
    {
      id: 'recovered_tuition',
      title: 'Maths tuition',
      kind: 'tuition',
      startAt: local(2026, 10, 1, 16, 0),
      endAt: local(2026, 10, 1, 22, 0),
      startMinutes: 16 * 60,
      endMinutes: 22 * 60,
      recurrenceDays: [4],
      skippedDates: ['2026-10-01'],
      createdAt: now - 4000,
      updatedAt: now - 4000,
    },
  );

  const recoveredPlan = buildReminderPlan(
    recoveredWorkspace,
    {
      ...settings,
      reviewEnabled: false,
      examEnabled: false,
    },
    now,
  );
  const recoveredReminders = recoveredPlan.filter(
    (item) => item.data.recovered === 1,
  );
  assert.equal(
    recoveredReminders.length,
    1,
    'A recovered window should create one calm heads-up for its first upcoming Autopilot block, not one notification per mini-plan segment.',
  );
  const recoveredReminder = recoveredReminders[0]!;
  assert.equal(
    recoveredReminder.href,
    '/(app)/today/day-map',
  );
  assert.equal(
    recoveredReminder.data.commitmentId,
    'recovered_tuition',
  );
  assert.equal(
    recoveredReminder.data.occurrenceDateKey,
    '2026-10-01',
  );
  assert.equal(
    recoveredReminder.data.topicId,
    'recovered_topic',
  );
  assert.ok(
    Number(recoveredReminder.data.scheduledStart) > now,
    'Recovered reminder must carry the exact reserved block start into the notification payload.',
  );
  assert.equal(
    recoveredReminder.at,
    Number(recoveredReminder.data.scheduledStart) -
      settings.studyLeadMinutes * 60_000,
  );
  assert.ok(
    recoveredReminder.body.includes('Recovered window'),
    'Recovered study reminders should explain why this study block exists.',
  );

  const recoveredSignature = reminderPlanSignature(
    recoveredPlan,
  );
  recoveredWorkspace.commitments.push({
    id: 'recovered_later_conflict',
    title: 'New appointment',
    kind: 'other',
    startAt: local(2026, 10, 1, 16, 0),
    endAt: local(2026, 10, 1, 16, 30),
    startMinutes: 16 * 60,
    endMinutes: 16 * 60 + 30,
    recurrenceDays: [],
    skippedDates: [],
    createdAt: now - 1000,
    updatedAt: now - 1000,
  });
  const reflowedRecoveredPlan = buildReminderPlan(
    recoveredWorkspace,
    {
      ...settings,
      reviewEnabled: false,
      examEnabled: false,
    },
    now,
  );
  const reflowedRecovered = reflowedRecoveredPlan.find(
    (item) => item.data.recovered === 1,
  );
  assert.ok(reflowedRecovered);
  assert.ok(
    Number(reflowedRecovered!.data.scheduledStart) >=
      local(2026, 10, 1, 16, 30),
    'A later schedule conflict should move the recovered reminder with the protected Autopilot block.',
  );
  assert.notEqual(
    reminderPlanSignature(reflowedRecoveredPlan),
    recoveredSignature,
    'Reflowing a recovered block must invalidate the old device reminder signature.',
  );

  const suppressedRecoveredPlan = buildReminderPlan(
    recoveredWorkspace,
    {
      ...settings,
      reviewEnabled: false,
      examEnabled: false,
    },
    now,
    {
      activeFocus: {
        topicId: 'another_topic',
        startedAt: now,
        unavailableUntil:
          Number(reflowedRecovered!.data.scheduledStart) +
          20 * 60_000,
      },
    },
  );
  assert.equal(
    suppressedRecoveredPlan.some(
      (item) => item.data.recovered === 1,
    ),
    false,
    'An overlapping active Focus session should suppress the recovered reminder instead of leaving a stale notification scheduled.',
  );

  const beforeMove = reminderPlanSignature(studyPlan);
  studyWorkspace.tasks[0]!.scheduledStart = local(2026, 9, 30, 17, 0);
  studyWorkspace.tasks[0]!.scheduledEnd = local(2026, 9, 30, 17, 35);
  const movedStudyPlan = buildReminderPlan(studyWorkspace, settings, now);
  assert.notEqual(
    reminderPlanSignature(movedStudyPlan),
    beforeMove,
    'Moving a study block must change the reminder plan so the provider cancels/replaces the old notification.',
  );

  studyWorkspace.tasks[0]!.status = 'completed';
  assert.equal(
    buildReminderPlan(studyWorkspace, settings, now).some((item) => item.kind === 'study'),
    false,
    'Completed tasks must not keep scheduled study reminders.',
  );

  const crowded = makeDueWorkspace(now);
  for (let index = 0; index < 5; index += 1) {
    crowded.exams.push({
      id: `exam_${index}`,
      name: `Exam ${index + 1}`,
      date: local(2026, 10, 3, 12, 0),
      subjects: ['Science'],
      scope: 'subjects',
      topicIds: [],
    });
  }

  const crowdedPlan = buildReminderPlan(
    crowded,
    {
      ...settings,
      examOffsets: [3],
      examTimeMinutes: settings.reviewTimeMinutes,
    },
    now,
  );

  const perDay = new Map<string, number>();
  for (const item of crowdedPlan) {
    const date = new Date(item.at);
    const key = [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ].join('-');
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  for (const count of perDay.values()) {
    assert.ok(count <= MAX_REMINDERS_PER_DAY);
  }
  assert.ok(crowdedPlan.length <= MAX_SCHEDULED_REMINDERS);

  const quietExam = createEmptyWorkspace(now);
  quietExam.exams.push({
    id: 'exam_quiet',
    name: 'Quiet-hour exam',
    date: local(2026, 10, 2, 12, 0),
    subjects: ['Physics'],
    scope: 'subjects',
    topicIds: [],
  });
  const quietExamPlan = buildReminderPlan(
    quietExam,
    {
      ...settings,
      reviewEnabled: false,
      examOffsets: [1],
      examTimeMinutes: 22 * 60,
    },
    now,
  ).filter((item) => item.kind === 'exam');

  assert.equal(
    quietExamPlan.length,
    0,
    'A quiet-hour shift must not turn a 1-day reminder into a wrong-label exam-day reminder.',
  );

  const forbidden = /streak|falling behind|behind|urgent|failure|guilt|lose your|missed your/i;
  for (const voice of ['calm', 'signal', 'spark'] as const) {
    for (const detail of ['brief', 'guided', 'context'] as const) {
      const reviewCopy = reviewReminderCopy(
        { voice, detail },
        {
          count: 3,
          firstTopic: 'Refraction',
          topicCount: 2,
          hasMistake: true,
        },
      );
      const examCopy = examReminderCopy(
        { voice, detail },
        'Mathematics test',
        3,
      );
      const studyCopy = studyReminderCopy(
        { voice, detail },
        'Finish Exercise 5.2',
        'Mathematics',
        35,
      );

      assert.equal(
        forbidden.test(
          `${reviewCopy.title} ${reviewCopy.body} ${examCopy.title} ${examCopy.body} ${studyCopy.title} ${studyCopy.body}`,
        ),
        false,
      );
    }
  }

  const calmBrief = sampleReminderCopy(
    { voice: 'calm', detail: 'brief' },
    'review',
  );
  const signalContext = sampleReminderCopy(
    { voice: 'signal', detail: 'context' },
    'review',
  );
  const sparkStudy = sampleReminderCopy(
    { voice: 'spark', detail: 'guided' },
    'study',
  );
  assert.notDeepEqual(calmBrief, signalContext);
  assert.ok(sparkStudy.title.includes('✦'));
  assert.ok(signalContext.body.includes('Open Review'));

  const invalid = normalizeReminderSettings({
    reviewTimeMinutes: 99999,
    examTimeMinutes: -500,
    quietStartMinutes: 2000,
    quietEndMinutes: -1,
    examOffsets: [7, 7, 0, 31, 3],
    studyLeadMinutes: 999,
    voice: 'spark',
    detail: 'invalid' as never,
  });
  assert.equal(invalid.reviewTimeMinutes, 1439);
  assert.equal(invalid.examTimeMinutes, 0);
  assert.equal(invalid.quietStartMinutes, 1439);
  assert.equal(invalid.quietEndMinutes, 0);
  assert.deepEqual(invalid.examOffsets, [7, 3]);
  assert.equal(invalid.studyLeadMinutes, 60);
  assert.equal(invalid.voice, 'spark');
  assert.equal(invalid.detail, 'guided');

  const firstSignature = reminderPlanSignature(duePlan);
  const secondSignature = reminderPlanSignature(
    buildReminderPlan(due, { ...settings, voice: 'spark' }, now),
  );
  assert.notEqual(firstSignature, secondSignature);

  assert.equal(formatTimeMinutes(0), '12:00 AM');
  assert.equal(formatTimeMinutes(19 * 60 + 15), '7:15 PM');

  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const blockedPermissions: string[] =
    appConfig.expo?.android?.blockedPermissions ?? [];
  assert.ok(
    blockedPermissions.includes('android.permission.SCHEDULE_EXACT_ALARM'),
  );
  assert.ok(
    blockedPermissions.includes('android.permission.USE_EXACT_ALARM'),
  );

  const reminderProviderSource = fs.readFileSync(
    'src/features/notifications/ReminderProvider.tsx',
    'utf8',
  );
  assert.ok(
    reminderProviderSource.includes('useFocus()') &&
      reminderProviderSource.includes('timerRemainingMs') &&
      reminderProviderSource.includes('activeFocus:'),
    'ReminderProvider should reschedule recovered heads-ups from the live Focus session instead of using stale workspace-only timing.',
  );
  assert.ok(
    reminderProviderSource.includes('recoveredCommitmentId') &&
      reminderProviderSource.includes('recoveredOccurrenceDateKey') &&
      reminderProviderSource.includes('recoveredHandoff') &&
      reminderProviderSource.includes("pathname: '/(app)/today/day-map'"),
    'Recovered notification taps should route to Day Map with the exact reservation identity.',
  );
  assert.ok(
    reminderProviderSource.includes('handledReminderResponsesRef') &&
      reminderProviderSource.includes('payload.responseId') &&
      reminderProviderSource.includes('routeReminderNow') &&
      reminderProviderSource.includes('queueOrRouteReminder'),
    'ReminderProvider should dedupe cold-launch and live-listener delivery while keeping unhandled intents pending until routing is actually safe.',
  );
  assert.ok(
    reminderProviderSource.includes('pendingReminderResponsesRef') &&
      reminderProviderSource.includes('PENDING_REMINDER_TTL_MS = 30_000') &&
      reminderProviderSource.includes('flushPendingReminderResponses'),
    'Cold-launch notification intent should be held briefly in memory while auth/workspace/onboarding hydrate.',
  );
  assert.ok(
    reminderProviderSource.includes("workspaceStatus === 'ready'") &&
      reminderProviderSource.includes('authAllowsApp') &&
      reminderProviderSource.includes('onboardingAllowsApp') &&
      reminderProviderSource.includes('payload.ownerKey === gate.ownerKey'),
    'Reminder routing must wait for an allowed auth state, ready workspace, restored onboarding state, and the matching notification owner.',
  );
  assert.ok(
    reminderProviderSource.includes('useAuth()') &&
      reminderProviderSource.includes('useOnboarding()') &&
      reminderProviderSource.includes('useOnboardingTransition()'),
    'ReminderProvider should use the same auth/onboarding gates as the app shell before routing a cold-launch intent.',
  );
  const consumeIndex = reminderProviderSource.indexOf(
    'await consumeInitialReminderResponse',
  );
  const subscribeIndex = reminderProviderSource.indexOf(
    'await subscribeToReminderResponses',
  );
  const queueInitialIndex = reminderProviderSource.indexOf(
    'if (initial) queueOrRouteReminder(initial)',
  );
  assert.ok(
    consumeIndex >= 0 &&
      subscribeIndex > consumeIndex &&
      queueInitialIndex > subscribeIndex,
    'Cold launch should be consumed/cleared first, then the live listener should start, then the launch payload should be queued or routed according to hydration state.',
  );
  const handledAddIndex = reminderProviderSource.indexOf(
    'handledReminderResponsesRef.current.add',
  );
  const pendingSetIndex = reminderProviderSource.indexOf(
    'pendingReminderResponsesRef.current.set',
  );
  assert.ok(
    handledAddIndex >= 0 &&
      pendingSetIndex > handledAddIndex &&
      reminderProviderSource.indexOf(
        'canRouteReminderPayload',
      ) >= 0,
    'A response should be marked handled only in the actual routing path, while hydration-blocked responses stay pending and retryable.',
  );
  assert.ok(
    reminderProviderSource.includes(
      'scheduleReminderPlan(\n        plan,\n        current.settings,\n        owner,',
    ),
    'Newly scheduled reminders should be tagged with the workspace owner that created them.',
  );

  const runtimeSource = fs.readFileSync(
    'src/features/notifications/notification-runtime.ts',
    'utf8',
  );
  assert.ok(
    runtimeSource.includes('ReminderOpenPayload') &&
      runtimeSource.includes('commitmentId:') &&
      runtimeSource.includes('scheduledStart:') &&
      runtimeSource.includes('ownerKey?: string') &&
      runtimeSource.includes('responseId:'),
    'Notification taps should forward recovered reservation identity, workspace owner, and a stable response ID.',
  );
  assert.ok(
    runtimeSource.includes('...(ownerKey ? { ownerKey } : {})') &&
      runtimeSource.includes("typeof data.ownerKey === 'string'"),
    'Scheduled reminder payloads should persist and restore the owner key used to guard cold-launch routing.',
  );
  assert.ok(
    runtimeSource.includes('consumeInitialReminderResponse') &&
      runtimeSource.includes('getLastNotificationResponseAsync') &&
      runtimeSource.includes('await Notifications.clearLastNotificationResponseAsync'),
    'Cold-launch reminder responses must be explicitly consumed and cleared before the provider routes them.',
  );
  const liveListenerSource =
    runtimeSource.slice(
      runtimeSource.indexOf('export async function subscribeToReminderResponses'),
    );
  assert.equal(
    liveListenerSource.includes('getLastNotificationResponseAsync'),
    false,
    'The ordinary live response listener must not replay the persisted cold-launch response.',
  );
  assert.equal(runtimeSource.includes('getExpoPushTokenAsync'), false);
  assert.equal(runtimeSource.includes('getDevicePushTokenAsync'), false);
  assert.ok(runtimeSource.includes('sampleReminderCopy(settings, kind)'));
  assert.ok(runtimeSource.includes('reminderSubtitle(settings, item.kind)'));
  assert.ok(runtimeSource.includes('reminderColor(settings)'));

  console.log('✓ reminders default off and silent');
  const reminderEngineSource = fs.readFileSync(
    path.join(process.cwd(), 'src/features/notifications/reminder-engine.ts'),
    'utf8',
  );
  assert.equal(
    reminderEngineSource.includes('today + offset * DAY'),
    false,
    'Calendar-day reminder planning must not use fixed 24-hour offsets.',
  );

  console.log('✓ review reminder horizon is intentionally limited to seven days');
  console.log('✓ exact-alarm Android permissions are explicitly blocked');
  console.log('✓ Feature 13 does not register device or Expo push tokens');
  console.log('✓ no due study data means no fake review reminder');
  console.log('✓ due reviews create one daily digest at the chosen window');
  console.log('✓ overnight quiet hours shift reminders to the quiet-end boundary');
  console.log('✓ exam reminders use only configured lead times before the exam');
  console.log('✓ scheduled Day Map tasks create one calm lead-time reminder');
  console.log('✓ recovered Autopilot windows create one calm heads-up, reflow it after schedule edits, and suppress it during overlapping Focus');
  console.log('✓ recovered notification taps preserve exact reservation identity through the runtime and provider route');
  console.log('✓ cold-launch notification responses are consumed, cleared, listener-safe, and routed exactly once');
  console.log('✓ cold-launch intents wait for matching auth/workspace/onboarding hydration and expire in memory rather than racing redirects');
  console.log('✓ moving/completing study blocks invalidates obsolete reminders');
  console.log('✓ quiet-hour shifts cannot produce wrong-day exam reminders');
  console.log('✓ daily notification volume is capped even with crowded exam data');
  console.log('✓ all personality/detail combinations avoid guilt/streak/urgency language');
  console.log('✓ Review, Exam and Study previews share the production copy engine');
  console.log('✓ reminder settings are normalized and plan signatures detect copy changes');
}

main();


const notificationRuntimeSource = fs.readFileSync(
  path.join(process.cwd(), 'src/features/notifications/notification-runtime.ts'),
  'utf8',
);
assert.ok(
  notificationRuntimeSource.includes('clearLastNotificationResponseAsync'),
  'Handled notification taps should be consumed so they are not replayed on later launches.',
);
assert.ok(
  notificationRuntimeSource.includes('requestIdentifier +') &&
    notificationRuntimeSource.includes('actionIdentifier'),
  'Cold and live delivery of the same response should derive the same responseId for exactly-once routing.',
);

const reminderStudioSource = fs.readFileSync(
  path.join(process.cwd(), 'app/(app)/settings/reminders.tsx'),
  'utf8',
);
assert.ok(reminderStudioSource.includes('title="Reminder Studio"'));
assert.ok(reminderStudioSource.includes('PREVIEW_KINDS'));
assert.ok(reminderStudioSource.includes('DETAIL_LEVELS'));
assert.ok(reminderStudioSource.includes('settings.detail'));
assert.ok(reminderStudioSource.includes('sendPreview(previewKind)'));
assert.ok(reminderStudioSource.includes('sampleReminderCopy(settings, kind)'));
assert.equal(reminderStudioSource.includes('notificationDim'), true);
assert.ok(
  reminderStudioSource.includes("quietGrid: { gap: 1 }"),
  'Quiet-hour controls should stack instead of squeezing two time steppers side-by-side.',
);
