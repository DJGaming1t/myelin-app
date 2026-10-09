/// <reference types="node" />
import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { createCloudAssistantAdapter } from '../src/features/assistant/cloud-assistant-adapter';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';

async function main() {
  // Runtime import of the native ESM Worker, without pulling it into the Expo bundle.
  const modulePath = '../workers/assistant/index.mjs';
  const { createHandler } = await import(modulePath);
  for (const mode of ['valid', 'bad-field', 'bad-batch-id', 'bad-request-id']) {
    let calls = 0; let releases = 0;
    const handler = createHandler({
      async verifyToken(token: string) { assert.equal(token, 'test-token'); return { uid: 'owner', email_verified: true }; },
      quota: { async reserve() { return async () => { releases++; }; }, async cooldown() {} },
      ai: { async run(_model: string, input: { messages: { content: string }[] }) {
        calls++;
        const prompt = JSON.parse(input.messages[1].content);
        const decision = { version: 1, requestId: mode === 'bad-request-id' ? 'other' : prompt.requestId, route: 'actions', confidence: 0.95,
          batch: { version: 1, requestId: mode === 'bad-batch-id' ? 'other' : prompt.requestId, actions: [
            { type: 'create_topic', name: 'Ocean Currents', subject: 'Geography', status: 'new', priority: mode === 'bad-field' ? 99 : 2,
              estimatedMinutes: 25, notes: '' },
          ] } };
        return { object: 'chat.completion', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(decision) } }] };
      } },
    });
    const cloud = createCloudAssistantAdapter({ endpoint: 'https://myelin-test.invalid/assistant', ownerId: 'owner',
      getCurrentOwnerId: () => 'owner', hasConsent: () => true, async getIdToken() { return 'test-token'; },
      fetch: async (url, init) => handler(new Request(String(url), init)),
    });
    const workspace = createEmptyWorkspace(); const original = JSON.stringify(workspace);
    const options = { workspace, requestId: 'worker-client-' + mode, cloud, allowCloudFallback: true,
      offline: { id: 'unreleased-test-model', async generate() { throw new Error('unavailable'); } },
      userRequest: 'Add Ocean Currents as a Geography topic, normal priority, estimated at 25 minutes.' };
    const result = await routeWithHybridAssistant(options);
    assert.equal(result.route, mode === 'valid' ? 'actions' : 'escalate');
    if (result.route === 'actions') assert.equal(result.prepared.preview.requiresConfirmation, true);
    assert.equal(calls, 1); assert.equal(releases, 1); assert.equal(JSON.stringify(workspace), original);
    const clarification = await routeWithHybridAssistant({ ...options, requestId: 'missing-exam-day', userRequest: 'Create an exam on Ocean Currents' });
    assert.equal(clarification.route, 'clarify'); assert.equal(calls, 1);
  }
  console.log('PASS: Worker → cloud client → strict Mini/grounding → confirmed preview; invalid fields/IDs reject, clarification makes no cloud call, workspace unchanged. Simulated AI only.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
