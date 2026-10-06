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
import { PreparedSyllabusImport } from '@/src/features/assistant/local-ai/syllabus-intake';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

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
  const [busy, setBusy] = useState<'prepare' | 'apply' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

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

  function resetPreview() {
    setPrepared(null);
    setNotice('');
    setError('');
  }

  async function prepare() {
    if (!canPrepare) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy('prepare');
    setPrepared(null);
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
      if (!controller.signal.aborted) setPrepared(next);
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

  async function apply() {
    if (!prepared || busy) return;
    setBusy('apply');
    setError('');
    setNotice('');

    try {
      const batch = prepared.prepared;
      const applied = applyPreparedAssistantActionBatch(
        currentWorkspace,
        batch,
        batch.confirmationKey,
      );
      await commitAssistantWorkspace(applied.nextWorkspace, batch.sourceRevision);
      setPrepared(null);
      setSourceText('');
      setExamName('');
      setExamDate('');
      setNotice(
        `Imported ${prepared.newTopicCount} new ${prepared.newTopicCount === 1 ? 'topic' : 'topics'} and created ${prepared.examName}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'MYELIN could not apply this import. Preview it again.',
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
                into a validated preview. Nothing changes until you apply it.
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
              <View style={styles.formCard}>
                <Text style={styles.sectionTitle}>EXAM DETAILS</Text>
                <TextInput
                  accessibilityLabel="Exam name"
                  editable={!busy}
                  maxLength={200}
                  value={examName}
                  onChangeText={(value) => {
                    setExamName(value);
                    resetPreview();
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
                    resetPreview();
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
                    resetPreview();
                  }}
                  placeholder={'Paste the syllabus text here.\n\nExample:\nMathematics\nReal Numbers\nPolynomials'}
                  placeholderTextColor={colors.subtle}
                  style={styles.sourceInput}
                  textAlignVertical="top"
                />
                <View style={styles.formFooter}>
                  <Text style={styles.counter}>{sourceText.length.toLocaleString()}/24,000</Text>
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

              {prepared ? (
                <View style={styles.previewCard} testID="syllabus-import-preview">
                  <View style={styles.previewTop}>
                    <View style={styles.grow}>
                      <Text style={styles.previewKicker}>REVIEW BEFORE APPLYING</Text>
                      <Text style={styles.previewTitle}>{prepared.examName}</Text>
                      <Text style={styles.body}>{prepared.examDate}</Text>
                    </View>
                    <Text style={styles.previewBadge}>PREVIEW</Text>
                  </View>

                  <View style={styles.stats}>
                    <Stat label="TOPICS" value={String(prepared.topicCount)} />
                    <Stat label="NEW" value={String(prepared.newTopicCount)} />
                    <Stat label="REUSED" value={String(prepared.existingTopicCount)} />
                    <Stat label="CHUNKS" value={String(prepared.sourceChunkCount)} />
                  </View>

                  {prepared.warnings.length ? (
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

                  <View style={styles.subjects}>
                    {prepared.subjects.map((subject) => (
                      <View key={subject.name} style={styles.subjectCard}>
                        <Text style={styles.subjectName}>{subject.name}</Text>
                        {subject.topics.map((topic) => (
                          <View key={topic.name} style={styles.topicRow}>
                            <View style={styles.topicDot} />
                            <View style={styles.grow}>
                              <Text style={styles.topicName}>{topic.name}</Text>
                              <Text style={styles.topicMeta}>
                                {topic.estimatedMinutes
                                  ? `${topic.estimatedMinutes}m`
                                  : '45m default'}
                                {' · '}
                                {topic.priority ? `priority ${topic.priority}` : 'normal priority'}
                                {' · '}
                                {topic.status ?? 'new'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>

                  <View style={styles.guardrail}>
                    <Text style={styles.guardrailTitle}>Safe import</Text>
                    <Text style={styles.body}>
                      Existing topics are reused without overwriting your notes,
                      status, priority or estimates. The exam and new topics are
                      applied only after this confirmation.
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
                      <Text style={styles.secondaryText}>Edit import</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apply syllabus import"
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
                  </View>
                </View>
              ) : null}
            </>
          )}

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
          ) : null}
          {!error && modelError ? <Text style={styles.error}>{modelError}</Text> : null}
          {!notice && modelMessage ? <Text style={styles.muted}>{modelMessage}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  kicker: { color: colors.subtle, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.55 },
  statusTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '800', marginTop: 4 },
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
  sectionTitle: { color: colors.subtle, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.65 },
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
  formFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
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
  previewKicker: { color: colors.accent, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.55 },
  previewTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: 4 },
  previewBadge: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  stats: { flexDirection: 'row', gap: 7, marginTop: 13 },
  stat: { flex: 1, minHeight: 57, borderRadius: radius.sm, backgroundColor: colors.bg, padding: 8, justifyContent: 'space-between' },
  statLabel: { color: colors.subtle, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.4 },
  statValue: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  warningBox: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,165,150,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,150,0.16)',
    padding: 10,
  },
  warningTitle: { color: colors.danger, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.45 },
  warningRow: { flexDirection: 'row', gap: 7, marginTop: 6 },
  warningDot: { color: colors.danger, fontSize: 12, lineHeight: 16 },
  warningText: { flex: 1, color: colors.textDim, fontSize: 10.5, lineHeight: 16 },
  subjects: { marginTop: 12, gap: 8 },
  subjectCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 10,
  },
  subjectName: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  topicRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  topicDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent, marginTop: 6 },
  topicName: { color: colors.textDim, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  topicMeta: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 1 },
  guardrail: { marginTop: 12, borderRadius: radius.md, backgroundColor: colors.bg, padding: 11 },
  guardrailTitle: { color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '900' },
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
