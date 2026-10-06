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
import { applyPreparedAssistantActionBatch } from '@/src/features/assistant/assistant-action-session';
import { useLocalAi } from '@/src/features/assistant/local-ai/LocalAiProvider';
import {
  PreparedSyllabusImport,
  SyllabusPriority,
  SyllabusReviewTopicDraft,
  SyllabusTopicStatus,
  prepareReviewedSyllabusImport,
} from '@/src/features/assistant/local-ai/syllabus-intake';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type EditableReviewTopic = {
  key: string;
  subject: string;
  name: string;
  minutes: string;
  priority: SyllabusPriority | null;
  status: SyllabusTopicStatus | null;
};

const PRIORITIES: Array<{ label: string; value: SyllabusPriority | null }> = [
  { label: 'Auto', value: null },
  { label: 'Low', value: 1 },
  { label: 'Normal', value: 2 },
  { label: 'High', value: 3 },
];

const STATUSES: Array<{ label: string; value: SyllabusTopicStatus | null }> = [
  { label: 'Auto', value: null },
  { label: 'New', value: 'new' },
  { label: 'Learning', value: 'learning' },
  { label: 'Review', value: 'review' },
];

function toReviewTopics(
  prepared: PreparedSyllabusImport,
  makeKey: () => string,
): EditableReviewTopic[] {
  return prepared.subjects.flatMap((subject) =>
    subject.topics.map((topic) => ({
      key: makeKey(),
      subject: subject.name,
      name: topic.name,
      minutes: topic.estimatedMinutes == null ? '' : String(topic.estimatedMinutes),
      priority: topic.priority,
      status: topic.status,
    })),
  );
}

function toReviewedDrafts(topics: EditableReviewTopic[]): SyllabusReviewTopicDraft[] {
  return topics.map((topic) => ({
    subject: topic.subject,
    name: topic.name,
    estimatedMinutes: topic.minutes.trim() ? Number(topic.minutes.trim()) : null,
    priority: topic.priority,
    status: topic.status,
  }));
}

