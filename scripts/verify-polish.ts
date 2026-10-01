import fs from 'node:fs';
import path from 'node:path';

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tokens = read('src/theme/tokens.ts');
const motion = read('src/features/accessibility/useReducedMotion.ts');
const root = read('app/_layout.tsx');
const app = read('app/(app)/_layout.tsx');
const nav = read('src/components/app/AppNav.tsx');
const header = read('src/components/app/ScreenHeader.tsx');
const states = read('src/components/app/ScreenState.tsx');
const focus = read('app/(app)/focus/index.tsx');
const workspaceProvider = read('src/data/WorkspaceProvider.tsx');
const reveal = read('src/components/motion/Reveal.tsx');
const planCard = read('src/features/today/PlanBlockCard.tsx');
const ambient = read('src/components/app/AmbientBackdrop.tsx');
const pulseHalo = read('src/components/motion/PulseHalo.tsx');
const animatedProgress = read('src/components/motion/AnimatedProgress.tsx');
const springPressable = read('src/components/motion/SpringPressable.tsx');
const today = read('app/(app)/today/index.tsx');
const review = read('app/(app)/review/index.tsx');
const onboarding = read('app/(onboarding)/index.tsx');
const settings = read('app/(app)/settings/index.tsx');
const taskForm = read('src/features/planning/TaskForm.tsx');
const commitmentForm = read('src/features/planning/CommitmentForm.tsx');
const examForm = read('src/features/exams/ExamForm.tsx');
const questionForm = read('src/features/topics/QuestionForm.tsx');

assert(tokens.includes('contentMax: 820'), 'Responsive content cap is missing.');
assert(tokens.includes('minTouch: 48'), '48-point Android touch target token is missing.');
assert(motion.includes('AccessibilityInfo.isReduceMotionEnabled'), 'System reduced-motion preference is not read.');
assert(motion.includes('workspace?.settings.reduceMotion || systemReduceMotion'), 'User and system motion preferences are not combined.');
assert(root.includes("animation: reduceMotion ? 'none' : 'fade'"), 'Root navigation ignores reduced motion.');
assert(app.includes("animation: 'none'"), 'Protected app navigation should not replay route fades between frequent study screens.');
assert(app.includes('kind="error"'), 'Workspace loading failures do not have an explicit error state.');
assert(app.includes('actionLabel="Try again"'), 'Workspace error state is missing a retry action.');
assert(app.includes('retryWorkspace()'), 'Workspace retry action is not wired to the provider.');
assert(workspaceProvider.includes('retryWorkspace: () => Promise<void>'), 'Workspace retry API is missing.');
assert(workspaceProvider.includes('workspaceStorage.load(currentOwner)'), 'Workspace retry does not reload durable storage.');
assert(states.includes('accessibilityLiveRegion'), 'Shared loading/error states do not announce changes.');
assert(nav.includes('accessibilityLabel={item.label}'), 'Bottom navigation labels are missing.');
assert(nav.includes('minHeight: layout.minTouch'), 'Bottom navigation touch targets are too small.');
assert(nav.includes('maxWidth: layout.contentMax'), 'Bottom navigation is not tablet/web bounded.');
assert(nav.includes('if (active) return;'), 'Tapping the active tab should be a true no-op.');
assert(!nav.includes('pressedMotion'), 'Bottom tabs should not scale on press.');
assert(header.includes('accessibilityRole="header"'), 'Screen titles are not exposed as headers.');
assert(header.includes('minHeight: layout.minTouch'), 'Header controls are too small.');
assert(header.includes('maxWidth: layout.contentMax'), 'Screen header is not tablet/web bounded.');
assert(focus.includes('setInterval(() => setNow(Date.now()), 1000)'), 'Focus timer redraw frequency was not reduced.');
assert(reveal.includes("from 'react-native-reanimated'"), 'Shared entrance motion is not running through Reanimated.');
assert(reveal.includes('withTiming') && reveal.includes('withSpring'), 'Shared entrance motion is missing timing/spring transitions.');
assert(reveal.includes('if (reduceMotion)'), 'Shared entrance motion ignores reduced-motion.');
assert(nav.includes('<AppIcon'), 'Bottom navigation is missing the shared icon treatment.');

