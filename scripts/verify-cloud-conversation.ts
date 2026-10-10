/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  chatMessagesForCloud, CloudChatError,
  createCloudChatClient, validCloudChatEndpoint,
} from '../src/features/assistant/cloud-conversation';

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
assert.match(screen, /chatMessagesForCloud\(prior, text\)/);
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
