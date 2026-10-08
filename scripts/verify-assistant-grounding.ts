import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { routeWithMyelinMini, type MyelinMiniModelAdapter } from '../src/features/assistant/myelin-mini';
import { AssistantGroundingError, checkAssistantActionGrounding } from '../src/features/assistant/assistant-request-grounding';
import { answerAssistantClarification, beginAssistantClarification } from '../src/features/assistant/assistant-clarification';
import { prepareLocalAssistantActions } from '../src/features/assistant/local-ai/local-assistant-bridge';
import { parseAssistantActionBatch } from '../src/features/assistant/ai-action-engine';
import { applyPreparedAssistantActionBatch } from '../src/features/assistant/assistant-action-session';

const now = new Date(2026, 9, 9, 12).getTime();
const workspace = createEmptyWorkspace(now);
workspace.topics.push({ id: 'climate', name: 'Climate Zones', subject: 'Geography', createdAt: now, status: 'learning', priority: 2, estimate: 40, notes: '', dueAt: 0, intervalDays: 1, lastGrade: 0, lastReviewed: 0, snoozeUntil: 0, cards: [] });
const requestId = 'grounding-dev';
const exam = (date: string) => ({ type: 'create_exam', name: 'Geography viva', date, topicRefs: [{ topicId: 'climate' }] });
const batch = (actions: unknown[]) => ({ version: 1, requestId, actions });
let output: unknown = batch([exam('2026-10-19')]);
let calls = 0;
let cloudCalls = 0;
const offline: MyelinMiniModelAdapter = { id: 'fake-offline', async generate() { calls++; return { version: 1, requestId, route: 'actions', confidence: 0.99, batch: output }; } };
const cloud: MyelinMiniModelAdapter = { ...offline, id: 'fake-cloud', async generate(request) { cloudCalls++; return offline.generate(request); } };
const route = (userRequest: string, clarificationAnswers = {}) => routeWithHybridAssistant({ workspace, requestId, offline, cloud, allowCloudFallback: true, now, userRequest, clarificationAnswers });
const scope = { ownerKey: 'dev-user', revision: workspace.revision, currentDate: '2026-10-09', now };

