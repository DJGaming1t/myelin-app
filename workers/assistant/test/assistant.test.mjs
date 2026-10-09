import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { createHandler } from '../index.mjs';
import { generateDecision } from '../decision-service.mjs';
import { CloudError } from '../errors.mjs';
import { MODEL, OUTPUT_TOKENS } from '../qwen-provider.mjs';

const body = { version: 1, prompt: JSON.stringify({ requestId: 'worker-development', userRequest: 'Add a Geography topic.', context: {} }) };
const decision = { version: 1, requestId: 'worker-development', route: 'clarify', confidence: 0.9,
  reason: 'missing-required-detail', question: 'What is the topic name?', missingFields: ['name'] };
const completion = value => ({ object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } }] });
const request = (patch = {}) => new Request('https://myelin-test.invalid/assistant', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer signed-token' }, body: JSON.stringify(body), ...patch,
});
function setup() {
  const state = { calls: 0, reserves: 0, releases: 0, cooldown: 0, wire: null };
  const deps = {
    async verifyToken(token) { assert.equal(token, 'signed-token'); return { uid: 'owner', email_verified: true }; },
    quota: { async reserve(uid, id) { state.reserves++; assert.equal(uid, 'owner'); assert.equal(id, decision.requestId); return async () => { state.releases++; }; },
      async cooldown(seconds) { state.cooldown = seconds; } },
    ai: { async run(model, input) { state.calls++; state.wire = { model, input }; return completion(decision); } },
    now: () => 86_399_000,
  };
  return { deps, state };
}

test('default Worker has no auth/quota bypass even with an AI binding and activation-looking env', async () => {
  const { deps, state } = setup();
  const result = await worker.fetch(request(), { AI: deps.ai, MYELIN_CLOUD_ENABLED: 'true', VERIFY_TOKEN: deps.verifyToken, QUOTA: deps.quota });
  assert.equal(result.status, 503); assert.equal((await result.json()).error, 'cloud-not-configured');
  assert.equal(state.calls, 0); assert.equal(state.reserves, 0);
});

test('HTTP path, method, JSON, wire injection and body byte caps fail before generation', async () => {
  const { deps, state } = setup(); const handler = createHandler(deps);
  assert.equal((await handler(new Request('https://myelin-test.invalid/wrong'))).status, 404);
  const get = await handler(request({ method: 'GET', body: undefined })); assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
  for (const req of [request({ body: '{' }), request({ headers: { 'content-type': 'text/plain' } }),
    request({ body: JSON.stringify({ ...body, model: 'paid-model' }) }),
    request({ body: JSON.stringify({ ...body, prompt: JSON.stringify({ requestId: 'x', userRequest: 'x', context: null }) }) }),
    request({ body: 'x'.repeat(128_001) }), request({ body: JSON.stringify({ ...body, prompt: 'x'.repeat(48_001) }) })]) {
    assert.equal((await handler(req)).status, 400);
  }
  assert.equal(state.calls, 0); assert.equal(state.reserves, 0);
});

test('auth rejects missing, unverified, anonymous and revoked credentials; auth outages are sanitized', async () => {
  const { deps, state } = setup(); const handler = createHandler(deps);
  assert.equal((await handler(request({ headers: { 'content-type': 'application/json' } }))).status, 401);
  for (const identity of [{ uid: 'owner', email_verified: false }, { uid: 'owner', email_verified: true, firebase: { sign_in_provider: 'anonymous' } }]) {
    deps.verifyToken = async () => identity; assert.equal((await handler(request())).status, 403);
  }
  for (const [code, expected] of [['auth/id-token-revoked', 401], ['auth/insufficient-permission', 503]]) {
    deps.verifyToken = async () => { throw Object.assign(new Error('private diagnostic'), { code }); };
    const response = await handler(request()); assert.equal(response.status, expected); assert.ok(!(await response.text()).includes('private diagnostic'));
  }
  assert.equal(state.reserves, 0); assert.equal(state.calls, 0);
});

test('server owns model, messages, output budget and JSON mode; revision and protocol are public', async () => {
  const { deps, state } = setup(); const release = 'a'.repeat(40);
  const response = await createHandler(deps, { releaseCommit: release })(request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { version: 1, decision });
  assert.equal(response.headers.get('x-myelin-release'), release); assert.equal(response.headers.get('x-myelin-protocol'), '1');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(state.releases, 1);
  assert.equal(state.wire.model, MODEL); assert.equal(state.wire.input.max_tokens, OUTPUT_TOKENS);
  assert.deepEqual(state.wire.input.response_format, { type: 'json_object' }); assert.equal(state.wire.input.stream, false);
  assert.equal(state.wire.input.messages[1].content, body.prompt); assert.match(state.wire.input.messages[0].content, /Never invent dates/);
  assert.deepEqual(Object.keys(state.wire.input).sort(), ['max_tokens', 'messages', 'response_format', 'stream', 'temperature']);
  const invalidRevision = await createHandler(deps, { releaseCommit: 'key=private' })(request());
  assert.equal(invalidRevision.headers.get('x-myelin-release'), null);
});

