const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateDecision, validateBody } = require('../assistant-core.cjs');
const { nextQuota, LIMITS, createFirestoreQuota, CloudError } = require('../quota.cjs');

const body = { version: 1, prompt: JSON.stringify({ requestId: 'cloud-dev', userRequest: 'Add a topic on Ocean Currents.', context: {} }) };
const decision = { version: 1, requestId: 'cloud-dev', route: 'clarify', confidence: 0.9, reason: 'missing-required-detail', question: 'Which subject?', missingFields: ['subject'] };
function setup() {
  const state = { verifies: 0, reserves: 0, releases: 0, calls: 0, cooldown: 0, wire: null };
  const deps = {
    apiKey: 'test-server-secret', model: 'gemini-development-model',
    async verifyToken(token) { state.verifies++; assert.equal(token, 'signed-token'); return { uid: 'owner', email_verified: true }; },
    quota: { async reserve(uid, id) { state.reserves++; assert.equal(uid, 'owner'); assert.equal(id, 'cloud-dev'); return async () => { state.releases++; }; }, async cooldown(seconds) { state.cooldown = seconds; } },
    async fetch(url, request) {
      state.calls++; state.wire = { url, request };
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(decision) }] } }] }));
    },
  };
  const controller = new AbortController();
  return { state, deps, controller, input: { body, authorization: 'Bearer signed-token', signal: controller.signal } };
}

test('authentication and request limits reject before quota or provider calls', async () => {
  for (const patch of [{ authorization: '' }, { body: { ...body, system: 'override' } }, { body: { ...body, prompt: 'x'.repeat(48_001) } }, { body: { version: 1, prompt: '{' } }]) {
    const { deps, input, state } = setup();
    await assert.rejects(generateDecision({ ...input, ...patch }, deps), CloudError);
    assert.equal(state.reserves, 0); assert.equal(state.calls, 0);
  }
  for (const identity of [{ uid: 'owner', email_verified: false }, { uid: 'owner', email_verified: true, firebase: { sign_in_provider: 'anonymous' } }]) {
    const { deps, input, state } = setup(); deps.verifyToken = async () => identity;
    await assert.rejects(generateDecision(input, deps), { status: 403 }); assert.equal(state.calls, 0);
  }
  const { deps, input, state } = setup(); deps.verifyToken = async () => { throw Object.assign(new Error('revoked-token-details'), { code: 'auth/id-token-revoked' }); };
  await assert.rejects(generateDecision(input, deps), { status: 401, code: 'sign-in-required' }); assert.equal(state.reserves, 0);
  assert.throws(() => validateBody({ version: 1, prompt: JSON.stringify({ requestId: 'id', userRequest: 'hello', context: null }) }), CloudError);
});

test('server authentication permissions/outages are not reported as invalid user credentials', async () => {
  for (const code of ['auth/insufficient-permission', 'auth/internal-error', 'app/invalid-credential']) {
    const { deps, input, state } = setup();
    deps.verifyToken = async () => { throw Object.assign(new Error('private deployment diagnostic'), { code }); };
    await assert.rejects(generateDecision(input, deps), { status: 503, code: 'authentication-unavailable' });
    assert.equal(state.calls, 0); assert.equal(state.reserves, 0);
  }
});

test('server owns instructions, token budget and key; output is a proposal only', async () => {
  const { deps, input, state } = setup();
  assert.deepEqual(await generateDecision(input, deps), decision);
  assert.equal(state.releases, 1);
  const request = JSON.parse(state.wire.request.body);
  assert.equal(request.generationConfig.maxOutputTokens, 1200);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.match(request.systemInstruction.parts[0].text, /Never invent dates/);
  assert.equal(request.contents[0].parts[0].text, body.prompt);
  assert.equal(state.wire.request.headers['x-goog-api-key'], deps.apiKey);
  assert.ok(!state.wire.url.includes(deps.apiKey));
});

test('unconfigured server, quota rejection and cancellation never call provider', async () => {
  for (const change of [deps => { deps.apiKey = ''; }, deps => { deps.model = ''; }, deps => { deps.quota.reserve = async () => { throw new CloudError(429, 'daily-limit', 100); }; }]) {
    const { deps, input, state } = setup(); change(deps);
    await assert.rejects(generateDecision(input, deps), CloudError); assert.equal(state.calls, 0);
  }
  const { deps, input, state, controller } = setup();
  deps.quota.reserve = async () => { controller.abort(new CloudError(499, 'cancelled')); return async () => { state.releases++; }; };
  await assert.rejects(generateDecision(input, deps), { code: 'cancelled' });
  assert.equal(state.calls, 0); assert.equal(state.releases, 1);
});

