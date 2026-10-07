import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import {
  LocalAiModelView,
  useLocalAi,
} from '@/src/features/assistant/local-ai/LocalAiProvider';
import { LocalAiModelId } from '@/src/features/assistant/local-ai/model-catalog';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function formatBytes(bytes: number | null) {
  if (bytes == null) return 'Unknown';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))} MB`;
}

function targetSize(model: LocalAiModelView) {
  const { min, max } = model.definition.targetDownloadMb;
  return `Target ${min}–${max} MB`;
}

function lifecycleLabel(model: LocalAiModelView) {
  const { state } = model;
  if (state.lifecycle === 'downloading') return 'Downloading';
  if (state.lifecycle === 'importing') return 'Importing';
  if (state.lifecycle === 'loading') return 'Loading';
  if (state.lifecycle === 'loaded') return 'Loaded';
  if (state.lifecycle === 'installed') return 'Installed';
  if (state.install) return 'Installed';
  if (!model.definition.artifact) return 'Mobile artifact not selected yet';
  if (!state.compatibility.runtimeId) return 'Runtime not in this build';
  if (!model.definition.artifact.downloadUrl) return 'Ready to import';
  return 'Ready to download';
}

function blockedReason(model: LocalAiModelView) {
  const runtimeIssue =
    model.state.compatibility.issues.find(
      (issue) => issue.code === 'runtime_missing',
    );
  if (runtimeIssue) {
    return 'This installed MYELIN build cannot load local AI yet. Install a native APK that includes LiteRT-LM; an OTA update cannot add a native runtime.';
  }
  if (!model.definition.artifact) {
    return 'The native AI runtime is ready, but MYELIN is still waiting for a verified mobile export for this model.';
  }
  if (
    !model.definition.artifact.downloadUrl &&
    model.state.compatibility.runtimeId
  ) {
    return 'Native AI is available. Direct download is intentionally disabled for this candidate; import the matching licensed .litertlm bundle to test real inference.';
  }
  return (
    model.state.compatibility.issues[0]?.message ??
    'This model cannot run in the current build yet.'
  );
}

export default function AiModelsScreen() {
  const {
    ready,
    snapshot,
    models,
    freeStorageBytes,
    message,
    error,
    nativeRuntimeAvailable,
    refresh,
    selectModel,
    downloadModel,
    importModelFile,
    cancelDownload,
    removeModel,
    acceptLicense,
    setAutoUnload,
    smokeTestModel,
    testAiSetup,
  } = useLocalAi();
  const [busy, setBusy] = useState('');

  const selected = useMemo(
    () =>
      models.find(
        (model) => model.definition.id === snapshot.selectedModelId,
      ) ?? null,
    [models, snapshot.selectedModelId],
  );
  const selectedReady = Boolean(
    selected?.state.install && selected.state.compatibility.runtimeId,
  );

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy('');
    }
  }

  function confirmLicense(modelId: LocalAiModelId, name: string) {
    Alert.alert(
      `Confirm ${name} licence`,
      'Only continue if you obtained the model legally and already accepted its licence terms at the source. MYELIN does not bypass gated access.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I accepted the licence',
          onPress: () =>
            void run(`license:${modelId}`, () => acceptLicense(modelId)),
        },
      ],
    );
  }

  function confirmRemove(modelId: LocalAiModelId, name: string) {
    Alert.alert(
      `Remove ${name}?`,
      'The downloaded model file will be deleted from this device. Your MYELIN study data is unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove model',
          style: 'destructive',
          onPress: () => void run(`remove:${modelId}`, () => removeModel(modelId)),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScreenHeader
        title="On-device AI"
        eyebrow="MYELIN AI"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>OPTIONAL • LOCAL</Text>
          <Text style={styles.heroTitle}>Choose how much AI lives on your phone.</Text>
          <Text style={styles.heroText}>
            Models are separate downloads, not part of the base app. MYELIN keeps scheduling maths and hard constraints deterministic even when a model is installed.
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>SELECTED</Text>
              <Text style={styles.statValue}>
                {selected?.definition.shortName ?? 'None'}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>FREE STORAGE</Text>
              <Text style={styles.statValue}>{formatBytes(freeStorageBytes)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Unload AI in background</Text>
            <Text style={styles.settingText}>
              Releases the active model when MYELIN leaves the foreground to reduce RAM pressure.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Unload AI in background"
            value={snapshot.preferences.autoUnload}
            disabled={!ready || Boolean(busy)}
            onValueChange={(value) =>
              void run('auto-unload', () => setAutoUnload(value))
            }
            trackColor={{ false: '#29292B', true: '#5C3024' }}
            thumbColor={snapshot.preferences.autoUnload ? colors.accent : '#B8B8B4'}
          />
        </View>

        <View style={styles.tryCard}>
          <View style={styles.tryCopy}>
            <Text style={styles.tryKicker}>AI SETUP CHECK</Text>
            <Text style={styles.tryTitle}>
              {nativeRuntimeAvailable
                ? selectedReady
                  ? 'Native AI is ready to run.'
                  : 'Native runtime detected.'
                : 'Check this installed APK for AI support.'}
            </Text>
            <Text style={styles.tryText}>
              {nativeRuntimeAvailable
                ? selectedReady
                  ? 'Runs the real selected model and asks it for a short MYELIN_OK response.'
                  : 'Your APK has the native inference runtime. The check will tell you what is still missing before real model inference can run.'
                : 'This checks whether the installed APK contains LiteRT-LM. OTA updates can change JavaScript, but they cannot add this native module.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check MYELIN AI setup"
            disabled={!ready || Boolean(busy)}
            onPress={() =>
              void run('setup-test', testAiSetup).catch(
                () => undefined,
              )
            }
            style={({ pressed }) => [
              styles.tryButton,
              (!ready || Boolean(busy)) && styles.disabled,
              pressed && ready && !busy && styles.pressed,
            ]}>
            <Text style={styles.tryButtonText}>
              {busy === 'setup-test'
                ? 'Checking…'
                : selectedReady
                  ? 'Run AI test'
                  : 'Check AI setup'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.tryCard}>
          <View style={styles.tryCopy}>
            <Text style={styles.tryKicker}>PREVIEW-FIRST ASSISTANT</Text>
            <Text style={styles.tryTitle}>Try the selected model with MYELIN.</Text>
            <Text style={styles.tryText}>
              Ask it to interpret a study request, review the exact proposed actions, then choose whether MYELIN applies them.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try selected local AI model"
            disabled={!selectedReady || Boolean(busy)}
            onPress={() => router.push('/(app)/settings/ai-assistant')}
            style={({ pressed }) => [
              styles.tryButton,
              (!selectedReady || Boolean(busy)) && styles.disabled,
              pressed && selectedReady && !busy && styles.pressed,
            ]}>
            <Text style={styles.tryButtonText}>
              {selectedReady
                ? 'Try selected model'
                : !nativeRuntimeAvailable
                  ? 'AI runtime missing from this APK'
                  : !selected
                    ? 'Choose a model first'
                    : 'Install or import the selected model first'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MODEL OPTIONS</Text>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => void run('refresh', refresh)}
            style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
            <Text style={styles.refreshText}>{busy === 'refresh' ? 'Checking…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        <View style={styles.modelList}>
          {models.map((model) => (
            <ModelCard
              key={model.definition.id}
              model={model}
              selected={snapshot.selectedModelId === model.definition.id}
              busy={busy}
              onSelect={() =>
                void run(`select:${model.definition.id}`, () =>
                  selectModel(model.definition.id),
                )
              }
              licenseAccepted={
                model.definition.license === 'Apache-2.0' ||
                snapshot.preferences.acceptedLicenseModelIds.includes(
                  model.definition.id,
                )
              }
              onAcceptLicense={() =>
                confirmLicense(
                  model.definition.id,
                  model.definition.shortName,
                )
              }
              onImport={() =>
                void run(`import:${model.definition.id}`, () =>
                  importModelFile(model.definition.id),
                ).catch(() => undefined)
              }
              onDownload={() =>
                void run(`download:${model.definition.id}`, () =>
                  downloadModel(model.definition.id),
                ).catch(() => undefined)
              }
              onCancel={() => cancelDownload(model.definition.id)}
              onRemove={() =>
                confirmRemove(model.definition.id, model.definition.shortName)
              }
              onSmokeTest={() =>
                void run(`smoke:${model.definition.id}`, () =>
                  smokeTestModel(model.definition.id),
                ).catch(() => undefined)
              }
            />
          ))}
        </View>

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Why are downloads still disabled?</Text>
          <Text style={styles.noteText}>
            Direct downloads remain disabled for gated or unverified artifacts. For device testing, import a licensed FunctionGemma .litertlm file that matches MYELIN's candidate bundle. MYELIN copies it into private storage, checks the exact size and SHA-256 fingerprint, and only then enables the runtime test.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModelCard({
  model,
  selected,
  busy,
  onSelect,
  licenseAccepted,
  onAcceptLicense,
  onImport,
  onDownload,
  onCancel,
  onRemove,
  onSmokeTest,
}: {
  model: LocalAiModelView;
  selected: boolean;
  busy: string;
  licenseAccepted: boolean;
  onSelect: () => void;
  onAcceptLicense: () => void;
  onImport: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onSmokeTest: () => void;
}) {
  const downloading = model.state.lifecycle === 'downloading';
  const importing = model.state.lifecycle === 'importing';
  const installed = Boolean(model.state.install);
  const artifact = model.definition.artifact;
  const canImport =
    artifact?.format === 'litertlm' &&
    Boolean(model.state.compatibility.runtimeId);
  const downloadAvailable = Boolean(artifact?.downloadUrl);
  const downloadBlocked =
    !downloadAvailable ||
    !model.state.compatibility.compatible ||
    Boolean(busy);
  const importBlocked =
    !canImport ||
    !licenseAccepted ||
    Boolean(busy);
  const progress = model.state.progress;
  const ratio =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.max(0, Math.min(1, progress.writtenBytes / progress.totalBytes))
      : 0;

  return (
    <View style={[styles.modelCard, selected && styles.modelCardSelected]}>
      <View style={styles.modelTop}>
        <View style={styles.modelTitleCopy}>
          <Text style={styles.modelName}>{model.definition.displayName}</Text>
          <Text style={styles.modelRole}>
            {model.definition.role === 'tool-specialist'
              ? 'Small tool specialist'
              : 'Stronger reasoning option'}
          </Text>
        </View>
        {selected ? <Text style={styles.selectedBadge}>SELECTED</Text> : null}
      </View>

      <Text style={styles.modelDescription}>{model.definition.description}</Text>

      <View style={styles.chips}>
        <Text style={styles.chip}>{targetSize(model)}</Text>
        <Text style={styles.chip}>{model.definition.license}</Text>
        <Text style={styles.chip}>
          {model.definition.capabilities.vision ? 'Vision-capable family' : 'Text only'}
        </Text>
      </View>

      <View style={styles.statusLine}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={styles.statusValue}>{lifecycleLabel(model)}</Text>
      </View>

      {installed && model.state.install?.sha256 ? (
        <View style={styles.verifiedRow}>
          <Text style={styles.verifiedBadge}>SHA-256 VERIFIED</Text>
          <Text style={styles.verifiedFingerprint}>
            {model.state.install.sha256.slice(0, 12)}…
          </Text>
        </View>
      ) : null}

      {downloading && progress ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(3, ratio * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {formatBytes(progress.writtenBytes)}
            {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}
          </Text>
        </View>
      ) : null}

      {!installed && !downloading && !importing ? (
        <Text style={styles.blockedText}>{blockedReason(model)}</Text>
      ) : null}

      {model.state.error ? (
        <Text style={styles.modelError}>{model.state.error}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(busy)}
          onPress={onSelect}
          style={({ pressed }) => [
            styles.secondaryButton,
            selected && styles.secondaryButtonSelected,
            Boolean(busy) && styles.disabled,
            pressed && !busy && styles.pressed,
          ]}>
          <Text style={styles.secondaryButtonText}>
            {selected ? 'Selected' : 'Choose'}
          </Text>
        </Pressable>

        {downloading ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Pause</Text>
          </Pressable>
        ) : importing ? (
          <Pressable
            accessibilityRole="button"
            disabled
            style={[styles.primaryButton, styles.disabled]}>
            <Text style={styles.primaryButtonText}>Importing…</Text>
          </Pressable>
        ) : installed ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busy)}
              onPress={onSmokeTest}
              style={({ pressed }) => [
                styles.primaryButton,
                Boolean(busy) && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}>
              <Text style={styles.primaryButtonText}>
                {busy === `smoke:${model.definition.id}` ? 'Testing…' : 'Run test'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busy)}
              onPress={onRemove}
              style={({ pressed }) => [
                styles.removeButton,
                Boolean(busy) && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </Pressable>
          </>
        ) : !licenseAccepted && model.definition.license !== 'Apache-2.0' ? (
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={onAcceptLicense}
            style={({ pressed }) => [
              styles.primaryButton,
              Boolean(busy) && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>Confirm licence</Text>
          </Pressable>
        ) : canImport && !downloadAvailable ? (
          <Pressable
            accessibilityRole="button"
            disabled={importBlocked}
            onPress={onImport}
            style={({ pressed }) => [
              styles.primaryButton,
              importBlocked && styles.disabled,
              pressed && !importBlocked && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>Import file</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={downloadBlocked}
            onPress={onDownload}
            style={({ pressed }) => [
              styles.primaryButton,
              downloadBlocked && styles.disabled,
              pressed && !downloadBlocked && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>
              {downloadAvailable ? 'Download' : 'Unavailable'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 72, gap: 14 },
  hero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  heroKicker: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginTop: 7,
  },
  heroText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 8,
  },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: 10,
    justifyContent: 'space-between',
  },
  statLabel: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValue: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  settingCard: {
    minHeight: 78,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  settingText: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  tryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.28)',
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: 12,
  },
  tryCopy: { gap: 4 },
  tryKicker: { color: colors.accent, fontSize: 9.5, lineHeight: 13, fontWeight: '900', letterSpacing: 0.55 },
  tryTitle: { color: colors.text, fontSize: 15.5, lineHeight: 21, fontWeight: '800' },
  tryText: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  tryButton: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tryButtonText: { color: '#150B08', fontSize: 12, fontWeight: '900' },
  sectionHeader: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.subtle, fontSize: 10.5, lineHeight: 14, fontWeight: '800', letterSpacing: 0.6 },
  refresh: { minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: 4 },
  refreshText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  modelList: { gap: 10 },
  modelCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  modelCardSelected: { borderColor: 'rgba(255,128,91,0.48)' },
  modelTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modelTitleCopy: { flex: 1 },
  modelName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  modelRole: { color: colors.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  selectedBadge: {
    color: colors.accent,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.55,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modelDescription: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  chip: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusLine: {
    minHeight: 42,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusLabel: { color: colors.subtle, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  statusValue: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16, fontWeight: '700', textAlign: 'right' },
  verifiedRow: {
    marginTop: -2,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  verifiedBadge: {
    color: colors.accent,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  verifiedFingerprint: {
    color: colors.subtle,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  blockedText: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginBottom: 10 },
  modelError: { color: colors.danger, fontSize: 11.5, lineHeight: 17, marginBottom: 10 },
  progressWrap: { marginBottom: 12 },
  progressTrack: { height: 5, borderRadius: radius.pill, backgroundColor: '#222225', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  progressText: { color: colors.muted, fontSize: 10.5, lineHeight: 14, marginTop: 5, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonSelected: { borderColor: 'rgba(255,128,91,0.35)', backgroundColor: colors.accentSoft },
  secondaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  primaryButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#150B08', fontSize: 12, fontWeight: '900' },
  removeButton: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.25)',
    backgroundColor: 'rgba(255,161,145,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  success: { color: colors.success, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  note: {
    marginTop: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  noteTitle: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  noteText: { color: colors.muted, fontSize: 11.5, lineHeight: 18, marginTop: 5 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
