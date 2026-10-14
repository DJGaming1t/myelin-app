import './verify-focus-start';
/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

import { migrateAndValidateWorkspace } from '../src/data/migrations';
import { createFocusWriteQueue } from '../src/features/focus/focus-write-queue';
import {
  focusDialMarkPosition,
  focusDialSize,
} from '../src/features/focus/focus-dial-layout';
import { createEmptyWorkspace } from '../src/data/schema';
import {
  addParkedDistraction,
  beginBreak,
  breakActualMinutes,
  createFocusSession,
  extendFiveMinuteLaunch,
  focusActualMinutes,
  formatTimer,
  pauseFocusTimer,
  removeParkedDistraction,
  resumeFocusTimer,
  timerIsComplete,
  timerRemainingMs,
} from '../src/features/focus/focus-engine';
import {
  FocusKeyValueStore,
  createFocusStorage,
} from '../src/features/focus/focus-storage';
import {
  POST_FOCUS_RETRIEVAL_LIMIT,
  buildPostFocusRetrievalSuggestion,
} from '../src/features/focus/post-focus-retrieval';

const MINUTE = 60_000;
const now = 1_800_000_000_000;

// Execute the actual screen handler with delayed/rejected storage, rather
// than treating a legacy handler name as proof of the save-before-route flow.
async function verifyBreakTransitions() {
  const screen = fs.readFileSync('app/(app)/focus/index.tsx', 'utf8');
  const source = ts.createSourceFile('focus.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'runBreakTransition') handler = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler, 'The Focus screen must have a shared break exit handler.');
  const executable = ts.transpileModule(handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;

  function simulate(phase = 'break') {
    const routes: unknown[] = [];
    const saves: string[] = [];
    const lock = { current: false };
    let busy: string | null = null;
    let error = '';
    let persist: () => Promise<void> = async () => {};
    const bindings = {
      session: { phase },
      breakTransitionLock: lock,
      retrievalSuggestion: { topicId: 'topic_light', count: 3 } as { topicId: string; count: number } | null,
      setBreakTransition: (value: string | null) => { busy = value; },
      setFocusError: (value: string) => { error = value; },
      completeBreak: async () => { saves.push('complete'); await persist(); },
      skipBreak: async () => { saves.push('skip'); await persist(); },
      router: { replace: (route: unknown) => { routes.push(JSON.parse(JSON.stringify(route))); } },
      Date: { now: () => now },
    };
    const run = vm.runInNewContext(executable + '\nrunBreakTransition;', bindings, { timeout: 1000 }) as
      (action: 'finish' | 'retrieve' | 'skip') => Promise<void>;
    return { bindings, routes, saves, lock, run,
      setPersistence: (next: () => Promise<void>) => { persist = next; },
      busy: () => busy, error: () => error };
  }

  const rapid = simulate();
  let release!: () => void;
  rapid.setPersistence(() => new Promise<void>(resolve => { release = resolve; }));
  const first = rapid.run('retrieve');
  assert.equal(rapid.lock.current, true);
  assert.equal(rapid.busy(), 'retrieve');
  assert.deepEqual(rapid.routes, [], 'Do not navigate before break storage succeeds.');
  await rapid.run('skip');
  assert.deepEqual(rapid.saves, ['complete'], 'A second rapid exit must not start another save.');
  rapid.bindings.retrievalSuggestion = { topicId: 'different_topic', count: 1 };
  release();
  await first;
  assert.deepEqual(rapid.routes, [{ pathname: '/(app)/review', params: {
    topicId: 'topic_light', autoStart: '1', limit: '3', source: 'focus',
  } }], 'Retrieve the bounded topic captured at the tap, even if the live suggestion changes.');
  await rapid.run('finish');
  assert.equal(rapid.routes.length, 1, 'Keep duplicate exits blocked through successful navigation.');

  const retry = simulate();
  retry.setPersistence(async () => { throw new Error('device storage unavailable'); });
  await retry.run('finish');
  assert.deepEqual(retry.routes, [], 'A rejected save must keep the user on Break.');
  assert.equal(retry.bindings.session.phase, 'break');
  assert.equal(retry.lock.current, false);
  assert.equal(retry.busy(), null);
  assert.match(retry.error(), /could not be saved.*retry/i);
  retry.setPersistence(async () => {});
  await retry.run('finish');
  assert.deepEqual(retry.saves, ['complete', 'complete']);
  assert.deepEqual(retry.routes, ['/(app)/today']);
  assert.equal(retry.error(), '', 'A successful retry clears the previous failure.');

  const noRecall = simulate();
  noRecall.bindings.retrievalSuggestion = null;
  await noRecall.run('retrieve');
  assert.deepEqual(noRecall.saves, ['complete']);
  assert.deepEqual(noRecall.routes, ['/(app)/today']);

  const skip = simulate();
  skip.setPersistence(() => new Promise<void>(resolve => { release = resolve; }));
  const skipping = skip.run('skip');
  assert.deepEqual(skip.saves, ['skip']);
  assert.deepEqual(skip.routes, []);
  release();
  await skipping;
  assert.deepEqual(skip.routes, ['/(app)/today']);

  const wrongPhase = simulate('focus');
  await wrongPhase.run('retrieve');
  assert.deepEqual(wrongPhase.saves, []);
  assert.deepEqual(wrongPhase.routes, []);
  console.log('✓ Actual break handler blocks rapid exits, waits for saves, preserves recall and recovers from failure');
}

class MemoryStore implements FocusKeyValueStore {
  values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

async function main() {
  let session = createFocusSession({
    topicId: 'topic_math',
    topicName: 'Quadratic Equations',
    subject: 'Mathematics',
    plannedMinutes: 45,
    breakMinutes: 10,
    launchMode: 'full',
    tinyStep: 'Solve question 1 without notes',
    now,
    id: 'focus_test',
  });

  assert.equal(timerRemainingMs(session, now), 45 * MINUTE);
  assert.equal(timerRemainingMs(session, now + 10 * MINUTE), 35 * MINUTE);

  // Simulate 90 minutes spent outside the app while Android suspends the
  // JavaScript interval. The persisted start time, not tick count, determines
  // the completed display when the screen becomes active again.
  const backgroundSession = createFocusSession({
    topicId: 'topic_background',
    topicName: 'Background timer check',
    subject: 'Mathematics',
    plannedMinutes: 25,
    breakMinutes: 5,
    launchMode: 'full',
    tinyStep: '',
    now,
    id: 'focus_background',
  });
  assert.equal(timerRemainingMs(backgroundSession, now + 90 * MINUTE), 0);
  assert.equal(timerIsComplete(backgroundSession, now + 90 * MINUTE), true);
  assert.equal(backgroundSession.runningSince, now, 'Recomputing must not restart or mutate the timer.');
  const backgroundPaused = pauseFocusTimer(backgroundSession, now + 4 * MINUTE);
  assert.equal(
    timerRemainingMs(backgroundPaused, now + 90 * MINUTE),
    21 * MINUTE,
    'An intentionally paused timer stays paused even after a long background period.',
  );

  session = pauseFocusTimer(session, now + 10 * MINUTE);
  assert.equal(session.runningSince, null);
  assert.equal(timerRemainingMs(session, now + 25 * MINUTE), 35 * MINUTE);

  session = resumeFocusTimer(session, now + 25 * MINUTE);
  assert.equal(timerRemainingMs(session, now + 30 * MINUTE), 30 * MINUTE);
  assert.equal(focusActualMinutes(session, now + 30 * MINUTE), 15);

  session = addParkedDistraction(session, 'Check that message later', now + 31 * MINUTE);
  assert.equal(session.distractions.length, 1);
  assert.equal(session.distractions[0]?.text, 'Check that message later');
  assert.equal(
    JSON.stringify({
      plannedMinutes: session.plannedFocusMinutes,
      tinyStep: session.tinyStep,
    }).includes('Check that message later'),
    false,
    'Distraction text should not be part of permanent study metadata.',
  );

  const distractionId = session.distractions[0]!.id;
  session = removeParkedDistraction(session, distractionId);
  assert.equal(session.distractions.length, 0);

  const standaloneTask = createFocusSession({
    taskId: 'task_homework',
    topicName: 'Finish worksheet',
    subject: 'Mathematics',
    plannedMinutes: 25,
    breakMinutes: 8,
    launchMode: 'full',
    tinyStep: 'Start question 1',
    now,
    id: 'focus_task',
  });
  assert.equal(standaloneTask.topicId, undefined);
  assert.equal(standaloneTask.taskId, 'task_homework');

  const five = createFocusSession({
    topicId: 'topic_chem',
    topicName: 'Metals',
    subject: 'Chemistry',
    plannedMinutes: 45,
    breakMinutes: 10,
    launchMode: 'five-minute',
    tinyStep: 'Write the reactivity series',
    now,
    id: 'focus_five',
  });

  assert.equal(five.plannedFocusMinutes, 5);
  assert.equal(timerIsComplete(five, now + 5 * MINUTE), true);

  const extended = extendFiveMinuteLaunch(five, now + 6 * MINUTE);
  assert.equal(extended.plannedFocusMinutes, 45);
  assert.equal(timerRemainingMs(extended, now + 6 * MINUTE), 40 * MINUTE);
  assert.equal(timerIsComplete(extended, now + 45 * MINUTE), false);
  assert.equal(timerIsComplete(extended, now + 46 * MINUTE), true);

  const finishedFocus = pauseFocusTimer(
    createFocusSession({
      topicId: 'topic_bio',
      topicName: 'Life Processes',
      subject: 'Biology',
      plannedMinutes: 25,
      breakMinutes: 8,
      launchMode: 'full',
      tinyStep: '',
      now,
      id: 'focus_bio',
    }),
    now + 18 * MINUTE,
  );

  assert.equal(focusActualMinutes(finishedFocus, now + 30 * MINUTE), 18);

  const onBreak = beginBreak(finishedFocus, 18, now + 20 * MINUTE);
  assert.equal(onBreak.phase, 'break');
  assert.equal(onBreak.focusLogged, true);
  assert.equal(onBreak.focusActualMinutes, 18);
  assert.equal(breakActualMinutes(onBreak, now + 24 * MINUTE), 4);

  assert.equal(formatTimer(65_000), '01:05');
  assert.equal(formatTimer(0), '00:00');

  // Compact layouts must not crop progress marks, while standard phones
  // retain the existing 228dp dial. Both stages use the same sizing.
  assert.equal(focusDialSize(360, 24), 228);
  assert.equal(focusDialSize(280, 24), 208);
  assert.equal(focusDialSize(240, 24), 168);
  assert.equal(focusDialSize(200, 24), 128);
  for (const width of [200, 216, 240, 280, 360, 480]) {
    const size = focusDialSize(width, 24);
    assert.ok(size + 20 <= width - 48, 'Dial and outer ring must fit inside screen padding.');
    for (const index of [0, 10, 20, 30, 39]) {
      const { left, top } = focusDialMarkPosition(size, index);
      assert.ok(left >= 0 && top >= 0 && left + 3 <= size && top + 9 <= size,
        'Circular progress marks must fit within the measured dial.');
    }
  }

  const memory = new MemoryStore();
  const storage = createFocusStorage(memory);

  await storage.save('user:A', five);
  assert.equal((await storage.load('user:A'))?.topicId, 'topic_chem');
  await storage.save('user:TASK', standaloneTask);
  const restoredTask = await storage.load('user:TASK');
  assert.equal(restoredTask?.taskId, 'task_homework');
  assert.equal(restoredTask?.topicId, undefined);
  assert.equal(await storage.load('user:B'), null, 'Active focus state must be isolated by owner.');

  const restored = await storage.load('user:A');
  assert.ok(restored);
  assert.equal(
    timerRemainingMs(restored!, now + 3 * MINUTE),
    2 * MINUTE,
    'Timestamp-based timer should recover after the app was not running.',
  );

  await storage.clear('user:A');
  assert.equal(await storage.load('user:A'), null);

  await memory.setItem(
    '@myelin/native/focus/user%3AA',
    JSON.stringify({ format: 'wrong', version: 1 }),
  );
  assert.equal(await storage.load('user:A'), null, 'Invalid active-session data should be discarded safely.');

  // Storage write errors must reach the caller, but must never poison
  // future recovery saves or allow later writes to race ahead.
  const persisted: Array<{ owner: string; id: string | null }> = [];
  let failNext = true;
  const durableQueue = createFocusWriteQueue<typeof five>(async (owner, next) => {
    if (failNext) {
      failNext = false;
      throw new Error('simulated AsyncStorage disk write failure');
    }
    persisted.push({ owner, id: next?.id ?? null });
  });
  await assert.rejects(
    durableQueue.write('user:retry', five),
    /simulated AsyncStorage disk write failure/,
    'Focus writes must not silently swallow device storage errors',
  );
  await durableQueue.write('user:retry', five);
  await durableQueue.write('user:retry', null);
  assert.deepEqual(persisted, [
    { owner: 'user:retry', id: 'focus_five' },
    { owner: 'user:retry', id: null },
  ], 'Retry and clear must both succeed after a previous write failure');

  let settle!: () => void;
  const gate = new Promise<void>(resolve => { settle = resolve; });
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const order: string[] = [];
  const serial = createFocusWriteQueue<typeof five>(async (owner, next) => {
    order.push('start-' + (next?.id ?? 'clear'));
    if (next) {
      markStarted();
      await gate;
    }
    order.push('finish-' + (next?.id ?? 'clear'));
  });
  const pendingSave = serial.write('user:A', five);
  const pendingClear = serial.write('user:A', null);
  await started;
  assert.deepEqual(order, ['start-focus_five'], 'Queued clear cannot overtake active save');
  settle();
  await Promise.all([pendingSave, pendingClear]);
  assert.deepEqual(order, [
    'start-focus_five', 'finish-focus_five', 'start-clear', 'finish-clear',
  ], 'Focus persistence must retain queued write ordering');

  const workspace = createEmptyWorkspace(now);
  workspace.topics.push({
    id: 'topic_math',
    name: 'Quadratic Equations',
    subject: 'Mathematics',
    createdAt: now,
    status: 'learning',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [],
  });

  workspace.history.push({
    id: 'session_focus',
    topicId: 'topic_math',
    at: now + 45 * MINUTE,
    kind: 'study',
    minutes: 38,
    grade: 0,
    effort: 4,
    prompt: '',
    response: '',
    confidence: 'unsure',
    plannedMinutes: 45,
    startedAt: now,
    endedAt: now + 38 * MINUTE,
    launchMode: 'five-minute',
    tinyStep: 'Start with question 1',
  });

  const retrievalWorkspace = createEmptyWorkspace(now);
  retrievalWorkspace.topics.push({
    id: 'retrieve_topic',
    name: 'Light',
    subject: 'Physics',
    createdAt: now,
    status: 'learning',
    priority: 2,
    estimate: 45,
    notes: '',
    dueAt: 0,
    intervalDays: 0,
    lastGrade: 0,
    lastReviewed: 0,
    snoozeUntil: 0,
    cards: [
      {
        id: 'ready_1',
        prompt: 'What is refraction?',
        answer: 'Change in direction of light.',
        hint: '',
        dueAt: 0,
        intervalDays: 0,
        lastGrade: 0,
        lastReviewed: 0,
        reps: 0,
      },
      {
        id: 'ready_2',
        prompt: 'State Snell law.',
        answer: 'Ratio of sines is constant.',
        hint: '',
        dueAt: now - MINUTE,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 24 * 60 * MINUTE,
        reps: 1,
      },
      {
        id: 'ready_3',
        prompt: 'Define refractive index.',
        answer: 'Ratio of speeds.',
        hint: '',
        dueAt: now - MINUTE,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 24 * 60 * MINUTE,
        reps: 1,
      },
      {
        id: 'ready_4',
        prompt: 'Why does light bend?',
        answer: 'Its speed changes between media.',
        hint: '',
        dueAt: now - MINUTE,
        intervalDays: 1,
        lastGrade: 2,
        lastReviewed: now - 24 * 60 * MINUTE,
        reps: 1,
      },
      {
        id: 'future',
        prompt: 'Future spaced card.',
        answer: 'Do not force this early.',
        hint: '',
        dueAt: now + 5 * 24 * 60 * MINUTE,
        intervalDays: 5,
        lastGrade: 3,
        lastReviewed: now,
        reps: 3,
      },
    ],
  });

  const retrieval = buildPostFocusRetrievalSuggestion(
    retrievalWorkspace,
    'retrieve_topic',
    25,
    now,
  );
  assert.ok(retrieval);
  assert.equal(retrieval!.count, POST_FOCUS_RETRIEVAL_LIMIT);
  assert.equal(retrieval!.cardIds.length, 3);
  assert.equal(
    retrieval!.cardIds.includes('future'),
    false,
    'Post-focus retrieval must not pull future spaced cards forward.',
  );
  assert.equal(
    buildPostFocusRetrievalSuggestion(
      retrievalWorkspace,
      'retrieve_topic',
      4,
      now,
    ),
    null,
    'Tiny accidental focus should not trigger a retrieval handoff.',
  );
  assert.equal(
    buildPostFocusRetrievalSuggestion(
      retrievalWorkspace,
      'missing_topic',
      25,
      now,
    ),
    null,
  );

  const validated = migrateAndValidateWorkspace(workspace);
  const history = validated.history[0]!;
  assert.equal(history.plannedMinutes, 45);
  assert.equal(history.minutes, 38);
  assert.equal(history.tinyStep, 'Start with question 1');

  await verifyBreakTransitions();

  console.log('✓ absolute timestamps survive background/app close');
  console.log('✓ pause and resume preserve elapsed time');
  console.log('✓ five-minute launch can extend into the full block');
  console.log('✓ distraction parking stays in active-session state');
  console.log('✓ break timing and partial duration are measurable');
  console.log('✓ standalone task timers persist without a fake Topic');
  console.log('✓ active sessions are isolated per workspace owner');
  console.log('✓ invalid active-session state fails safely');
  console.log('✓ planned-vs-actual focus metadata survives workspace validation');
  console.log('✓ post-focus retrieval is capped, due-only and skipped for tiny/no-topic focus');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


const focusProviderSource = fs.readFileSync(
  path.join(process.cwd(), 'src/features/focus/FocusProvider.tsx'),
  'utf8',
);
assert.ok(
  focusProviderSource.includes('await waitForSaves();'),
  'Focus completion must persist workspace history before advancing recovery state.',
);


const focusProviderIdempotencySource = fs.readFileSync(
  path.join(process.cwd(), 'src/features/focus/FocusProvider.tsx'),
  'utf8',
);
assert.ok(
  focusProviderIdempotencySource.includes('historyId(current.id)'),
  'Focus history should use a stable ID so a save retry cannot duplicate the session.',
);
assert.ok(
  focusProviderIdempotencySource.includes('draft.history.some((entry) => entry.id === stableHistoryId)'),
  'Focus completion should detect an already-applied in-memory history record.',
);
assert.ok(
  focusProviderIdempotencySource.includes('task.lastFocusSessionId === current.id') &&
    focusProviderIdempotencySource.includes('task.lastFocusSessionId = current.id'),
  'Standalone task focus completion should be idempotent across recovery retries.',
);
assert.ok(
  focusProviderIdempotencySource.includes('task.focusMinutesForDay') &&
    focusProviderIdempotencySource.includes('task.focusDayKey'),
  'Standalone task focus should contribute to daily capacity accounting.',
);
assert.ok(
  focusProviderIdempotencySource.includes('const stableBreakAt = current.phaseStartedAt'),
  'Break logging should use a stable timestamp so retries remain idempotent.',
);

const focusScreenSource = fs.readFileSync(
  path.join(process.cwd(), 'app/(app)/focus/index.tsx'),
  'utf8',
);

assert.ok(
  focusProviderSource.includes('await saveQueue.current.write(owner, next)') &&
    focusProviderSource.includes('sessionRef.current = previous') &&
    focusProviderSource.includes('setSaveError(') &&
    focusProviderSource.includes('throw error;'),
  'A focus state should roll back and show a warning rather than claim an unsaved timer is durable.',
);
assert.ok(
  focusProviderSource.includes('await commitSession(addParkedDistraction(current, text))'),
  'Parking a distraction must report save failure before the input text is removed.',
);
assert.ok(
  focusScreenSource.includes('The thought could not be saved. Your text is still here') &&
    focusScreenSource.indexOf('await park(value)') < focusScreenSource.indexOf("setDistraction('');") &&
    focusScreenSource.includes('Could not save the Focus session.') &&
    focusScreenSource.includes('Break progress could not be saved.') &&
    focusScreenSource.includes('Could not clear this session.') &&
    focusScreenSource.includes('accessibilityRole="alert"'),
  'Focus must keep unsaved thought text and show actionable storage errors without navigating away.',
);

// A single hard-coded title offset makes Focus/Break headers overlap status
// labels on narrow Android screens. Keep navigation truthful by destination.
assert.ok(
  focusScreenSource.includes("backLabel = 'Today'") &&
    focusScreenSource.includes('backLabel="Review"') &&
    focusScreenSource.includes('backLabel="Back"') &&
    focusScreenSource.includes("accessibilityLabel={backLabel === 'Back' ? 'Go back' : 'Back to ' + backLabel}"),
  'Focus back actions must accurately describe Today, Review, and previous-screen destinations.',
);
assert.ok(
  focusScreenSource.includes('<View style={styles.topBarMain}>') &&
    focusScreenSource.includes('styles.backButton') &&
    focusScreenSource.includes('<View style={styles.topBarSpacer} accessible={false} />') &&
    focusScreenSource.includes('{helper ? <Text style={styles.topHelper}>{helper}</Text> : null}') &&
    focusScreenSource.includes('numberOfLines={1}>{label}</Text>') &&
    !focusScreenSource.includes('translateX: -24') &&
    !focusScreenSource.includes("position: 'absolute',\n    left: '50%'"),
  'Focus navigation must use symmetric flexible header columns instead of an absolute title offset.',
);
const headerStyleStart = focusScreenSource.indexOf('  backButton: {');
const headerStyleEnd = focusScreenSource.indexOf('\n  back:', headerStyleStart);
assert.ok(
  headerStyleStart > 0 &&
    focusScreenSource.slice(headerStyleStart, headerStyleEnd).includes('minHeight: layout.minTouch'),
  'Focus back control must meet the minimum touch target height.',
);
console.log('✓ Focus header is responsive with accurate back labels and accessible touch targets');

// Resume after background and navigation returns must refresh only the
// displayed clock. Never auto-resume a paused session or change saved minutes.
assert.ok(
  focusScreenSource.includes('AppState.addEventListener(\'change\'') &&
    focusScreenSource.includes("nextState === 'active'") &&
    focusScreenSource.includes('if (active) setNow(Date.now())') &&
    focusScreenSource.includes('return () => listener.remove();'),
  'Android foreground must update the Focus clock immediately and clean its listener.',
);
assert.ok(
  focusScreenSource.includes('useFocusEffect(useCallback(() => {') &&
    focusScreenSource.includes('setNow(Date.now());') &&
    focusScreenSource.includes('if (session?.runningSince == null || !appIsActive) return;') &&
    focusScreenSource.includes('clearInterval(timer)'),
  'Navigation focus must recompute wall time and backgrounded screens must stop interval updates.',
);
assert.ok(
  !focusScreenSource.includes('resumeFocusTimer(') &&
    !focusScreenSource.includes('beginBreak(session,') &&
    !focusScreenSource.includes("AppState.addEventListener('change', resume"),
  'App foreground should never silently resume a paused focus session or advance to break.',
);
console.log('✓ Focus foreground/route return refreshes the display without mutating the session');

// Break completion must be a single durable save-and-navigate operation.
// Rapid taps on Retrieve/Finish/End may otherwise trigger two saves and two
// different router replacements before React disables either button.
const breakExitStart = focusScreenSource.indexOf("  async function runBreakTransition(");
const breakExitEnd = focusScreenSource.indexOf("\n  if (!ready || !workspace)", breakExitStart);
assert.ok(breakExitStart > 0 && breakExitEnd > breakExitStart, 'Expected shared break completion handler.');
const breakExit = focusScreenSource.slice(breakExitStart, breakExitEnd);
assert.ok(
  breakExit.includes("if (breakTransitionLock.current || session?.phase !== 'break') return;") &&
    breakExit.includes('breakTransitionLock.current = true;') &&
    breakExit.includes('setBreakTransition(action);') &&
    breakExit.indexOf('breakTransitionLock.current = true;') < breakExit.indexOf('await completeBreak(Date.now());'),
  'Break transition must synchronously block repeat presses before awaiting storage.',
);
assert.ok(
  breakExit.includes("const suggestion = action === 'retrieve' ? retrievalSuggestion : null;") &&
    breakExit.includes("if (action === 'skip')") &&
    breakExit.includes('await skipBreak(Date.now());') &&
    breakExit.includes('await completeBreak(Date.now());') &&
    breakExit.indexOf('await completeBreak(Date.now());') < breakExit.indexOf("router.replace({") &&
    breakExit.indexOf('await skipBreak(Date.now());') < breakExit.indexOf("router.replace('/(app)/today');"),
  'Break completion must save before routing and only retrieve when a matching queue exists.',
);
assert.ok(
  breakExit.includes('breakTransitionLock.current = false;') &&
    breakExit.includes('setBreakTransition(null);') &&
    breakExit.includes('Break progress could not be saved. Stay here and retry.'),
  'Break transition failure must re-enable actions, preserve screen, and report a retryable error.',
);
const breakUi = focusScreenSource.slice(
  focusScreenSource.indexOf("  if (session.phase === 'break') {"),
  focusScreenSource.indexOf("  const canExtend =", focusScreenSource.indexOf("  if (session.phase === 'break') {")),
);
assert.ok(
  breakUi.includes('session.focusLogged ? (') &&
    breakUi.includes('Focus logged · {session.focusActualMinutes} min') &&
    breakUi.includes('styles.focusSavedCue'),
  'After a successful durable completion, the Break stage should confirm logged minutes.',
);
assert.equal(
  (breakUi.match(/disabled={Boolean\(breakTransition\)}/g) ?? []).length,
  4,
  'Retrieve, finish-without-recall, finish, and end-break controls must all disable during save.',
);
assert.ok(
  breakUi.includes("runBreakTransition('retrieve')") &&
    breakUi.includes("runBreakTransition('finish')") &&
    breakUi.includes("runBreakTransition('skip')") &&
    breakUi.includes('Saving break…') &&
    !focusScreenSource.includes('async function finishBreakAndRetrieve()'),
  'All break exits should share one busy/error/navigation flow, without the prior separate handlers.',
);
console.log('✓ Focus-to-Break confirms saved work and break exits are single-flight, retryable transitions');

// Focus/Break timer UI should respond to narrower devices, including the
// circular marks and the main time label. Effort chips need usable tap height.
assert.ok(
  focusScreenSource.includes('useWindowDimensions') &&
    focusScreenSource.includes('focusDialSize(windowWidth, spacing.lg)') &&
    focusScreenSource.includes('focusDialMarkPosition(size, index)') &&
    (focusScreenSource.match(/size={timerDialSize}/g) ?? []).length === 2 &&
    focusScreenSource.includes('width: size, height: size, borderRadius: size / 2') &&
    focusScreenSource.includes('width: innerSize, height: innerSize, borderRadius: innerSize / 2'),
  'Focus and Break dial must size both the ring and tick marks from available screen width.',
);
assert.ok(
  focusScreenSource.includes('adjustsFontSizeToFit') &&
    focusScreenSource.includes('minimumFontScale={0.64}') &&
    focusScreenSource.includes('size < 196 && styles.timerValueCompact') &&
    focusScreenSource.includes('size < 160 && styles.timerValueTiny') &&
    focusScreenSource.includes('timerValueTiny: { fontSize: 27, lineHeight: 34') &&
    focusScreenSource.includes('numberOfLines={2} style={styles.timerLabel}'),
  'Timer value and caption should remain legible in the smaller dial.',
);
const effortStyleStart = focusScreenSource.indexOf('  effort: {');
const effortStyleEnd = focusScreenSource.indexOf('\n  effortActive:', effortStyleStart);
assert.ok(
  effortStyleStart > 0 &&
    focusScreenSource.slice(effortStyleStart, effortStyleEnd).includes('minHeight: layout.minTouch'),
  'Focus effort rating chips must meet MYELIN minimum touch target height.',
);
console.log('✓ Focus dial adapts to narrow screens with accessible effort controls');

const reviewScreenSource = fs.readFileSync(
  path.join(process.cwd(), 'app/(app)/review/index.tsx'),
  'utf8',
);
assert.ok(
  breakExit.includes("pathname: '/(app)/review'") &&
    breakExit.includes('topicId: suggestion.topicId') &&
    breakExit.includes('limit: String(suggestion.count)') &&
    breakExit.includes("autoStart: '1'") &&
    breakExit.includes("source: 'focus'"),
  'Focus must finish the break before handing a useful topic into short retrieval.',
);
assert.ok(
  focusScreenSource.includes('Finish break without recall'),
  'Post-focus retrieval must stay optional.',
);
assert.ok(
  reviewScreenSource.includes('autoStartRequested') &&
    reviewScreenSource.includes('requestedLimit') &&
    reviewScreenSource.includes('limit: requestedLimit'),
  'Review must auto-start only the bounded post-focus topic queue.',
);
assert.ok(
  reviewScreenSource.includes('if (fromFocus)') &&
    reviewScreenSource.includes("router.replace('/(app)/today')"),
  'Completing post-focus retrieval must return to Today so Mileage can recalculate.',
);
