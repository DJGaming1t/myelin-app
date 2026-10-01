import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  ReminderVoice,
  buildReminderPlan,
  formatTimeMinutes,
  normalizeReminderSettings,
} from '@/src/features/notifications/reminder-engine';
import { useReminders } from '@/src/features/notifications/ReminderProvider';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

const REVIEW_PRESETS = [
  { label: 'Before school', value: 7 * 60 + 15 },
  { label: 'Reset', value: 16 * 60 + 30 },
  { label: 'Evening', value: 19 * 60 + 15 },
];

const EXAM_PRESETS = [
  { label: 'Morning', value: 7 * 60 + 30 },
  { label: 'After school', value: 16 * 60 + 45 },
  { label: 'Evening', value: 18 * 60 + 30 },
];

const VOICES: Array<{
  id: ReminderVoice;
  name: string;
  mark: string;
  description: string;
}> = [
  {
    id: 'calm',
    name: 'Calm',
    mark: '◌',
    description: 'Quiet, low-pressure wording with room to choose when to act.',
  },
  {
    id: 'signal',
    name: 'Signal',
    mark: '⌁',
    description: 'Compact and information-first: what is ready and where to begin.',
  },
  {
    id: 'spark',
    name: 'Spark',
    mark: '✦',
    description: 'Warmer, playful nudges without streaks, guilt or urgency tricks.',
  },
];

function permissionLabel(value: string) {
  if (value === 'granted') return 'Allowed';
  if (value === 'denied') return 'Blocked by device';
  if (value === 'unsupported') return 'Unavailable on web';
  return 'Not asked yet';
}

