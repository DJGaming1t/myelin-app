/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cloneWorkspace, createEmptyWorkspace } from '../src/data/schema';
import { createStudyTask } from '../src/features/planning/task-engine';
import { attachCloudStudySnapshot, buildCloudStudySnapshot } from '../src/features/assistant/cloud-study-snapshot';
import {
  chatMessagesForCloud, CloudChatError,
  createCloudChatClient, validCloudChatEndpoint,
} from '../src/features/assistant/cloud-conversation';

async function run() {
const endpoint = 'https://myelin-dev.example.workers.dev/chat';
assert.equal(validCloudChatEndpoint(endpoint), true);
for (const invalid of [
  '', 'http://example.com/chat', 'https://example.com/assistant',
  'https://user:password@example.com/chat', 'https://example.com/chat?key=secret',
  'https://localhost/chat',
]) assert.equal(validCloudChatEndpoint(invalid), false);

const history = [
  { role: 'user' as const, content: 'Help me plan my week' },
  { role: 'assistant' as const, content: 'Which subject is most urgent?' },
  { role: 'user' as const, content: 'Science' },
  { role: 'assistant' as const, content: 'What is its deadline?' },
];
const messages = chatMessagesForCloud(history, 'Friday, so how should I prepare?');
assert.deepEqual(messages, [...history, { role: 'user', content: 'Friday, so how should I prepare?' }]);
assert.deepEqual(chatMessagesForCloud([], 'Hello'), [{ role: 'user', content: 'Hello' }]);
assert.equal(chatMessagesForCloud(history, 'Follow-up')[0]!.role, 'user');

// Opted-in cloud chat may receive numeric workload evidence, but never
// automatically export private task names, notes, exam names or study answers.
const clock = new Date(2026, 9, 10, 15).getTime();
const saved = createEmptyWorkspace(clock);
saved.settings.dailyMinutes = 110;
const overdue = createStudyTask({
  title: 'PRIVATE_TASK_NAME', notes: 'PRIVATE_NOTES',
  estimatedMinutes: 70, dueAt: clock - 86_400_000, now: clock,
});
overdue.actualMinutes = 15;
overdue.postponements = 3;
saved.tasks.push(overdue);
const estimateMet = createStudyTask({
  title: 'PRIVATE_COMPLETED_TITLE', estimatedMinutes: 30, now: clock,
});
estimateMet.actualMinutes = 30;
saved.tasks.push(estimateMet);
saved.exams.push({
  id: 'private-exam-id', name: 'PRIVATE_EXAM_NAME',
  date: clock + 3 * 86_400_000, subjects: [], topicIds: [], scope: 'topics',
});
saved.history.push({
  id: 'private-session-id', topicId: 'private-topic-id', at: clock - 3600000,
  kind: 'study', minutes: 25, grade: 2, effort: 3,
  prompt: 'PRIVATE_STUDY_PROMPT', response: 'PRIVATE_STUDY_RESPONSE',
  confidence: 'partial',
});
const immutable = cloneWorkspace(saved);
const payload = buildCloudStudySnapshot(saved, clock);
const stats = JSON.parse(payload).metrics;
assert.equal(stats.openTasksWithRemainingWork, 1);
assert.equal(stats.estimatedRemainingMinutes, 55);
assert.equal(stats.overdueTasks, 1);
assert.equal(stats.repeatedlyPostponedTasks, 1);
assert.equal(stats.estimateMetTasksStillOpen, 1);
assert.equal(stats.loggedStudyMinutesLastSevenDays, 25);
assert.equal(stats.recordedStudyDaysLastSevenDays, 1);
assert.equal(stats.upcomingExamsWithinFourteenDays, 1);
assert.equal(stats.nearestExamInDays, 3);
assert.equal(stats.preferredStudyMinutesPerDay, 110);
const withContext = attachCloudStudySnapshot('Analyse my current workflow', saved, clock);
assert.match(withContext, /MYELIN aggregate data/);
const modelMessages = chatMessagesForCloud([], withContext);
assert.equal(modelMessages.length, 1);
assert.equal(modelMessages[0]!.role, 'user');
assert.ok(modelMessages[0]!.content.length <= 2000);
for (const privateField of [
  'PRIVATE_TASK_NAME', 'PRIVATE_NOTES', 'PRIVATE_COMPLETED_TITLE',
  'PRIVATE_EXAM_NAME', 'PRIVATE_STUDY_PROMPT', 'PRIVATE_STUDY_RESPONSE',
  'private-session-id', 'private-topic-id',
]) {
  assert.ok(!payload.includes(privateField), 'Snapshot leaked ' + privateField);
  assert.ok(!withContext.includes(privateField), 'Cloud content leaked ' + privateField);
}
assert.deepEqual(saved, immutable, 'Building model context cannot change recorded work');
const overlongQuestion = 'x'.repeat(1800);
assert.equal(attachCloudStudySnapshot(overlongQuestion, saved, clock), overlongQuestion,
  'Long questions must stay intact rather than be silently truncated for metrics');

let owner = 'alice';
let consent = false;
let sent = 0;
let tokenReads = 0;
let received: unknown = null;
let responseText = 'I would prioritise the nearest exam and leave room for breaks.';
const client = createCloudChatClient({
  endpoint, ownerId: 'alice',
  getCurrentOwnerId: () => owner,
  hasConsent: () => consent,
  getIdToken: async () => { tokenReads++; return 'signed-firebase-token'; },
  fetch: async (url, init) => {
    sent++;
    assert.equal(url, endpoint);
    assert.equal((init?.headers as Record<string, string>).authorization,
      'Bearer signed-firebase-token');
    received = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ version: 1, reply: responseText }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  },
});
const input = { requestId: 'myelin-chat-abc123', messages };
await assert.rejects(client.generate(input), (err: unknown) =>
  err instanceof CloudChatError && err.code === 'consent-required');
