import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  PreparedAssistantActionBatch,
  applyPreparedAssistantActionBatch,
} from '@/src/features/assistant/assistant-action-session';
import {
  type AssistantExamPlanSummary,
  isAssistantExamPlanSummary,
} from '@/src/features/assistant/ai-action-engine';
import { useLocalAi } from '@/src/features/assistant/local-ai/LocalAiProvider';
import { localDateKeyFromTimestamp, tryBuildMyelinMiniFastDecision } from '@/src/features/assistant/myelin-mini-fast-router';
import { answerAssistantClarification, beginAssistantClarification, type AssistantClarificationAnswers, type PendingAssistantClarification } from '@/src/features/assistant/assistant-clarification';
import { AssistantGroundingError, checkAssistantRequestGrounding } from '@/src/features/assistant/assistant-request-grounding';
import { assistantChatReducer, assistantOfflineStatus, createAssistantChat, tryAssistantChatReply, type AssistantChatScope } from '@/src/features/assistant/assistant-conversation';
import { tryAssistantPlanningReply } from '@/src/features/assistant/assistant-planning-review';
import { tryAssistantPlanMathReply } from '@/src/features/assistant/assistant-plan-math';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const EXAMPLES = [
  'I have to complete bio practical nb by tomorrow.',
  'What can you do?',
  'Review my plan',
] as const;

function TaskPreviewDetails({ prepared, index }: { prepared: PreparedAssistantActionBatch; index: number }) {
  const action = prepared.batch.actions[index];
  if (action?.type === 'create_commitment') {
    const data = prepared.preview.results[index]?.data;
    const conflicts = data && typeof data === 'object' && 'conflicts' in data && Array.isArray(data.conflicts)
      ? data.conflicts.filter((name): name is string => typeof name === 'string') : [];
    return <Text selectable style={styles.resultSummary}>
      Blocks these hours in Day map and reduces available study time.
      {conflicts.length ? `\nOverlaps in the next week: ${conflicts.join(', ')}. Existing tasks keep their scheduled times; review them in Day map.` : ''}
    </Text>;
  }
  if (action?.type !== 'create_task') return null;
  return (
    <Text selectable style={styles.resultSummary}>
      {action.subject || 'Subject not specified'} · {action.taskType}{'\n'}
      {action.dueDate ? `Due ${action.dueDate}` : 'No deadline'} ·{' '}
      {action.estimatedMinutes ? `${action.estimatedMinutes} min` : 'Duration not set — add an estimate before planning'}
    </Text>
  );
}

function previewLabel(prepared: PreparedAssistantActionBatch) {
  const count = prepared.preview.results.length;
  return `${count} proposed ${count === 1 ? 'action' : 'actions'}`;
}

function minutesLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function percentLabel(value: number | null) {
  return value == null ? 'Learning' : `${Math.round(value * 100)}%`;
}

function planDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function strainText(strain: AssistantExamPlanSummary['strain']) {
  return strain === 'overloaded'
    ? 'Overloaded'
    : strain === 'tight'
      ? 'Tight'
      : strain === 'balanced'
        ? 'Balanced'
        : 'Comfortable';
}

