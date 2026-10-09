/// <reference types="node" />
import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { assistantChatReducer, assistantOfflineStatus, createAssistantChat, tryAssistantChatReply } from '../src/features/assistant/assistant-conversation';
import { LOCAL_AI_MODELS } from '../src/features/assistant/local-ai/model-catalog';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { answerAssistantClarification, beginAssistantClarification } from '../src/features/assistant/assistant-clarification';
import { applyPreparedAssistantActionBatch } from '../src/features/assistant/assistant-action-session';

async function main() {
  const now = new Date(2026, 9, 9, 12).getTime();
  const workspace = createEmptyWorkspace(now);
  workspace.topics.push({ id: 'trig', name: 'Trigonometry', subject: 'Mathematics', createdAt: now,
    status: 'learning', priority: 2, estimate: 45, notes: '', dueAt: 0, intervalDays: 1,
    lastGrade: 0, lastReviewed: 0, snoozeUntil: 0, cards: [] });
  const scope = { ownerKey: 'student', revision: workspace.revision, epoch: 0 };
  const questionScope = { ...scope, currentDate: '2026-10-09', now };
  let chat = createAssistantChat(scope.ownerKey, scope.revision);
  const append = (role: 'user' | 'assistant', text: string) => {
    chat = assistantChatReducer(chat, { type: 'append', scope: chat, role, text });
  };
  for (const request of ['Hello!', 'What can you do?', 'How do I use Focus?', 'How to open Review', 'What is Progress?', 'Thanks']) {
    const reply = tryAssistantChatReply(request, 'not-released');
    assert.ok(reply, request); append('user', request); append('assistant', reply);
  }
  for (const request of ['Hello, add trig practice for 30 minutes', 'Thanks and delete everything', 'Explain photosynthesis', 'How do I use Focus and add bio homework', 'What can you do? Add 30 min trig practice']) {
    assert.equal(tryAssistantChatReply(request, 'not-released'), null, 'Help must not swallow commands: ' + request);
  }
  assert.match(tryAssistantChatReply('Which model are you using?', 'not-released')!, /no released phone version/);
  assert.match(tryAssistantChatReply('Are you ready?', 'ready')!, /not a general chat or teaching model/);
  assert.equal(chat.messages.length, 12);
  assert.equal(workspace.tasks.length, 0, 'App-help replies never mutate workspace.');

  const gemma = LOCAL_AI_MODELS.find(m => m.id === 'functiongemma-270m')!;
  for (const qwen of LOCAL_AI_MODELS.filter(m => m.vendor === 'qwen')) {
    assert.equal(assistantOfflineStatus({ definition: qwen, installed: false, runtimeAvailable: true }), 'not-released');
  }
  assert.equal(assistantOfflineStatus({ definition: gemma, installed: false, runtimeAvailable: true }), 'not-installed');
  assert.equal(assistantOfflineStatus({ definition: gemma, installed: true, runtimeAvailable: false }), 'runtime-unavailable');
  assert.equal(assistantOfflineStatus({ definition: gemma, installed: true, runtimeAvailable: true }), 'ready');
  let modelCalls = 0; let cloudCalls = 0;
  const offline = { id: 'unavailable', async generate(): Promise<never> { modelCalls++; throw new Error('PRIVATE_PROVIDER_DETAIL'); } };
  const cloud = { id: 'cloud-not-connected', async generate(): Promise<never> { cloudCalls++; throw new Error('Must not call without consent'); } };
  for (const [status, expected] of [['not-released', /no released phone version/], ['not-installed', /file is not installed/], ['runtime-unavailable', /cannot run/], ['ready', /could not produce a valid action/]] as const) {
    const result = await routeWithHybridAssistant({ workspace, userRequest: 'Add Elasticity as a Physics topic', requestId: 'unavailable-' + status,
      offline, offlineStatus: status, cloud, allowCloudFallback: false, now });
    assert.equal(result.route, 'escalate');
    if (result.route !== 'escalate') throw new Error('Wrong route');
    assert.match(result.note, expected); assert.doesNotMatch(result.note, /PRIVATE_PROVIDER_DETAIL|try a simpler request/);
  }
  assert.equal(cloudCalls, 0);
  const callsBefore = modelCalls;
  const original = 'Add practice tomorrow';
  const route = (answers?: { topicId?: string; estimatedMinutes?: number }) => routeWithHybridAssistant({ workspace, userRequest: original,
    requestId: 'chat-practice', offline, offlineStatus: 'not-released', allowCloudFallback: false, now, clarificationAnswers: answers });
  append('user', original);
  const first = await route(); const topicQuestion = beginAssistantClarification(original, first, questionScope)!;
  assert.equal(topicQuestion.field, 'topic'); append('assistant', topicQuestion.question);
  append('user', "It's Trigonometry");
  const topic = answerAssistantClarification(topicQuestion, "It's Trigonometry", workspace, questionScope);
  assert.equal(topic.kind, 'resolved'); if (topic.kind !== 'resolved') throw new Error('topic');
  const second = await route(topic.answers);
  const durationQuestion = beginAssistantClarification(original, second, questionScope, topic.answers, topicQuestion)!;
  assert.equal(durationQuestion.field, 'estimatedMinutes'); append('assistant', durationQuestion.question);
  for (const bad of ['1 hour 70 minutes', '1 hour 30 minutes and add homework', '1.5 hours 30 minutes', '13 hours 0 minutes']) {
    assert.equal(answerAssistantClarification(durationQuestion, bad, workspace, questionScope).kind, 'retry', bad);
  }
  append('user', 'Make it 1 hour 30 minutes');
  const duration = answerAssistantClarification(durationQuestion, 'Make it 1 hour 30 minutes', workspace, questionScope);
  assert.equal(duration.kind, 'resolved'); if (duration.kind !== 'resolved') throw new Error('duration');
  assert.equal(duration.answers.estimatedMinutes, 90); assert.equal(duration.answers.topicId, 'trig');
  const result = await route(duration.answers); assert.equal(result.route, 'actions');
  if (result.route !== 'actions') throw new Error('preview');
  assert.equal(workspace.tasks.length, 0); assert.equal(result.prepared.preview.requiresConfirmation, true);
  assert.throws(() => applyPreparedAssistantActionBatch(workspace, result.prepared, 'wrong'));
  const applied = applyPreparedAssistantActionBatch(workspace, result.prepared, result.prepared.confirmationKey, now);
  assert.equal(applied.nextWorkspace.tasks.length, 1); assert.equal(applied.nextWorkspace.tasks[0]!.estimatedMinutes, 90);
  const repeated = applyPreparedAssistantActionBatch(applied.nextWorkspace, result.prepared, result.prepared.confirmationKey, now);
  assert.equal(repeated.nextWorkspace.tasks.length, 1);
  assert.equal(modelCalls, callsBefore, 'Conversation followups still work without loading a model.');
  chat = assistantChatReducer(chat, { type: 'sync', ownerKey: scope.ownerKey, revision: applied.nextWorkspace.revision });
  const before = chat;
  assert.equal(assistantChatReducer(chat, { type: 'append', scope, role: 'assistant', text: 'Late stale preview' }), before);
  chat = assistantChatReducer(chat, { type: 'committed', scope, text: 'Done — applied one change.' });
  assert.equal(chat.messages.at(-1)?.text, 'Done — applied one change.');
  assert.equal(answerAssistantClarification(durationQuestion, '45 minutes', workspace, { ...questionScope, now: now + 600_001 }).kind, 'expired');
  const previous = chat;
  chat = assistantChatReducer(chat, { type: 'reset' }); assert.equal(chat.messages.length, 0);
  assert.equal(assistantChatReducer(chat, { type: 'append', scope: previous, role: 'assistant', text: 'Cancelled request' }), chat);
  assert.equal(assistantChatReducer(chat, { type: 'committed', scope: previous, text: 'Old commit' }), chat);
  append('user', 'Private old-account request');
  const oldOwner = chat;
  chat = assistantChatReducer(chat, { type: 'sync', ownerKey: 'another-student', revision: 0 });
  assert.equal(chat.messages.length, 0);
  assert.equal(assistantChatReducer(chat, { type: 'append', scope: oldOwner, role: 'assistant', text: 'Wrong owner response' }), chat);
  for (let index = 0; index < 100; index++) append('user', 'Message ' + index);
  assert.equal(chat.messages.length, 80); assert.equal(new Set(chat.messages.map(m => m.id)).size, 80);
  console.log('PASS: bounded app-help chat, precise availability, retained natural replies, confirmed/idempotent apply, stale-result rejection, new-chat/account isolation and bounded history.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