test('context byte bound rejects without truncation or quota reservation', async () => {
  const { deps, state } = setup();
  const huge = { ...body, prompt: JSON.stringify({ requestId: decision.requestId, userRequest: 'Add a topic.', context: { notes: '界'.repeat(9000) } }) };
  const response = await createHandler(deps)(request({ body: JSON.stringify(huge) }));
  assert.equal(response.status, 400); assert.equal((await response.json()).error, 'context-too-large');
  assert.equal(state.reserves, 0); assert.equal(state.calls, 0);
});

test('quota failures do not start AI and private database errors never escape', async () => {
  const { deps, state } = setup();
  for (const error of [new CloudError(429, 'daily-limit', 100), new Error('database credentials')]) {
    deps.quota.reserve = async () => { throw error; };
    const response = await createHandler(deps)(request()); assert.equal(response.status, error.status ?? 503);
    assert.ok(!(await response.text()).includes('database credentials'));
  }
  assert.equal(state.calls, 0);
});

test('provider free exhaustion, capacity, paid-only model and failures have no retry or diagnostics', async () => {
  for (const [code, status, seconds] of [[3036, 429, 1], [3040, 429, 60], [5035, 503, 0], [5004, 502, 0]]) {
    const { deps, state } = setup(); deps.ai.run = async () => { state.calls++; throw Object.assign(new Error('secret provider diagnostic'), { code }); };
    const response = await createHandler(deps)(request()); assert.equal(response.status, status);
    assert.equal(response.headers.get('retry-after'), seconds ? String(seconds) : null);
    assert.ok(!(await response.text()).includes('secret')); assert.equal(state.cooldown, seconds);
    assert.equal(state.calls, 1); assert.equal(state.releases, 1);
  }
});

test('truncation, refusals, ambiguous candidates, wrong IDs and non-JSON output fail closed', async () => {
  const variants = [undefined, { candidates: [] }, { ...completion(decision), choices: [] },
    { ...completion(decision), choices: [...completion(decision).choices, ...completion(decision).choices] },
    { object: 'chat.completion', choices: [{ finish_reason: 'length', message: { role: 'assistant', content: JSON.stringify(decision) } }] },
    completion({ ...decision, requestId: 'other' }), completion({ ...decision, route: 'unknown' }),
    { object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(decision), refusal: 'Cannot comply' } }] },
    { object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(decision), tool_calls: [{}] } }] },
    { object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '```json\n{}\n```' } }] },
    { object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '界'.repeat(22_000) } }] }];
  for (const raw of variants) {
    const { deps, state } = setup(); deps.ai.run = async () => raw;
    assert.equal((await createHandler(deps)(request())).status, 502); assert.equal(state.releases, 1);
  }
});

test('provider ignoring cancellation cannot surface a late decision', async () => {
  const { deps, state } = setup(); let started; let finish;
  const ready = new Promise(resolve => { started = resolve; });
  deps.ai.run = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const controller = new AbortController();
  const pending = generateDecision({ body, authorization: 'Bearer signed-token', signal: controller.signal }, deps);
  await ready; controller.abort(); await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(state.releases, 1); finish(completion(decision));
});

test('HTTP deadline stays bounded during delayed reservation; its late lease is released without AI', async () => {
  const { deps, state } = setup(); let reserved; let finish;
  const ready = new Promise(resolve => { reserved = resolve; }); const background = [];
  deps.quota.reserve = async () => { reserved(); return new Promise(resolve => { finish = resolve; }); };
  const pending = createHandler(deps, { timeoutMs: 20 })(request(), { waitUntil: promise => background.push(promise) });
  await ready; const response = await pending; assert.equal(response.status, 504); assert.equal(state.calls, 0);
  finish(async () => { state.releases++; }); await Promise.all(background);
  assert.equal(state.releases, 1); assert.equal(state.calls, 0);
});

test('HTTP deadline covers token verification, request body and stalled cleanup', async () => {
  for (const mode of ['auth', 'body', 'cleanup']) {
    const { deps, state } = setup(); let req = request();
    if (mode === 'auth') deps.verifyToken = () => new Promise(() => {});
    if (mode === 'cleanup') deps.quota.reserve = async () => () => new Promise(() => {});
    if (mode === 'body') req = request({ body: new ReadableStream({ start() {} }), duplex: 'half' });
    const response = await createHandler(deps, { timeoutMs: 10 })(req);
    assert.equal(response.status, 504); assert.equal(state.calls, mode === 'cleanup' ? 1 : 0);
  }
});