function ExamPlanPreview({ plan }: { plan: AssistantExamPlanSummary }) {
  const required = plan.feasibility.totalRequiredMinutes;
  const usableCapacity = plan.feasibility.totalCapacityMinutes;
  const unallocated = plan.feasibility.totalOverloadMinutes;
  const activeDays = plan.days.filter((day) => day.blocks.length > 0);
  const visibleDays = activeDays.slice(0, 7);
  const hiddenDays = Math.max(0, activeDays.length - visibleDays.length);

  return (
    <View testID="assistant-exam-plan-preview" style={styles.plan}>
      <View style={styles.planHeading}>
        <View style={styles.planHeadingCopy}>
          <Text style={styles.planEyebrow}>MYELIN CALCULATED PLAN</Text>
          <Text style={styles.planTitle}>
            {plan.examCount} {plan.examCount === 1 ? 'exam' : 'exams'} · {plan.uniqueTopicCount}{' '}
            {plan.uniqueTopicCount === 1 ? 'topic' : 'topics'}
          </Text>
        </View>
        <Text style={[
          styles.planStrain,
          plan.strain === 'overloaded' || plan.strain === 'tight'
            ? styles.planStrainHot
            : styles.planStrainCalm,
        ]}>
          {strainText(plan.strain).toUpperCase()}
        </Text>
      </View>

      <View style={styles.planStats}>
        <View style={styles.planStat}>
          <Text style={styles.planStatLabel}>DAILY MILEAGE</Text>
          <Text style={styles.planStatValue}>
            {minutesLabel(plan.capacity.sustainableDailyMinutes)}
          </Text>
          <Text style={styles.planStatMeta}>
            {plan.capacity.source === 'personalized' ? 'Personalized' : 'From daily setting'}
          </Text>
        </View>
        <View style={styles.planStat}>
          <Text style={styles.planStatLabel}>WORK REQUIRED</Text>
          <Text style={styles.planStatValue}>{minutesLabel(required)}</Text>
          <Text style={styles.planStatMeta}>Prep + final revision</Text>
        </View>
        <View style={styles.planStat}>
          <Text style={styles.planStatLabel}>USABLE CAPACITY</Text>
          <Text style={styles.planStatValue}>{minutesLabel(usableCapacity)}</Text>
          <Text style={styles.planStatMeta}>{Math.round(plan.bufferRatio * 100)}% buffer protected</Text>
        </View>
        <View style={styles.planStat}>
          <Text style={styles.planStatLabel}>DOESN'T FIT</Text>
          <Text style={[styles.planStatValue, unallocated > 0 && styles.planDanger]}>
            {minutesLabel(unallocated)}
          </Text>
          <Text style={styles.planStatMeta}>{unallocated > 0 ? 'Needs adjustment' : 'Within capacity'}</Text>
        </View>
      </View>

      {plan.workload.taskRemainingMinutes > 0 ||
      plan.workload.deduplicatedMinutes > 0 ? (
        <View style={styles.ledgerSummary}>
          <Text style={styles.ledgerSummaryTitle}>ONE WORKLOAD LEDGER</Text>
          <Text style={styles.ledgerSummaryText}>
            Tasks and exam work are sharing the same mileage.
            {plan.workload.deduplicatedMinutes > 0
              ? ` MYELIN merged ${minutesLabel(plan.workload.deduplicatedMinutes)} that was already represented by linked tasks instead of counting it twice.`
              : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.mileageStrip}>
        <View style={styles.mileageItem}>
          <Text style={styles.mileageLabel}>PACE</Text>
          <Text style={styles.mileageValue}>
            {plan.capacity.estimateMultiplier === 1
              ? '1.00×'
              : `${plan.capacity.estimateMultiplier.toFixed(2)}×`}
          </Text>
        </View>
        <View style={styles.mileageItem}>
          <Text style={styles.mileageLabel}>COMPLETION</Text>
          <Text style={styles.mileageValue}>
            {percentLabel(plan.capacity.completionReliability)}
          </Text>
        </View>
        <View style={styles.mileageItem}>
          <Text style={styles.mileageLabel}>POSTPONE PRESSURE</Text>
          <Text style={styles.mileageValue}>
            {Math.round(plan.capacity.postponementPressure * 100)}%
          </Text>
        </View>
      </View>

      {plan.feasibility.firstOverloadedDeadline ? (
        <View style={styles.capacityBreak}>
          <Text style={styles.capacityBreakKicker}>FIRST CAPACITY BREAK</Text>
          <Text style={styles.capacityBreakTitle}>
            By {planDateLabel(plan.feasibility.firstOverloadedDeadline.deadlineAt)}, MYELIN is short by{' '}
            {minutesLabel(plan.feasibility.firstOverloadedDeadline.overloadMinutes)}.
          </Text>
          <Text style={styles.capacityBreakText}>
            {minutesLabel(plan.feasibility.firstOverloadedDeadline.requiredMinutes)} is forced into a window with only{' '}
            {minutesLabel(plan.feasibility.firstOverloadedDeadline.capacityMinutes)} of safe capacity.
            {plan.feasibility.firstOverloadedDeadline.extraMinutesPerAvailableDay
              ? ` That is about ${minutesLabel(plan.feasibility.firstOverloadedDeadline.extraMinutesPerAvailableDay)} extra per available day if nothing moves.`
              : ''}
          </Text>

          {plan.feasibility.firstOverloadedDeadline.reliefCandidates.length ? (
            <View style={styles.reliefList}>
              <Text style={styles.planSubhead}>WHAT WOULD MAKE IT FIT</Text>
              {plan.feasibility.firstOverloadedDeadline.reliefCandidates
                .slice(0, 4)
                .map((candidate) => (
                  <View key={candidate.demandId} style={styles.reliefRow}>
                    <Text style={styles.reliefMinutes}>
                      {minutesLabel(candidate.suggestedMinutes)}
                    </Text>
                    <View style={styles.reliefCopy}>
                      <Text style={styles.reliefLabel}>{candidate.label}</Text>
                      <Text style={styles.reliefMeta}>
                        {candidate.movable
                          ? 'Move later, reduce scope, or deprioritize'
                          : 'Protected work — add capacity or reduce scope'}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {plan.warnings.length ? (
        <View style={styles.planWarnings}>
          <Text style={styles.planSubhead}>CAPACITY WARNINGS</Text>
          {plan.warnings.slice(0, 4).map((warning) => (
            <View key={warning} style={styles.warningRow}>
              <Text style={styles.warningDot}>•</Text>
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {plan.exams.length ? (
        <View style={styles.planSection}>
          <Text style={styles.planSubhead}>EXAMS</Text>
          {plan.exams.map((exam) => {
            const shortfall =
              exam.preparationUnallocatedMinutes + exam.revisionUnallocatedMinutes;
            return (
              <View key={exam.examId} style={styles.examRow}>
                <View style={styles.examCopy}>
                  <Text style={styles.examName}>{exam.examName}</Text>
                  <Text style={styles.examMeta}>
                    {planDateLabel(exam.examDate)} · {exam.topicCount}{' '}
                    {exam.topicCount === 1 ? 'topic' : 'topics'}
                  </Text>
                </View>
                <Text style={[styles.examFit, shortfall > 0 && styles.planDanger]}>
                  {shortfall > 0 ? `${minutesLabel(shortfall)} short` : 'Fits'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.planSection}>
        <Text style={styles.planSubhead}>NEXT PLANNED DAYS</Text>
        {!visibleDays.length ? (
          <Text style={styles.emptyPlanText}>
            No study blocks can be placed yet. Check the warnings above or add upcoming exams and topics.
          </Text>
        ) : (
          visibleDays.map((day) => {
            const planned = day.plannedPreparationMinutes + day.plannedRevisionMinutes;
            return (
              <View key={day.day} style={styles.dayCard}>
                <View style={styles.dayTop}>
                  <View>
                    <Text style={styles.dayDate}>{planDateLabel(day.day)}</Text>
                    <Text style={styles.dayCapacity}>
                      {minutesLabel(planned)} planned · {minutesLabel(day.usableCapacityMinutes)} usable
                    </Text>
                  </View>
                  <Text style={styles.dayStrain}>{strainText(day.strain)}</Text>
                </View>
                <View style={styles.dayBlocks}>
                  {day.blocks.slice(0, 4).map((block, blockIndex) => (
                    <View key={`${block.kind}:${block.topicId}:${blockIndex}`} style={styles.blockRow}>
                      <Text style={styles.blockMinutes}>{minutesLabel(block.minutes)}</Text>
                      <View style={styles.blockCopy}>
                        <Text style={styles.blockTopic}>{block.topicName}</Text>
                        <Text style={styles.blockMeta}>
                          {block.kind === 'revision' ? 'Revision' : 'Preparation'} · {block.subject}
                          {block.reasons[0] ? ` · ${block.reasons[0]}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {day.blocks.length > 4 ? (
                    <Text style={styles.moreBlocks}>+{day.blocks.length - 4} more blocks</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        {hiddenDays > 0 ? (
          <Text style={styles.moreDays}>+{hiddenDays} more planned {hiddenDays === 1 ? 'day' : 'days'}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function LocalAiAssistantScreen() {
  const { workspace, ownerKey, commitAssistantWorkspace } = useWorkspace();
  const { ready, snapshot, models, prepareAssistantActions, prepareAssistantDecision, nativeRuntimeAvailable } = useLocalAi();
  const [request, setRequest] = useState('');
  const [prepared, setPrepared] = useState<PreparedAssistantActionBatch | null>(null);
  const [busy, setBusy] = useState<'prepare' | 'apply' | ''>('');
  const [error, setError] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<PendingAssistantClarification | null>(null);
  const [chat, dispatchChat] = useReducer(assistantChatReducer, undefined,
    () => createAssistantChat(ownerKey, workspace?.revision ?? 0));
  const controllerRef = useRef<AbortController | null>(null);
  const applyGuard = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const workspaceScopeRef = useRef({ ownerKey, revision: workspace?.revision ?? 0 });
  workspaceScopeRef.current = { ownerKey, revision: workspace?.revision ?? 0 };

  const selected = useMemo(
    () => models.find(model => model.definition.id === (snapshot.selectedModelId === 'functiongemma-270m'
      ? snapshot.selectedModelId : snapshot.preferences.preferredOfflineModelId ?? 'qwen3.5-0.8b')) ?? null,
    [models, snapshot.selectedModelId, snapshot.preferences.preferredOfflineModelId],
  );
  const offlineStatus = assistantOfflineStatus({ definition: selected?.definition,
    installed: Boolean(selected?.state.install),
    runtimeAvailable: Boolean(nativeRuntimeAvailable && selected?.state.compatibility.compatible && selected.state.compatibility.runtimeId) });
  const available = offlineStatus === 'ready';

  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, []);
  useEffect(() => {
    controllerRef.current?.abort(); controllerRef.current = null;
    dispatchChat({ type: 'sync', ownerKey, revision: workspace?.revision ?? 0 });
    setPendingQuestion(null); setPrepared(null); setRequest(''); setError('');
    if (!applyGuard.current) setBusy('');
  }, [ownerKey, workspace?.revision]);

  function append(scope: AssistantChatScope, role: 'user' | 'assistant', text: string) {
    dispatchChat({ type: 'append', scope, role, text });
  }
  function scopeIsCurrent(scope: AssistantChatScope) {
    return scope.ownerKey === workspaceScopeRef.current.ownerKey &&
      scope.revision === workspaceScopeRef.current.revision && scope.epoch === chatRef.current.epoch;
  }
  function startNewRequest() {
    if (applyGuard.current) return;
    controllerRef.current?.abort(); controllerRef.current = null;
    setBusy(''); setRequest(''); setPendingQuestion(null); setPrepared(null); setError('');
  }
  function newChat() {
    if (applyGuard.current) return;
    startNewRequest(); dispatchChat({ type: 'reset' });
  }

  async function send() {
    if (!workspace || !ownerKey || !ready || busy || controllerRef.current || applyGuard.current) return;
    if (chat.ownerKey !== ownerKey || chat.revision !== workspace.revision) return;
    const text = request.trim();
    if (!text) return;
    const scope: AssistantChatScope = { ownerKey, revision: workspace.revision, epoch: chat.epoch };
    const now = Date.now();
    const clarificationScope = { ownerKey, revision: workspace.revision, now, currentDate: localDateKeyFromTimestamp(now) };
    const userRequest = pendingQuestion?.userRequest ?? text;
    let clarificationAnswers: AssistantClarificationAnswers | undefined;
    append(scope, 'user', text); setRequest(''); setError(''); setPrepared(null);
    if (pendingQuestion) {
      const resolved = answerAssistantClarification(pendingQuestion, text, workspace, clarificationScope);
      if (resolved.kind !== 'resolved') {
        append(scope, 'assistant', resolved.message);
        if (resolved.kind === 'expired') setPendingQuestion(null);
        return;
      }
      clarificationAnswers = resolved.answers;
    } else {
      const reply = tryAssistantPlanningReply(text, workspace, now) ?? tryAssistantPlanMathReply(text) ?? tryAssistantChatReply(text, offlineStatus);
      if (reply) { append(scope, 'assistant', reply); return; }
    }
    const controller = new AbortController(); controllerRef.current = controller; setBusy('prepare');
    const isCurrent = () => !controller.signal.aborted && controllerRef.current === controller && scopeIsCurrent(scope);
    try {
      const args = { workspace, userRequest, currentRoute: '/(app)/settings/ai-assistant', signal: controller.signal, now, clarificationAnswers };
      const hasRuleDecision = checkAssistantRequestGrounding({ workspace, userRequest, currentDate: clarificationScope.currentDate, clarificationAnswers }) !== null ||
        tryBuildMyelinMiniFastDecision({ workspace, userRequest, requestId: 'screen-rule-check', currentDate: clarificationScope.currentDate, clarificationAnswers }) !== null;
      if (snapshot.selectedModelId === 'functiongemma-270m' && available && !hasRuleDecision) {
        const next = await prepareAssistantActions(args);
        if (!isCurrent()) return;
        setPrepared(next); setPendingQuestion(null);
        append(scope, 'assistant', 'I prepared a proposal. Review the details below, then confirm if they look right.');
      } else {
        const decision = await prepareAssistantDecision(args);
        if (!isCurrent()) return;
        if (decision.route === 'actions') {
          setPrepared(decision.prepared); setPendingQuestion(null);
          append(scope, 'assistant', 'I prepared a proposal. Review the details below, then confirm if they look right.');
        } else {
          const nextQuestion = beginAssistantClarification(userRequest, decision, clarificationScope, clarificationAnswers, pendingQuestion);
          setPendingQuestion(nextQuestion);
          const reply = decision.route === 'clarify' ? decision.question : decision.note;
          append(scope, 'assistant', reply + (decision.route === 'clarify' && !nextQuestion ? ' Send a complete revised request to continue.' :
            decision.route === 'escalate' && ['tutoring', 'general-knowledge', 'complex-reasoning'].includes(decision.reason)
              ? ' A teaching model is not connected in this beta. I can help with supported app tasks and app guidance.' : ''));
        }
      }
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof AssistantGroundingError) {
        const decision = { route: 'clarify' as const, confidence: 1, ...cause.clarification, modelId: 'myelin-request-grounding-v1' };
        const nextQuestion = beginAssistantClarification(userRequest, decision, clarificationScope, clarificationAnswers, pendingQuestion);
        setPendingQuestion(nextQuestion);
        append(scope, 'assistant', decision.question + (nextQuestion ? '' : ' Send a complete revised request to continue.'));
      } else {
        append(scope, 'assistant', 'I could not prepare this request. Nothing was changed. Try a supported task request or ask “What can you do?”');
      }
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(''); }
    }
  }

  async function apply() {
    if (!workspace || !ownerKey || !prepared?.preview.hasMutations || busy || applyGuard.current) return;
    const scope: AssistantChatScope = { ownerKey, revision: workspace.revision, epoch: chat.epoch };
    if (!scopeIsCurrent(scope)) return;
    applyGuard.current = true; setBusy('apply'); setError('');
    try {
      const applied = applyPreparedAssistantActionBatch(workspace, prepared, prepared.confirmationKey);
      await commitAssistantWorkspace(applied.nextWorkspace, prepared.sourceRevision);
      dispatchChat({ type: 'committed', scope, text: `Done — applied ${applied.results.length} ${applied.results.length === 1 ? 'change' : 'changes'} to MYELIN.` });
      if (scope.ownerKey === workspaceScopeRef.current.ownerKey && scope.epoch === chatRef.current.epoch) {
        setPrepared(null); setPendingQuestion(null); setRequest('');
      }
    } catch (cause) {
      if (scopeIsCurrent(scope)) setError(cause instanceof Error ? cause.message : 'Could not apply these changes. Send the request again for a fresh preview.');
    } finally { applyGuard.current = false; setBusy(''); }
  }

  if (!workspace) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>Opening MYELIN…</Text></View></SafeAreaView>;
  const hasMessages = chat.ownerKey === ownerKey && chat.messages.length > 0;
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="MYELIN assistant" variant="compact" onBack={() => router.back()} actionLabel="New chat" onAction={newChat} />
        <View style={styles.chatStatus}>
          <View style={styles.statusCopy}>
            <Text style={styles.chatStatusTitle}>Tasks, routines and plan checks</Text>
            <Text style={styles.statusText}>{available ? 'Offline actions available · General chat is not connected' : 'Basic task help · Qwen and general chat are not connected'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Manage AI models" onPress={() => router.push('/(app)/settings/ai-models')} style={styles.modelLink}>
            <Text style={styles.modelLinkText}>Models</Text>
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
          {!hasMessages ? (
            <View style={styles.chatWelcome}>
              <Text style={styles.welcomeTitle}>What do you need to get done?</Text>
              <Text style={styles.welcomeText}>Tell me about work to finish or your weekly routine. Ask “Review my plan” to check recorded deadlines, overlaps and workload. I’ll show a preview before changing anything.</Text>
              <View style={styles.examples}>
                {EXAMPLES.map(example => <Pressable key={example} accessibilityRole="button" onPress={() => setRequest(example)} style={({ pressed }) => [styles.example, pressed && styles.pressed]}>
                  <Text style={styles.exampleText}>{example}</Text><Text style={styles.arrow}>↗</Text>
                </Pressable>)}
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/settings/ai-syllabus')} style={styles.example}>
                <Text style={styles.exampleText}>Open syllabus import</Text><Text style={styles.arrow}>→</Text>
              </Pressable>
            </View>
          ) : chat.messages.map(message => (
            <View key={message.id} style={[styles.chatBubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={styles.bubbleLabel}>{message.role === 'user' ? 'YOU' : 'MYELIN'}</Text>
              <Text selectable accessibilityLiveRegion={message.role === 'assistant' ? 'polite' : 'none'} style={styles.bubbleText}>{message.text}</Text>
            </View>
          ))}
          {busy === 'prepare' ? <Text accessibilityLiveRegion="polite" style={styles.modelMessage}>Preparing your request…</Text> : null}
          {prepared ? (
            <View testID="assistant-chat-action-preview" style={styles.previewCard}>
              <Text style={styles.previewKicker}>REVIEW BEFORE APPLYING</Text>
              <Text style={styles.previewTitle}>{previewLabel(prepared)}</Text>
              <View style={styles.results}>
                {prepared.preview.results.map((result, index) => (
                  <View key={`${result.type}:${index}`} style={styles.resultRow}>
                    <Text style={styles.resultNumber}>{index + 1}</Text>
                    <View style={styles.resultCopy}>
                      <Text selectable style={styles.resultSummary}>{result.summary}</Text>
                      <TaskPreviewDetails prepared={prepared} index={index} />
                      {result.type === 'generate_exam_plan' && isAssistantExamPlanSummary(result.data) ? <ExamPlanPreview plan={result.data} /> : null}
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.modelMessage}>Nothing changes until you confirm.</Text>
              <View style={styles.previewActions}>
                <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => { setPrepared(null); setError(''); append(chat, 'assistant', 'Proposal dismissed. Send a revised request whenever you’re ready.'); }}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Dismiss</Text></Pressable>
                {prepared.preview.hasMutations ? <Pressable accessibilityRole="button" accessibilityLabel="Confirm proposed changes" disabled={Boolean(busy)} onPress={() => void apply()}
                  style={({ pressed }) => [styles.primaryButton, Boolean(busy) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy === 'apply' ? 'Applying…' : 'Confirm changes'}</Text></Pressable>
                  : <View style={styles.readOnlyBox}><Text style={styles.readOnlyText}>No changes to apply</Text></View>}
              </View>
            </View>
          ) : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.composer}>
          {pendingQuestion ? <View style={styles.answerHint}>
            <Text style={styles.answerHintText}>Reply to my question below</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Start a different request" disabled={Boolean(busy)} onPress={startNewRequest} style={styles.modelLink}><Text style={styles.modelLinkText}>Different request</Text></Pressable>
          </View> : null}
          <View style={styles.composerRow}>
            <TextInput testID="assistant-chat-composer" accessibilityLabel={pendingQuestion ? "Answer MYELIN's question" : 'Message MYELIN'} multiline maxLength={pendingQuestion ? 300 : 2000}
              value={request} editable={!busy} onChangeText={value => { setRequest(value); setError(''); }}
              placeholder={pendingQuestion ? pendingQuestion.field === 'estimatedMinutes' ? 'e.g. 45 minutes' : pendingQuestion.field === 'dueDate' ? 'e.g. tomorrow or YYYY-MM-DD' : pendingQuestion.field === 'subject' ? 'e.g. Biology' : pendingQuestion.field === 'recurrenceDays' ? 'e.g. weekdays or Mon, Wed, Fri' : pendingQuestion.field === 'timeRange' ? 'e.g. 5:30 AM to 2 PM' : 'Exact existing topic name' : 'Message MYELIN…'}
              placeholderTextColor={colors.subtle} style={styles.chatInput} textAlignVertical="top" />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!ready || !request.trim() || Boolean(busy)} onPress={() => void send()}
              style={({ pressed }) => [styles.sendButton, (!ready || !request.trim() || Boolean(busy)) && styles.disabled, pressed && styles.pressed]}><Text style={styles.prepareButtonText}>Send</Text></Pressable>
          </View>
          {busy === 'prepare' ? <Pressable accessibilityRole="button" onPress={startNewRequest} style={styles.modelLink}><Text style={styles.modelLinkText}>Cancel request</Text></Pressable> :
            <Text style={styles.composerNote}>Changes always need your confirmation · Chat stays on this screen</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chatStatus: { marginHorizontal: spacing.lg, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatStatusTitle: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  modelLink: { minHeight: layout.minTouch, paddingHorizontal: 8, justifyContent: 'center' },
  modelLinkText: { color: colors.accent, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  chatContent: { width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: 12, gap: 14 },
  chatWelcome: { paddingVertical: 16, gap: 14 },
  welcomeTitle: { color: colors.text, fontSize: 24, lineHeight: 31, fontWeight: '800' },
  welcomeText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  chatBubble: { maxWidth: '94%', borderRadius: radius.lg, padding: 14, gap: 6 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(255,128,91,0.22)' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  bubbleLabel: { color: colors.subtle, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.6 },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  composer: { paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, gap: 5 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: { flex: 1, minHeight: layout.minTouch, maxHeight: 130, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 14, lineHeight: 21, paddingHorizontal: 12, paddingVertical: 12 },
  sendButton: { minHeight: layout.minTouch, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  composerNote: { color: colors.subtle, fontSize: 10, lineHeight: 15, paddingTop: 3 },
  answerHint: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  answerHintText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  statusCopy: { flex: 1 },
  statusText: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  prepareButtonText: { color: '#150B08', fontSize: 12, fontWeight: '900' },
  examples: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  example: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exampleText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 18 },
  arrow: { color: colors.accent, fontSize: 17 },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.32)',
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  previewKicker: { color: colors.accent, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.55 },
  previewTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 4 },
  results: { marginTop: 13 },
  resultRow: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 11,
  },
  resultNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    fontSize: 10.5,
    fontWeight: '900',
  },
  resultCopy: { flex: 1 },
  resultSummary: { color: colors.text, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  plan: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 12,
  },
  planHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planHeadingCopy: { flex: 1 },
  planEyebrow: { color: colors.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.55 },
  planTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 3 },
  planStrain: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.45,
    overflow: 'hidden',
  },
  planStrainHot: { color: colors.danger, backgroundColor: 'rgba(255,165,150,0.09)' },
  planStrainCalm: { color: colors.success, backgroundColor: 'rgba(184,221,177,0.08)' },
  planStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  planStat: {
    width: '48%',
    minHeight: 66,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    padding: 9,
  },
  planStatLabel: { color: colors.subtle, fontSize: 8.5, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4 },
  planStatValue: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 3 },
  planStatMeta: { color: colors.muted, fontSize: 9.5, lineHeight: 13, marginTop: 2 },
  planDanger: { color: colors.danger },
  ledgerSummary: {
    marginTop: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 9,
  },
  ledgerSummaryTitle: { color: colors.accent, fontSize: 8.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.45 },
  ledgerSummaryText: { color: colors.textDim, fontSize: 10, lineHeight: 15, marginTop: 3 },
  mileageStrip: {
    flexDirection: 'row',
    marginTop: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  mileageItem: { flex: 1, minHeight: 49, padding: 8, justifyContent: 'center' },
  mileageLabel: { color: colors.subtle, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.35 },
  mileageValue: { color: colors.textDim, fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  capacityBreak: {
    marginTop: 11,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.20)',
    backgroundColor: 'rgba(255,165,150,0.055)',
    padding: 10,
  },
  capacityBreakKicker: { color: colors.danger, fontSize: 8.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.5 },
  capacityBreakTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 4 },
  capacityBreakText: { color: colors.textDim, fontSize: 10, lineHeight: 15, marginTop: 4 },
  reliefList: { marginTop: 9 },
  reliefRow: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
  },
  reliefMinutes: { width: 42, color: colors.accent, fontSize: 10, lineHeight: 15, fontWeight: '900' },
  reliefCopy: { flex: 1 },
  reliefLabel: { color: colors.textDim, fontSize: 10.5, lineHeight: 15, fontWeight: '700' },
  reliefMeta: { color: colors.subtle, fontSize: 9, lineHeight: 13, marginTop: 1 },
  planWarnings: {
    marginTop: 11,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,165,150,0.055)',
    padding: 9,
  },
  planSubhead: { color: colors.subtle, fontSize: 8.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.5 },
  warningRow: { flexDirection: 'row', gap: 6, marginTop: 5 },
  warningDot: { color: colors.danger, fontSize: 11, lineHeight: 15 },
  warningText: { flex: 1, color: colors.textDim, fontSize: 10, lineHeight: 15 },
  planSection: { marginTop: 12 },
  examRow: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  examCopy: { flex: 1 },
  examName: { color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  examMeta: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 2 },
  examFit: { color: colors.success, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  dayCard: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 9,
  },
  dayTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  dayDate: { color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  dayCapacity: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 1 },
  dayStrain: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  dayBlocks: { marginTop: 7, gap: 6 },
  blockRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  blockMinutes: { width: 39, color: colors.accent, fontSize: 10, lineHeight: 15, fontWeight: '900' },
  blockCopy: { flex: 1 },
  blockTopic: { color: colors.textDim, fontSize: 10.5, lineHeight: 15, fontWeight: '700' },
  blockMeta: { color: colors.subtle, fontSize: 9, lineHeight: 13, marginTop: 1 },
  moreBlocks: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginLeft: 47 },
  moreDays: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  emptyPlanText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 7 },
  previewActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: { color: '#150B08', fontSize: 12, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  readOnlyBox: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  readOnlyText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  modelMessage: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
});

