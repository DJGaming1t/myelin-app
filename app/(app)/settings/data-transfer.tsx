import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
  ImportCandidate,
  isImportOlderThanCurrent,
  mergeWorkspaces,
  parseImportJson,
  workspaceImportCounts,
} from '@/src/features/transfer/backup-engine';
import {
  exportWorkspaceBackup,
  readBackupDocument,
} from '@/src/features/transfer/backup-io';
import { colors, radius, spacing } from '@/src/theme/tokens';

type Preview = {
  fileName: string;
  candidate: ImportCandidate;
  revision: number;
};

function formatDate(timestamp: number | null) {
  if (!timestamp) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function DataTransferScreen() {
  const {
    workspace,
    replaceWorkspace,
    restoreImportRecovery,
    hasImportRecovery,
  } = useWorkspace();
  const { session: focusSession, discard: discardFocus } = useFocus();
  const { session: reviewSession, discardReview } = useReview();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(
    () => (preview ? workspaceImportCounts(preview.candidate.workspace) : null),
    [preview],
  );

  const mergePreview = useMemo(() => {
    if (!workspace || !preview) return null;
    try {
      return mergeWorkspaces(workspace, preview.candidate.workspace).report;
    } catch {
      return null;
    }
  }, [preview, workspace]);

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening data transfer…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentWorkspace = workspace;

  const previewStale = Boolean(
    preview && preview.revision !== currentWorkspace.revision,
  );
  const older = preview
    ? isImportOlderThanCurrent(preview.candidate, currentWorkspace)
    : false;

  async function stopTransientSessions() {
    await Promise.all([
      focusSession ? discardFocus() : Promise.resolve(),
      reviewSession ? discardReview() : Promise.resolve(),
    ]);
  }

  async function exportBackup() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await exportWorkspaceBackup(currentWorkspace);
      setMessage(
        result.method === 'download'
          ? `${result.name} downloaded.`
          : result.method === 'file-share'
            ? 'Backup file opened in the system share sheet.'
            : 'File sharing was unavailable, so the JSON backup was offered as text.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not export the backup.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackup() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const selected = await readBackupDocument();
      if (!selected) return;
      const candidate = parseImportJson(selected.text);
      setPreview({
        fileName: selected.name,
        candidate,
        revision: currentWorkspace.revision,
      });
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error ? cause.message : 'Could not read this backup.',
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmMerge() {
    if (!preview || !mergePreview) return;
    if (previewStale) {
      setError('This workspace changed after the preview. Choose the file again before importing.');
      return;
    }

    const added = mergePreview.added;
    const transient =
      focusSession || reviewSession
        ? '\n\nThe current Focus/Review session will be discarded first.'
        : '';

    Alert.alert(
      'Merge this backup?',
      `Current records are never overwritten. MYELIN will add ${added.topics} topics, ${added.exams} exams, ${added.mistakes} mistakes and ${added.sessions} sessions. Current study settings stay unchanged. A pre-import recovery snapshot will be saved automatically.${transient}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: () => void applyMerge(),
        },
      ],
    );
  }

  async function applyMerge() {
    if (!preview) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await stopTransientSessions();
      const merged = mergeWorkspaces(currentWorkspace, preview.candidate.workspace);
      await replaceWorkspace(merged.workspace, preview.revision);
      setPreview(null);
      setMessage(
        `Merge complete. Added ${merged.report.added.topics} topics, ${merged.report.added.exams} exams, ${merged.report.added.mistakes} mistakes and ${merged.report.added.sessions} sessions. ${merged.report.remappedIds} conflicting IDs were safely remapped.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The merge was not applied.',
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmReplace() {
    if (!preview || !counts) return;
    if (previewStale) {
      setError('This workspace changed after the preview. Choose the file again before importing.');
      return;
    }

    const ageWarning = older
      ? '\n\nWarning: this backup is older than the current workspace.'
      : '';
    const transient =
      focusSession || reviewSession
        ? '\n\nThe current Focus/Review session will be discarded first.'
        : '';

    Alert.alert(
      'Replace the current workspace?',
      `This will replace the current workspace with ${counts.topics} topics, ${counts.exams} exams, ${counts.mistakes} mistakes and ${counts.sessions} sessions. A pre-import recovery snapshot will be saved on this device first.${ageWarning}${transient}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace workspace',
          style: 'destructive',
          onPress: () => void applyReplace(),
        },
      ],
    );
  }

  async function applyReplace() {
    if (!preview) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await stopTransientSessions();
      await replaceWorkspace(preview.candidate.workspace, preview.revision);
      setPreview(null);
      setMessage('Workspace replaced. The previous workspace is available as the pre-import recovery snapshot.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The replacement was not applied.',
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmRecovery() {
    Alert.alert(
      'Restore the pre-import workspace?',
      'This swaps the current workspace with the recovery snapshot. The workspace you have now becomes the new recovery snapshot, so the action can be reversed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore recovery',
          onPress: () => void restoreRecovery(),
        },
      ],
    );
  }

  async function restoreRecovery() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await stopTransientSessions();
      const restored = await restoreImportRecovery(currentWorkspace.revision);
      if (!restored) {
        setError('No valid pre-import recovery snapshot is available.');
        return;
      }
      setPreview(null);
      setMessage('Pre-import workspace restored. The replaced workspace is now the recovery snapshot.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not restore recovery.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="PORTABLE DATA"
        title="Backup & migration"
        subtitle="Export a portable native backup, or preview a native/web MYELIN JSON file before merging or replacing anything."
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.primaryPanel}>
          <Text style={styles.panelEyebrow}>EXPORT</Text>
          <Text style={styles.panelTitle}>Keep a copy you control.</Text>
          <Text style={styles.panelText}>
            The exported JSON contains this workspace’s topics, questions, exams, mistakes, study history, breaks and settings. It does not contain your Firebase password or authentication tokens.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void exportBackup()}
            style={({ pressed }) => [
              styles.primaryButton,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonText}>Export native backup</Text>
            <Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import or migrate</Text>
          <Text style={styles.sectionText}>
            Supported: native MYELIN backups/workspaces and web v1, v2 and v3 JSON backups. On the existing web app, use Settings → Export backup, then choose that JSON here.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void chooseBackup()}
            style={({ pressed }) => [
              styles.chooseButton,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <View>
              <Text style={styles.chooseTitle}>
                {busy ? 'Working…' : 'Choose JSON backup'}
              </Text>
              <Text style={styles.chooseText}>Nothing changes until you confirm an action</Text>
            </View>
            <Text style={styles.chooseArrow}>＋</Text>
          </Pressable>
        </View>

        {preview && counts ? (
          <View style={styles.preview}>
            <View style={styles.previewHeader}>
              <View style={styles.previewCopy}>
                <Text style={styles.previewEyebrow}>IMPORT PREVIEW</Text>
                <Text style={styles.previewTitle} numberOfLines={2}>{preview.fileName}</Text>
                <Text style={styles.previewSource}>{preview.candidate.sourceLabel}</Text>
              </View>
              <Text style={older ? styles.olderBadge : styles.readyBadge}>
                {older ? 'OLDER' : 'READY'}
              </Text>
            </View>

            <View style={styles.metaRows}>
              <MetaRow label="Source updated" value={formatDate(preview.candidate.sourceUpdatedAt)} />
              <MetaRow label="Current updated" value={formatDate(currentWorkspace.updatedAt)} />
              <MetaRow label="Preview revision" value={String(preview.revision)} />
            </View>

            <View style={styles.countGrid}>
              <Count label="TOPICS" value={counts.topics} />
              <Count label="QUESTIONS" value={counts.questions} />
              <Count label="EXAMS" value={counts.exams} />
              <Count label="MISTAKES" value={counts.mistakes} />
              <Count label="SESSIONS" value={counts.sessions} />
              <Count label="BREAKS" value={counts.breaks} />
            </View>

            {previewStale ? (
              <Notice tone="danger">
                This workspace changed after the file was previewed. Choose the file again before importing so newer work cannot be overwritten.
              </Notice>
            ) : null}

            {older ? (
              <Notice tone="danger">
                This source is older than the current workspace. Merge is non-destructive; Replace requires an explicit destructive confirmation.
              </Notice>
            ) : null}

            {preview.candidate.warnings.map((warning) => (
              <Notice key={warning}>{warning}</Notice>
            ))}

            {mergePreview ? (
              <View style={styles.mergeInfo}>
                <Text style={styles.mergeTitle}>Merge preview</Text>
                <Text style={styles.mergeText}>
                  Adds {mergePreview.added.topics} topics · {mergePreview.added.exams} exams · {mergePreview.added.mistakes} mistakes · {mergePreview.added.sessions} sessions. {mergePreview.skippedIdentical} identical records would be skipped and {mergePreview.remappedIds} conflicting IDs remapped. Current settings stay unchanged.
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy || previewStale || !mergePreview}
                onPress={confirmMerge}
                style={({ pressed }) => [
                  styles.mergeButton,
                  (busy || previewStale || !mergePreview) && styles.disabled,
                  pressed && !busy && !previewStale && styles.pressed,
                ]}>
                <Text style={styles.mergeButtonText}>Merge safely</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || previewStale}
                onPress={confirmReplace}
                style={({ pressed }) => [
                  styles.replaceButton,
                  (busy || previewStale) && styles.disabled,
                  pressed && !busy && !previewStale && styles.pressed,
                ]}>
                <Text style={styles.replaceButtonText}>Replace</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setPreview(null)}
              style={({ pressed }) => [styles.cancelPreview, pressed && styles.pressed]}>
              <Text style={styles.cancelPreviewText}>Clear preview</Text>
            </Pressable>
          </View>
        ) : null}

        {hasImportRecovery ? (
          <View style={styles.recoveryPanel}>
            <Text style={styles.recoveryEyebrow}>RECOVERY</Text>
            <Text style={styles.recoveryTitle}>Pre-import workspace available</Text>
            <Text style={styles.recoveryText}>
              MYELIN saved the workspace that existed immediately before the latest import. Restoring swaps the two snapshots instead of destroying the current one.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={confirmRecovery}
              style={({ pressed }) => [
                styles.recoveryButton,
                busy && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}>
              <Text style={styles.recoveryButtonText}>Restore pre-import workspace</Text>
            </Pressable>
          </View>
        ) : null}

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.rules}>
          <Text style={styles.rulesTitle}>Import rules</Text>
          <Rule text="Picking a file never modifies the workspace." />
          <Rule text="Merge adds data without overwriting conflicting current records; conflicting IDs are remapped." />
          <Rule text="Replace is explicit, warns when the source is older, and creates a pre-import recovery snapshot first." />
          <Rule text="If the workspace revision changes after preview, the import is blocked until you preview again." />
          <Rule text="In-progress web timers/review drafts are not converted; completed history and scheduling data are preserved." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
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

function Notice({
  children,
  tone,
}: {
  children: string;
  tone?: 'danger';
}) {
  return (
    <View style={[styles.notice, tone === 'danger' && styles.noticeDanger]}>
      <Text style={[styles.noticeText, tone === 'danger' && styles.noticeDangerText]}>
        {children}
      </Text>
    </View>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={styles.rule}>
      <Text style={styles.ruleMark}>✓</Text>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 56 },
  primaryPanel: { borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,128,91,0.25)', backgroundColor: colors.accentSoft, padding: spacing.lg },
  panelEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6 },
  panelText: { color: colors.muted, fontSize: 10.5, lineHeight: 17, marginTop: 6 },
  primaryButton: { minHeight: 50, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryButtonText: { color: '#25140e', fontSize: 11.5, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 18 },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sectionText: { color: colors.subtle, fontSize: 9.8, lineHeight: 15, marginTop: 4 },
  chooseButton: { minHeight: 64, marginTop: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chooseTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  chooseText: { color: colors.subtle, fontSize: 8.8, marginTop: 4 },
  chooseArrow: { color: colors.accent, fontSize: 20 },
  preview: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, padding: spacing.md },
  previewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  previewCopy: { flex: 1 },
  previewEyebrow: { color: colors.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  previewTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  previewSource: { color: colors.muted, fontSize: 9.5, marginTop: 3 },
  readyBadge: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  olderBadge: { color: colors.danger, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  metaRows: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 7 },
  metaRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  metaLabel: { color: colors.subtle, fontSize: 8.5 },
  metaValue: { color: colors.muted, fontSize: 8.8, textAlign: 'right' },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  count: { width: '31.7%', minHeight: 54, borderRadius: radius.md, backgroundColor: colors.bg, padding: 9, justifyContent: 'space-between' },
  countLabel: { color: colors.subtle, fontSize: 6.8, fontWeight: '800', letterSpacing: 0.9 },
  countValue: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  notice: { marginTop: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  noticeDanger: { borderColor: 'rgba(255,161,145,0.24)', backgroundColor: 'rgba(255,161,145,0.045)' },
  noticeText: { color: colors.muted, fontSize: 9.5, lineHeight: 15 },
  noticeDangerText: { color: colors.danger },
  mergeInfo: { marginTop: 10, borderLeftWidth: 2, borderLeftColor: colors.success, paddingLeft: 10 },
  mergeTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  mergeText: { color: colors.muted, fontSize: 9.3, lineHeight: 15, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  mergeButton: { flex: 1, minHeight: 47, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  mergeButtonText: { color: '#25140e', fontSize: 11, fontWeight: '800' },
  replaceButton: { flex: 1, minHeight: 47, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.28)', alignItems: 'center', justifyContent: 'center' },
  replaceButtonText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  cancelPreview: { minHeight: 38, marginTop: 5, alignItems: 'center', justifyContent: 'center' },
  cancelPreviewText: { color: colors.subtle, fontSize: 9.5, fontWeight: '600' },
  recoveryPanel: { marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(180,216,174,0.2)', backgroundColor: 'rgba(180,216,174,0.045)', padding: spacing.md },
  recoveryEyebrow: { color: colors.success, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  recoveryTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 5 },
  recoveryText: { color: colors.muted, fontSize: 9.5, lineHeight: 15, marginTop: 5 },
  recoveryButton: { minHeight: 43, marginTop: 11, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(180,216,174,0.28)', alignItems: 'center', justifyContent: 'center' },
  recoveryButtonText: { color: colors.success, fontSize: 10.5, fontWeight: '700' },
  success: { color: colors.success, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  error: { color: colors.danger, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  rules: { marginTop: 34, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  rulesTitle: { color: colors.text, fontSize: 11, fontWeight: '700', marginBottom: 7 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  ruleMark: { color: colors.success, fontSize: 10.5 },
  ruleText: { flex: 1, color: colors.subtle, fontSize: 9.4, lineHeight: 14 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