export default function RemindersScreen() {
  const { workspace } = useWorkspace();
  const {
    ready,
    status,
    permission,
    settings,
    scheduledCount,
    plannedCount,
    message,
    updateSettings,
    enable,
    disable,
    reschedule,
    sendPreview,
    refreshPermission,
  } = useReminders();

  const [busy, setBusy] = useState('');

  const previewPlan = useMemo(() => {
    if (!workspace) return [];
    return buildReminderPlan(
      workspace,
      normalizeReminderSettings({ ...settings, enabled: true }),
      Date.now(),
    ).slice(0, 2);
  }, [settings, workspace]);

  const voice = VOICES.find((item) => item.id === settings.voice)!;
  const disabled = !ready || status === 'scheduling' || Boolean(busy);

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    try {
      await action();
    } finally {
      setBusy('');
    }
  }

  function toggleOffset(offset: number) {
    const exists = settings.examOffsets.includes(offset);
    if (exists && settings.examOffsets.length === 1) return;

    const next = exists
      ? settings.examOffsets.filter((item) => item !== offset)
      : [...settings.examOffsets, offset];

    void updateSettings({ examOffsets: next });
  }

  function confirmDisable() {
    Alert.alert(
      'Turn reminders off?',
      'Scheduled MYELIN reminders will be cancelled on this device. Your personality, times and quiet hours will stay saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          onPress: () => void run('disable', disable),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScreenHeader
        eyebrow="NUDGES, NOT PRESSURE"
        title="Reminders"
        subtitle="Make study notifications feel useful enough to open and calm enough to ignore when life is busy."
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroOrb}>
            <Text style={styles.heroOrbText}>{voice.mark}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>CURRENT PERSONALITY</Text>
            <Text style={styles.heroTitle}>{voice.name}</Text>
            <Text style={styles.heroText}>{voice.description}</Text>
          </View>
          <View style={[styles.statusPill, settings.enabled && styles.statusPillOn]}>
            <Text
              style={[
                styles.statusPillText,
                settings.enabled && styles.statusPillTextOn,
              ]}>
              {settings.enabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>

        <View style={styles.previewShell}>
          <View style={styles.previewHeader}>
            <Text style={styles.sectionEyebrow}>LIVE PREVIEW</Text>
            <Text style={styles.previewMeta}>
              {previewPlan.length
                ? `${plannedCount} currently useful`
                : 'Preview copy'}
            </Text>
          </View>

          <NotificationPreview
            voice={settings.voice}
            item={previewPlan[0]}
            fallbackKind="review"
          />

          <View style={styles.stackOffset}>
            <NotificationPreview
              voice={settings.voice}
              item={previewPlan[1]}
              fallbackKind="exam"
              dimmed
            />
          </View>
        </View>

        <Section
          title="Choose a personality"
          subtitle="The information stays factual. Only the tone changes.">
          <View style={styles.voiceGrid}>
            {VOICES.map((item) => {
              const active = settings.voice === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={disabled}
                  onPress={() => void updateSettings({ voice: item.id })}
                  style={({ pressed }) => [
                    styles.voiceCard,
                    active && styles.voiceCardActive,
                    pressed && !disabled && styles.pressed,
                  ]}>
                  <View style={styles.voiceTop}>
                    <Text
                      style={[
                        styles.voiceMark,
                        active && styles.voiceMarkActive,
                      ]}>
                      {item.mark}
                    </Text>
                    {active ? <Text style={styles.selected}>SELECTED</Text> : null}
                  </View>
                  <Text style={styles.voiceName}>{item.name}</Text>
                  <Text style={styles.voiceText}>{item.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          title="Review window"
          subtitle="At most one due-review digest is planned per day. No due work means no review notification.">
          <ToggleRow
            label="Due-review reminders"
            helper="Uses actual recall cards and unresolved mistakes that are ready for review."
            value={settings.reviewEnabled}
            disabled={disabled}
            onChange={(value) => void updateSettings({ reviewEnabled: value })}
          />

          <PresetRow
            value={settings.reviewTimeMinutes}
            presets={REVIEW_PRESETS}
            disabled={disabled || !settings.reviewEnabled}
            onChange={(value) => void updateSettings({ reviewTimeMinutes: value })}
          />

          <TimeStepper
            label="Review time"
            value={settings.reviewTimeMinutes}
            disabled={disabled || !settings.reviewEnabled}
            onChange={(value) => void updateSettings({ reviewTimeMinutes: value })}
          />
        </Section>

        <Section
          title="Exam check-ins"
          subtitle="Exam reminders point back to the exam plan. They do not predict marks or claim how prepared you are.">
          <ToggleRow
            label="Upcoming-exam reminders"
            helper="Short check-ins before exams that already exist in MYELIN."
            value={settings.examEnabled}
            disabled={disabled}
            onChange={(value) => void updateSettings({ examEnabled: value })}
          />

          <PresetRow
            value={settings.examTimeMinutes}
            presets={EXAM_PRESETS}
            disabled={disabled || !settings.examEnabled}
            onChange={(value) => void updateSettings({ examTimeMinutes: value })}
          />

          <TimeStepper
            label="Exam reminder time"
            value={settings.examTimeMinutes}
            disabled={disabled || !settings.examEnabled}
            onChange={(value) => void updateSettings({ examTimeMinutes: value })}
          />

          <Text style={styles.microLabel}>REMIND ME BEFORE</Text>
          <View style={styles.offsetRow}>
            {[7, 3, 1].map((offset) => {
              const active = settings.examOffsets.includes(offset);
              return (
                <Pressable
                  key={offset}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={disabled || !settings.examEnabled}
                  onPress={() => toggleOffset(offset)}
                  style={({ pressed }) => [
                    styles.offsetChip,
                    active && styles.offsetChipActive,
                    pressed && !disabled && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.offsetText,
                      active && styles.offsetTextActive,
                    ]}>
                    {offset === 1 ? '1 day' : `${offset} days`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          title="Planned study blocks"
          subtitle="One gentle heads-up before scheduled Day Map study. Moving the block automatically replaces the old reminder.">
          <ToggleRow
            label="Day Map reminders"
            helper="Only scheduled study tasks can create these reminders. Flexible Today and Inbox work stay silent."
            value={settings.studyBlockEnabled}
            disabled={disabled}
            onChange={(value) => void updateSettings({ studyBlockEnabled: value })}
          />

          <Text style={styles.microLabel}>REMIND ME BEFORE</Text>
          <View style={styles.offsetRow}>
            {[5, 10, 15].map((minutes) => {
              const active = settings.studyLeadMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={disabled || !settings.studyBlockEnabled}
                  onPress={() => void updateSettings({ studyLeadMinutes: minutes })}
                  style={({ pressed }) => [
                    styles.offsetChip,
                    active && styles.offsetChipActive,
                    pressed && !disabled && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.offsetText,
                      active && styles.offsetTextActive,
                    ]}>
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section
          title="Quiet hours"
          subtitle="Quiet hours always win. A reminder landing inside this window is moved to the end of quiet hours.">
          <View style={styles.quietGrid}>
            <TimeStepper
              compact
              label="Starts"
              value={settings.quietStartMinutes}
              disabled={disabled}
              onChange={(value) => void updateSettings({ quietStartMinutes: value })}
            />
            <TimeStepper
              compact
              label="Ends"
              value={settings.quietEndMinutes}
              disabled={disabled}
              onChange={(value) => void updateSettings({ quietEndMinutes: value })}
            />
          </View>
        </Section>

        <Section
          title="Sound & delivery"
          subtitle="MYELIN uses normal or low-interruption channels—never high/max alarm-style importance.">
          <ToggleRow
            label="Use system sound"
            helper={
              settings.sound
                ? 'Uses the device’s normal notification sound.'
                : 'Gentle channel: silent and non-vibrating by default.'
            }
            value={settings.sound}
            disabled={disabled}
            onChange={(value) => void updateSettings({ sound: value })}
          />

          <StatusLine label="PERMISSION" value={permissionLabel(permission)} />
          <StatusLine
            label="SCHEDULED"
            value={
              settings.enabled
                ? `${scheduledCount} on this device`
                : `${plannedCount} would be useful now`
            }
          />

          {permission === 'denied' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.secondaryButtonText}>Open device settings</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ) : null}

          {settings.enabled && permission === 'granted' ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void run('preview', sendPreview)}
              style={({ pressed }) => [
                styles.previewButton,
                disabled && styles.disabled,
                pressed && !disabled && styles.pressed,
              ]}>
              <View style={styles.previewButtonCopy}>
                <Text style={styles.previewButtonTitle}>
                  {busy === 'preview' ? 'Sending…' : 'Send live preview'}
                </Text>
                <Text style={styles.previewButtonText}>
                  See this personality as a real notification now
                </Text>
              </View>
              <Text style={styles.previewGlyph}>✦</Text>
            </Pressable>
          ) : null}
        </Section>

        {message ? (
          <View
            style={[
              styles.message,
              status === 'error' || status === 'blocked'
                ? styles.messageDanger
                : null,
            ]}>
            <Text
              style={[
                styles.messageText,
                status === 'error' || status === 'blocked'
                  ? styles.messageDangerText
                  : null,
              ]}>
              {message}
            </Text>
          </View>
        ) : null}

        <View style={styles.activationCard}>
          <Text style={styles.activationEyebrow}>
            {settings.enabled ? 'REMINDERS ACTIVE' : 'YOUR CHOICE'}
          </Text>
          <Text style={styles.activationTitle}>
            {settings.enabled
              ? 'Useful nudges, capped and quiet-hour aware.'
              : 'Nothing is scheduled until you choose to enable it.'}
          </Text>
          <Text style={styles.activationText}>
            Permission is requested only when you press Enable. MYELIN does not
            register for push tokens or send notification data to a reminder
            server in this feature.
          </Text>

          {!settings.enabled ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled || permission === 'unsupported'}
              onPress={() => void run('enable', enable)}
              style={({ pressed }) => [
                styles.primaryButton,
                (disabled || permission === 'unsupported') && styles.disabled,
                pressed && !disabled && styles.pressed,
              ]}>
              <Text style={styles.primaryButtonText}>
                {busy === 'enable' ? 'Enabling…' : 'Enable my reminders'}
              </Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>
          ) : (
            <View style={styles.activeActions}>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void run('refresh', reschedule)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.flexButton,
                  disabled && styles.disabled,
                  pressed && !disabled && styles.pressed,
                ]}>
                <Text style={styles.secondaryButtonText}>
                  {busy === 'refresh' ? 'Refreshing…' : 'Refresh schedule'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={confirmDisable}
                style={({ pressed }) => [
                  styles.offButton,
                  styles.flexButton,
                  disabled && styles.disabled,
                  pressed && !disabled && styles.pressed,
                ]}>
                <Text style={styles.offButtonText}>Turn off</Text>
              </Pressable>
            </View>
          )}

          {settings.enabled ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void run('permission', refreshPermission)}
              style={({ pressed }) => [
                styles.permissionRefresh,
                pressed && !disabled && styles.pressed,
              ]}>
              <Text style={styles.permissionRefreshText}>
                Refresh device permission
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.ethics}>
          <Text style={styles.ethicsTitle}>What MYELIN will not do</Text>
          <Rule text="No streak-loss threats, guilt, fake urgency or “you are falling behind” messages." />
          <Rule text="No more than two planned MYELIN reminders in a day." />
          <Rule text="No review reminder when the current workspace has nothing ready." />
          <Rule text="No exact-alarm permission just to force a study reminder at the precise second." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationPreview({
  item,
  voice,
  fallbackKind,
  dimmed,
}: {
  item?: ReturnType<typeof buildReminderPlan>[number];
  voice: ReminderVoice;
  fallbackKind: 'review' | 'exam';
  dimmed?: boolean;
}) {
  const fallback =
    fallbackKind === 'review'
      ? voice === 'signal'
        ? {
            title: '3 reviews ready',
            body: 'Start with Refraction. One focused recall round is enough.',
          }
        : voice === 'spark'
          ? {
              title: 'A small win is ready ✦',
              body: 'Refraction + 2 more are waiting in your review queue.',
            }
          : {
              title: 'A quiet review window',
              body: '3 reviews are ready. Refraction can be your first stop.',
            }
      : voice === 'signal'
        ? {
            title: 'Mathematics exam • in 3 days',
            body: 'Open the exam plan and choose one useful next step.',
          }
        : voice === 'spark'
          ? {
              title: 'Next-step spark ✦',
              body: 'Mathematics exam is in 3 days. Pick one clean move for today.',
            }
          : {
              title: 'A note for later',
              body: 'Mathematics exam is in 3 days. A short check-in is enough today.',
            };

  return (
    <View style={[styles.notification, dimmed && styles.notificationDim]}>
      <View style={styles.notificationTop}>
        <View style={styles.appDot}>
          <Text style={styles.appDotText}>M</Text>
        </View>
        <Text style={styles.notificationApp}>MYELIN</Text>
        <Text style={styles.notificationTime}>now</Text>
      </View>
      <Text style={styles.notificationTitle}>{item?.title ?? fallback.title}</Text>
      <Text style={styles.notificationBody}>{item?.body ?? fallback.body}</Text>
      <View style={styles.notificationBottom}>
        <Text style={styles.notificationKind}>
          {(item?.kind ?? fallbackKind).toUpperCase()}
        </Text>
        <Text style={styles.notificationAction}>
          {fallbackKind === 'review' ? 'Open recall →' : 'Open exam plan →'}
        </Text>
      </View>
    </View>
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

function ToggleRow({
  label,
  helper,
  value,
  disabled,
  onChange,
}: {
  label: string;
  helper: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.toggleRow, disabled && styles.disabled]}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHelper}>{helper}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: '#29292B', true: '#5C3024' }}
        thumbColor={value ? colors.accent : '#B8B8B4'}
      />
    </View>
  );
}

function PresetRow({
  value,
  presets,
  disabled,
  onChange,
}: {
  value: number;
  presets: Array<{ label: string; value: number }>;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.presetRow}>
      {presets.map((preset) => {
        const active = value === preset.value;
        return (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            disabled={disabled}
            onPress={() => onChange(preset.value)}
            style={({ pressed }) => [
              styles.preset,
              active && styles.presetActive,
              pressed && !disabled && styles.pressed,
            ]}>
            <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
              {preset.label}
            </Text>
            <Text style={[styles.presetTime, active && styles.presetTimeActive]}>
              {formatTimeMinutes(preset.value)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function TimeStepper({
  label,
  value,
  disabled,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  const shift = (delta: number) =>
    onChange(((value + delta) % 1440 + 1440) % 1440);

  return (
    <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
      <View>
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={styles.timeValue}>{formatTimeMinutes(value)}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 15 minutes earlier`}
          disabled={disabled}
          onPress={() => shift(-15)}
          style={({ pressed }) => [
            styles.stepButton,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}>
          <Text style={styles.stepButtonText}>−15</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 15 minutes later`}
          disabled={disabled}
          onPress={() => shift(15)}
          style={({ pressed }) => [
            styles.stepButton,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}>
          <Text style={styles.stepButtonText}>+15</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusLine}>
      <Text style={styles.statusLineLabel}>{label}</Text>
      <Text style={styles.statusLineValue}>{value}</Text>
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
  content: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  hero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroOrb: {
    width: 43,
    height: 43,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.35)',
    backgroundColor: 'rgba(255,128,91,0.11)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOrbText: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  heroCopy: { flex: 1 },
  heroEyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 3 },
  heroText: { color: colors.muted, fontSize: 11.3, lineHeight: 16, marginTop: 4 },
  statusPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusPillOn: {
    borderColor: 'rgba(180,216,174,0.3)',
    backgroundColor: 'rgba(180,216,174,0.06)',
  },
  statusPillText: {
    color: colors.subtle,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusPillTextOn: { color: colors.success },
  previewShell: { marginTop: spacing.xl },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  sectionEyebrow: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  previewMeta: { color: colors.muted, fontSize: 10.5 },
  notification: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.105)',
    backgroundColor: '#171719',
    padding: 13,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  notificationDim: { opacity: 0.62, transform: [{ scale: 0.975 }] },
  stackOffset: { marginTop: -3, paddingHorizontal: 7 },
  notificationTop: { flexDirection: 'row', alignItems: 'center' },
  appDot: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appDotText: { color: '#27150f', fontSize: 9, fontWeight: '900' },
  notificationApp: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginLeft: 7,
  },
  notificationTime: { color: colors.subtle, fontSize: 10, marginLeft: 'auto' },
  notificationTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 9 },
  notificationBody: { color: colors.muted, fontSize: 11.2, lineHeight: 16, marginTop: 3 },
  notificationBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  notificationKind: {
    color: colors.accent,
    fontSize: 9.2,
    fontWeight: '800',
    letterSpacing: 1,
  },
  notificationAction: { color: colors.subtle, fontSize: 10.3, fontWeight: '600' },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  sectionSubtitle: { color: colors.subtle, fontSize: 11.3, lineHeight: 16.5, marginTop: 4 },
  sectionBody: {
    marginTop: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  voiceGrid: { gap: 8 },
  voiceCard: {
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 11,
  },
  voiceCardActive: {
    borderColor: 'rgba(255,128,91,0.35)',
    backgroundColor: colors.accentSoft,
  },
  voiceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceMark: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  voiceMarkActive: { color: colors.accent },
  selected: {
    color: colors.accent,
    fontSize: 6.7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  voiceName: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 5 },
  voiceText: { color: colors.subtle, fontSize: 11, lineHeight: 16, marginTop: 3 },
  toggleRow: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleCopy: { flex: 1 },
  toggleLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  toggleHelper: { color: colors.subtle, fontSize: 11, lineHeight: 16, marginTop: 3 },
  presetRow: { gap: 7, paddingVertical: 7 },
  preset: {
    minWidth: 98,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 9,
  },
  presetActive: {
    borderColor: 'rgba(255,128,91,0.34)',
    backgroundColor: colors.accentSoft,
  },
  presetLabel: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  presetLabelActive: { color: colors.text },
  presetTime: { color: colors.subtle, fontSize: 10, marginTop: 3 },
  presetTimeActive: { color: colors.accent },
  timeRow: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 6,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timeRowCompact: { flex: 1, borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  timeLabel: { color: colors.subtle, fontSize: 10.5, fontWeight: '700' },
  timeValue: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 5 },
  stepButton: {
    minWidth: layout.minTouch,
    minHeight: layout.minTouch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  stepButtonText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  microLabel: {
    color: colors.subtle,
    fontSize: 7.2,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 7,
  },
  offsetRow: { flexDirection: 'row', gap: 7 },
  offsetChip: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offsetChipActive: {
    borderColor: 'rgba(255,128,91,0.35)',
    backgroundColor: colors.accentSoft,
  },
  offsetText: { color: colors.muted, fontSize: 10.8, fontWeight: '700' },
  offsetTextActive: { color: colors.accent },
  quietGrid: { flexDirection: 'row', gap: 13 },
  statusLine: {
    minHeight: 39,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusLineLabel: {
    color: colors.subtle,
    fontSize: 7.2,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusLineValue: { flex: 1, minWidth: 0, color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  previewButton: {
    minHeight: 57,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.28)',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  previewButtonTitle: { color: colors.text, fontSize: 12.2, fontWeight: '700' },
  previewButtonText: { color: colors.subtle, fontSize: 10.8, lineHeight: 15, marginTop: 3 },
  previewButtonCopy: { flex: 1, minWidth: 0 },
  previewGlyph: { color: colors.accent, fontSize: 17, flexShrink: 0 },
  message: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  messageDanger: {
    borderColor: 'rgba(255,161,145,0.25)',
    backgroundColor: 'rgba(255,161,145,0.04)',
  },
  messageText: { color: colors.muted, fontSize: 11.2, lineHeight: 16.5 },
  messageDangerText: { color: colors.danger },
  activationCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.22)',
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
  },
  activationEyebrow: {
    color: colors.accent,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  activationTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700', marginTop: 5 },
  activationText: { color: colors.muted, fontSize: 11.2, lineHeight: 16.5, marginTop: 5 },
  primaryButton: {
    minHeight: 49,
    marginTop: 13,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButtonText: { color: '#25140e', fontSize: 10.8, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 18 },
  secondaryButton: {
    minHeight: layout.minTouch,
    marginTop: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: { color: colors.text, fontSize: 11.2, fontWeight: '700' },
  arrow: { color: colors.accent, fontSize: 16, position: 'absolute', right: 11 },
  activeActions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  flexButton: { flex: 1 },
  offButton: {
    minHeight: layout.minTouch,
    marginTop: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,161,145,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  offButtonText: { color: colors.danger, fontSize: 11.2, fontWeight: '700' },
  permissionRefresh: { minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  permissionRefreshText: { color: colors.subtle, fontSize: 10.8, fontWeight: '600' },
  ethics: {
    marginTop: 31,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  ethicsTitle: { color: colors.text, fontSize: 10.5, fontWeight: '700', marginBottom: 8 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  ruleMark: { color: colors.success, fontSize: 10 },
  ruleText: { flex: 1, color: colors.subtle, fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
});
