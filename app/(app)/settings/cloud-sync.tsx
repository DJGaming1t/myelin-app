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
import { useAuth } from '@/src/features/auth/AuthProvider';
import {
  CloudSyncStatus,
  useCloudSync,
} from '@/src/features/cloud-sync/CloudSyncProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';

function statusLabel(status: CloudSyncStatus) {
  switch (status) {
    case 'unavailable':
      return 'Not activated';
    case 'off':
      return 'Off';
    case 'idle':
      return 'Ready';
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return 'Synced';
    case 'paused':
      return 'Paused';
    case 'conflict':
      return 'Needs choice';
    case 'error':
      return 'Error';
  }
}

function statusTone(status: CloudSyncStatus) {
  if (status === 'synced') return 'success' as const;
  if (status === 'conflict' || status === 'error') return 'danger' as const;
  if (status === 'syncing' || status === 'paused') return 'accent' as const;
  return 'muted' as const;
}

function dateLabel(timestamp: number) {
  if (!timestamp) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function CloudSyncScreen() {
  const { user, localMode } = useAuth();
  const {
    releaseEnabled,
    enabled,
    preferenceReady,
    status,
    message,
    lastSyncAt,
    conflict,
    enableSync,
    disableSync,
    syncNow,
    resolveConflict,
    deleteCloudCopy,
    deleteAccountAndCloud,
  } = useCloudSync();

  const [busyAction, setBusyAction] = useState('');

  const signedIn = Boolean(user && !localMode);
  const canSync = releaseEnabled && signedIn && preferenceReady;
  const busy = status === 'syncing' || Boolean(busyAction);

  const explanation = useMemo(() => {
    if (!releaseEnabled) {
      return 'The cloud-sync code and Security Rules are installed in this branch, but production upload is intentionally locked until the tested rules are deployed to the Firebase project.';
    }
    if (localMode) {
      return 'Local-only mode never uploads study data. Sign in to a verified account if you want cross-device sync.';
    }
    if (!user) {
      return 'Sign in to use cloud sync. Anonymous/local workspaces are never uploaded.';
    }
    return 'MYELIN keeps the device workspace as the offline source of truth. Firestore is used only to move validated snapshots between devices.';
  }, [localMode, releaseEnabled, user]);

  async function action(name: string, run: () => Promise<void>) {
    setBusyAction(name);
    try {
      await run();
    } finally {
      setBusyAction('');
    }
  }

  function confirmDisable() {
    Alert.alert(
      'Turn off cloud sync?',
      'Your cloud copy will remain stored, but this device will stop checking or uploading changes until you turn sync on again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          onPress: () => void action('disable', disableSync),
        },
      ],
    );
  }

  function confirmDeleteCloud() {
    Alert.alert(
      'Delete cloud copy?',
      'This deletes MYELIN study data stored in Firestore for this account. Your local workspace stays on this device and sync is turned off.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete cloud copy',
          style: 'destructive',
          onPress: () => void action('delete-cloud', deleteCloudCopy),
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account and study data?',
      'MYELIN will first delete the Firestore study copy, then request deletion of the Firebase account. If Firebase requires a recent sign-in, the account deletion will stop and you can sign in again to retry. If account deletion succeeds, this device workspace is also erased.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void action('delete-account', deleteAccountAndCloud),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        eyebrow="CLOUD"
        title="Cloud sync"
        subtitle="Cross-device sync with explicit conflict handling and per-user Firestore access."
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View>
              <Text style={styles.eyebrow}>STATUS</Text>
              <Text
                style={[
                  styles.status,
                  statusTone(status) === 'success' && styles.success,
                  statusTone(status) === 'danger' && styles.danger,
                  statusTone(status) === 'accent' && styles.accent,
                ]}>
                {statusLabel(status)}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {enabled ? 'SYNC ON' : 'SYNC OFF'}
              </Text>
            </View>
          </View>

          <Text style={styles.explanation}>{explanation}</Text>

          <View style={styles.meta}>
            <Meta label="ACCOUNT" value={signedIn ? 'Signed in' : 'Local / signed out'} />
            <Meta label="LAST SYNC" value={dateLabel(lastSyncAt)} />
            <Meta
              label="OFFLINE STORAGE"
              value="AsyncStorage"
            />
          </View>

          {message ? (
            <View
              style={[
                styles.messageBox,
                (status === 'error' || status === 'conflict') &&
                  styles.messageDanger,
              ]}>
              <Text
                style={[
                  styles.messageText,
                  (status === 'error' || status === 'conflict') &&
                    styles.messageDangerText,
                ]}>
                {message}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync controls</Text>
          <Text style={styles.sectionText}>
            Cloud sync is opt-in. Turning it on never changes local-only workspaces.
          </Text>

          {!enabled ? (
            <ActionButton
              title={releaseEnabled ? 'Enable cloud sync' : 'Cloud sync activation locked'}
              detail={
                releaseEnabled
                  ? 'Compare this device with the cloud before any upload or download'
                  : 'Deploy the tested Firestore rules before enabling production uploads'
              }
              disabled={!canSync || busy}
              onPress={() => void action('enable', enableSync)}
              accent
            />
          ) : (
            <>
              <ActionButton
                title="Sync now"
                detail="Check this device and the cloud immediately"
                disabled={busy}
                onPress={() => void action('sync', syncNow)}
                accent
              />
              <ActionButton
                title="Turn off cloud sync"
                detail="Keep the existing cloud copy but stop automatic checks"
                disabled={busy}
                onPress={confirmDisable}
              />
            </>
          )}
        </View>

        {conflict ? (
          <View style={styles.conflictCard}>
            <Text style={styles.conflictEyebrow}>CONFLICT</Text>
            <Text style={styles.conflictTitle}>Both copies changed.</Text>
            <Text style={styles.conflictText}>
              MYELIN will not guess which copy is correct. Choose one source, or
              merge safely. A cloud/merge choice is blocked while a Focus or
              Review session is active.
            </Text>

            <View style={styles.conflictActions}>
              <SmallChoice
                title="Keep this device"
                detail="Upload this local workspace"
                disabled={busy}
                onPress={() =>
                  void action('device', () => resolveConflict('device'))
                }
              />
              <SmallChoice
                title="Use cloud"
                detail="Replace this device copy"
                disabled={busy}
                onPress={() =>
                  void action('cloud', () => resolveConflict('cloud'))
                }
              />
              <SmallChoice
                title="Merge safely"
                detail="Keep both when IDs conflict"
                disabled={busy}
                onPress={() =>
                  void action('merge', () => resolveConflict('merge'))
                }
              />
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What is synchronized</Text>
          <Text style={styles.sectionText}>
            The cloud snapshot includes study records already present in the
            native workspace. Authentication secrets are never part of the
            snapshot.
          </Text>

          <View style={styles.listCard}>
            <Rule text="Topics, notes, recall questions and review scheduling" />
            <Rule text="Exams, mistakes, study/review history and break history" />
            <Rule text="Study defaults and accessibility settings" />
            <Rule text="No Firebase password, auth token or Google credential" />
            <Rule text="Active Focus/Review drafts stay local and are not guessed into cloud history" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud data controls</Text>
          <Text style={styles.sectionText}>
            These actions are separate from ordinary local workspace reset.
          </Text>

          <ActionButton
            title="Delete cloud copy"
            detail="Keep this account and local workspace; remove Firestore study data"
            disabled={!releaseEnabled || !signedIn || busy}
            onPress={confirmDeleteCloud}
            danger
          />

          <ActionButton
            title="Delete account & study data"
            detail="Delete cloud study data, Firebase account, then this device workspace"
            disabled={!releaseEnabled || !signedIn || busy}
            onPress={confirmDeleteAccount}
            danger
          />
        </View>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Offline-first by design</Text>
          <Text style={styles.noteText}>
            The Firebase JavaScript SDK does not provide persistent Firestore
            cache in React Native, so MYELIN does not depend on it. Study work is
            saved locally first; Firestore is a validated transport for
            cross-device copies.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  title,
  detail,
  disabled,
  onPress,
  accent,
  danger,
}: {
  title: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        accent && styles.actionAccent,
        danger && styles.actionDanger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={styles.actionCopy}>
        <Text
          style={[
            styles.actionTitle,
            accent && styles.actionTitleAccent,
            danger && styles.actionTitleDanger,
          ]}>
          {title}
        </Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Text
        style={[
          styles.actionArrow,
          accent && styles.actionTitleAccent,
          danger && styles.actionTitleDanger,
        ]}>
        →
      </Text>
    </Pressable>
  );
}

function SmallChoice({
  title,
  detail,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceDetail}>{detail}</Text>
    </Pressable>
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
  content: { paddingHorizontal: spacing.lg, paddingBottom: 56 },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  statusTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  eyebrow: {
    color: colors.subtle,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  status: {
    color: colors.muted,
    fontSize: 19,
    fontWeight: '700',
    marginTop: 4,
  },
  success: { color: colors.success },
  danger: { color: colors.danger },
  accent: { color: colors.accent },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  pillText: {
    color: colors.subtle,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  explanation: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 12,
  },
  meta: {
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 7,
  },
  metaRow: {
    minHeight: 31,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  metaLabel: {
    color: colors.subtle,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  metaValue: {
    color: colors.text,
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'right',
  },
  messageBox: {
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 10,
  },
  messageDanger: {
    borderColor: 'rgba(255,161,145,0.25)',
    backgroundColor: 'rgba(255,161,145,0.04)',
  },
  messageText: { color: colors.muted, fontSize: 9.4, lineHeight: 15 },
  messageDangerText: { color: colors.danger },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  sectionText: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 15,
    marginTop: 4,
    marginBottom: 9,
  },
  action: {
    minHeight: 61,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionAccent: {
    borderColor: 'rgba(255,128,91,0.28)',
    backgroundColor: colors.accentSoft,
  },
  actionDanger: {
    borderColor: 'rgba(255,161,145,0.22)',
    backgroundColor: 'rgba(255,161,145,0.035)',
  },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.text, fontSize: 11.2, fontWeight: '700' },
  actionTitleAccent: { color: colors.accent },
  actionTitleDanger: { color: colors.danger },
  actionDetail: {
    color: colors.subtle,
    fontSize: 8.7,
    lineHeight: 13,
    marginTop: 3,
  },
  actionArrow: { color: colors.muted, fontSize: 18 },
  conflictCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.28)',
    backgroundColor: 'rgba(255,161,145,0.035)',
    padding: spacing.md,
  },
  conflictEyebrow: {
    color: colors.danger,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  conflictTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },
  conflictText: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 15,
    marginTop: 5,
  },
  conflictActions: { gap: 7, marginTop: 12 },
  choice: {
    minHeight: 53,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 10,
  },
  choiceTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  choiceDetail: { color: colors.subtle, fontSize: 8.7, marginTop: 3 },
  listCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 11,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 7,
  },
  ruleMark: { color: colors.success, fontSize: 10 },
  ruleText: { flex: 1, color: colors.muted, fontSize: 9.3, lineHeight: 14 },
  note: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  noteTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  noteText: {
    color: colors.subtle,
    fontSize: 9.3,
    lineHeight: 15,
    marginTop: 4,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
