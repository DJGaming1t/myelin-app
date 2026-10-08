/// <reference types="node" />
import assert from 'node:assert/strict';
import { createCloudAssistantAdapter, AssistantCloudError } from '../src/features/assistant/cloud-assistant-adapter';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { createEmptyWorkspace } from '../src/data/schema';
import { myelinMiniDecisionJsonSchema, MyelinMiniModelRequest } from '../src/features/assistant/myelin-mini';

const requestId = 'cloud-transport-development';
const decision = { version: 1, requestId, route: 'actions', confidence: 0.93, batch: { version: 1, requestId, actions: [
  { type: 'create_topic', name: 'Ocean Currents', subject: 'Geography', status: 'new', priority: 2, estimatedMinutes: 25, notes: '' },
] } };
const request: MyelinMiniModelRequest = { system: 'client system must not be sent', user: '{}', responseSchema: myelinMiniDecisionJsonSchema(), maxOutputTokens: 999999 };
function setup() {
  const state = { consent: true, owner: 'owner' as string | null, calls: 0, tokens: 0, now: 1000 };
  const options = { endpoint: 'https://example.cloudfunctions.net/myelinAssistant', ownerId: 'owner',
    getCurrentOwnerId: () => state.owner, hasConsent: () => state.consent,
    async getIdToken() { state.tokens++; return 'firebase-token'; }, now: () => state.now,
    fetch: (async (_url, init) => {
      state.calls++;
      assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer firebase-token');
      assert.deepEqual(Object.keys(JSON.parse(init!.body as string)).sort(), ['prompt', 'version']);
      return new Response(JSON.stringify({ version: 1, decision }));
    }) as typeof fetch,
  };
  return { options, state };
}

async function main() {
  for (const endpoint of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=secret']) {
    const { options } = setup(); assert.throws(() => createCloudAssistantAdapter({ ...options, endpoint }), AssistantCloudError);
  }
  for (const condition of ['consent', 'owner'] as const) {
    const { options, state } = setup(); if (condition === 'consent') state.consent = false; else state.owner = null;
    await assert.rejects(createCloudAssistantAdapter(options).generate(request), AssistantCloudError);
    assert.equal(state.calls, 0); assert.equal(state.tokens, 0);
  }
  {
    const { options, state } = setup();
    options.getIdToken = async () => { state.owner = 'different-account'; return 'old-owner-token'; };
    await assert.rejects(createCloudAssistantAdapter(options).generate(request), { code: 'sign-in-required' }); assert.equal(state.calls, 0);
  }
  {
    const { options, state } = setup(); const cloud = createCloudAssistantAdapter(options);
    const workspace = createEmptyWorkspace(); const input = { workspace, requestId, cloud,
      offline: { id: 'unavailable-local', async generate() { throw new Error('unreleased'); } },
      userRequest: 'Add Ocean Currents as a Geography topic.', allowCloudFallback: false };
    assert.equal((await routeWithHybridAssistant(input)).route, 'escalate'); assert.equal(state.calls, 0);
    const result = await routeWithHybridAssistant({ ...input, allowCloudFallback: true });
    assert.equal(result.route, 'actions');
    if (result.route === 'actions') assert.equal(result.prepared.preview.requiresConfirmation, true);
    assert.equal(workspace.topics.length, 0);
    const previousCalls = state.calls;
    assert.equal((await routeWithHybridAssistant({ ...input, allowCloudFallback: true, userRequest: 'Record an exam on Ocean Currents' })).route, 'clarify');
    assert.equal(state.calls, previousCalls);
  }
  {
    const { options, state } = setup(); options.fetch = async () => { state.calls++; return new Response('', { status: 429, headers: { 'retry-after': '5' } }); };
    const adapter = createCloudAssistantAdapter(options);
    await assert.rejects(adapter.generate(request), { code: 'cloud-busy', retryAfterSeconds: 5 });
    await assert.rejects(adapter.generate(request), { code: 'cloud-busy' }); assert.equal(state.calls, 1);
    state.now += 5000; await assert.rejects(adapter.generate(request), { code: 'cloud-busy' }); assert.equal(state.calls, 2);
  }
  {
    const { options, state } = setup(); let began!: () => void; let finish!: (value: Response) => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    options.fetch = async () => { state.calls++; began(); return new Promise(resolve => { finish = resolve; }); };
    const controller = new AbortController();
    const pending = createCloudAssistantAdapter(options).generate({ ...request, signal: controller.signal });
    await started; controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
    finish(new Response(JSON.stringify({ version: 1, decision })));
    const before = state.calls;
    await assert.rejects(createCloudAssistantAdapter(options).generate({ ...request, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(state.calls, before);
  }
  {
    const { options } = setup(); options.getIdToken = () => new Promise(() => {});
    await assert.rejects(createCloudAssistantAdapter({ ...options, timeoutMs: 5 }).generate(request), { code: 'cloud-timeout' });
  }
  for (const fail of ['account-switch', 'consent-revoked', 'invalid-json', 'oversized', 'wrong-version']) {
    const { options, state } = setup(); options.fetch = async () => {
      if (fail === 'account-switch') state.owner = 'someone-else';
      if (fail === 'consent-revoked') state.consent = false;
      return new Response(fail === 'invalid-json' ? '{' : fail === 'oversized' ? 'x'.repeat(64_001) : JSON.stringify({ version: fail === 'wrong-version' ? 2 : 1, decision }));
    };
    await assert.rejects(createCloudAssistantAdapter(options).generate(request), AssistantCloudError);
  }
  {
    const { options } = setup(); options.fetch = async () => new Response(JSON.stringify({ version: 1, decision: { ...decision, requestId: 'wrong' } }));
    const result = await routeWithHybridAssistant({ workspace: createEmptyWorkspace(), userRequest: 'Add Ocean Currents as a Geography topic.', requestId,
      offline: { id: 'offline', async generate() { throw new Error('no model'); } }, cloud: createCloudAssistantAdapter(options), allowCloudFallback: true });
    assert.equal(result.route, 'escalate');
  }
  console.log('PASS: authenticated cloud transport, consent/owner guards, bounded timeout, abort/late replies, quota backoff and confirmed previews.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