async function main() {
  const original = 'Record a Geography viva covering Climate Zones';
  const missing = await route(original);
  assert.equal(missing.route, 'clarify');
  assert.equal(calls, 0); assert.equal(cloudCalls, 0, 'Known missing details must not be guessed by cloud.');
  const pending = beginAssistantClarification(original, missing, scope)!;
  assert.equal(pending.field, 'dueDate');
  const answer = answerAssistantClarification(pending, '2026-10-19', workspace, scope);
  if (answer.kind !== 'resolved') throw new Error('Date answer should resolve');
  const accepted = await route(original, answer.answers);
  assert.equal(accepted.route, 'actions');
  assert.equal(workspace.exams.length, 0);
  if (accepted.route === 'actions') {
    assert.equal(accepted.prepared.preview.requiresConfirmation, true);
    assert.throws(() => applyPreparedAssistantActionBatch(workspace, accepted.prepared, 'wrong'));
    assert.equal(applyPreparedAssistantActionBatch(workspace, accepted.prepared, accepted.prepared.confirmationKey, now).nextWorkspace.exams.length, 1);
  }
  output = batch([exam('2026-10-20')]);
  assert.equal((await route(original, answer.answers)).route, 'clarify', 'Model cannot replace the explicit answer with its own date.');
  assert.equal(cloudCalls, 0, 'Grounding rejection never escalates to cloud guesses.');
  for (const suffix of ['today tomorrow', 'next Thursday', '2026-02-30', 'date unknown']) {
    assert.equal((await route(`${original}, ${suffix}`)).route, 'clarify');
  }
  output = batch([exam('2026-10-10')]);
  assert.equal((await route(`${original}, tomorrow`)).route, 'actions');
  output = batch([exam('2026-10-11')]);
  assert.equal((await route(`${original}, tomorrow`)).route, 'clarify');

  output = batch([{ type: 'update_topic', topic: { topicId: 'climate' }, patch: { priority: 3 } }]);
  const vague = await route('Raise it to high priority');
  assert.equal(vague.route, 'clarify');
  const targetPending = beginAssistantClarification('Raise it to high priority', vague, scope)!;
  const targetAnswer = answerAssistantClarification(targetPending, 'Climate Zones', workspace, scope);
  if (targetAnswer.kind !== 'resolved') throw new Error('Target answer should resolve');
  assert.equal((await route('Raise it to high priority', targetAnswer.answers)).route, 'actions');
  assert.equal((await routeWithMyelinMini({ workspace, requestId, model: offline, now, allowFastRouter: false, userRequest: 'Please raise the priority of Weather Systems' })).route, 'clarify', 'A real ID is insufficient when the requested record differs.');
  output = batch([{ type: 'update_topic', topic: { topicId: 'missing' }, patch: { priority: 3 } }]);
  assert.equal((await routeWithMyelinMini({ workspace, requestId, model: offline, now, allowFastRouter: false, userRequest: 'Raise Climate Zones priority' })).route, 'clarify');

  const ground = (userRequest: string, actions: unknown[]) => checkAssistantActionGrounding({ workspace, userRequest, currentDate: scope.currentDate }, parseAssistantActionBatch(batch(actions)));
  workspace.topics.push({ ...workspace.topics[0]!, id: 'climate-advanced', name: 'Climate Zones Advanced' });
  assert.equal(ground('Update Clim to review', [{ type: 'update_topic', topic: { topicId: 'climate' }, patch: { status: 'review' } }])?.reason, 'ambiguous-reference');
  assert.equal(ground('Update Climate Zones to review', [{ type: 'update_topic', topic: { topicId: 'climate' }, patch: { status: 'review' } }]), null);
  workspace.topics.pop();
  workspace.topics.push({ ...workspace.topics[0]!, id: 'climate-duplicate' });
  assert.equal(ground('Update Geography Climate Zones to review', [{ type: 'update_topic', topic: { topicId: 'climate' }, patch: { status: 'review' } }])?.reason, 'ambiguous-reference');
  workspace.topics.pop();
  workspace.topics.push({ ...workspace.topics[0]!, id: 'creationism', name: 'Creationism' });
  assert.equal(ground('Create a record', [{ type: 'update_topic', topic: { topicId: 'creationism' }, patch: { priority: 3 } }])?.reason, 'missing-target', 'An instruction verb cannot count as a topic prefix.');
  workspace.topics.pop();
  assert.equal((await route('Raise it to high priority', { topicId: 'missing' })).route, 'clarify');
  workspace.topics.push({ ...workspace.topics[0]!, id: 'ab-climate', name: 'Regional Systems' });
  const explicitIdAction = [{ type: 'update_topic', topic: { topicId: 'ab-climate' }, patch: { priority: 3 } }];
  assert.equal(ground('Update id ab climate to high priority', explicitIdAction)?.reason, 'missing-target');
  assert.equal(ground('Update id AB-CLIMATE to high priority', explicitIdAction)?.reason, 'missing-target');
  assert.equal(ground('Update id ab-climate to high priority', explicitIdAction), null);
  assert.equal(ground('Update id "ab-climate" to high priority', explicitIdAction), null);
  workspace.topics.pop();
  assert.equal((await route(original, { dueDate: 'not-a-date' })).route, 'clarify');
  const create = { type: 'create_topic', name: 'Plant Transport', subject: 'Biology', status: 'new', priority: 2, estimatedMinutes: 40, notes: '', clientRef: 'plant' };
  const linked = { type: 'create_task', title: 'Review Plant Transport', subject: 'Biology', taskType: 'revision', estimatedMinutes: 20, priority: 2, notes: '', topic: { clientRef: 'plant' } };
  assert.equal(ground('Create Plant Transport then add a revision task for it', [create, linked]), null);
  assert.equal(ground('Create Plant Transport then add a revision task for it', [linked, create])?.reason, 'missing-target');
  assert.equal(ground('Create Plant Transport and update a chapter', [create, { type: 'update_topic', topic: { topicId: 'climate' }, patch: { priority: 3 } }])?.reason, 'missing-target');
  assert.equal(workspace.topics.length, 1, 'A rejected batch cannot partially create records.');

  output = batch([exam('2026-10-19')]);
  const remote = await routeWithHybridAssistant({ workspace, requestId, now, userRequest: 'Could you record a Geography viva covering Climate Zones?', allowCloudFallback: true,
    offline: { id: 'unavailable', async generate() { throw new Error('Not installed'); } }, cloud });
  assert.equal(remote.route, 'clarify'); assert.equal(cloudCalls, 1, 'Cloud-generated dates face the same checks.');
  const session = { modelId: 'functiongemma-270m' as const, async close() {}, async generate() { return { text: JSON.stringify(output), finishReason: 'stop' as const }; } };
  await assert.rejects(() => prepareLocalAssistantActions({ workspace, session, requestId, now, userRequest: 'Could you record a Geography viva covering Climate Zones?' }), error => error instanceof AssistantGroundingError && error.clarification.reason === 'missing-date');
  assert.equal((await prepareLocalAssistantActions({ workspace, session, requestId, now, userRequest: `${original} on 2026-10-19` })).preview.requiresConfirmation, true);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => routeWithMyelinMini({ workspace, requestId, model: offline, now, userRequest: original, signal: aborted.signal }), { name: 'AbortError' });
  assert.equal(workspace.exams.length, 0);
  console.log('PASS: request/date grounding, typed replies, ambiguous and invented targets, cloud and FunctionGemma parity, whole-batch rejection and confirmation.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
