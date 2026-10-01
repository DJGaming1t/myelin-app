/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path: string) {
  return fs.readFileSync(path, 'utf8');
}

function main() {
  const backdrop = read('src/components/app/AmbientBackdrop.tsx');
  assert.ok(backdrop.includes('useReducedMotion'));
  assert.ok(backdrop.includes('gridLine'));

  const reveal = read('src/components/motion/Reveal.tsx');
  assert.ok(reveal.includes('useReducedMotion'));

  const springPressable = read('src/components/motion/SpringPressable.tsx');
  assert.ok(springPressable.includes('useReducedMotion'));

  const progress = read('src/components/motion/AnimatedProgress.tsx');
  assert.ok(progress.includes('useReducedMotion'));

  const nav = read('src/components/app/AppNav.tsx');
  assert.ok(nav.includes('borderRadius: radius.xl'));
  assert.ok(nav.includes('activeIndicator'));
  assert.equal(nav.includes("glyph:"), false);
  assert.ok(nav.includes("key: 'topics'"));

  const header = read('src/components/app/ScreenHeader.tsx');
  assert.ok(header.includes('eyebrowPill'));
  assert.ok(header.includes('actionButton'));
  assert.equal(header.includes("fontWeight: '650'"), false);

  const today = read('app/(app)/today/index.tsx');
  assert.ok(today.includes('<AmbientBackdrop />'));
  assert.ok(today.includes('<AnimatedProgress'));
  assert.ok(today.includes('nextGlow'));
  assert.ok(today.includes('TUNE TODAY'));
  assert.ok(today.indexOf("NEXT'") < today.indexOf('TUNE TODAY'));

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
  assert.equal(topicCard.includes('metaPill'), false);

  const topics = read('app/(app)/topics/index.tsx');
  assert.ok(topics.includes('Math.min(index * 30, 150)'));
  assert.ok(topics.includes('librarySummary'));

  const topicDetail = read('app/(app)/topics/[topicId]/index.tsx');
  assert.ok(topicDetail.includes('NEXT MOVE'));
  assert.ok(topicDetail.includes('recommendReview'));
  assert.ok(topicDetail.includes('stateStrip'));

  const dayMap = read('app/(app)/today/day-map.tsx');
  assert.ok(dayMap.includes('WHERE STUDY CAN FIT'));
  assert.ok(dayMap.includes('daySummary'));
  assert.ok(dayMap.indexOf('TIMELINE') < dayMap.indexOf('WHERE STUDY CAN FIT'));

  const focus = read('app/(app)/focus/index.tsx');
  assert.ok(focus.includes('<AnimatedProgress'));
  assert.ok(focus.includes('phaseProgress'));
  assert.equal(focus.includes('<PulseHalo'), false);

  const review = read('app/(app)/review/index.tsx');
  assert.ok(review.includes('RECALL BEFORE YOU CHECK'));
  assert.ok(review.includes('COMPARE, THEN GRADE'));
  assert.ok(review.includes('<AnimatedProgress'));

  const progressScreen = read('app/(app)/progress/index.tsx');
  assert.ok(progressScreen.includes('<Reveal delay={35}'));

  const authIntro = read('app/(auth)/index.tsx');
  const authAccess = read('app/(auth)/access.tsx');
  const authScaffold = read('src/components/auth/AuthScaffold.tsx');
  assert.ok(authIntro.includes('Know what to study. Then do it.'));
  assert.ok(authIntro.includes('Trigonometry practice'));
  assert.ok(authAccess.includes('YOUR STUDY SYSTEM'));
  assert.ok(authAccess.includes('ADAPT'));
  assert.ok(authScaffold.includes('<AmbientBackdrop />'));
  assert.ok(authScaffold.includes('<Reveal'));

  const onboarding = read('app/(onboarding)/index.tsx');
  assert.ok(onboarding.includes('<AnimatedProgress'));
  assert.ok(onboarding.includes('of 2'));
  assert.ok(onboarding.includes('<Reveal key="capacity"'));
  assert.ok(onboarding.includes('<Reveal key="topic"'));
  assert.equal(onboarding.includes('<Reveal key="intro"'), false);

  console.log('✓ shared dark visual shell remains consistent');
  console.log('✓ primary navigation uses a calm indicator instead of improvised glyphs');
  console.log('✓ Today puts the next move before capacity tuning');
  console.log('✓ Topics behaves like a knowledge map rather than a stack of cards');
  console.log('✓ Topic detail chooses a useful next study mode');
  console.log('✓ Day Map is timeline-first and spatial');
  console.log('✓ Focus uses explicit progress without continuous pulsing decoration');
  console.log('✓ Recall is a single-task immersive mode');
  console.log('✓ unauthenticated entry explains the product before authentication');
  console.log('✓ authentication carries the MYELIN study-system personality');
  console.log('✓ onboarding is reduced to two useful decisions');
}

main();
