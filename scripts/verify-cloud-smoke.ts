/// <reference types="node" />
import assert from 'node:assert/strict';
import { smokeAssistantCloud } from './smoke-assistant-cloud';
const release = 'a'.repeat(40);
function setup(mode: 'valid' | 'wrong-details' | 'wrong-request' | 'malformed' | 'wrong-release' = 'valid') {
  let providerCalls = 0; let probes = 0;
  const send: typeof fetch = async (_url, options) => {
    const headers = { 'x-myelin-protocol': '1', 'x-myelin-release': release };
    const auth = (options?.headers as Record<string, string> | undefined)?.authorization;
    assert.equal(options?.redirect, 'error');
    if (!auth) {
      const checks = [ [405, 'method-not-allowed'], [401, 'sign-in-required'], [400, 'invalid-request'] ] as const;
      const [status, error] = checks[probes++]; return new Response(JSON.stringify({ error }), { status, headers });
    }
    providerCalls++; assert.equal(auth, 'Bearer synthetic-token');
    const prompt = JSON.parse(JSON.parse(options!.body as string).prompt);
    assert.equal(prompt.context.topics.length, 0);
    const decision = { version: 1, requestId: mode === 'wrong-request' ? 'other' : prompt.requestId,
      route: 'actions', confidence: 0.95, batch: { version: 1, requestId: prompt.requestId, actions: [
        { type: 'create_topic', name: 'Weather Instruments', subject: 'Geography', status: 'new', priority: 2,
          estimatedMinutes: mode === 'wrong-details' ? 99 : 25, notes: '' },
      ] } };
    return new Response(mode === 'malformed' ? '{' : JSON.stringify({ version: 1, decision }), {
      headers: mode === 'wrong-release' ? { ...headers, 'x-myelin-release': 'b'.repeat(40) } : headers });
  };
  return { send, count: () => providerCalls };
}
async function main() {
  const noToken = setup(); const unauth = await smokeAssistantCloud({ release, fetch: noToken.send });
  assert.equal(unauth.providerVerified, false); assert.equal(noToken.count(), 0);
  const valid = setup(); const good = await smokeAssistantCloud({ release, fetch: valid.send, token: 'synthetic-token' });
  assert.equal(good.providerVerified, true); assert.equal(good.appCloudEnabled, false); assert.equal(valid.count(), 1);
  assert.ok(!JSON.stringify(good).includes('synthetic-token'));
  for (const mode of ['wrong-details', 'wrong-request', 'malformed', 'wrong-release'] as const) {
    const fake = setup(mode); await assert.rejects(smokeAssistantCloud({ release, fetch: fake.send, token: 'synthetic-token' }));
    assert.equal(fake.count(), 1);
  }
  console.log('PASS: live smoke receipts distinguish transport from provider validation and never apply actions or expose tokens.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
