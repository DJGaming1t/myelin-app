/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path: string) {
  return fs.readFileSync(path, 'utf8');
}

function main() {
  const backdrop = read('src/components/app/AmbientBackdrop.tsx');
  assert.ok(backdrop.includes('Animated.loop'));
  assert.ok(backdrop.includes('useReducedMotion'));
  assert.ok(backdrop.includes('duration: 12000'));
  assert.ok(backdrop.includes('gridLine'));

  const reveal = read('src/components/motion/Reveal.tsx');
  assert.ok(reveal.includes('Animated.spring'));
  assert.ok(reveal.includes('overshootClamping: true'));
  assert.ok(reveal.includes('scale: motion.interpolate'));
  assert.ok(reveal.includes('useReducedMotion'));

  const springPressable = read('src/components/motion/SpringPressable.tsx');
  assert.ok(springPressable.includes('Animated.spring'));
  assert.ok(springPressable.includes('useNativeDriver: true'));
  assert.ok(springPressable.includes('useReducedMotion'));

  const progress = read('src/components/motion/AnimatedProgress.tsx');
  assert.ok(progress.includes('Animated.spring'));
  assert.ok(progress.includes('useReducedMotion'));

  const halo = read('src/components/motion/PulseHalo.tsx');
  assert.ok(halo.includes('Animated.loop'));
  assert.ok(halo.includes('styles.halo'));
  assert.ok(halo.includes('useReducedMotion'));

  const nav = read('src/components/app/AppNav.tsx');
  assert.ok(nav.includes('borderRadius: radius.xl'));
  assert.ok(nav.includes('shadowRadius: 24'));
  assert.ok(nav.includes('activeGlow'));

  const header = read('src/components/app/ScreenHeader.tsx');
  assert.ok(header.includes('eyebrowPill'));
  assert.ok(header.includes('actionButton'));
  assert.equal(header.includes("fontWeight: '650'"), false);

  const today = read('app/(app)/today/index.tsx');
  assert.ok(today.includes('<AmbientBackdrop />'));
  assert.ok(today.includes('<AnimatedProgress'));
  assert.ok(today.includes('summaryMetricAccent'));
  assert.ok(today.includes('nextGhost'));

  for (const path of [
    'app/(app)/topics/index.tsx',
    'app/(app)/progress/index.tsx',
    'app/(app)/settings/index.tsx',
  ]) {
    assert.ok(
      read(path).includes('<AmbientBackdrop />'),
      `${path} should use the shared ambient shell.`,
    );
  }

  assert.ok(
    read('src/features/topics/TopicCard.tsx').includes('<SpringPressable'),
  );
  assert.ok(
    read('src/features/today/PlanBlockCard.tsx').includes('<SpringPressable'),
  );
  assert.ok(
    read('src/features/review/ReviewChoiceButton.tsx').includes('<SpringPressable'),
  );

  const topics = read('app/(app)/topics/index.tsx');
  assert.ok(topics.includes('Math.min(index * 45, 225)'));

  const progressScreen = read('app/(app)/progress/index.tsx');
  assert.ok(progressScreen.includes('<Reveal delay={35}'));
  assert.ok(progressScreen.includes('Math.min(index * 45, 225)'));

  const onboarding = read('app/(onboarding)/index.tsx');
  assert.ok(onboarding.includes('<AnimatedProgress'));
  assert.ok(onboarding.includes('<Reveal key="intro"'));
  assert.ok(onboarding.includes('<Reveal key="capacity"'));
  assert.ok(onboarding.includes('<Reveal key="topic"'));

  console.log('✓ ambient depth is animated and reduced-motion aware');
  console.log('✓ reveals and progress use controlled spring motion');
  console.log('✓ high-touch cards use native-driver spring presses');
  console.log('✓ floating navigation and stronger header hierarchy are present');
  console.log('✓ Today uses animated capacity and premium next-move hierarchy');
  console.log('✓ Topics, Progress and Settings share the ambient visual shell');
  console.log('✓ Topic/Progress lists use staggered entrances');
  console.log('✓ onboarding uses the same motion language as the main app');
}

main();
