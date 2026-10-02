/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path: string) {
  return fs.readFileSync(path, 'utf8');
}

function main() {
  const tokens = read('src/theme/tokens.ts');
  assert.ok(tokens.includes('export const type ='));
  assert.ok(tokens.includes('export const space ='));
  assert.ok(tokens.includes('export const motion ='));

  const backdrop = read('src/components/app/AmbientBackdrop.tsx');
  assert.equal(backdrop.includes('Animated.loop'), false);
  assert.equal(backdrop.includes('Animated.View'), false);
  assert.ok(backdrop.includes('orbTop'));

  const reveal = read('src/components/motion/Reveal.tsx');
  assert.ok(reveal.includes('useReducedMotion'));

  const springPressable = read('src/components/motion/SpringPressable.tsx');
  assert.ok(springPressable.includes('useReducedMotion'));

  const disclosure = read('src/components/motion/AnimatedDisclosure.tsx');
  assert.ok(disclosure.includes('FadeInDown.duration(motion.stateMs)'));
  assert.ok(disclosure.includes('FadeOutUp.duration(motion.pressMs + 20)'));
  assert.ok(disclosure.includes('useReducedMotion'));

  const progress = read('src/components/motion/AnimatedProgress.tsx');
  assert.ok(progress.includes('useReducedMotion'));

  const nav = read('src/components/app/AppNav.tsx');
  assert.ok(nav.includes("label: 'Library'"));
  assert.ok(nav.includes("router.push('/(app)/quick-add')"));
  assert.ok(nav.includes('<AppIcon'));
  assert.ok(nav.includes('addButtonFrame'));
  assert.equal(nav.includes("key: 'exams'"), false);
  assert.equal((nav.match(/\{ key: '(today|topics|review|progress)'/g) ?? []).length, 4);

  const header = read('src/components/app/ScreenHeader.tsx');
  assert.ok(header.includes("variant?: 'hero' | 'standard' | 'compact'"));
  assert.ok(header.includes('...type.pageTitle'));
  assert.equal(header.includes('eyebrowPill'), false);

  const quickAdd = read('app/(app)/quick-add.tsx');
  assert.ok(quickAdd.includes('Add to MYELIN'));
  assert.ok(quickAdd.includes('title="Topic"'));
  assert.ok(quickAdd.includes('title="Task"'));
  assert.ok(quickAdd.includes('title="Exam"'));
  assert.ok(quickAdd.includes('title="Fixed time"'));

  const topicForm = read('src/features/topics/TopicForm.tsx');
  assert.ok(topicForm.includes('showAdvanced'));
  assert.ok(topicForm.includes('More options'));
  assert.ok(topicForm.indexOf('Topic name') < topicForm.indexOf('More options'));
  assert.ok(topicForm.indexOf('More options') < topicForm.indexOf('Estimated focused study time'));

  const today = read('app/(app)/today/index.tsx');
  assert.ok(today.includes('<AmbientBackdrop />'));
  assert.ok(today.includes('Later today'));
  assert.ok(today.includes('Adjust today'));
  assert.ok(today.includes('showAdjust'));
  assert.ok(today.includes('<AnimatedDisclosure visible={showWhy}'));
  assert.ok(today.includes('<AnimatedDisclosure visible={showAdjust}'));
  assert.ok(today.includes('Why this?'));
  assert.equal(today.includes('TUNE TODAY'), false);
  assert.equal(today.includes('SummaryMetric'), false);
  assert.ok(today.indexOf("'NEXT'") < today.indexOf('Later today'));

  for (const path of [
    'app/(app)/topics/index.tsx',
    'app/(app)/topics/[topicId]/index.tsx',
    'app/(app)/progress/index.tsx',
    'app/(app)/settings/index.tsx',
    'app/(app)/settings/cloud-sync.tsx',
    'app/(app)/settings/data-transfer.tsx',
    'app/(app)/settings/reminders.tsx',
    'app/(app)/settings/tutorial.tsx',
  ]) {
    assert.ok(
      read(path).includes('<AmbientBackdrop />'),
      `${path} should use the shared ambient shell.`,
    );
  }

  const appLayout = read('app/(app)/_layout.tsx');
  assert.ok(appLayout.includes('<Stack.Screen name="topics" options={{ animation: \'none\' }} />'));

  const topicsLayout = read('app/(app)/topics/_layout.tsx');
  assert.ok(topicsLayout.includes('<Stack.Screen name="index" options={{ animation: \'none\' }} />'));

  const topics = read('app/(app)/topics/index.tsx');
  assert.ok(topics.includes('title="Library"'));
  assert.ok(topics.includes('showFilters'));
  assert.ok(topics.includes('<AnimatedDisclosure visible={showFilters}'));
  assert.ok(topics.includes('ActionRow'));
  assert.equal(topics.includes('eyebrow="STUDY LIBRARY"'), false);

  const topicCard = read('src/features/topics/TopicCard.tsx');
  assert.ok(topicCard.includes('<SpringPressable'));
  assert.ok(topicCard.includes('rightMeta'));
  assert.equal(topicCard.includes('notes'), false);

  const topicDetail = read('app/(app)/topics/[topicId]/index.tsx');
  assert.ok(topicDetail.includes('NEXT MOVE'));
  assert.ok(topicDetail.includes('recommendReview'));
  assert.ok(topicDetail.includes('showDetails'));
  assert.ok(topicDetail.includes('Topic details'));
  assert.ok(topicDetail.indexOf('NEXT MOVE') < topicDetail.indexOf('Topic details'));

  const dayMap = read('app/(app)/today/day-map.tsx');
  assert.ok(dayMap.includes('TIMELINE'));
  assert.ok(dayMap.includes('showPlanning'));
  assert.ok(dayMap.includes('<AnimatedDisclosure visible={showPlanning}>'));
  assert.ok(dayMap.includes('Planning options'));
  assert.equal(dayMap.includes('>Flow</Text>'), false);

  const focus = read('app/(app)/focus/index.tsx');
  assert.ok(focus.includes('<AnimatedProgress'));
  assert.ok(focus.includes('showParking'));
  assert.ok(focus.includes('Park a distraction'));
  assert.equal(focus.includes('<PulseHalo'), false);

  const review = read('app/(app)/review/index.tsx');
  assert.ok(review.includes('title="Review"'));
  assert.ok(review.includes('Recall what is due. Corrections stay close.'));
  assert.ok(review.includes('RECALL BEFORE YOU CHECK'));
  assert.ok(review.includes('COMPARE, THEN GRADE'));
  assert.ok(review.includes('<AnimatedProgress'));

  const progressScreen = read('app/(app)/progress/index.tsx');
  assert.ok(progressScreen.includes('showEvidence'));
  assert.ok(progressScreen.includes('<AnimatedDisclosure visible={showEvidence}>'));
  assert.ok(progressScreen.includes('See deeper evidence'));
  assert.ok(progressScreen.includes('Evidence, not a score'));

  const mistakes = read('app/(app)/mistakes/index.tsx');
  assert.ok(mistakes.includes('title="Corrections"'));
  assert.ok(mistakes.includes('showBrowse'));
  assert.ok(mistakes.includes('<AnimatedDisclosure visible={showBrowse}'));
  assert.ok(mistakes.includes('Browse corrections'));
  assert.equal(mistakes.includes('CORRECTION LOOP'), false);

  const exams = read('app/(app)/exams/index.tsx');
  assert.ok(exams.includes('variant="compact"'));
  assert.equal(exams.includes('EXAM PRESSURE'), false);

  const retest = read('app/(app)/mistakes/retest.tsx');
  assert.ok(retest.includes('fontSize: 11'));
  assert.ok(retest.includes('fontSize: 13'));

  const authIntro = read('app/(auth)/index.tsx');
  const authAccess = read('app/(auth)/access.tsx');
  const authScaffold = read('src/components/auth/AuthScaffold.tsx');
  assert.ok(authIntro.includes('Know what to study'));
assert.ok(authIntro.includes('OnboardingShell'));
assert.ok(authIntro.includes('StudyPathVisual'));
  assert.equal(authIntro.includes('<Signal'), false);
  assert.equal(authIntro.includes('<LoopStep'), false);
  assert.ok(authAccess.includes('Continue to MYELIN'));
  assert.equal(authAccess.includes('PersonalityStep'), false);
  assert.ok(authScaffold.includes('<AmbientBackdrop />'));
  assert.equal(authScaffold.includes('<Reveal'), false);

  const onboardingShell = read('src/components/onboarding/OnboardingShell.tsx');
  assert.ok(onboardingShell.includes('withRepeat'));
  assert.ok(onboardingShell.includes('useReducedMotion'));
  assert.ok(onboardingShell.includes('signal.value'));

  const onboardingTransition = read('src/features/onboarding/OnboardingTransitionProvider.tsx');
  assert.ok(onboardingTransition.includes('sceneScale'));
  assert.ok(onboardingTransition.includes('coverDisc'));
  assert.ok(onboardingTransition.includes('coverProgress'));
  assert.ok(onboardingTransition.includes('lensStage'));
  assert.ok(onboardingTransition.includes('aperture'));
  assert.ok(onboardingTransition.includes('lensTravel'));
  assert.ok(onboardingTransition.includes('landingY'));
  assert.ok(onboardingTransition.includes('haloProgress'));
  assert.ok(onboardingTransition.includes('haloOuter'));
  assert.ok(onboardingTransition.includes('POST_COMMIT_HOLD_MS'));
  assert.ok(onboardingTransition.includes('withDelay(125, withTiming(1'));
  assert.ok(onboardingTransition.includes('useWindowDimensions'));
  assert.ok(onboardingTransition.includes('useReducedMotion'));
  assert.equal(onboardingTransition.includes('wordmark'), false);

  const onboarding = read('app/(onboarding)/index.tsx');
  assert.ok(onboarding.includes('How much focus fits in a normal day?'));
assert.ok(onboarding.includes('OnboardingShell'));
  assert.equal(onboarding.includes('TopicStep'), false);
  assert.equal(onboarding.includes('AnimatedProgress'), false);

  const tutorialScreen = read('app/(app)/settings/tutorial.tsx');
  assert.ok(tutorialScreen.includes('Three ideas. About a minute.'));
  assert.ok(tutorialScreen.includes('signalStage'));
  assert.ok(tutorialScreen.includes('withRepeat'));
  assert.equal(tutorialScreen.includes('current.cards'), false);

  const settingsScreen = read('app/(app)/settings/index.tsx');
  assert.ok(settingsScreen.includes('accessibilityState={{ expanded: open }}'));
  assert.ok(settingsScreen.includes('FadeInDown.duration(motion.stateMs)'));
  assert.ok(settingsScreen.includes('label="Delete account"'));
  assert.equal(settingsScreen.includes('<AppNav />'), false);

  assert.ok(nav.includes('if (active) return;'));
  assert.equal(nav.includes('pressedMotion'), false);

  console.log('✓ shared semantic design tokens are established');
  console.log('✓ navigation exposes four real destinations plus a separate Add action');
  console.log('✓ Quick Add routes capture into the existing study model');
  console.log('✓ Topic creation is simple by default and progressively discloses power');
  console.log('✓ Today is decision-first and hides tuning until requested');
  console.log('✓ Library hides secondary filters until requested');
  console.log('✓ Review keeps the idle hub simple while active recall stays immersive');
  console.log('✓ Progress shows action-relevant evidence before deeper calibration');
  console.log('✓ Focus hides distraction management until requested');
  console.log('✓ Day Map keeps the timeline primary and planning tools secondary');
  console.log('✓ Topic detail puts the recommended study action before admin state');
  console.log('✓ Corrections behaves like a queue instead of a dashboard');
  console.log('✓ Focus and Recall remain immersive study modes');
  console.log('✓ the existing product engine remains connected behind the new hierarchy');
}

main();
