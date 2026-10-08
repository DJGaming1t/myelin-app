/// <reference types="node" />
import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { createLocalMiniAdapter } from '../src/features/assistant/local-ai/local-assistant-bridge';
import { createLocalAiPreferenceStore } from '../src/features/assistant/local-ai/local-ai-preferences';
import { LocalAiManager } from '../src/features/assistant/local-ai/local-ai-manager';
import { LOCAL_AI_MODELS } from '../src/features/assistant/local-ai/model-catalog';
import { MyelinMiniModelAdapter } from '../src/features/assistant/myelin-mini';

async function main() {
  const values = new Map<string, string>();
  const store = createLocalAiPreferenceStore({
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  });
  const files = {
    async inspect() { return null; },
    async download(): Promise<never> { throw new Error('No release'); },
    async importFile(): Promise<never> { throw new Error('No release'); },
    async remove() {},
  };
  const manager = new LocalAiManager(files, store, async () => ({ platform: 'android', availableRuntimeIds: [] }), []);
  await manager.initialize();
  await manager.setPreferredOfflineModel('qwen3.5-2b');
  assert.equal((await store.load()).preferredOfflineModelId, 'qwen3.5-2b');
  assert.equal(manager.snapshot().selectedModelId, null, 'Preference must not falsely install/select an unavailable model.');
  for (const id of ['qwen3.5-0.8b', 'qwen3.5-2b'] as const) {
    assert.equal(LOCAL_AI_MODELS.find(m => m.id === id)!.artifact, null);
    await assert.rejects(() => manager.load(id));
  }
  const failing = new LocalAiManager(files, { load: () => store.load(), async save() { throw new Error('Storage full'); } }, async () => ({ platform: 'android', availableRuntimeIds: [] }), []);
  await failing.initialize();
  await assert.rejects(() => failing.setPreferredOfflineModel('qwen3.5-0.8b'), /Storage full/);
  assert.equal(failing.snapshot().preferences.preferredOfflineModelId, 'qwen3.5-2b');

  const workspace = createEmptyWorkspace();
  const requestId = 'hybrid-test';
  let offlineCalls = 0;
  let cloudCalls = 0;
  let output: unknown = { invalid: true };
  const offline: MyelinMiniModelAdapter = { id: 'test-offline', async generate() { offlineCalls++; return output; } };
  const cloud: MyelinMiniModelAdapter = { id: 'test-cloud', async generate() {
    cloudCalls++;
    return { version: 1, requestId, route: 'actions', confidence: 0.95, batch: { version: 1, requestId, actions: [
      { type: 'create_topic', name: 'Elasticity', subject: 'Physics', status: 'new', priority: 2, estimatedMinutes: 45, notes: '' },
    ] } };
  } };
  const input = { workspace, requestId, offline, cloud, userRequest: 'Add Elasticity as a Physics topic.', allowCloudFallback: false };
  const unavailable = await routeWithHybridAssistant(input);
  assert.equal(unavailable.route, 'escalate');
  assert.equal(cloudCalls, 0, 'No cloud request without consent.');
  const fallback = await routeWithHybridAssistant({ ...input, allowCloudFallback: true });
  assert.equal(fallback.modelId, cloud.id);
  assert.equal(fallback.route, 'actions');
  if (fallback.route === 'actions') assert.equal(fallback.prepared.preview.requiresConfirmation, true);
  assert.equal(workspace.topics.length, 0, 'Neither provider may apply changes directly.');

  output = { version: 1, requestId, route: 'clarify', confidence: 0.95, reason: 'missing-required-detail', question: 'Which subject?', missingFields: ['subject'] };
  const count = cloudCalls;
  assert.equal((await routeWithHybridAssistant({ ...input, allowCloudFallback: true })).route, 'clarify');
  assert.equal(cloudCalls, count, 'Clarification must reach the user instead of being guessed in the cloud.');
  output = { version: 1, requestId, route: 'actions', confidence: 0.95, batch: { version: 1, requestId, actions: [
    { type: 'update_topic', topic: { topicId: 'invented' }, patch: { priority: 3 } },
  ] } };
  assert.equal((await routeWithHybridAssistant(input)).route, 'clarify', 'Invalid record references require a user answer before any preview.');
  const rulesCount = offlineCalls;
  const rules = await routeWithHybridAssistant({ ...input, userRequest: 'Practice Algebra for 20 minutes.' });
  assert.equal(rules.route, 'clarify');
  assert.equal(offlineCalls, rulesCount, 'Simple rules must not load model weights.');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => routeWithHybridAssistant({ ...input, allowCloudFallback: true, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(cloudCalls, count);
  await assert.rejects(() => routeWithHybridAssistant({ ...input, allowCloudFallback: true,
    offline: { id: 'cancelled-model', async generate() { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } },
  }), { name: 'AbortError' });
  assert.equal(cloudCalls, count);

  for (const modelId of ['qwen3.5-0.8b', 'qwen3.5-2b'] as const) {
    let seenBudget = 0;
    const adapter = createLocalMiniAdapter(modelId, async () => ({ modelId, async close() {}, async generate(request) {
      seenBudget = request.maxOutputTokens ?? 0;
      assert.ok(request.jsonSchema);
      return { text: JSON.stringify({ version: 1, requestId, route: 'escalate', confidence: 0.95, reason: 'tutoring', note: 'This needs a teaching model.' }), finishReason: 'stop' };
    } }));
    const result = await routeWithHybridAssistant({ ...input, offline: adapter });
    assert.equal(result.modelId, modelId);
    assert.equal(seenBudget, 1200, 'The Qwen bridge requests the shared Mini output budget; release bundles still need native budget tests.');
  }
  console.log('PASS: Lite/Enhanced preference, safe fallback consent, cancellation, clarification, validated previews and shared Qwen protocol.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
