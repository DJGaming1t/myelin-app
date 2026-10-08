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
import { useLocalAi } from '@/src/features/assistant/local-ai/LocalAiProvider';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

function formatBytes(bytes: number | null) {
  if (bytes == null) return 'Unknown';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))} MB`;
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
    selectModel,
    setPreferredOfflineModel,
    importModelFile,
    removeModel,
    acceptLicense,
    setAutoUnload,
    smokeTestModel,
  } = useLocalAi();
  const [busy, setBusy] = useState('');

  const functionGemma = useMemo(
    () =>
      models.find(
        (model) =>
          model.definition.id === 'functiongemma-270m',
      ) ?? null,
    [models],
  );

  const installed = Boolean(
    functionGemma?.state.install,
  );
  const selected =
    snapshot.selectedModelId ===
    'functiongemma-270m';
  const usable =
    installed &&
    Boolean(
      functionGemma?.state.compatibility.runtimeId,
    );

  async function run(
    label: string,
    action: () => Promise<unknown>,
  ) {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy('');
    }
  }

  function importFunctionGemma() {
    if (!functionGemma || busy) return;

    Alert.alert(
      'Import FunctionGemma?',
      'Use this only if you already have the licensed mobile_actions_q8_ekv1024.litertlm file. MYELIN will verify the exact file before enabling AI.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          onPress: () => {
            void run('import', async () => {
              if (
                !snapshot.preferences.acceptedLicenseModelIds.includes(
                  'functiongemma-270m',
                )
              ) {
                await acceptLicense(
                  'functiongemma-270m',
                );
              }
              await importModelFile(
                'functiongemma-270m',
              );
              await selectModel(
                'functiongemma-270m',
              );
            }).catch(() => undefined);
          },
        },
      ],
    );
  }

  function confirmRemove() {
    if (!functionGemma || busy) return;
    Alert.alert(
      'Remove FunctionGemma?',
      'This removes only the local model file. Your MYELIN study data is unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove model',
          style: 'destructive',
          onPress: () =>
            void run('remove', () =>
              removeModel('functiongemma-270m'),
            ),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScreenHeader
        title="On-device AI"
        eyebrow="EXPERIMENTAL"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            LOCAL • PRIVATE • OPTIONAL
          </Text>
          <Text style={styles.heroTitle}>
            Choose your offline AI.
          </Text>
          <Text style={styles.heroText}>
            Save a preference for Lite or Enhanced.
            Qwen downloads open after model quality and phone tests pass.
            Simple supported commands work through MYELIN rules already.
          </Text>

          <View style={styles.statusGrid}>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>
                NATIVE RUNTIME
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  nativeRuntimeAvailable &&
                    styles.statusGood,
                ]}>
                {nativeRuntimeAvailable
                  ? 'Ready'
                  : 'Unavailable'}
              </Text>
            </View>
            <View style={styles.statusTile}>
              <Text style={styles.statusLabel}>
                FREE STORAGE
              </Text>
              <Text style={styles.statusValue}>
                {formatBytes(freeStorageBytes)}
              </Text>
            </View>
          </View>
        </View>

        {!nativeRuntimeAvailable ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              This APK cannot run local AI
            </Text>
            <Text style={styles.warningText}>
              LiteRT-LM is not available in the
              installed native build. JavaScript
              updates cannot add a missing native
              runtime.
            </Text>
          </View>
        ) : null}

        {models.filter(({ definition }) => definition.vendor === 'qwen').map(({ definition, state }) => {
          const preferred = (snapshot.preferences.preferredOfflineModelId ?? 'qwen3.5-0.8b') === definition.id;
          const modelId = definition.id as 'qwen3.5-0.8b' | 'qwen3.5-2b';
          return (
            <View key={definition.id} style={styles.modelCard}>
              <Text style={styles.modelName}>{definition.displayName}</Text>
              <Text style={styles.modelDescription}>{definition.description}</Text>
              <Text selectable style={styles.verified}>
                {state.install ? 'VERIFIED FILE INSTALLED' : 'PHONE RELEASE PENDING · DOWNLOAD UNAVAILABLE'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Prefer ${definition.shortName}`}
                accessibilityState={{ selected: preferred, disabled: !ready || Boolean(busy) }}
                disabled={!ready || Boolean(busy)}
                onPress={() => void run('offline-preference', () => setPreferredOfflineModel(modelId)).catch(() => undefined)}
                style={({ pressed }) => [styles.secondaryButton, { marginTop: 14 }, (!ready || Boolean(busy)) && styles.disabled, pressed && !busy && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>{preferred ? 'Preferred offline model' : 'Save as preferred'}</Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/settings/ai-assistant')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open MYELIN assistant</Text>
        </Pressable>

        <View style={styles.modelCard}>
          <View style={styles.modelHeader}>
            <View style={styles.modelHeaderCopy}>
              <Text style={styles.modelName}>
                FunctionGemma 270M
              </Text>
              <Text style={styles.modelRole}>
                Experimental tool interpreter
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {installed
                  ? 'INSTALLED'
                  : 'MANUAL IMPORT'}
              </Text>
            </View>
          </View>

          <Text style={styles.modelDescription}>
            Small on-device model used to test
            structured study actions. MYELIN verifies
            the imported file before the model can
            run.
          </Text>

          <View style={styles.flow}>
            <FlowStep
              number="1"
              title="Have the licensed .litertlm file"
              detail="MYELIN does not ask for your Hugging Face credentials or bypass the Gemma licence."
            />
            <FlowStep
              number="2"
              title="Import and verify"
              detail="The app checks the expected model file before enabling it."
            />
            <FlowStep
              number="3"
              title="Run the model test"
              detail="After the native test succeeds, the local assistant becomes available."
            />
          </View>

          {!installed ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                !ready ||
                !nativeRuntimeAvailable ||
                Boolean(busy)
              }
              onPress={importFunctionGemma}
              style={({ pressed }) => [
                styles.primaryButton,
                (!ready ||
                  !nativeRuntimeAvailable ||
                  Boolean(busy)) &&
                  styles.disabled,
                pressed &&
                  ready &&
                  nativeRuntimeAvailable &&
                  !busy &&
                  styles.pressed,
              ]}>
              <Text style={styles.primaryButtonText}>
                {busy === 'import'
                  ? 'Importing…'
                  : 'Import licensed .litertlm'}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={() =>
                  void run('test', () =>
                    smokeTestModel(
                      'functiongemma-270m',
                    ),
                  ).catch(() => undefined)
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.flexButton,
                  Boolean(busy) && styles.disabled,
                  pressed && !busy && styles.pressed,
                ]}>
                <Text
                  style={styles.primaryButtonText}>
                  {busy === 'test'
                    ? 'Testing…'
                    : 'Run model test'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!usable || Boolean(busy)}
                onPress={() => {
                  if (!selected) {
                    void run('select', () =>
                      selectModel(
                        'functiongemma-270m',
                      ),
                    ).then(() =>
                      router.push(
                        '/(app)/settings/ai-assistant',
                      ),
                    );
                    return;
                  }
                  router.push(
                    '/(app)/settings/ai-assistant',
                  );
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.flexButton,
                  (!usable || Boolean(busy)) &&
                    styles.disabled,
                  pressed &&
                    usable &&
                    !busy &&
                    styles.pressed,
                ]}>
                <Text
                  style={styles.secondaryButtonText}>
                  Open assistant
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={confirmRemove}
                style={({ pressed }) => [
                  styles.removeButton,
                  Boolean(busy) && styles.disabled,
                  pressed && !busy && styles.pressed,
                ]}>
                <Text style={styles.removeText}>
                  Remove
                </Text>
              </Pressable>
            </View>
          )}

          {functionGemma?.state.install?.sha256 ? (
            <Text style={styles.verified}>
              VERIFIED •{' '}
              {functionGemma.state.install.sha256.slice(
                0,
                12,
              )}
              …
            </Text>
          ) : null}
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>
              Unload AI in background
            </Text>
            <Text style={styles.settingText}>
              Releases the model when MYELIN leaves
              the foreground to reduce RAM use.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Unload AI in background"
            value={snapshot.preferences.autoUnload}
            disabled={!ready || Boolean(busy)}
            onValueChange={(value) =>
              void run('auto-unload', () =>
                setAutoUnload(value),
              )
            }
            trackColor={{
              false: '#29292B',
              true: '#5C3024',
            }}
            thumbColor={
              snapshot.preferences.autoUnload
                ? colors.accent
                : '#B8B8B4'
            }
          />
        </View>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>
            Cloud AI
          </Text>
          <Text style={styles.noteText}>
            Cloud fallback needs a secure server connection, provider quota controls,
            and your permission to send a request. That connection is not enabled in this build.
          </Text>
        </View>

        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.success}>
            {message}
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FlowStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.flowStep}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>
          {number}
        </Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>
          {title}
        </Text>
        <Text style={styles.stepDetail}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: layout.readingMax,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 72,
    gap: 14,
  },
  hero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.28)',
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    marginTop: 7,
  },
  heroText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 9,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  statusTile: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: 11,
    justifyContent: 'space-between',
  },
  statusLabel: {
    color: colors.subtle,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statusValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  statusGood: { color: colors.success },
  warningCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.28)',
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  warningText: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 5,
  },
  modelCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modelHeaderCopy: { flex: 1 },
  modelName: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  modelRole: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modelDescription: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 12,
  },
  flow: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 16,
    paddingTop: 14,
    gap: 13,
  },
  flowStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  stepCopy: { flex: 1 },
  stepTitle: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '800',
  },
  stepDetail: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },
  primaryButton: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#150B08',
    fontSize: 12,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  flexButton: {
    flex: 1,
    minWidth: 126,
    marginTop: 0,
  },
  removeButton: {
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.danger,
    fontSize: 11.5,
    fontWeight: '800',
  },
  verified: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.35,
    marginTop: 12,
  },
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
  settingTitle: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '800',
  },
  settingText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  note: {
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  noteTitle: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '800',
  },
  noteText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  success: {
    color: colors.success,
    fontSize: 11.5,
    lineHeight: 17,
  },
  error: {
    color: colors.danger,
    fontSize: 11.5,
    lineHeight: 17,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});

