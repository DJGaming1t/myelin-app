import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { answerAssistantClarification, beginAssistantClarification, type AssistantClarificationAnswers, type ClarificationScope } from '../src/features/assistant/assistant-clarification';
import { routeWithHybridAssistant } from '../src/features/assistant/hybrid-assistant-router';
import { tryBuildMyelinMiniFastDecision } from '../src/features/assistant/myelin-mini-fast-router';
import { applyPreparedAssistantActionBatch } from '../src/features/assistant/assistant-action-session';

const NOW = new Date(2026, 9, 8, 12).getTime();
const scope: ClarificationScope = { ownerKey: 'local:user', revision: 0, currentDate: '2026-10-08', now: NOW };
const workspace = createEmptyWorkspace(NOW);
workspace.topics.push({ id: 'trig', name: 'Trigonometry', subject: 'Mathematics', createdAt: NOW, status: 'learning', priority: 2, estimate: 45, notes: '', dueAt: 0, intervalDays: 1, lastGrade: 0, lastReviewed: 0, snoozeUntil: 0, cards: [] });
let modelCalls = 0;
const offline = { id: 'not-installed', async generate(): Promise<never> { modelCalls++; throw new Error('No model needed'); } };
const route = (userRequest: string, requestId: string, clarificationAnswers?: AssistantClarificationAnswers) => routeWithHybridAssistant({ workspace, userRequest, requestId, clarificationAnswers, offline, allowCloudFallback: false, now: NOW });

async function main() {
  const original = 'I have to complite practical nb by tomorrow';
  const first = await route(original, 'notebook-subject');
  const pending = beginAssistantClarification(original, first, scope)!;
  assert.equal(pending.field, 'subject');
  const answered = answerAssistantClarification(pending, 'bio', workspace, scope);
  assert.equal(answered.kind, 'resolved');
  if (answered.kind !== 'resolved') throw new Error('Subject must resolve');
  assert.equal(answered.userRequest, original);
  assert.deepEqual(answered.answers, { subject: 'Biology' });
  const preview = await route(answered.userRequest, 'notebook-preview', answered.answers);
  assert.equal(preview.route, 'actions');
  assert.equal(workspace.tasks.length, 0);
  if (preview.route === 'actions') {
    const action = preview.prepared.batch.actions[0]!;
    assert.equal(action.type, 'create_task');
    if (action.type === 'create_task') {
      assert.equal(action.title, 'Complete Biology practical notebook');
      assert.equal(action.dueDate, '2026-10-09');
      assert.equal(action.topic, undefined);
      assert.equal(action.estimatedMinutes, 0);
    }
    assert.equal(preview.prepared.preview.requiresConfirmation, true);
    assert.throws(() => applyPreparedAssistantActionBatch(workspace, preview.prepared, 'wrong'));
  }

  const request = 'Add practice tomorrow';
  const question = beginAssistantClarification(request, await route(request, 'ask-topic'), scope)!;
  assert.equal(question.field, 'topic');
  const topicAnswer = answerAssistantClarification(question, 'trig', workspace, scope);
  assert.equal(topicAnswer.kind, 'resolved');
  if (topicAnswer.kind !== 'resolved') throw new Error('Topic must resolve');
  const second = beginAssistantClarification(request, await route(request, 'ask-duration', topicAnswer.answers), scope, topicAnswer.answers, question)!;
  assert.equal(second.field, 'estimatedMinutes');
  const durationAnswer = answerAssistantClarification(second, '45 minutes', workspace, scope);
  assert.equal(durationAnswer.kind, 'resolved');
  if (durationAnswer.kind !== 'resolved') throw new Error('Duration must resolve');
  assert.deepEqual(durationAnswer.answers, { topicId: 'trig', estimatedMinutes: 45 });
  const done = await route(request, 'practice-preview', durationAnswer.answers);
  assert.equal(done.route, 'actions');
  if (done.route === 'actions') {
    const action = done.prepared.batch.actions[0]!;
    assert.equal(action.type, 'create_task');
    if (action.type === 'create_task') { assert.deepEqual(action.topic, { topicId: 'trig' }); assert.equal(action.estimatedMinutes, 45); assert.equal(action.dueDate, '2026-10-09'); }
  }

  const conflict = 'Finish bio practical nb today tomorrow';
  const dateQuestion = beginAssistantClarification(conflict, await route(conflict, 'conflict'), scope)!;
  assert.equal(dateQuestion.field, 'dueDate');
  const dateAnswer = answerAssistantClarification(dateQuestion, 'tomorrow', workspace, scope);
  if (dateAnswer.kind !== 'resolved') throw new Error('Deadline must resolve');
  const resolved = await route(conflict, 'resolved-deadline', dateAnswer.answers);
  assert.equal(resolved.route, 'actions');
  if (resolved.route === 'actions') { const action = resolved.prepared.batch.actions[0]!; if (action.type === 'create_task') assert.equal(action.dueDate, '2026-10-09'); }
  assert.equal(answerAssistantClarification(dateQuestion, '2026-02-30', workspace, scope).kind, 'retry');
  assert.equal(answerAssistantClarification(dateQuestion, 'tomorrow at 8pm', workspace, scope).kind, 'retry');
  for (const answer of ['-30', '900 minutes', '30 or 45 minutes', '45 minutes and create a topic', 'delete everything']) assert.equal(answerAssistantClarification(second, answer, workspace, scope).kind, 'retry', answer);
  for (const answer of ['45', '45 minutes', '1.5 hours', 'half an hour']) assert.equal(answerAssistantClarification(second, answer, workspace, scope).kind, 'resolved', answer);
  assert.equal(answerAssistantClarification(pending, 'bio and chem', workspace, scope).kind, 'retry');
  assert.equal(answerAssistantClarification(question, 'Nonexistent topic', workspace, scope).kind, 'retry');
  workspace.topics.push({ ...workspace.topics[0]!, id: 'trig-2', name: 'Trigonometry advanced' });
  assert.equal(answerAssistantClarification(question, 'trig', workspace, scope).kind, 'retry');
  assert.equal(answerAssistantClarification(question, 'Trigonometry', workspace, scope).kind, 'resolved');
  workspace.topics.pop();
  for (const changed of [ { ...scope, ownerKey: 'another:user' }, { ...scope, revision: 1 }, { ...scope, currentDate: '2026-10-09' }, { ...scope, now: NOW + 600_001 }, { ...scope, now: NOW - 1 } ]) assert.equal(answerAssistantClarification(pending, 'Bio', workspace, changed).kind, 'expired');
  assert.equal(beginAssistantClarification(original, first, scope, {}, { ...pending, turns: 4 }), null);
  for (const clarificationAnswers of [{ topicId: 'invented' }, { dueDate: 'banana' }]) assert.equal(tryBuildMyelinMiniFastDecision({ workspace, userRequest: 'Finish bio homework tomorrow', requestId: 'invalid-answers', currentDate: scope.currentDate, clarificationAnswers })?.route, 'clarify');
  assert.equal(modelCalls, 0, 'Clarification never loads a model or invokes cloud to guess.');
  console.log('PASS: retained request, multiple explicit answers, exact previews, invalid-reply recovery, isolation and expiry.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