assert.equal(sent, 0);
assert.equal(tokenReads, 0);
consent = true;
const answer = await client.generate(input);
assert.equal(answer, responseText);
assert.deepEqual(received, { version: 1, requestId: input.requestId, messages });
assert.equal(sent, 1);
assert.equal(tokenReads, 1);
owner = 'bob';
await assert.rejects(client.generate(input), (err: unknown) =>
  err instanceof CloudChatError && err.code === 'sign-in-required');
assert.equal(sent, 1);

const cancelled = new AbortController();
cancelled.abort();
owner = 'alice';
await assert.rejects(client.generate({ ...input, signal: cancelled.signal }), {
  name: 'AbortError',
});
assert.equal(sent, 1);

for (const [status, body, expected] of [
  [401, { error: 'sign-in-required' }, 'sign-in-required'],
  [403, { error: 'verified-account-required' }, 'verified-account-required'],
  [429, { error: 'daily-limit' }, 'daily-limit'],
  [429, { error: 'provider-busy' }, 'cloud-busy'],
  [503, { error: 'cloud-not-configured' }, 'cloud-unavailable'],
] as const) {
  const failed = createCloudChatClient({
    endpoint, ownerId: owner,
    getCurrentOwnerId: () => owner,
    hasConsent: () => true,
    getIdToken: async () => 'valid-token',
    fetch: async () => new Response(JSON.stringify(body), { status }),
  });
  await assert.rejects(failed.generate(input), (err: unknown) =>
    err instanceof CloudChatError && err.code === expected);
}

let resolveDelayed: ((value: Response) => void) | null = null;
const delayed = createCloudChatClient({
  endpoint, ownerId: owner,
  getCurrentOwnerId: () => owner,
  hasConsent: () => true,
  getIdToken: async () => 'valid-token',
  fetch: () => new Promise<Response>(resolve => { resolveDelayed = resolve; }),
});
const controller = new AbortController();
const pending = delayed.generate({ ...input, signal: controller.signal });
controller.abort();
await assert.rejects(pending, { name: 'AbortError' });
if (resolveDelayed) (resolveDelayed as (value: Response) => void)(
  new Response(JSON.stringify({ version: 1, reply: 'late answer' })),
);

const screen = fs.readFileSync('app/(app)/settings/ai-assistant.tsx', 'utf8');
assert.match(screen, /EXPO_PUBLIC_MYELIN_CHAT_ENDPOINT/);
assert.match(screen, /useAuth\(\)/);
assert.match(screen, /getIdToken/);
assert.match(screen, /hasConsent: \(\) => cloudConsent/);
assert.match(screen, /Alert\.alert\('Use hosted conversation\?'/);
assert.match(screen, /chatMessagesForCloud\(prior, attachCloudStudySnapshot\(text, workspace, now\)\)/);
assert.match(screen, /cloudEligible && cloudConsent && isAssistantWorkflowAnalysisRequest\(text\)/);
assert.match(screen, /summary counts \(workload, deadlines, recorded study and exams\)/);
assert.match(screen, /createCloudChatClient/);
assert.match(screen, /!hasRuleDecision/);
assert.match(screen, /cloudConfigured && !cloudEligible/);
assert.match(screen, /The model cannot change your plan/);
assert.match(screen, /setCloudConsent\(false\)/);
assert.match(screen, /controllerRef\.current\?\.abort\(\)/);
const worker = fs.readFileSync('workers/assistant/index.mjs', 'utf8');
assert.match(worker, /pathname === '\/chat'/);
assert.match(worker, /generateConversation/);
assert.match(worker, /pathname === '\/chat' \? \{ version: 1, reply: result \}/);
console.log('Cloud conversation client, consent, multi-turn and UI routing checks passed.');
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