test('429 causes shared cooldown, no automatic billable retry, sanitized errors', async () => {
  const { deps, input, state } = setup();
  deps.fetch = async () => { state.calls++; return new Response('private provider diagnostic', { status: 429, headers: { 'retry-after': '120' } }); };
  await assert.rejects(generateDecision(input, deps), { status: 429, code: 'provider-busy', retryAfter: 120 });
  assert.equal(state.calls, 1); assert.equal(state.cooldown, 120); assert.equal(state.releases, 1);
});

test('truncated, blocked, malformed and mismatched output cannot succeed', async () => {
  for (const value of [
    'not json',
    JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(decision) }] } }] }),
    JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ ...decision, requestId: 'other' }) }] } }] }),
    JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
    'x'.repeat(64_001),
  ]) {
    const { deps, input, state } = setup(); deps.fetch = async () => new Response(value);
    await assert.rejects(generateDecision(input, deps), { status: 502 }); assert.equal(state.releases, 1);
  }
});

test('abort interrupts provider that ignores its signal; late result is discarded', async () => {
  const { deps, input, state, controller } = setup(); let started;
  const ready = new Promise(resolve => { started = resolve; }); let finish;
  deps.fetch = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const request = generateDecision(input, deps); await ready;
  controller.abort(new CloudError(504, 'cloud-timeout'));
  await assert.rejects(request, { code: 'cloud-timeout' }); assert.equal(state.releases, 1);
  finish(new Response('{}'));
});

test('user/global minute/day windows, live lease, dedupe and cooldown', () => {
  const at = 1_000_000; let global = {}; let user = {};
  for (let i = 0; i < LIMITS.userMinute; i++) {
    const result = nextQuota(global, { ...user, activeUntil: 0 }, 'r' + i, at, 'lease'); global = result.global; user = result.user;
  }
  assert.throws(() => nextQuota(global, { ...user, activeUntil: 0 }, 'new', at, 'x'), { code: 'minute-limit' });
  assert.throws(() => nextQuota(global, user, 'new', at, 'x'), { code: 'request-in-progress' });
  assert.throws(() => nextQuota(global, { ...user, activeUntil: 0 }, 'r0', at, 'x'), { code: 'duplicate-request' });
  assert.throws(() => nextQuota({ ...global, cooldownUntil: at + 50_000 }, {}, 'new', at, 'x'), { code: 'provider-busy' });
  assert.throws(() => nextQuota({ ...global, minuteCount: LIMITS.globalMinute }, {}, 'new', at, 'x'), { code: 'minute-limit' });
  assert.throws(() => nextQuota({ ...global, dayCount: LIMITS.globalDay }, {}, 'new', at, 'x'), { code: 'daily-limit' });
  assert.throws(() => nextQuota({}, { ...user, activeUntil: 0, dayCount: LIMITS.userDay }, 'new', at, 'x'), { code: 'daily-limit' });
  const tomorrow = nextQuota(global, user, 'new', at + 86_400_000, 'new-lease');
  assert.equal(tomorrow.global.dayCount, 1); assert.equal(tomorrow.user.minuteCount, 1); assert.equal(tomorrow.user.recent.length, 1);
});

// Run against the actual Admin SDK emulator transaction implementation in CI.
test('Firestore transactions serialize concurrent reservations and preserve newer leases', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: 'demo-myelin-assistant' }, 'quota-test');
  const db = getFirestore(app); let now = 2_000_000;
  try {
    const quota = createFirestoreQuota(db, () => now);
    const reservations = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => quota.reserve('one-user', 'request-' + i)));
    const success = reservations.filter(item => item.status === 'fulfilled');
    assert.equal(success.length, 1);
    const global = (await db.doc('_assistantQuota/global').get()).data(); assert.equal(global.minuteCount, 1);
    const oldRelease = success[0].value;
    now += 60_000;
    const newRelease = await quota.reserve('one-user', 'request-next');
    await oldRelease();
    await assert.rejects(quota.reserve('one-user', 'third'), { code: 'request-in-progress' });
    await newRelease();
    await quota.cooldown(60);
    await assert.rejects(quota.reserve('other-user', 'different'), { code: 'provider-busy' });
    // Unauthenticated and signed-in clients have no access to server quota state.
    const endpoint = 'http://' + process.env.FIRESTORE_EMULATOR_HOST + '/v1/projects/demo-myelin-assistant/databases/(default)/documents/_assistantQuota/global';
    const read = await fetch(endpoint); assert.equal(read.status, 403);
    const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
    const { doc, getDoc, setDoc } = require('firebase/firestore');
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    const rules = await initializeTestEnvironment({ projectId: 'demo-myelin-assistant', firestore: { host, port: Number(port) } });
    try {
      const client = rules.authenticatedContext('one-user').firestore();
      await assertFails(getDoc(doc(client, '_assistantQuota', 'global')));
      await assertFails(setDoc(doc(client, '_assistantQuota', 'global'), { minuteCount: 0 }));
    } finally { await rules.cleanup(); }
  } finally { await db.terminate(); await deleteApp(app); }
});