export default function LocalAiSyllabusScreen() {
  const { workspace, commitAssistantWorkspace } = useWorkspace();
  const {
    snapshot,
    models,
    prepareSyllabusImport,
    message: modelMessage,
    error: modelError,
  } = useLocalAi();

  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [prepared, setPrepared] = useState<PreparedSyllabusImport | null>(null);
  const [completedPlan, setCompletedPlan] = useState<
    PreparedSyllabusImport['autopilotPlan'] | null
  >(null);
  const [reviewTopics, setReviewTopics] = useState<EditableReviewTopic[]>([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [busy, setBusy] = useState<'prepare' | 'validate' | 'apply' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const nextReviewKeyRef = useRef(1);

  const selected = useMemo(
    () => models.find((model) => model.definition.id === snapshot.selectedModelId) ?? null,
    [models, snapshot.selectedModelId],
  );
  const available = Boolean(
    selected?.state.install && selected.state.compatibility.runtimeId,
  );

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
          <Text style={styles.muted}>Opening syllabus import…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;
  const canPrepare =
    available &&
    examName.trim().length > 0 &&
    examDate.trim().length > 0 &&
    sourceText.trim().length > 0 &&
    !busy;

  function makeReviewKey() {
    const value = nextReviewKeyRef.current;
    nextReviewKeyRef.current += 1;
    return `review-topic-${value}`;
  }

  function resetPreview() {
    setPrepared(null);
    setReviewTopics([]);
    setReviewDirty(false);
    setNotice('');
    setError('');
  }

  function markReviewDirty() {
    setReviewDirty(true);
    setNotice('');
    setError('');
  }

  function editReviewTopic(
    key: string,
    patch: Partial<Omit<EditableReviewTopic, 'key'>>,
  ) {
    setReviewTopics((current) =>
      current.map((topic) => (topic.key === key ? { ...topic, ...patch } : topic)),
    );
    markReviewDirty();
  }

  function removeReviewTopic(key: string) {
    setReviewTopics((current) => current.filter((topic) => topic.key !== key));
    markReviewDirty();
  }

  function addReviewTopic() {
    setReviewTopics((current) => [
      ...current,
      {
        key: makeReviewKey(),
        subject: current[0]?.subject || 'Unsorted',
        name: '',
        minutes: '',
        priority: null,
        status: null,
      },
    ]);
    markReviewDirty();
  }

  async function prepare() {
    if (!canPrepare) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy('prepare');
    setPrepared(null);
    setCompletedPlan(null);
    setReviewTopics([]);
    setReviewDirty(false);
    setNotice('');
    setError('');

    try {
      const next = await prepareSyllabusImport({
        workspace: currentWorkspace,
        sourceText: sourceText.trim(),
        examName: examName.trim(),
        examDate: examDate.trim(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPrepared(next);
      setReviewTopics(toReviewTopics(next, makeReviewKey));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'MYELIN could not prepare this syllabus import.',
        );
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy('');
    }
  }

  function rebuildReviewedImport() {
    if (!prepared) {
      throw new Error('Preview the syllabus before reviewing it.');
    }
    return prepareReviewedSyllabusImport({
      workspace: currentWorkspace,
      examName: prepared.examName,
      examDate: prepared.examDate,
      sourceChunkCount: prepared.sourceChunkCount,
      topics: toReviewedDrafts(reviewTopics),
    });
  }

  function validateReview() {
    if (!prepared || busy) return;
    setBusy('validate');
    setError('');
    setNotice('');

    try {
      const next = rebuildReviewedImport();
      setPrepared(next);
      setReviewDirty(false);
      setNotice('Review validated. MYELIN rebuilt the import from your edited values.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'MYELIN could not validate these syllabus edits.',
      );
    } finally {
      setBusy('');
    }
  }

  async function apply() {
    if (!prepared || reviewDirty || busy) return;
    setBusy('apply');
    setError('');
    setNotice('');

    try {
      const latest = rebuildReviewedImport();
      const batch = latest.prepared;
      const applied = applyPreparedAssistantActionBatch(
        currentWorkspace,
        batch,
        batch.confirmationKey,
      );
      await commitAssistantWorkspace(applied.nextWorkspace, batch.sourceRevision);
      setCompletedPlan(latest.autopilotPlan);
      setPrepared(null);
      setReviewTopics([]);
      setReviewDirty(false);
      setSourceText('');
      setExamName('');
      setExamDate('');
      setNotice(
        `Imported ${latest.newTopicCount} new ${latest.newTopicCount === 1 ? 'topic' : 'topics'} and created ${latest.examName}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'MYELIN could not apply this import. Validate the review again.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Import syllabus"
          eyebrow="MYELIN AI"
          onBack={() => router.back()}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <View style={styles.grow}>
              <Text style={styles.kicker}>LOCAL EXTRACTION</Text>
              <Text style={styles.statusTitle}>
                {selected?.definition.shortName ?? 'No model selected'}
              </Text>
              <Text style={styles.body}>
                MYELIN lets the model read the syllabus, then converts the result
                into a validated preview. You can correct that preview before
                anything changes.
              </Text>
            </View>
            <Text style={[styles.badge, available ? styles.ready : styles.blocked]}>
              {available ? 'READY' : 'NOT READY'}
            </Text>
          </View>

          {!available ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(app)/settings/ai-models')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Manage AI models</Text>
            </Pressable>
          ) : (
            <>
              {!prepared ? (
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>EXAM DETAILS</Text>
                  <TextInput
                    accessibilityLabel="Exam name"
                    editable={!busy}
                    maxLength={200}
                    value={examName}
                    onChangeText={(value) => {
                      setExamName(value);
                      setNotice('');
                      setError('');
                    }}
                    placeholder="Example: Half Yearly"
                    placeholderTextColor={colors.subtle}
                    style={styles.singleInput}
                  />
                  <TextInput
                    accessibilityLabel="Exam date"
                    editable={!busy}
                    value={examDate}
                    onChangeText={(value) => {
                      setExamDate(value);
                      setNotice('');
                      setError('');
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.subtle}
                    autoCapitalize="none"
                    style={styles.singleInput}
                  />

                  <Text style={[styles.sectionTitle, styles.sourceTitle]}>SYLLABUS TEXT</Text>
                  <TextInput
                    accessibilityLabel="Syllabus text"
                    multiline
                    editable={!busy}
                    maxLength={24000}
                    value={sourceText}
                    onChangeText={(value) => {
                      setSourceText(value);
                      setNotice('');
                      setError('');
                    }}
                    placeholder={'Paste the syllabus text here.\n\nExample:\nMathematics\nReal Numbers\nPolynomials'}
                    placeholderTextColor={colors.subtle}
                    style={styles.sourceInput}
                    textAlignVertical="top"
                  />
                  <View style={styles.formFooter}>
                    <Text style={styles.counter}>
                      {sourceText.length.toLocaleString()}/24,000
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canPrepare}
                      onPress={() => void prepare()}
                      style={({ pressed }) => [
                        styles.prepareButton,
                        !canPrepare && styles.disabled,
                        pressed && canPrepare && styles.pressed,
                      ]}>
                      <Text style={styles.primaryText}>
                        {busy === 'prepare' ? 'Reading locally…' : 'Preview import'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.previewCard} testID="syllabus-import-preview">
                  <View style={styles.previewTop}>
                    <View style={styles.grow}>
                      <Text style={styles.previewKicker}>EDITABLE REVIEW</Text>
                      <Text style={styles.previewTitle}>{prepared.examName}</Text>
                      <Text style={styles.body}>{prepared.examDate}</Text>
                    </View>
                    <Text
                      style={[
                        styles.previewBadge,
                        reviewDirty && styles.previewBadgeDirty,
                      ]}>
                      {reviewDirty ? 'EDITED' : 'VALIDATED'}
                    </Text>
                  </View>

                  <View style={styles.stats}>
                    <Stat label="TOPICS" value={String(reviewTopics.length)} />
                    <Stat
                      label="NEW"
                      value={reviewDirty ? '—' : String(prepared.newTopicCount)}
                    />
                    <Stat
                      label="REUSED"
                      value={reviewDirty ? '—' : String(prepared.existingTopicCount)}
                    />
                    <Stat label="CHUNKS" value={String(prepared.sourceChunkCount)} />
                  </View>

                  {reviewDirty ? (
                    <View style={styles.dirtyBox}>
                      <Text style={styles.dirtyTitle}>CHANGES NEED VALIDATION</Text>
                      <Text style={styles.dirtyText}>
                        MYELIN will rebuild the proposed topics and exam from these
                        fields before Apply is enabled.
                      </Text>
                    </View>
                  ) : prepared.warnings.length ? (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningTitle}>CHECK THESE FIRST</Text>
                      {prepared.warnings.map((warning) => (
                        <View key={warning} style={styles.warningRow}>
                          <Text style={styles.warningDot}>•</Text>
                          <Text style={styles.warningText}>{warning}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {!reviewDirty ? (
                    <AutopilotPlanCard
                      plan={prepared.autopilotPlan}
                      title="First preparation plan"
                      subtitle="Calculated from this reviewed syllabus before anything is saved."
                    />
                  ) : null}

                  <View style={styles.reviewIntro}>
                    <Text style={styles.sectionTitle}>REVIEW TOPICS</Text>
                    <Text style={styles.reviewIntroText}>
                      Fix model mistakes here. Subject changes apply per topic, so
                      one misplaced topic can move without changing the rest.
                    </Text>
                  </View>

                  <View style={styles.subjects}>
                    {reviewTopics.map((topic, index) => (
                      <View key={topic.key} style={styles.topicEditor}>
                        <View style={styles.topicEditorTop}>
                          <Text style={styles.topicNumber}>TOPIC {index + 1}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${topic.name || `topic ${index + 1}`}`}
                            disabled={Boolean(busy)}
                            onPress={() => removeReviewTopic(topic.key)}
                            style={({ pressed }) => [
                              styles.removeButton,
                              pressed && !busy && styles.pressed,
                            ]}>
                            <Text style={styles.removeText}>Remove</Text>
                          </Pressable>
                        </View>

                        <Text style={styles.fieldLabel}>SUBJECT</Text>
                        <TextInput
                          accessibilityLabel={`Subject for topic ${index + 1}`}
                          editable={!busy}
                          maxLength={120}
                          value={topic.subject}
                          onChangeText={(value) =>
                            editReviewTopic(topic.key, { subject: value })
                          }
                          placeholder="Subject"
                          placeholderTextColor={colors.subtle}
                          style={styles.reviewInput}
                        />

                        <Text style={styles.fieldLabel}>TOPIC NAME</Text>
                        <TextInput
                          accessibilityLabel={`Topic name ${index + 1}`}
                          editable={!busy}
                          maxLength={300}
                          value={topic.name}
                          onChangeText={(value) =>
                            editReviewTopic(topic.key, { name: value })
                          }
                          placeholder="Topic name"
                          placeholderTextColor={colors.subtle}
                          style={styles.reviewInput}
                        />

                        <View style={styles.compactFieldRow}>
                          <View style={styles.minutesField}>
                            <Text style={styles.fieldLabel}>MINUTES</Text>
                            <TextInput
                              accessibilityLabel={`Estimated minutes for ${topic.name || `topic ${index + 1}`}`}
                              editable={!busy}
                              keyboardType="number-pad"
                              maxLength={3}
                              value={topic.minutes}
                              onChangeText={(value) =>
                                editReviewTopic(topic.key, { minutes: value })
                              }
                              placeholder="45 auto"
                              placeholderTextColor={colors.subtle}
                              style={styles.reviewInput}
                            />
                          </View>
                          <View style={styles.compactHint}>
                            <Text style={styles.compactHintTitle}>Allowed</Text>
                            <Text style={styles.compactHintText}>5–240m · blank = 45m</Text>
                          </View>
                        </View>

                        <Text style={styles.fieldLabel}>PRIORITY</Text>
                        <ChoiceRow
                          items={PRIORITIES}
                          value={topic.priority}
                          disabled={Boolean(busy)}
                          onChange={(value) =>
                            editReviewTopic(topic.key, { priority: value })
                          }
                        />

                        <Text style={styles.fieldLabel}>STATUS</Text>
                        <ChoiceRow
                          items={STATUSES}
                          value={topic.status}
                          disabled={Boolean(busy)}
                          onChange={(value) =>
                            editReviewTopic(topic.key, { status: value })
                          }
                        />
                      </View>
                    ))}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busy)}
                    onPress={addReviewTopic}
                    style={({ pressed }) => [
                      styles.addTopicButton,
                      pressed && !busy && styles.pressed,
                    ]}>
                    <Text style={styles.addTopicText}>+ Add missing topic</Text>
                  </Pressable>

                  <View style={styles.guardrail}>
                    <Text style={styles.guardrailTitle}>MYELIN rebuilds after edits</Text>
                    <Text style={styles.body}>
                      Your fields are not written directly to storage. They are
                      normalized, checked for duplicates and limits, converted into
                      a fresh action batch, then passed through the same confirmation
                      boundary as the original AI extraction.
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy)}
                      onPress={resetPreview}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed && !busy && styles.pressed,
                      ]}>
                      <Text style={styles.secondaryText}>Edit source</Text>
                    </Pressable>

                    {reviewDirty ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(busy)}
                        onPress={validateReview}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          Boolean(busy) && styles.disabled,
                          pressed && !busy && styles.pressed,
                        ]}>
                        <Text style={styles.primaryText}>
                          {busy === 'validate' ? 'Validating…' : 'Validate changes'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Apply reviewed syllabus import"
                        disabled={Boolean(busy)}
                        onPress={() => void apply()}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          Boolean(busy) && styles.disabled,
                          pressed && !busy && styles.pressed,
                        ]}>
                        <Text style={styles.primaryText}>
                          {busy === 'apply' ? 'Applying…' : 'Apply import'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {notice}
            </Text>
          ) : null}

          {completedPlan ? (
            <AutopilotPlanCard
              plan={completedPlan}
              title="Autopilot is ready"
              subtitle="This is MYELIN's first capacity-aware plan for the imported exam."
              applied
            />
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {!error && modelError ? <Text style={styles.error}>{modelError}</Text> : null}
          {!notice && modelMessage ? <Text style={styles.muted}>{modelMessage}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function minutesLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function planDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function strainText(
  strain: PreparedSyllabusImport['autopilotPlan']['strain'],
) {
  return strain === 'overloaded'
    ? 'Overloaded'
    : strain === 'tight'
      ? 'Tight'
      : strain === 'balanced'
        ? 'Balanced'
        : 'Comfortable';
}

function AutopilotPlanCard({
  plan,
  title,
  subtitle,
  applied = false,
}: {
  plan: PreparedSyllabusImport['autopilotPlan'];
  title: string;
  subtitle: string;
  applied?: boolean;
}) {
  const activeDays = plan.days.filter((day) => day.blocks.length > 0);
  const visibleDays = activeDays.slice(0, 5);
  const required = plan.feasibility.totalRequiredMinutes;
  const capacity = plan.feasibility.totalCapacityMinutes;
  const shortfall = plan.feasibility.totalOverloadMinutes;

  return (
    <View
      testID={applied ? 'syllabus-autopilot-applied' : 'syllabus-autopilot-preview'}
      style={styles.autopilotCard}>
      <View style={styles.autopilotTop}>
        <View style={styles.grow}>
          <Text style={styles.autopilotKicker}>MILEAGE · EXAM AUTOPILOT</Text>
          <Text style={styles.autopilotTitle}>{title}</Text>
          <Text style={styles.autopilotSubtitle}>{subtitle}</Text>
        </View>
        <Text
          style={[
            styles.autopilotStrain,
            plan.strain === 'overloaded' || plan.strain === 'tight'
              ? styles.autopilotStrainHot
              : styles.autopilotStrainCalm,
          ]}>
          {strainText(plan.strain).toUpperCase()}
        </Text>
      </View>

      <View style={styles.autopilotStats}>
        <View style={styles.autopilotStat}>
          <Text style={styles.autopilotStatLabel}>DAILY MILEAGE</Text>
          <Text style={styles.autopilotStatValue}>
            {minutesLabel(plan.capacityProfile.sustainableDailyMinutes)}
          </Text>
        </View>
        <View style={styles.autopilotStat}>
          <Text style={styles.autopilotStatLabel}>WORK REQUIRED</Text>
          <Text style={styles.autopilotStatValue}>{minutesLabel(required)}</Text>
        </View>
        <View style={styles.autopilotStat}>
          <Text style={styles.autopilotStatLabel}>SAFE CAPACITY</Text>
          <Text style={styles.autopilotStatValue}>{minutesLabel(capacity)}</Text>
        </View>
        <View style={styles.autopilotStat}>
          <Text style={styles.autopilotStatLabel}>DOESN'T FIT</Text>
          <Text
            style={[
              styles.autopilotStatValue,
              shortfall > 0 && styles.autopilotDanger,
            ]}>
            {minutesLabel(shortfall)}
          </Text>
        </View>
      </View>

      {plan.exams.length === 0 ? (
        <View style={styles.autopilotNotice}>
          <Text style={styles.autopilotNoticeTitle}>LONG-RANGE EXAM</Text>
          <Text style={styles.autopilotNoticeText}>
            This exam is outside MYELIN's current 120-day detailed planning horizon.
            The syllabus is still valid; Autopilot will calculate concrete study
            blocks once it enters that window.
          </Text>
        </View>
      ) : (
        <>
          {plan.workloadLedger.taskRemainingMinutes > 0 ||
          plan.workloadLedger.deduplicatedMinutes > 0 ? (
            <View style={styles.autopilotLedger}>
              <Text style={styles.autopilotLedgerTitle}>ONE WORKLOAD LEDGER</Text>
              <Text style={styles.autopilotLedgerText}>
                Existing tasks and this exam share the same daily mileage.
                {plan.workloadLedger.deduplicatedMinutes > 0
                  ? ` MYELIN removed ${minutesLabel(plan.workloadLedger.deduplicatedMinutes)} of duplicated work.`
                  : ''}
              </Text>
            </View>
          ) : null}

          {plan.feasibility.firstOverloadedDeadline ? (
            <View style={styles.autopilotBreak}>
              <Text style={styles.autopilotBreakKicker}>FIRST CAPACITY BREAK</Text>
              <Text style={styles.autopilotBreakTitle}>
                By {planDateLabel(plan.feasibility.firstOverloadedDeadline.deadlineAt)},
                {' '}MYELIN is short by{' '}
                {minutesLabel(plan.feasibility.firstOverloadedDeadline.overloadMinutes)}.
              </Text>
              {plan.feasibility.firstOverloadedDeadline.extraMinutesPerAvailableDay ? (
                <Text style={styles.autopilotBreakText}>
                  That would require about{' '}
                  {minutesLabel(
                    plan.feasibility.firstOverloadedDeadline.extraMinutesPerAvailableDay,
                  )}{' '}
                  extra per available day if scope and deadlines stay unchanged.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.autopilotDays}>
            <Text style={styles.autopilotDaysTitle}>FIRST PLANNED DAYS</Text>
            {visibleDays.length ? (
              visibleDays.map((day) => {
                const planned =
                  day.plannedPreparationMinutes + day.plannedRevisionMinutes;
                return (
                  <View key={day.day} style={styles.autopilotDay}>
                    <View style={styles.autopilotDayTop}>
                      <View>
                        <Text style={styles.autopilotDayDate}>
                          {planDateLabel(day.day)}
                        </Text>
                        <Text style={styles.autopilotDayMeta}>
                          {minutesLabel(planned)} planned ·{' '}
                          {minutesLabel(day.usableCapacityMinutes)} usable
                        </Text>
                      </View>
                      <Text style={styles.autopilotDayStrain}>
                        {strainText(day.strain)}
                      </Text>
                    </View>
                    {day.blocks.slice(0, 3).map((block) => (
                      <View key={block.id} style={styles.autopilotBlock}>
                        <Text style={styles.autopilotBlockMinutes}>
                          {minutesLabel(block.minutes)}
                        </Text>
                        <View style={styles.grow}>
                          <Text style={styles.autopilotBlockTopic}>
                            {block.topicName}
                          </Text>
                          <Text style={styles.autopilotBlockMeta}>
                            {block.kind === 'revision' ? 'Revision' : 'Preparation'}
                            {' · '}
                            {block.subject}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })
            ) : (
              <Text style={styles.autopilotEmpty}>
                No study blocks fit yet. Check the capacity warning above.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function ChoiceRow<T extends string | number | null>({
  items,
  value,
  disabled,
  onChange,
}: {
  items: Array<{ label: string; value: T }>;
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.choiceRow}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              pressed && !disabled && styles.pressed,
            ]}>
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
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
  grow: { flex: 1, minWidth: 0 },
  muted: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
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
  kicker: {
    color: colors.subtle,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  body: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.45,
    overflow: 'hidden',
  },
  ready: { color: colors.success, backgroundColor: 'rgba(116,201,152,0.10)' },
  blocked: { color: colors.subtle, backgroundColor: colors.bg },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.subtle,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  sourceTitle: { marginTop: 15 },
  singleInput: {
    minHeight: layout.minTouch,
    marginTop: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 12,
  },
  sourceInput: {
    minHeight: 190,
    maxHeight: 340,
    marginTop: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  formFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  counter: { flex: 1, color: colors.subtle, fontSize: 10.5 },
  prepareButton: {
    minWidth: 132,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.32)',
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  previewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  previewKicker: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  previewBadge: {
    color: colors.success,
    backgroundColor: 'rgba(116,201,152,0.10)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  previewBadgeDirty: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  stats: { flexDirection: 'row', gap: 7, marginTop: 13 },
  stat: {
    flex: 1,
    minHeight: 57,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    padding: 8,
    justifyContent: 'space-between',
  },
  statLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  dirtyBox: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.20)',
    padding: 10,
  },
  dirtyTitle: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  dirtyText: {
    color: colors.textDim,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 4,
  },
  warningBox: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,165,150,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.16)',
    padding: 10,
  },
  warningTitle: {
    color: colors.danger,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  warningRow: { flexDirection: 'row', gap: 7, marginTop: 6 },
  warningDot: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  warningText: { flex: 1, color: colors.textDim, fontSize: 10.5, lineHeight: 16 },
  autopilotCard: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.bg,
    padding: 11,
  },
  autopilotTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  autopilotKicker: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  autopilotTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  autopilotSubtitle: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  autopilotStrain: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    overflow: 'hidden',
  },
  autopilotStrainHot: {
    color: colors.danger,
    backgroundColor: 'rgba(255,165,150,0.09)',
  },
  autopilotStrainCalm: {
    color: colors.success,
    backgroundColor: 'rgba(116,201,152,0.09)',
  },
  autopilotStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
  },
  autopilotStat: {
    width: '48%',
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    padding: 8,
  },
  autopilotStatLabel: {
    color: colors.subtle,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.38,
  },
  autopilotStatValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  autopilotDanger: { color: colors.danger },
  autopilotNotice: {
    marginTop: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 9,
  },
  autopilotNoticeTitle: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  autopilotNoticeText: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  autopilotLedger: {
    marginTop: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    padding: 9,
  },
  autopilotLedgerTitle: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  autopilotLedgerText: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  autopilotBreak: {
    marginTop: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.20)',
    backgroundColor: 'rgba(255,165,150,0.055)',
    padding: 9,
  },
  autopilotBreakKicker: {
    color: colors.danger,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  autopilotBreakTitle: {
    color: colors.text,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  autopilotBreakText: {
    color: colors.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 3,
  },
  autopilotDays: { marginTop: 11 },
  autopilotDaysTitle: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  autopilotDay: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 8,
  },
  autopilotDayTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  autopilotDayDate: {
    color: colors.text,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '800',
  },
  autopilotDayMeta: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 1,
  },
  autopilotDayStrain: {
    color: colors.subtle,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  autopilotBlock: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  autopilotBlockMinutes: {
    width: 38,
    color: colors.accent,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: '900',
  },
  autopilotBlockTopic: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  autopilotBlockMeta: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 1,
  },
  autopilotEmpty: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  reviewIntro: { marginTop: 14 },
  reviewIntroText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  subjects: { marginTop: 9, gap: 9 },
  topicEditor: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 11,
  },
  topicEditorTop: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topicNumber: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  removeButton: {
    minHeight: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.20)',
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.danger, fontSize: 9.5, lineHeight: 13, fontWeight: '800' },
  fieldLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
    marginTop: 9,
  },
  reviewInput: {
    minHeight: 42,
    marginTop: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 10,
  },
  compactFieldRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-end',
  },
  minutesField: { flex: 1 },
  compactHint: {
    flex: 1,
    minHeight: 42,
    marginTop: 5,
    justifyContent: 'center',
  },
  compactHintTitle: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
  },
  compactHintText: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 2 },
  choiceRow: { gap: 6, paddingTop: 6, paddingRight: 4 },
  choice: {
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: {
    borderColor: 'rgba(255,128,91,0.36)',
    backgroundColor: colors.accentSoft,
  },
  choiceText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  choiceTextActive: { color: colors.accent },
  addTopicButton: {
    minHeight: layout.minTouch,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,128,91,0.28)',
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  addTopicText: { color: colors.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  guardrail: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: 11,
  },
  guardrailTitle: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '900',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryText: { color: '#150B08', fontSize: 12, fontWeight: '900' },
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
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  success: { color: colors.success, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
});
