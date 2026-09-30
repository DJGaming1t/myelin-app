import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '@/src/components/auth/AuthButton';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { workspaceOwnerLabel } from '@/src/data/owner';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function WorkspaceCheckpointScreen() {
  const { user, localMode, signOutUser, exitLocalMode } = useAuth();
  const {
    status,
    ownerKey,
    workspace,
    recovered,
    resetBecauseCorrupt,
    saveError,
  } = useWorkspace();

  async function leave() {
    if (localMode) await exitLocalMode();
    else await signOutUser();
    router.replace('/');
  }

  const title = localMode
    ? 'Local workspace isolated.'
    : `Workspace ready${user?.displayName ? `, ${user.displayName}` : ''}.`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brand}>MYELIN</Text>
        </View>

        <View style={styles.center}>
          <Text style={styles.eyebrow}>OFFLINE DATA CHECKPOINT</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            {localMode
              ? 'This device-only workspace is stored separately from every Firebase account.'
              : 'This workspace is keyed to your Firebase UID, not your email address. Switching accounts loads a different local dataset.'}
          </Text>

          {status === 'loading' ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Opening workspace…</Text>
            </View>
          ) : null}

          {status === 'error' ? (
            <View style={[styles.notice, styles.noticeDanger]}>
              <Text style={styles.noticeTitle}>Workspace could not be opened</Text>
              <Text style={styles.noticeText}>{saveError || 'Unknown storage error.'}</Text>
            </View>
          ) : null}

          {recovered ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Recovered a safe copy</Text>
              <Text style={styles.noticeText}>
                MYELIN restored the newest valid pending or backup save after detecting a problem with the primary copy.
              </Text>
            </View>
          ) : null}

          {resetBecauseCorrupt ? (
            <View style={[styles.notice, styles.noticeDanger]}>
              <Text style={styles.noticeTitle}>Damaged data was quarantined</Text>
              <Text style={styles.noticeText}>
                None of the saved copies passed validation, so MYELIN opened a fresh workspace and kept the damaged raw data separately for later recovery tools.
              </Text>
            </View>
          ) : null}

          {workspace && ownerKey ? (
            <View style={styles.statusCard}>
              <StatusRow
                label="WORKSPACE"
                value={workspaceOwnerLabel(ownerKey) === 'account' ? 'Firebase account' : 'This device only'}
              />
              <Divider />
              <StatusRow label="SCHEMA" value={`v${workspace.schemaVersion}`} />
              <Divider />
              <StatusRow label="REVISION" value={String(workspace.revision)} />
              <Divider />
              <StatusRow label="TOPICS" value={String(workspace.topics.length)} />
              <Divider />
              <StatusRow label="SESSIONS" value={String(workspace.history.length)} />
              <Divider />
              <StatusRow label="MISTAKES" value={String(workspace.mistakes.length)} />
            </View>
          ) : null}

          {saveError && status === 'ready' ? (
            <Text style={styles.saveError}>Latest save problem: {saveError}</Text>
          ) : null}
        </View>

        <AuthButton
          label={localMode ? 'Return to sign in' : 'Sign out'}
          variant="secondary"
          onPress={leave}
        />
      </View>
    </SafeAreaView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  center: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '600',
    letterSpacing: -1.5,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.md,
    maxWidth: 540,
  },
  loading: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  loadingText: { color: colors.muted, fontSize: 12 },
  notice: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(180,216,174,0.2)',
    backgroundColor: 'rgba(180,216,174,0.06)',
    padding: 12,
  },
  noticeDanger: {
    borderColor: 'rgba(255,161,145,0.22)',
    backgroundColor: 'rgba(255,161,145,0.055)',
  },
  noticeTitle: { color: colors.text, fontSize: 11, fontWeight: '700' },
  noticeText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  statusCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  statusLabel: { color: colors.subtle, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.3 },
  statusValue: { color: colors.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
  saveError: { color: colors.danger, fontSize: 10.5, lineHeight: 16, marginTop: spacing.md },
});
