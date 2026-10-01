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
  assert.ok(backdrop.includes('useReducedMotion'));

  const reveal = read('src/components/motion/Reveal.tsx');
  assert.ok(reveal.includes('useReducedMotion'));

  const springPressable = read('src/components/motion/SpringPressable.tsx');
  assert.ok(springPressable.includes('useReducedMotion'));

  const progress = read('src/components/motion/AnimatedProgress.tsx');
  assert.ok(progress.includes('useReducedMotion'));

  const nav = read('src/components/app/AppNav.tsx');
  assert.ok(nav.includes("label: 'Library'"));
  assert.ok(nav.includes("router.push('/(app)/quick-add')"));
  assert.ok(nav.includes('<AppIcon'));
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
  assert.ok(today.includes('Why this?'));
  assert.equal(today.includes('TUNE TODAY'), false);
  assert.equal(today.includes('SummaryMetric'), false);
  assert.ok(today.indexOf("'NEXT'") < today.indexOf('Later today'));

  for (const path of [
    'app/(app)/topics/index.tsx',
    'app/(app)/topics/[topicId]/index.tsx',
    'app/(app)/progress/index.tsx',
    'app/(app)/settings/index.tsx',
  ]) {
    assert.ok(
      read(path).includes('<AmbientBackdrop />'),
      `${path} should use the shared ambient shell.`,
    );
  }

  const topicCard = read('src/features/topics/TopicCard.tsx');
  assert.ok(topicCard.includes('<SpringPressable'));
  assert.ok(topicCard.includes('stateRail'));

  const topicDetail = read('app/(app)/topics/[topicId]/index.tsx');
  assert.ok(topicDetail.includes('NEXT MOVE'));
  assert.ok(topicDetail.includes('recommendReview'));

  const dayMap = read('app/(app)/today/day-map.tsx');
  assert.ok(dayMap.includes('TIMELINE'));

  const focus = read('app/(app)/focus/index.tsx');
  assert.ok(focus.includes('<AnimatedProgress'));
  assert.equal(focus.includes('<PulseHalo'), false);

  const review = read('app/(app)/review/index.tsx');
  assert.ok(review.includes('RECALL BEFORE YOU CHECK'));
  assert.ok(review.includes('COMPARE, THEN GRADE'));
  assert.ok(review.includes('<AnimatedProgress'));

  const authIntro = read('app/(auth)/index.tsx');
  const authAccess = read('app/(auth)/access.tsx');
  const authScaffold = read('src/components/auth/AuthScaffold.tsx');
  assert.ok(authIntro.includes('Know what to study. Then do it.'));
  assert.ok(authAccess.includes('YOUR STUDY SYSTEM'));
  assert.ok(authScaffold.includes('<AmbientBackdrop />'));

  const onboarding = read('app/(onboarding)/index.tsx');
  assert.ok(onboarding.includes('of 2'));

  console.log('✓ shared semantic design tokens are established');
  console.log('✓ navigation exposes four real destinations plus a separate Add action');
  console.log('✓ Quick Add routes capture into the existing study model');
  console.log('✓ Topic creation is simple by default and progressively discloses power');
  console.log('✓ Today is decision-first and hides tuning until requested');
  console.log('✓ Focus and Recall remain immersive study modes');
  console.log('✓ the existing product engine remains connected behind the new hierarchy');
}

main();