assert((nav.match(/\{ key: '(today|topics|review|progress)'/g) ?? []).length === 4, 'Bottom navigation should expose exactly four primary destinations.');
assert(!nav.includes("key: 'settings'"), 'Settings should remain secondary.');
assert(nav.includes("label: 'Library'"), 'Topics should be presented as the Library destination.');
assert(!nav.includes("key: 'mistakes'"), 'Mistakes should be contextual to Review/Today rather than permanent navigation.');
assert(!nav.includes("key: 'exams'"), 'Exams should be contextual rather than permanent navigation.');
assert(nav.includes("router.push('/(app)/quick-add')"), 'Global Quick Add is missing from the navigation shell.');

assert(!header.includes('<Reveal'), 'Shared screen headers should not replay entrance motion on every navigation.');
assert(states.includes('<Reveal'), 'Shared states are missing entrance motion.');
assert(planCard.includes('Math.min(index * 55, 220)'), 'Today plan cards are missing staggered reveal motion.');
assert(ambient.includes('orbTop'), 'Ambient visual backdrop is missing.');
assert(!ambient.includes('Animated.loop'), 'Ambient background should not run continuous decorative animation loops.');
assert(!ambient.includes('Easing.'), 'Ambient background should remain static and quiet.');
assert(pulseHalo.includes('reduceMotion'), 'Legacy halo primitive must remain accessibility-safe while it exists.');

assert(animatedProgress.includes("from 'react-native-reanimated'"), 'Progress animation is not running through Reanimated.');
assert(animatedProgress.includes('withSpring'), 'Animated progress spring primitive is missing.');
assert(animatedProgress.includes('scaleX'), 'Progress should animate a transform instead of layout width.');
assert(animatedProgress.includes('if (reduceMotion)'), 'Animated progress ignores reduced motion.');
assert(springPressable.includes("from 'react-native-reanimated'"), 'Shared press feedback is not running through Reanimated.');
assert(springPressable.includes('withSpring'), 'Shared spring press primitive is missing.');
assert(springPressable.includes('useReducedMotion()'), 'Shared press motion ignores reduced motion.');
assert(today.includes('<AmbientBackdrop />'), 'Today is missing the ambient backdrop.');
assert(today.includes('Later today'), 'Today is missing the reduced later-today hierarchy.');
assert(today.includes('showAdjust'), 'Today tuning should be progressively disclosed.');
assert(focus.includes('<AnimatedProgress'), 'Focus must show explicit phase progress.');
assert(focus.includes('phaseProgress'), 'Focus phase progress is not derived from the timer.');
assert(!focus.includes('<PulseHalo'), 'Focus should not continuously pulse while the student is working.');
assert(review.includes('<AnimatedProgress'), 'Review is missing animated queue progress.');
assert(review.includes('<Reveal key='), 'Review card transitions are missing.');

assert(onboarding.includes('How much focus fits in a normal day?'), 'Onboarding should ask for one useful setup decision.');
assert(!onboarding.includes('AnimatedProgress'), 'One-step onboarding should not show artificial multi-step progress.');
assert(!onboarding.includes('TopicStep'), 'Onboarding should not require topic creation before entering the app.');
assert(settings.includes('variant="compact"'), 'Settings should use the compact utility-screen header.');
assert(settings.includes('sectionSubtitle: { color: colors.muted, fontSize: 12'), 'Settings section descriptions are too small.');
assert(settings.includes('dataLabel: { color: colors.subtle, fontSize: 10'), 'Settings data labels regressed below the readability floor.');
assert(settings.includes('accessibilityState={{ expanded: open }}'), 'Settings groups should use progressive disclosure.');
assert(settings.includes('FadeInDown.duration(180)'), 'Settings disclosures should animate open.');
assert(settings.includes('FadeOutUp.duration(130)'), 'Settings disclosures should animate closed.');
assert(settings.includes("label=\"Delete account\""), 'Settings should expose direct account deletion.');
assert(settings.includes('transferCopy: { flex: 1, minWidth: 0 }'), 'Settings action copy must be constrained so arrows stay inside rows.');
assert(settings.includes("onBack={() => router.back()}"), 'Settings should behave like a secondary screen.');
assert(!settings.includes('<AppNav />'), 'Settings should not duplicate top-level navigation.');
assert(taskForm.includes('variant="compact"'), 'Task form should use the compact form header.');
assert(taskForm.includes("chipText: { color: colors.muted, fontSize: 12"), 'Task form chip labels are too small.');
assert(commitmentForm.includes('variant="compact"'), 'Fixed-time form should use the compact form header.');
assert(commitmentForm.includes("helper: { color: colors.muted, fontSize: 11.5"), 'Fixed-time helper text is too small.');
assert(examForm.includes("dateHelp: { color: colors.muted, fontSize: 11.5"), 'Exam date helper is too small.');
assert(questionForm.includes("label: { color: colors.textDim, fontSize: 12.5"), 'Recall form labels are too small.');
assert(states.includes('fontSize: 13'), 'Shared state messages should remain readable.');

console.log('Product polish verification passed.');
