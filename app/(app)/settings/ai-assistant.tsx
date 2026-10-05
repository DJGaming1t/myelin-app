import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const EXAMPLES = [
  'Add Quadratic Equations as a Maths topic.',
  'Create a Science revision task for Magnetic Effects of Electric Current.',
  'Make an exam plan from my upcoming exams.',
] as const;

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
  const { workspace, commitAssistantWorkspace } = useWorkspace();
  const {
    snapshot,
    models,
    prepareAssistantActions,
    message: modelMessage,
    error: modelError,
  } = useLocalAi();
  const [request, setRequest] = useState('');
  const [prepared, setPrepared] = useState<PreparedAssistantActionBatch | null>(null);
  const [busy, setBusy] = useState<'prepare' | 'apply' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => models.find((model) => model.definition.id === snapshot.selectedModelId) ?? null,
    [models, snapshot.selectedModelId],
  );
  const installed = Boolean(selected?.state.install);
  const available = Boolean(selected && installed && selected.state.compatibility.runtimeId);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.muted}>Opening MYELIN AI…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;

  async function prepare() {
    const userRequest = request.trim();
    if (!userRequest || !available || busy) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy('prepare');
    setPrepared(null);
    setNotice('');
    setError('');

    try {
      const next = await prepareAssistantActions({
        workspace: currentWorkspace,
        userRequest,
        currentRoute: '/(app)/settings/ai-assistant',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPrepared(next);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The local assistant could not prepare these actions.');
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy('');
    }
  }

  async function apply() {
    if (!prepared || !prepared.preview.hasMutations || busy) return;
    setBusy('apply');
    setError('');
    setNotice('');

    try {
      const applied = applyPreparedAssistantActionBatch(
        currentWorkspace,
        prepared,
        prepared.confirmationKey,
      );
      await commitAssistantWorkspace(applied.nextWorkspace, prepared.sourceRevision);
      setPrepared(null);
      setRequest('');
      setNotice(
        `Applied ${applied.results.length} ${applied.results.length === 1 ? 'change' : 'changes'} to MYELIN.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'MYELIN could not apply those actions. Preview them again.',
      );
    } finally {
      setBusy('');
    }
  }

  function useExample(value: string) {
    if (busy) return;
    setRequest(value);
    setPrepared(null);
    setNotice('');
    setError('');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Ask local AI"
          eyebrow="MYELIN AI"
          onBack={() => router.back()}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <View style={styles.statusCopy}>
              <Text style={styles.statusKicker}>SELECTED MODEL</Text>
              <Text style={styles.statusName}>{selected?.definition.shortName ?? 'None'}</Text>
              <Text style={styles.statusText}>
                {available
                  ? 'Runs on this device. MYELIN validates every proposed action before anything can change.'
                  : 'Choose and install a compatible local model first.'}
              </Text>
            </View>
            <Text style={[styles.statusBadge, available ? styles.readyBadge : styles.blockedBadge]}>
              {available ? 'READY' : 'NOT READY'}
            </Text>
          </View>

          {!available ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(app)/settings/ai-models')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Manage AI models</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.requestCard}>
                <Text style={styles.sectionTitle}>WHAT SHOULD MYELIN INTERPRET?</Text>
                <TextInput
                  accessibilityLabel="Local AI request"
                  multiline
                  maxLength={2000}
                  value={request}
                  editable={!busy}
                  onChangeText={(value) => {
                    setRequest(value);
                    setPrepared(null);
                    setNotice('');
                    setError('');
                  }}
                  placeholder="Example: Add Quadratic Equations as a Maths topic."
                  placeholderTextColor={colors.subtle}
                  style={styles.input}
                  textAlignVertical="top"
                />
                <View style={styles.requestFooter}>
                  <Text style={styles.counter}>{request.length}/2000</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!request.trim() || Boolean(busy)}
                    onPress={() => void prepare()}
                    style={({ pressed }) => [
                      styles.prepareButton,
                      (!request.trim() || Boolean(busy)) && styles.disabled,
                      pressed && !busy && styles.pressed,
                    ]}>
                    <Text style={styles.prepareButtonText}>
                      {busy === 'prepare' ? 'Thinking locally…' : 'Preview actions'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {!prepared ? (
                <View style={styles.examples}>
                  <Text style={styles.sectionTitle}>TRY A REQUEST</Text>
                  {EXAMPLES.map((example) => (
                    <Pressable
                      key={example}
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      onPress={() => useExample(example)}
                      style={({ pressed }) => [styles.example, pressed && styles.pressed]}>
                      <Text style={styles.exampleText}>{example}</Text>
                      <Text style={styles.arrow}>→</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewHeaderCopy}>
                      <Text style={styles.previewKicker}>REVIEW BEFORE APPLYING</Text>
                      <Text style={styles.previewTitle}>{previewLabel(prepared)}</Text>
                    </View>
                    <Text style={styles.previewBadge}>PREVIEW</Text>
                  </View>

                  <View style={styles.results}>
                    {prepared.preview.results.map((result, index) => (
                      <View key={`${result.type}:${index}`} style={styles.resultRow}>
                        <Text style={styles.resultNumber}>{index + 1}</Text>
                        <View style={styles.resultCopy}>
                          <Text style={styles.resultType}>
                            {result.type.replaceAll('_', ' ').toUpperCase()}
                          </Text>
                          <Text style={styles.resultSummary}>{result.summary}</Text>
                          {result.type === 'generate_exam_plan' &&
                          isAssistantExamPlanSummary(result.data) ? (
                            <ExamPlanPreview plan={result.data} />
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={styles.guardrail}>
                    <Text style={styles.guardrailTitle}>MYELIN stays in control</Text>
                    <Text style={styles.guardrailText}>
                      The model interprets your request. MYELIN validates IDs, limits and data changes. Exam scheduling is calculated by MYELIN's deterministic planner, not by the model.
                    </Text>
                  </View>

                  <View style={styles.previewActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      onPress={() => {
                        setPrepared(null);
                        setNotice('');
                        setError('');
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && !busy && styles.pressed]}>
                      <Text style={styles.secondaryButtonText}>Edit request</Text>
                    </Pressable>

                    {prepared.preview.hasMutations ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Apply local AI proposed changes"
                        disabled={Boolean(busy)}
                        onPress={() => void apply()}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          Boolean(busy) && styles.disabled,
                          pressed && !busy && styles.pressed,
                        ]}>
                        <Text style={styles.primaryButtonText}>
                          {busy === 'apply' ? 'Applying…' : 'Apply changes'}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={styles.readOnlyBox}>
                        <Text style={styles.readOnlyText}>No data changes to apply.</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {!error && modelError ? <Text style={styles.error}>{modelError}</Text> : null}
          {!notice && modelMessage ? <Text style={styles.modelMessage}>{modelMessage}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 72,
    gap: 14,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusCopy: { flex: 1 },
  statusKicker: { color: colors.subtle, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  statusName: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '800', marginTop: 4 },
  statusText: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  statusBadge: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  readyBadge: { color: colors.success, backgroundColor: 'rgba(116,201,152,0.10)' },
  blockedBadge: { color: colors.subtle, backgroundColor: colors.bg },
  requestCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  sectionTitle: { color: colors.subtle, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.65 },
  input: {
    minHeight: 118,
    maxHeight: 230,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  requestFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  counter: { flex: 1, color: colors.subtle, fontSize: 10.5 },
  prepareButton: {
    minHeight: layout.minTouch,
    minWidth: 132,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  previewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  previewHeaderCopy: { flex: 1 },
  previewKicker: { color: colors.accent, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.55 },
  previewTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 4 },
  previewBadge: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
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
  resultType: { color: colors.subtle, fontSize: 9.5, lineHeight: 13, fontWeight: '800', letterSpacing: 0.45 },
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
  guardrail: {
    marginTop: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: 11,
  },
  guardrailTitle: { color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  guardrailText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
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
  success: { color: colors.success, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  modelMessage: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
});
