/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createEmptyWorkspace } from '../src/data/schema';
import {
  DAILY_CAPACITY_OPTIONS,
  ONBOARDING_VERSION,
  applyOnboardingSetup,
  createOnboardingRecord,
  hasMeaningfulWorkspaceData,
  normalizeDailyCapacity,
  normalizeOnboardingRecord,
  shouldShowOnboarding,
} from '../src/features/onboarding/onboarding-engine';
import { createTopic } from '../src/features/topics/topic-operations';

function read(relative: string) {
  return fs.readFileSync(relative, 'utf8');
}

function main() {
  const now = new Date(2026, 8, 30, 12, 0, 0, 0).getTime();

  const fresh = createEmptyWorkspace(now);
  assert.equal(hasMeaningfulWorkspaceData(fresh), false);
  assert.equal(shouldShowOnboarding(fresh, null), true);

  const completed = createOnboardingRecord('completed', now);
  const skipped = createOnboardingRecord('skipped', now);
  const existing = createOnboardingRecord('existing-data', now);

  assert.equal(completed.version, ONBOARDING_VERSION);
  assert.equal(shouldShowOnboarding(fresh, completed), false);
  assert.equal(shouldShowOnboarding(fresh, skipped), false);
  assert.equal(shouldShowOnboarding(fresh, existing), false);

  for (const outcome of ['completed', 'skipped', 'existing-data'] as const) {
    const record = createOnboardingRecord(outcome, now);
    assert.deepEqual(normalizeOnboardingRecord(record), record);
  }

  assert.equal(normalizeOnboardingRecord(null), null);
  assert.equal(normalizeOnboardingRecord({ version: 999, outcome: 'completed', finishedAt: now }), null);
  assert.equal(normalizeOnboardingRecord({ version: 1, outcome: 'wrong', finishedAt: now }), null);
  assert.equal(normalizeOnboardingRecord({ version: 1, outcome: 'completed', finishedAt: 0 }), null);

  assert.deepEqual([...DAILY_CAPACITY_OPTIONS], [45, 60, 90, 120]);
  assert.equal(normalizeDailyCapacity(Number.NaN), 90);
  assert.equal(normalizeDailyCapacity(2), 30);
  assert.equal(normalizeDailyCapacity(46), 45);
  assert.equal(normalizeDailyCapacity(93), 95);
  assert.equal(normalizeDailyCapacity(999), 240);

  const settingsOnly = createEmptyWorkspace(now);
  settingsOnly.settings.dailyMinutes = 60;
  settingsOnly.revision = 3;
  assert.equal(
    shouldShowOnboarding(settingsOnly, null),
    true,
    'Changing settings alone should not falsely classify a fresh user as experienced.',
  );

  const meaningfulCases = [
    (workspace: ReturnType<typeof createEmptyWorkspace>) => {
      workspace.topics.push(
        createTopic(
          {
            name: 'Quadratic Equations',
            subject: 'Mathematics',
            status: 'new',
            priority: 2,
            estimate: 45,
            notes: '',
          },
          now,
          'topic_existing',
        ),
      );
    },
    (workspace: ReturnType<typeof createEmptyWorkspace>) => {
      workspace.exams.push({
        id: 'exam_existing',
        name: 'Midterm',
        date: now + 86_400_000,
        subjects: ['Mathematics'],
        scope: 'subjects',
        topicIds: [],
      });
    },
    (workspace: ReturnType<typeof createEmptyWorkspace>) => {
      workspace.breaks.push({ at: now, minutes: 10 });
    },
  ];

  for (const seed of meaningfulCases) {
    const workspace = createEmptyWorkspace(now);
    seed(workspace);
    assert.equal(hasMeaningfulWorkspaceData(workspace), true);
    assert.equal(shouldShowOnboarding(workspace, null), false);
  }

  const setup = createEmptyWorkspace(now);
  const firstTopic = createTopic(
    {
      name: 'Refraction',
      subject: 'Science',
      status: 'new',
      priority: 2,
      estimate: 45,
      notes: '',
    },
    now,
    'topic_first',
  );

  applyOnboardingSetup(setup, 61, firstTopic);
  assert.equal(setup.settings.dailyMinutes, 60);
  assert.equal(setup.topics.length, 1);
  assert.equal(setup.topics[0]!.id, 'topic_first');

  applyOnboardingSetup(setup, 61, firstTopic);
  assert.equal(
    setup.topics.length,
    1,
    'Retrying onboarding must not duplicate the first topic.',
  );

  const storageSource = fs.readFileSync(
    'src/features/onboarding/onboarding-storage.ts',
    'utf8',
  );
  assert.ok(storageSource.includes('encodeURIComponent(ownerKey)'));
  assert.ok(storageSource.includes('@myelin/onboarding'));

  const providerSource = fs.readFileSync(
    'src/features/onboarding/OnboardingProvider.tsx',
    'utf8',
  );
  assert.ok(providerSource.includes("createOnboardingRecord('existing-data')"));
  assert.ok(providerSource.includes('restart: () => Promise<void>'));
  assert.ok(providerSource.includes('onboardingStorage.clear(ownerKey)'));
  assert.equal(
    providerSource.includes('workspace?.revision'),
    false,
    'The gate must not reclassify a user mid-onboarding after the first topic changes revision.',
  );

  const appGate = fs.readFileSync('app/(app)/_layout.tsx', 'utf8');
  const rootGate = fs.readFileSync('app/index.tsx', 'utf8');
  assert.ok(appGate.includes('<Redirect href="/(onboarding)"'));
  assert.ok(rootGate.includes("'/(onboarding)'"));

  const screenSource = fs.readFileSync('app/(onboarding)/index.tsx', 'utf8');
  const shellSource = fs.readFileSync('src/components/onboarding/OnboardingShell.tsx', 'utf8');
  const transitionSource = fs.readFileSync(
    'src/features/onboarding/OnboardingTransitionProvider.tsx',
    'utf8',
  );
  const rootLayoutSource = fs.readFileSync('app/_layout.tsx', 'utf8');
  const welcomeSource = fs.readFileSync('app/(auth)/index.tsx', 'utf8');
  assert.ok(screenSource.includes("finish('skipped')"));
  assert.ok(screenSource.includes('applyOnboardingSetup'));
  assert.ok(screenSource.includes('Enter MYELIN'));
  assert.ok(screenSource.includes('How much focus fits in a normal day?'));
  assert.ok(screenSource.includes('useOnboardingTransition'));
  assert.ok(screenSource.includes('runTransition(async () =>'));
  assert.ok(rootLayoutSource.includes('<OnboardingTransitionProvider>'));
  assert.ok(transitionSource.includes('useReducedMotion()'));
  assert.ok(transitionSource.includes('withTiming'));
  assert.equal(transitionSource.includes('withSequence'), false);
  assert.ok(transitionSource.includes('await commit()'));
  assert.ok(transitionSource.includes('runEntryTransition'));
  assert.ok(transitionSource.includes('setEntryPending(true)'));
  assert.ok(transitionSource.includes('await task()'));
  assert.ok(transitionSource.includes('setActive(true)'));
  assert.ok(transitionSource.includes('await commit()'));
  assert.ok(transitionSource.includes('accessibilityLabel="Opening MYELIN"'));
  assert.ok(transitionSource.includes('coralProgress'));
  assert.ok(transitionSource.includes('darkProgress'));
  assert.ok(transitionSource.includes('accentProgress'));
  assert.ok(transitionSource.includes('coralField'));
  assert.ok(transitionSource.includes('darkField'));
  assert.ok(transitionSource.includes('accentRibbon'));
  assert.ok(transitionSource.includes("rotateZ: '-12deg'"));
  assert.equal(transitionSource.includes('eyeStage'), false);
  assert.equal(transitionSource.includes('eyeOpen'), false);
  assert.equal(transitionSource.includes('coreScale'), false);
  assert.equal(transitionSource.includes('rimProgress'), false);
  assert.equal(transitionSource.includes('rimEcho'), false);
  assert.equal(transitionSource.includes('coralDisc'), false);
  assert.equal(transitionSource.includes('darkDisc'), false);
  assert.equal(transitionSource.includes('sceneScale'), false);
  assert.equal(transitionSource.includes('haloProgress'), false);
  assert.equal(transitionSource.includes('lensTravel'), false);
  assert.ok(transitionSource.includes('const LEAD_IN_MS = 280'));
  assert.ok(transitionSource.includes('const COVER_IN_MS = 330'));
  assert.ok(transitionSource.includes('const FULL_COVER_HOLD_MS = 110'));
  assert.ok(transitionSource.includes('const POST_COMMIT_HOLD_MS = 160'));
  assert.ok(transitionSource.includes('const REVEAL_MS = 420'));
  assert.ok(transitionSource.includes('sceneOpacity.set(0)'));
  const fullCoverIndex = transitionSource.indexOf(
    'await sleep(85 + COVER_IN_MS + FULL_COVER_HOLD_MS)',
  );
  const coveredCommitIndex = transitionSource.indexOf(
    'await commit()',
    fullCoverIndex,
  );
  const hiddenSettleIndex = transitionSource.indexOf(
    'await sleep(POST_COMMIT_HOLD_MS)',
    coveredCommitIndex,
  );
  const sceneRevealIndex = transitionSource.indexOf(
    'sceneOpacity.set(1)',
    hiddenSettleIndex,
  );
  const darkRevealIndex = transitionSource.indexOf(
    'darkProgress.set(',
    sceneRevealIndex,
  );
  const coralRevealIndex = transitionSource.indexOf(
    'coralProgress.set(',
    darkRevealIndex,
  );
  assert.ok(
    fullCoverIndex >= 0 &&
      coveredCommitIndex > fullCoverIndex &&
      hiddenSettleIndex > coveredCommitIndex &&
      sceneRevealIndex > hiddenSettleIndex &&
      darkRevealIndex > sceneRevealIndex &&
      coralRevealIndex > darkRevealIndex,
    'The diagonal fields must fully cover, commit hidden, then reveal in a staggered order.',
  );
assert.ok(screenSource.includes('OnboardingShell'));
  assert.equal(screenSource.includes('TopicStep'), false);
  assert.equal(screenSource.includes('Create topic & enter MYELIN'), false);
  assert.ok(shellSource.includes('scrollable?: boolean'));
  assert.ok(shellSource.includes('height < 740'));
  assert.ok(welcomeSource.includes('scrollable={false}'));
  assert.ok(welcomeSource.includes('I already use MYELIN'));

  console.log('✓ a truly fresh workspace enters first-run onboarding');
  console.log('✓ completed, skipped and experienced workspaces bypass onboarding');
  console.log('✓ onboarding completion records reject malformed or old-version data');
  console.log('✓ daily capacity choices are realistic and safely normalized');
  console.log('✓ settings-only changes do not misclassify a fresh workspace');
  console.log('✓ existing study activity is recognized as experienced-user data');
  console.log('✓ applying setup twice cannot duplicate the first topic');
  console.log('✓ onboarding storage is namespaced by encoded workspace owner');
  console.log('✓ creating a first topic cannot auto-dismiss onboarding mid-flow');
  console.log('✓ app/root route guards send fresh users to onboarding');
  console.log('✓ the UI keeps setup to one decision with an explicit skip path');
  console.log('✓ the welcome screen keeps both entry actions in the first viewport');
}

main();


const replayScreen = read('app/(app)/settings/tutorial.tsx');
const settingsScreen = read('app/(app)/settings/index.tsx');

assert(
  settingsScreen.includes('restartOnboarding()') &&
    settingsScreen.includes("router.replace('/(onboarding)')"),
  'A full workspace reset should restart onboarding so the fresh-start flow is reproducible.',
);
assert(
  settingsScreen.includes("router.push('/(app)/settings/tutorial')"),
  'Settings does not expose tutorial replay.',
);
assert(
  replayScreen.includes('Tutorial replay is read-only'),
  'Tutorial replay does not clearly state that it is read-only.',
);
assert(
  !replayScreen.includes('updateWorkspace(') &&
    !replayScreen.includes('finish(') &&
    !replayScreen.includes('onboardingStorage'),
  'Tutorial replay must not modify workspace or onboarding state.',
);
console.log('Tutorial replay verification passed.');
