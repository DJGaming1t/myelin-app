import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import {
  ImportPreview,
  buildImportPreview,
  importRelationMessage,
} from '@/src/features/transfer/backup-engine';
import {
  pickBackupText,
  shareNativeBackup,
} from '@/src/features/transfer/transfer-files';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function DataTransferScreen() {
  const {
    workspace,
    replaceWorkspace,
    waitForSaves,
  } = useWorkspace();
  const { session: focusSession, discard: discardFocus } = useFocus();
  const { session: reviewSession, discardReview } = useReview();

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening data transfer…</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function exportBackup() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const name = await shareNativeBackup(workspace);
      setMessage(`Backup ready: ${name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the backup.');
    } finally {
      setBusy(false);
    }
  }

  async function selectBackup() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const picked = await pickBackupText();
      if (!picked) return;

      const next = buildImportPreview(picked.text, workspace);
      setPreview(next);
      setFileName(picked.name);
    } catch (err) {
      setPreview(null);
      setFileName('');
      setError(err instanceof Error ? err.message : 'Could not read this backup.');
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!preview) return;

    const older = preview.relation === 'source-older';
    const title = older ? 'Replace newer local data?' : 'Replace this workspace?';
    const body = [
      importRelationMessage(preview),
      '',
      'This replaces the current workspace only. It does not merge records and it does not affect other account/local workspace keys.',
      '',
      'Export the current workspace first if you may want to restore it.',
    ].join('\n');

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: older ? 'Replace newer data' : 'Import backup',
        style: older ? 'destructive' : 'default',
        onPress: () => void applyImport(),
      },
    ]);
  }

  async function applyImport() {
    if (!preview || busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await Promise.all([
        focusSession ? discardFocus() : Promise.resolve(),
        reviewSession ? discardReview() : Promise.resolve(),
      ]);
      await waitForSaves();

      const imported = await replaceWorkspace(preview.workspace);
      if (!imported) throw new Error('MYELIN could not replace the current workspace.');

      setPreview(null);
      setFileName('');
      router.replace('/(app)/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this backup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="PORTABLE DATA"
        title="Backup & migration"
        subtitle="Export a native backup, or inspect a MYELIN native/web JSON backup before replacing this workspace."
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>EXPORT</Text>
          <Text style={styles.cardTitle}>Keep a portable native backup.</Text>
          <Text style={styles.cardText}>
            The JSON contains this workspace’s topics, recall questions, exams, mistakes,
            study history, breaks and settings. Account passwords and Firebase credentials are
            not included.
          </Text>

          {focusSession || reviewSession ? (
            <View style={styles.activeSessionNote}>
              <Text style={styles.activeSessionTitle}>Active session not included</Text>
              <Text style={styles.activeSessionText}>
                Finish or discard the current Focus/Review session first if you want the backup to reflect all completed work. In-progress timer/draft state is stored separately from the workspace backup.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void exportBackup()}
            style={({ pressed }) => [
              styles.primary,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.primaryText}>Export / share backup</Text>
            <Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>IMPORT</Text>
          <Text style={styles.cardTitle}>Inspect before replacing anything.</Text>
          <Text style={styles.cardText}>
            Supported files include MYELIN native backups and the existing web-app JSON
            backups. Import never silently merges or overwrites the current workspace.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void selectBackup()}
            style={({ pressed }) => [
              styles.secondary,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.secondaryText}>
              {busy ? 'Reading…' : 'Choose JSON backup'}
            </Text>
          </Pressable>
        </View>

        {preview ? (
          <View style={[
            styles.preview,
            preview.relation === 'source-older' && styles.previewWarning,
          ]}>
            <Text style={styles.previewEyebrow}>IMPORT PREVIEW</Text>
            <Text style={styles.previewName}>{fileName}</Text>
            <Text style={styles.previewSource}>{preview.sourceLabel}</Text>

            <View style={styles.relationBox}>
              <Text style={[
                styles.relationText,
                preview.relation === 'source-older' && styles.warningText,
              ]}>
                {importRelationMessage(preview)}
              </Text>
            </View>

            <View style={styles.countGrid}>
              <Count label="TOPICS" value={preview.counts.topics} />
              <Count label="QUESTIONS" value={preview.counts.questions} />
              <Count label="EXAMS" value={preview.counts.exams} />
              <Count label="MISTAKES" value={preview.counts.mistakes} />
              <Count label="SESSIONS" value={preview.counts.sessions} />
              <Count label="BREAKS" value={preview.counts.breaks} />
            </View>

            {preview.sourceUpdatedAt ? (
              <Text style={styles.meta}>
                Source updated: {new Date(preview.sourceUpdatedAt).toLocaleString()}
                {preview.sourceRevision != null
                  ? ` · revision ${preview.sourceRevision}`
                  : ''}
              </Text>
            ) : null}

            {preview.warnings.length ? (
              <View style={styles.warningList}>
                <Text style={styles.warningTitle}>Migration notes</Text>
                {preview.warnings.map((warning) => (
                  <Text key={warning} style={styles.warningItem}>• {warning}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.noMerge}>
              <Text style={styles.noMergeTitle}>No silent merge</Text>
              <Text style={styles.noMergeText}>
                Import replaces only the current workspace after another confirmation. The
                selected file is validated before this button becomes available.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={confirmImport}
              style={({ pressed }) => [
                styles.importButton,
                preview.relation === 'source-older' && styles.importButtonWarning,
                busy && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}>
              <Text style={[
                styles.importButtonText,
                preview.relation === 'source-older' && styles.importButtonWarningText,
              ]}>
                {preview.relation === 'source-older'
                  ? 'Review warning & replace'
                  : 'Confirm import'}
              </Text>
              <Text style={[
                styles.importArrow,
                preview.relation === 'source-older' && styles.importButtonWarningText,
              ]}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPreview(null);
                setFileName('');
              }}
              style={({ pressed }) => [styles.cancelPreview, pressed && styles.pressed]}>
              <Text style={styles.cancelPreviewText}>Discard this preview</Text>
            </Pressable>
          </View>
        ) : null}

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.guide}>
          <Text style={styles.guideTitle}>Moving from the old MYELIN web app</Text>
          <Text style={styles.guideText}>
            Export a JSON backup from the web app’s Settings, transfer that .json file to
            this device, then choose it here. Current v3 web data is converted to the native
            schema; older supported web backups keep the study/history information that
            actually exists in those formats.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={styles.countValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 52 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: 10,
  },
  cardEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  cardText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  activeSessionNote: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.22)',
    backgroundColor: 'rgba(255,161,145,0.035)',
    padding: 10,
  },
  activeSessionTitle: { color: colors.danger, fontSize: 9.5, fontWeight: '700' },
  activeSessionText: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  primary: {
    minHeight: 48,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryText: { color: '#25140e', fontSize: 11.5, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 18 },
  secondary: {
    minHeight: 46,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  preview: {
    marginTop: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.24)',
    backgroundColor: 'rgba(180,216,174,0.035)',
    padding: spacing.md,
  },
  previewWarning: {
    borderColor: 'rgba(255,161,145,0.3)',
    backgroundColor: 'rgba(255,161,145,0.035)',
  },
  previewEyebrow: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  previewName: { color: colors.text, fontSize: 13.5, fontWeight: '700', marginTop: 5 },
  previewSource: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  relationBox: { marginTop: 11, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 10 },
  relationText: { color: colors.text, fontSize: 10, lineHeight: 16 },
  warningText: { color: colors.danger },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.md },
  count: { width: '31.7%', minHeight: 54, borderRadius: radius.md, backgroundColor: colors.panel, padding: 9, justifyContent: 'space-between' },
  countLabel: { color: colors.subtle, fontSize: 7, fontWeight: '800', letterSpacing: 0.9 },
  countValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  meta: { color: colors.subtle, fontSize: 8.8, marginTop: 10 },
  warningList: { marginTop: 12, borderRadius: radius.md, backgroundColor: colors.panel, padding: 11 },
  warningTitle: { color: colors.text, fontSize: 10, fontWeight: '700' },
  warningItem: { color: colors.muted, fontSize: 9.3, lineHeight: 15, marginTop: 5 },
  noMerge: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11 },
  noMergeTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  noMergeText: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  importButton: {
    minHeight: 50,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importButtonWarning: {
    backgroundColor: 'rgba(255,161,145,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.3)',
  },
  importButtonText: { color: '#25140e', fontSize: 11.5, fontWeight: '800' },
  importButtonWarningText: { color: colors.danger },
  importArrow: { color: '#25140e', fontSize: 18 },
  cancelPreview: { minHeight: 40, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  cancelPreviewText: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  success: { color: colors.success, fontSize: 10, lineHeight: 15, marginTop: 10 },
  error: { color: colors.danger, fontSize: 10, lineHeight: 15, marginTop: 10 },
  guide: { marginTop: 28, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  guideTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  guideText: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
