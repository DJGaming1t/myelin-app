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

import { AppNav } from '@/src/components/app/AppNav';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { authErrorMessage } from '@/src/features/auth/auth-errors';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { useReview } from '@/src/features/review/ReviewProvider';
import {
  applyStudyDefaults,
  providerLabels,
  workspaceDataSummary,
} from '@/src/features/settings/settings-engine';
import { colors, radius, spacing } from '@/src/theme/tokens';

const DAILY = [30, 60, 90, 120, 180];
const FOCUS = [20, 25, 30, 45, 60];
const BREAKS = [5, 10, 15];

export default function SettingsScreen() {
  const {
    workspace,
    updateWorkspace,
    resetWorkspace,
    waitForSaves,
    ownerKey,
    saveError,
  } = useWorkspace();
  const {
    user,
    localMode,
    keepSignedIn,
    setKeepSignedIn,
    signOutUser,
    exitLocalMode,
    requestPasswordReset,
    refreshVerification,
  } = useAuth();
  const { discard: discardFocus, session: focusSession } = useFocus();
  const { discardReview, session: reviewSession } = useReview();

  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const summary = useMemo(
    () => (workspace ? workspaceDataSummary(workspace) : null),
    [workspace],
  );

  if (!workspace || !summary || !ownerKey) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loading}>Opening settings…</Text>
        </View>
      </SafeAreaView>
    );
  }

  function changeDefaults(
    field: 'dailyMinutes' | 'focusMinutes' | 'breakMinutes',
    value: number,
  ) {
    updateWorkspace((draft) => {
      applyStudyDefaults(draft.settings, {
        dailyMinutes:
          field === 'dailyMinutes' ? value : draft.settings.dailyMinutes,
        focusMinutes:
          field === 'focusMinutes' ? value : draft.settings.focusMinutes,
        breakMinutes:
          field === 'breakMinutes' ? value : draft.settings.breakMinutes,
      });
    });
  }

  async function changePersistence(value: boolean) {
    setAccountError('');
    setAccountMessage('');
    setAccountBusy(true);
    try {
      await setKeepSignedIn(value);
      setAccountMessage(
        value
          ? 'This account can stay signed in after the app closes.'
          : 'This account will use a non-persistent session on this device.',
      );
    } catch {
      setAccountError('Could not change session persistence right now.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function refreshAccount() {
    setAccountError('');
    setAccountMessage('');
    setAccountBusy(true);
    try {
      const verified = await refreshVerification();
      setAccountMessage(
        verified
          ? 'Account status refreshed. Email is verified.'
          : 'Account status refreshed. Email is not verified yet.',
      );
    } catch {
      setAccountError('Could not refresh account status.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function sendPasswordLink() {
    if (!user?.email) return;
    setAccountError('');
    setAccountMessage('');
    setAccountBusy(true);
    try {
      await requestPasswordReset(user.email);
      setAccountMessage('A password reset email was requested.');
    } catch (error) {
      setAccountError(authErrorMessage(error, 'reset'));
    } finally {
      setAccountBusy(false);
    }
  }

  function switchIdentity() {
    const title = localMode ? 'Leave local workspace?' : 'Switch account?';
    const message = localMode
      ? 'The local workspace will stay on this device. It is not automatically moved into the account you sign in with.'
      : 'Your current account workspace stays stored separately on this device. Signing out does not erase it.';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: localMode ? 'Continue to sign in' : 'Sign out',
        onPress: async () => {
          if (localMode) await exitLocalMode();
          else await signOutUser();
          router.replace('/');
        },
      },
    ]);
  }

  function confirmReset() {
    Alert.alert(
      'Reset this workspace?',
      'This permanently removes this workspace’s topics, questions, exams, mistakes, study history, breaks, settings, backups and any quarantined recovery copy stored on this device. It does not delete your Firebase account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset workspace',
          style: 'destructive',
          onPress: async () => {
            setResetBusy(true);
            try {
              await Promise.all([
                focusSession ? discardFocus() : Promise.resolve(),
                reviewSession ? discardReview() : Promise.resolve(),
              ]);
              await waitForSaves();
              await resetWorkspace();
            } finally {
              setResetBusy(false);
            }
          },
        },
      ],
    );
  }

  const providers = user
    ? providerLabels(user.providerData.map((item) => item.providerId))
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <ScreenHeader
          eyebrow="CONTROL"
          title="Settings"
          subtitle="Study defaults, account session choices, accessibility and local-data controls."
          actionLabel="Today"
          onAction={() => router.push('/(app)/today')}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Section
            title="Study defaults"
            subtitle="Today can still override available time and energy for a specific day.">
            <ChoiceSetting
              label="Daily capacity"
              value={workspace.settings.dailyMinutes}
              options={DAILY}
              format={(value) => (value >= 60 && value % 60 === 0 ? `${value / 60}h` : `${value}m`)}
              onChange={(value) => changeDefaults('dailyMinutes', value)}
            />
            <ChoiceSetting
              label="Focus block"
              value={workspace.settings.focusMinutes}
              options={FOCUS}
              format={(value) => `${value}m`}
              onChange={(value) => changeDefaults('focusMinutes', value)}
            />
            <ChoiceSetting
              label="Break"
              value={workspace.settings.breakMinutes}
              options={BREAKS}
              format={(value) => `${value}m`}
              onChange={(value) => changeDefaults('breakMinutes', value)}
            />
          </Section>

          <Section
            title="Accessibility"
            subtitle="Text uses the device’s normal font-scaling behavior.">
            <SwitchRow
              label="Reduce motion"
              helper="Removes protected-app route fade transitions. Other motion will also respect this preference as polish is added."
              value={workspace.settings.reduceMotion}
              onValueChange={(value) =>
                updateWorkspace((draft) => {
                  draft.settings.reduceMotion = value;
                })
              }
            />
          </Section>

          <Section
            title="Account & session"
            subtitle={
              localMode
                ? 'You are using a local-only workspace with no signed-in identity.'
                : 'Firebase Authentication handles account identity. Study records remain local in this build.'
            }>
            {localMode ? (
              <>
                <StatusRow label="MODE" value="Local only" tone="accent" />
                <StatusRow label="WORKSPACE" value="This device" />
                <InfoBox>
                  Nothing from this workspace is uploaded. Signing in later will not silently merge or move this local data.
                </InfoBox>
              </>
            ) : user ? (
              <>
                <StatusRow
                  label="ACCOUNT"
                  value={user.displayName?.trim() || user.email || 'Signed in'}
                />
                {user.displayName?.trim() && user.email ? (
                  <StatusRow label="EMAIL" value={user.email} />
                ) : null}
                <StatusRow
                  label="VERIFICATION"
                  value={user.emailVerified ? 'Verified' : 'Not verified'}
                  tone={user.emailVerified ? 'success' : 'danger'}
                />
                <StatusRow label="SIGN-IN METHOD" value={providers.join(' + ')} />

                <SwitchRow
                  label="Keep me signed in"
                  helper="Turn this off on a shared device. It changes Firebase session persistence; it does not delete your local workspace."
                  value={keepSignedIn}
                  disabled={accountBusy}
                  onValueChange={(value) => void changePersistence(value)}
                />

                <View style={styles.accountActions}>
                  <SmallAction
                    label="Refresh account status"
                    disabled={accountBusy}
                    onPress={() => void refreshAccount()}
                  />
                  {user.email ? (
                    <SmallAction
                      label="Send password reset email"
                      disabled={accountBusy}
                      onPress={() => void sendPasswordLink()}
                    />
                  ) : null}
                </View>
              </>
            ) : null}

            {accountMessage ? (
              <Text style={styles.successMessage}>{accountMessage}</Text>
            ) : null}
            {accountError ? <Text style={styles.errorMessage}>{accountError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              onPress={switchIdentity}
              style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}>
              <Text style={styles.switchButtonText}>
                {localMode ? 'Sign in or create account' : 'Sign out / switch account'}
              </Text>
              <Text style={styles.switchArrow}>→</Text>
            </Pressable>
          </Section>

          <Section
            title="Privacy"
            subtitle="What leaves this device in the current native build.">
            <PrivacyRow
              label="Study data"
              value="On-device only"
              helper="Topics, answers, mistakes, progress, exams and study history are stored locally per workspace."
            />
            <PrivacyRow
              label="Cloud sync"
              value="Off"
              helper="Firestore sync has not been enabled yet."
            />
            <PrivacyRow
              label="Analytics"
              value="Off"
              helper="Firebase Analytics is not initialized in this native build."
            />
            <PrivacyRow
              label="Authentication"
              value={localMode ? 'Not used' : 'Firebase Auth'}
              helper={
                localMode
                  ? 'Local mode does not require an account.'
                  : 'Firebase receives the account information required for authentication. Study records are separate.'
              }
            />
          </Section>

          <Section
            title="Local data"
            subtitle="Counts below describe only the currently selected workspace.">
            <View style={styles.dataGrid}>
              <DataMetric label="TOPICS" value={summary.topics} />
              <DataMetric label="QUESTIONS" value={summary.questions} />
              <DataMetric label="EXAMS" value={summary.exams} />
              <DataMetric label="MISTAKES" value={summary.mistakes} />
              <DataMetric label="SESSIONS" value={summary.sessions} />
              <DataMetric label="BREAKS" value={summary.breaks} />
            </View>

            <InfoBox>
              Signing out leaves this account’s local workspace on this device so it can be restored when the same account signs in again. Different accounts use separate local workspace keys.
            </InfoBox>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/settings/data-transfer')}
              style={({ pressed }) => [styles.transferButton, pressed && styles.pressed]}>
              <View>
                <Text style={styles.transferTitle}>Backup & migration</Text>
                <Text style={styles.transferText}>Export, inspect and import MYELIN JSON backups</Text>
              </View>
              <Text style={styles.transferArrow}>→</Text>
            </Pressable>

            {saveError ? <Text style={styles.errorMessage}>Save issue: {saveError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={resetBusy}
              onPress={confirmReset}
              style={({ pressed }) => [
                styles.resetButton,
                resetBusy && styles.disabled,
                pressed && !resetBusy && styles.pressed,
              ]}>
              <View>
                <Text style={styles.resetTitle}>
                  {resetBusy ? 'Resetting…' : 'Reset this workspace'}
                </Text>
                <Text style={styles.resetText}>Permanent on-device deletion for this workspace</Text>
              </View>
              <Text style={styles.resetArrow}>→</Text>
            </Pressable>
          </Section>

          <View style={styles.bottomNote}>
            <Text style={styles.bottomNoteTitle}>Account deletion is different from workspace reset.</Text>
            <Text style={styles.bottomNoteText}>
              This screen does not pretend that resetting local study data deletes a Firebase account. Account/cloud data lifecycle will be handled alongside Cloud Sync, where it can be implemented and tested as one complete path.
            </Text>
          </View>
        </ScrollView>

        <AppNav />
      </View>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ChoiceSetting({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.settingBlock}>
      <View style={styles.settingTop}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingValue}>{format(value)}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: option === value }}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.choice,
              option === value && styles.choiceActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.choiceText, option === value && styles.choiceTextActive]}>
              {format(option)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function SwitchRow({
  label,
  helper,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  helper: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.switchRow, disabled && styles.disabled]}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Text style={styles.switchHelper}>{helper}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: '#29292B', true: '#5C3024' }}
        thumbColor={value ? colors.accent : '#B8B8B4'}
      />
    </View>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'accent' | 'success' | 'danger';
}) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text
        style={[
          styles.statusValue,
          tone === 'accent' && styles.accentText,
          tone === 'success' && styles.successText,
          tone === 'danger' && styles.dangerText,
        ]}>
        {value}
      </Text>
    </View>
  );
}

function PrivacyRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <View style={styles.privacyRow}>
      <View style={styles.privacyTop}>
        <Text style={styles.privacyLabel}>{label}</Text>
        <Text style={styles.privacyValue}>{value}</Text>
      </View>
      <Text style={styles.privacyHelper}>{helper}</Text>
    </View>
  );
}

function DataMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.dataMetric}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function SmallAction({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallAction,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, fontSize: 12 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 3 },
  sectionBody: { marginTop: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  settingBlock: { paddingVertical: 4, marginBottom: 13 },
  settingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  settingLabel: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  settingValue: { color: colors.accent, fontSize: 10.5, fontWeight: '800' },
  choiceRow: { gap: 7, paddingTop: 9 },
  choice: { minWidth: 48, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { borderColor: 'rgba(255,128,91,0.42)', backgroundColor: colors.accentSoft },
  choiceText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  choiceTextActive: { color: colors.accent },
  switchRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1 },
  switchLabel: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  switchHelper: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  statusRow: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  statusValue: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: '700', textAlign: 'right' },
  accentText: { color: colors.accent },
  successText: { color: colors.success },
  dangerText: { color: colors.danger },
  infoBox: { marginTop: 11, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 10 },
  infoText: { color: colors.muted, fontSize: 9.5, lineHeight: 15 },
  accountActions: { gap: 7, marginTop: 11 },
  smallAction: { minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  smallActionText: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  successMessage: { color: colors.success, fontSize: 9.5, lineHeight: 14, marginTop: 10 },
  errorMessage: { color: colors.danger, fontSize: 9.5, lineHeight: 14, marginTop: 10 },
  switchButton: { minHeight: 52, marginTop: 12, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,128,91,0.24)', backgroundColor: colors.accentSoft, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchButtonText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  switchArrow: { color: colors.accent, fontSize: 18 },
  privacyRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  privacyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  privacyLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  privacyValue: { color: colors.success, fontSize: 9.5, fontWeight: '800' },
  privacyHelper: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  dataMetric: { width: '31.7%', minHeight: 56, borderRadius: radius.md, backgroundColor: colors.bg, padding: 9, justifyContent: 'space-between' },
  dataLabel: { color: colors.subtle, fontSize: 7, fontWeight: '800', letterSpacing: 0.9 },
  dataValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  transferButton: { minHeight: 56, marginTop: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  transferTitle: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  transferText: { color: colors.subtle, fontSize: 8.8, marginTop: 3 },
  transferArrow: { color: colors.accent, fontSize: 18 },
  resetButton: { minHeight: 60, marginTop: 16, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,161,145,0.25)', backgroundColor: 'rgba(255,161,145,0.04)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resetTitle: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  resetText: { color: colors.subtle, fontSize: 8.8, marginTop: 3 },
  resetArrow: { color: colors.danger, fontSize: 18 },
  bottomNote: { marginTop: 2, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  bottomNoteTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700' },
  bottomNoteText: { color: colors.subtle, fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
