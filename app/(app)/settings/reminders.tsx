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
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { Reveal } from '@/src/components/motion/Reveal';
import { useWorkspace } from '@/src/data/WorkspaceProvider';
import {
  ReminderDetail,
  ReminderKind,
  ReminderVoice,
  buildRecoveredReminderInsight,
  buildReminderPlan,
  buildReminderTimelineOverview,
  formatTimeMinutes,
  normalizeReminderSettings,
  sampleReminderCopy,
} from '@/src/features/notifications/reminder-engine';
import { useReminders } from '@/src/features/notifications/ReminderProvider';
import {
  reminderColorValue,
  reminderSubtitleText,
} from '@/src/features/notifications/notification-runtime';
import { useFocus } from '@/src/features/focus/FocusProvider';
import { timerRemainingMs } from '@/src/features/focus/focus-engine';
import { useScreenClock } from '@/src/features/planning/useScreenClock';
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

const DETAIL_LEVELS: Array<{
  id: ReminderDetail;
  name: string;
  description: string;
}> = [
  {
    id: 'brief',
    name: 'Brief',
    description: 'Fast glance. Just the useful fact and the first move.',
  },
  {
    id: 'guided',
    name: 'Guided',
    description: 'Balanced copy with one clear next step.',
  },
  {
    id: 'context',
    name: 'Context',
    description: 'Adds queue, plan or duration detail when it helps.',
  },
];

const PREVIEW_KINDS: Array<{
  id: ReminderKind;
  label: string;
}> = [
  { id: 'review', label: 'Review' },
  { id: 'exam', label: 'Exam' },
  { id: 'study', label: 'Study' },
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

function timelineSourceLabel(
  source: 'review' | 'exam' | 'study' | 'recovered',
) {
  if (source === 'review') return 'REVIEW';
  if (source === 'exam') return 'EXAM';
  if (source === 'recovered') return 'RECOVERED';
  return 'DAY MAP';
}

function timelineDecisionLabel(
  decision:
    | 'scheduled'
    | 'collision'
    | 'daily-cap'
    | 'global-cap',
) {
  if (decision === 'scheduled') return 'SCHEDULED';
  if (decision === 'collision') return 'COLLISION';
  if (decision === 'daily-cap') return 'DAILY CAP';
  return 'QUEUE CAP';
}

function permissionLabel(value: string) {
  if (value === 'granted') return 'Allowed';
  if (value === 'denied') return 'Blocked by device';
  if (value === 'unsupported') return 'Unavailable on web';
  return 'Not asked yet';
}

export default function RemindersScreen() {
  const { workspace } = useWorkspace();
  const { session: activeFocus } = useFocus();
  const now = useScreenClock();
  const {
    ready,
    status,
    permission,
    settings,
    scheduledCount,
    trackedScheduledCount,
    deviceScheduleChecked,
    plannedCount,
    message,
    updateSettings,
    enable,
    disable,
    reschedule,
    sendPreview,
    sendExactPreview,
    refreshPermission,
  } = useReminders();

  const [busy, setBusy] = useState('');
  const [previewKind, setPreviewKind] = useState<ReminderKind>('review');

  const normalizedSettings = useMemo(
    () =>
      normalizeReminderSettings({
        ...settings,
        enabled: true,
      }),
    [settings],
  );
  const activeFocusRemaining =
    activeFocus?.phase === 'focus'
      ? timerRemainingMs(activeFocus, now)
      : 0;
  const reminderContext = useMemo(
    () => ({
      activeFocus:
        activeFocus && activeFocusRemaining > 0
          ? {
              topicId: activeFocus.topicId ?? null,
              startedAt: activeFocus.startedAt,
              unavailableUntil:
                now + activeFocusRemaining,
            }
          : null,
    }),
    [
      activeFocus,
      activeFocusRemaining,
      now,
    ],
  );
  const previewPlan = useMemo(() => {
    if (!workspace) return [];
    return buildReminderPlan(
      workspace,
      normalizedSettings,
      now,
      reminderContext,
    ).slice(0, 2);
  }, [
    normalizedSettings,
    now,
    reminderContext,
    workspace,
  ]);
  const recoveredInsight = useMemo(
    () =>
      workspace
        ? buildRecoveredReminderInsight(
            workspace,
            settings,
            now,
            reminderContext,
          )
        : null,
    [now, reminderContext, settings, workspace],
  );
  const reminderTimelineOverview = useMemo(
    () =>
      workspace
        ? buildReminderTimelineOverview(
            workspace,
            normalizedSettings,
            now,
            reminderContext,
            8,
          )
        : {
            items: [],
            summary: {
              totalCandidates: 0,
              scheduled: 0,
              withheld: 0,
              collision: 0,
              dailyCap: 0,
              globalCap: 0,
            },
            omittedCount: 0,
          },
    [
      normalizedSettings,
      now,
      reminderContext,
      workspace,
    ],
  );
  const reminderTimeline =
    reminderTimelineOverview.items;
  const timelineScheduledCount =
    reminderTimelineOverview.summary.scheduled;
  const timelineWithheldCount =
    reminderTimelineOverview.summary.withheld;
  const timelineQueueCapCount =
    reminderTimelineOverview.summary.globalCap;

  const voice = VOICES.find((item) => item.id === settings.voice)!;
  const detail = DETAIL_LEVELS.find((item) => item.id === settings.detail)!;
  const previewItem = previewPlan.find((item) => item.kind === previewKind);
  const disabled = !ready || status === 'scheduling' || Boolean(busy);
  const deviceScheduleMismatch =
    settings.enabled &&
    permission === 'granted' &&
    deviceScheduleChecked &&
    scheduledCount !== plannedCount;
  const trackedDeviceMismatch =
    settings.enabled &&
    permission === 'granted' &&
    deviceScheduleChecked &&
    trackedScheduledCount !== scheduledCount;

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
        title="Reminder Studio"
        subtitle="Shape what MYELIN says, how much it says, and when it is allowed to interrupt."
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
            <Text style={styles.heroEyebrow}>CURRENT STYLE</Text>
            <Text style={styles.heroTitle}>
              {voice.name} · {detail.name}
            </Text>
            <Text style={styles.heroText}>
              {voice.description} {detail.description}
            </Text>
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
            <View>
              <Text style={styles.sectionEyebrow}>LIVE PREVIEW</Text>
              <Text style={styles.previewMeta}>
                {previewPlan.length
                  ? `${plannedCount} currently useful`
                  : 'Uses sample study data'}
              </Text>
            </View>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>
                {voice.name.toUpperCase()} · {detail.name.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.previewTabs}>
            {PREVIEW_KINDS.map((kind) => {
              const active = previewKind === kind.id;
              return (
                <Pressable
                  key={kind.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPreviewKind(kind.id)}
                  style={({ pressed }) => [
                    styles.previewTab,
                    active && styles.previewTabActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.previewTabText,
                      active && styles.previewTabTextActive,
                    ]}>
                    {kind.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Reveal
            key={`preview:${previewKind}:${settings.voice}:${settings.detail}`}
            distance={6}>
            <NotificationPreview
              settings={settings}
              item={previewItem}
              kind={previewKind}
            />
          </Reveal>

          {settings.enabled && permission === 'granted' ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() =>
                void run('preview', () => sendPreview(previewKind))
              }
              style={({ pressed }) => [
                styles.previewButton,
                disabled && styles.disabled,
                pressed && !disabled && styles.pressed,
              ]}>
              <View style={styles.previewButtonCopy}>
                <Text style={styles.previewButtonTitle}>
                  {busy === 'preview'
                    ? 'Sending…'
                    : `Send ${previewKind} preview`}
                </Text>
                <Text style={styles.previewButtonText}>
                  Uses this exact personality, detail level and sound choice
                </Text>
              </View>
              <Text style={styles.previewGlyph}>{voice.mark}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.recoveredInsight}>
          <View style={styles.recoveredInsightHeader}>
            <View style={styles.recoveredInsightHeaderCopy}>
              <Text style={styles.sectionEyebrow}>
                NEXT RECOVERED REMINDER
              </Text>
              <Text style={styles.recoveredInsightMeta}>
                What MYELIN currently expects to notify you about
              </Text>
            </View>
            <View
              style={[
                styles.recoveredInsightStatus,
                recoveredInsight?.status === 'scheduled' &&
                  styles.recoveredInsightStatusScheduled,
                recoveredInsight?.status === 'reflowed' &&
                  styles.recoveredInsightStatusReflowed,
                recoveredInsight?.status === 'protected' &&
                  styles.recoveredInsightStatusProtected,
                recoveredInsight?.status === 'suppressed' &&
                  styles.recoveredInsightStatusSuppressed,
              ]}>
              <Text style={styles.recoveredInsightStatusText}>
                {recoveredInsight
                  ? recoveredInsight.status.toUpperCase()
                  : 'NONE'}
              </Text>
            </View>
          </View>

          {recoveredInsight ? (
            <>
              <View style={styles.recoveredInsightBody}>
                <Text style={styles.recoveredInsightTitle}>
                  {recoveredInsight.topicName} ·{' '}
                  {recoveredInsight.minutes}m
                </Text>
                <Text style={styles.recoveredInsightLine}>
                  {recoveredInsight.commitmentTitle} recovered ·{' '}
                  {new Date(
                    recoveredInsight.start,
                  ).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  ·{' '}
                  {new Intl.DateTimeFormat(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(
                    new Date(recoveredInsight.start),
                  )}
                </Text>
                <Text style={styles.recoveredInsightDelivery}>
                  {recoveredInsight.reminderAt != null
                    ? `Will notify ${new Intl.DateTimeFormat(
                        undefined,
                        {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        },
                      ).format(
                        new Date(
                          recoveredInsight.reminderAt,
                        ),
                      )}`
                    : recoveredInsight.status === 'protected'
                      ? 'No stale notification will be sent while this block is protected.'
                      : 'No device notification is currently scheduled for this block.'}
                </Text>
              </View>

              <View style={styles.recoveredExactPreview}>
                <Text style={styles.recoveredExactPreviewLabel}>
                  {recoveredInsight.status === 'protected' ||
                  recoveredInsight.status === 'suppressed'
                    ? 'WOULD-HAVE-BEEN NOTIFICATION'
                    : 'EXACT NOTIFICATION'}
                </Text>
                <NotificationPreview
                  settings={settings}
                  kind="study"
                  copy={recoveredInsight.preview}
                />
                {(recoveredInsight.status === 'protected' ||
                  recoveredInsight.status === 'suppressed') ? (
                  <Text style={styles.recoveredExactWithheld}>
                    MYELIN is withholding this real reminder right now. Sending the preview below is manual and does not change the plan.
                  </Text>
                ) : null}
              </View>

              <View style={styles.recoveredInsightWhy}>
                <Text style={styles.recoveredInsightWhyLabel}>
                  WHY THIS REMINDER?
                </Text>
                <Text style={styles.recoveredInsightWhyText}>
                  {recoveredInsight.why}
                </Text>
                <Text style={styles.recoveredInsightDetail}>
                  {recoveredInsight.detail}
                </Text>
              </View>

              {permission === 'granted' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send this exact recovered reminder preview"
                  disabled={disabled}
                  onPress={() =>
                    void run('recovered-preview', () =>
                      sendExactPreview({
                        kind: 'study',
                        title: recoveredInsight.preview.title,
                        body: recoveredInsight.preview.body,
                        href: '/(app)/today/day-map',
                        data: {
                          recoveredPreview: 1,
                          insightStatus:
                            recoveredInsight.status,
                        },
                      }),
                    )
                  }
                  style={({ pressed }) => [
                    styles.recoveredPreviewButton,
                    disabled && styles.disabled,
                    pressed && !disabled && styles.pressed,
                  ]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recoveredPreviewButtonTitle}>
                      {busy === 'recovered-preview'
                        ? 'Sending…'
                        : 'Send this preview'}
                    </Text>
                    <Text style={styles.recoveredPreviewButtonText}>
                      Manual preview only · does not schedule or unsuppress the real reminder
                    </Text>
                  </View>
                  <Text style={styles.previewGlyph}>{voice.mark}</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open this recovered study window in Day Map"
                onPress={() =>
                  router.push('/(app)/today/day-map')
                }
                style={({ pressed }) => [
                  styles.recoveredInsightAction,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.recoveredInsightActionText}>
                  Open in Day Map
                </Text>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.recoveredInsightEmpty}>
              No recovered Autopilot window currently needs a
              heads-up. When one does, its live state will appear
              here.
            </Text>
          )}
        </View>

        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <View style={styles.timelineHeaderCopy}>
              <Text style={styles.sectionEyebrow}>
                NEXT REMINDERS
              </Text>
              <Text style={styles.timelineMeta}>
                Final ordering after adaptive timing, quiet hours,
                collisions, daily usefulness and the global device cap
              </Text>
            </View>
            <View style={styles.timelineCountPill}>
              <Text style={styles.timelineCountText}>
                {timelineScheduledCount} SCHEDULED
              </Text>
            </View>
          </View>

          {reminderTimeline.length ? (
            <>
              {reminderTimeline.map((entry, index) => {
                const winner =
                  entry.winnerKey &&
                  reminderTimeline.find(
                    (item) =>
                      item.reminder.key ===
                      entry.winnerKey,
                  );
                const scheduled =
                  entry.decision === 'scheduled';

                return (
                  <View
                    key={entry.reminder.key}
                    style={[
                      styles.timelineRow,
                      index ===
                        reminderTimeline.length - 1 &&
                        styles.timelineRowLast,
                    ]}>
                    <View
                      style={[
                        styles.timelineRailDot,
                        scheduled &&
                          styles.timelineRailDotScheduled,
                      ]}
                    />
                    <View style={styles.timelineRowBody}>
                      <View style={styles.timelineRowTop}>
                        <Text style={styles.timelineSource}>
                          {timelineSourceLabel(
                            entry.source,
                          )}
                        </Text>
                        <Text style={styles.timelineTime}>
                          {new Intl.DateTimeFormat(
                            undefined,
                            {
                              weekday: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            },
                          ).format(
                            new Date(
                              entry.reminder.at,
                            ),
                          )}
                        </Text>
                      </View>

                      <Text style={styles.timelineTitle}>
                        {entry.reminder.title}
                      </Text>

                      <View style={styles.timelineDecisionRow}>
                        <View
                          style={[
                            styles.timelineDecision,
                            scheduled &&
                              styles.timelineDecisionScheduled,
                            entry.decision ===
                              'collision' &&
                              styles.timelineDecisionCollision,
                          ]}>
                          <Text
                            style={[
                              styles.timelineDecisionText,
                              scheduled &&
                                styles.timelineDecisionTextScheduled,
                            ]}>
                            {timelineDecisionLabel(
                              entry.decision,
                            )}
                          </Text>
                        </View>
                        {entry.source === 'recovered' ? (
                          <Text
                            style={
                              styles.timelineRecoveredTag
                            }>
                            AUTOPILOT
                          </Text>
                        ) : null}
                      </View>

                      <Text style={styles.timelineReason}>
                        {entry.reason}
                      </Text>
                      <View style={styles.timelineUsefulness}>
                        <Text style={styles.timelineUsefulnessScore}>
                          USEFULNESS {entry.usefulnessScore}
                        </Text>
                        <Text style={styles.timelineUsefulnessReason}>
                          {entry.usefulnessReason}
                        </Text>
                      </View>

                      {(entry.decision ===
                        'collision' ||
                        entry.decision ===
                          'daily-cap' ||
                        entry.decision ===
                          'global-cap') &&
                      winner ? (
                        <Text
                          style={
                            styles.timelineWinner
                          }>
                          {entry.decision ===
                          'daily-cap'
                            ? 'Highest-ranked day winner'
                            : entry.decision ===
                                'global-cap'
                              ? 'Queue cutoff winner'
                              : 'Winner'}{' '}
                          ·{' '}
                          {timelineSourceLabel(
                            winner.source,
                          )}{' '}
                          · {winner.reminder.title}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              <Text style={styles.timelineFooter}>
                {timelineWithheldCount
                  ? `${timelineWithheldCount} candidate${timelineWithheldCount === 1 ? '' : 's'} withheld across the full queue${timelineQueueCapCount ? ` · ${timelineQueueCapCount} hit QUEUE CAP` : ''}. They are not scheduled on the device.`
                  : 'No candidate currently loses to collision or cap rules.'}
                {reminderTimelineOverview.omittedCount
                  ? ` Showing ${reminderTimeline.length} of ${reminderTimelineOverview.summary.totalCandidates} decisions; important QUEUE CAP losses are pinned into this preview.`
                  : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.timelineEmpty}>
              Nothing currently qualifies for the reminder queue.
              {settings.enabled
                ? ''
                : ' This preview updates before you enable reminders.'}
            </Text>
          )}
        </View>

        <Section
          title="Make it yours"
          subtitle="Personality changes the tone. Detail changes how much context MYELIN includes.">
          <Text style={styles.microLabel}>PERSONALITY</Text>
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
                    {active ? <Text style={styles.selected}>ON</Text> : null}
                  </View>
                  <Text
                    style={[
                      styles.voiceName,
                      active && styles.voiceNameActive,
                    ]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.choiceDescription}>{voice.description}</Text>

          <Text style={styles.microLabel}>DETAIL</Text>
          <View style={styles.detailGrid}>
            {DETAIL_LEVELS.map((item) => {
              const active = settings.detail === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={disabled}
                  onPress={() => void updateSettings({ detail: item.id })}
                  style={({ pressed }) => [
                    styles.detailCard,
                    active && styles.detailCardActive,
                    pressed && !disabled && styles.pressed,
                  ]}>
                  <View style={styles.detailTop}>
                    <Text
                      style={[
                        styles.detailName,
                        active && styles.detailNameActive,
                      ]}>
                      {item.name}
                    </Text>
                    {active ? <Text style={styles.selected}>ON</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.choiceDescription}>{detail.description}</Text>
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

        <Section title="Adaptive timing" subtitle="Use open schedule windows and recent successful focus times. Sleep protection in Settings always applies.">
          <ToggleRow label="Adapt to my study rhythm" helper="After three saved focus blocks around a similar time, review nudges can move there. Avoid fixed commitments and skip review nudges on days you already reviewed." value={settings.adaptive !== false} disabled={disabled} onChange={value => void updateSettings({ adaptive: value })} />
        </Section>
        <Section
          title="Quiet hours"
          subtitle="Quiet hours always win. A reminder landing inside this window is moved to the end of quiet hours.">
          <View style={styles.quietGrid}>
            <TimeStepper
              label="Starts"
              value={settings.quietStartMinutes}
              disabled={disabled}
              onChange={(value) => void updateSettings({ quietStartMinutes: value })}
            />
            <TimeStepper
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
            label="PLANNED"
            value={`${plannedCount} selected by MYELIN`}
          />
          <StatusLine
            label="DEVICE"
            value={
              !settings.enabled
                ? '0 registered · reminders off'
                : permission !== 'granted'
                  ? '0 registered · permission required'
                  : !deviceScheduleChecked
                    ? 'Could not verify registrations'
                    : `${scheduledCount} actually registered`
            }
          />

          {deviceScheduleMismatch ||
          trackedDeviceMismatch ? (
            <Text style={styles.deliveryMismatch}>
              {deviceScheduleMismatch
                ? `Device and plan differ (${scheduledCount} registered vs ${plannedCount} planned). Refresh schedule will repair the difference.`
                : `The device has ${scheduledCount} MYELIN reminder${scheduledCount === 1 ? '' : 's'}, but the app was tracking ${trackedScheduledCount}. Refresh schedule will reconcile the exact registrations.`}
            </Text>
          ) : null}

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


        </Section>

        <AnimatedDisclosure
          visible={Boolean(message)}
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
        </AnimatedDisclosure>

        <Reveal key={`activation:${settings.enabled ? 'on' : 'off'}`} distance={6}>
        <View style={styles.activationCard}>
          <Text style={styles.activationEyebrow}>
            {!settings.enabled ? 'YOUR CHOICE' :
              status === 'error' || !deviceScheduleChecked
                ? 'SCHEDULE NEEDS CHECK' : 'REMINDERS ACTIVE'}
          </Text>
          <Text style={styles.activationTitle}>
            {!settings.enabled
              ? 'Nothing is scheduled until you choose to enable it.'
              : status === 'error' || !deviceScheduleChecked
                ? 'Reminder delivery is not verified. Check the warning and refresh your schedule.'
                : 'Useful nudges, capped and quiet-hour aware.'}
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
        </Reveal>

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
  copy,
  settings,
  kind,
}: {
  item?: ReturnType<typeof buildReminderPlan>[number];
  copy?: { title: string; body: string };
  settings: { voice: ReminderVoice; detail: ReminderDetail };
  kind: ReminderKind;
}) {
  const fallback = sampleReminderCopy(settings, kind);
  const subtitle = reminderSubtitleText(
    settings,
    kind,
  );
  const mark =
    settings.voice === 'signal' ? '⌁' : settings.voice === 'spark' ? '✦' : '◌';
  const accent = reminderColorValue(settings);
  const action =
    kind === 'review'
      ? 'Open Review →'
      : kind === 'exam'
        ? 'Open exam plan →'
        : 'Open Day Map →';

  return (
    <View style={[styles.notification, { borderLeftColor: accent }]}>
      <View style={styles.notificationTop}>
        <View style={[styles.appDot, { backgroundColor: accent }]}>
          <Text style={styles.appDotText}>{mark}</Text>
        </View>
        <Text style={styles.notificationApp}>MYELIN</Text>
        <Text style={styles.notificationTime}>now</Text>
      </View>

      <Text style={[styles.notificationSubtitle, { color: accent }]}>
        {subtitle}
      </Text>
      <Text style={styles.notificationTitle}>
        {copy?.title ?? item?.title ?? fallback.title}
      </Text>
      <Text style={styles.notificationBody}>
        {copy?.body ?? item?.body ?? fallback.body}
      </Text>

      <View style={styles.notificationBottom}>
        <Text style={styles.notificationKind}>
          {settings.voice.toUpperCase()} · {settings.detail.toUpperCase()}
        </Text>
        <Text style={styles.notificationAction}>{action}</Text>
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
  deliveryMismatch: {
    marginTop: 8,
    color: colors.danger,
    fontSize: 10.8,
    lineHeight: 15,
  },
  timelineCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  timelineHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  timelineMeta: {
    color: colors.subtle,
    fontSize: 10.8,
    lineHeight: 15,
    marginTop: 3,
  },
  timelineCountPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  timelineCountText: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  timelineRow: {
    position: 'relative',
    flexDirection: 'row',
    gap: 10,
    paddingTop: 13,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  timelineRowLast: {
    borderBottomWidth: 0,
  },
  timelineRailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
  },
  timelineRailDotScheduled: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  timelineRowBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineSource: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  timelineTime: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 13,
  },
  timelineTitle: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  timelineDecisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
  },
  timelineDecision: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  timelineDecisionScheduled: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  timelineDecisionCollision: {
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
  },
  timelineDecisionText: {
    color: colors.muted,
    fontSize: 7.8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  timelineDecisionTextScheduled: {
    color: colors.accent,
  },
  timelineRecoveredTag: {
    color: colors.accent,
    fontSize: 7.8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  timelineReason: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  timelineUsefulness: {
    marginTop: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  timelineUsefulnessScore: {
    color: colors.accent,
    fontSize: 7.8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  timelineUsefulnessReason: {
    color: colors.subtle,
    fontSize: 9.4,
    lineHeight: 13,
    marginTop: 3,
  },
  timelineWinner: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 4,
  },
  timelineFooter: {
    color: colors.subtle,
    fontSize: 9.8,
    lineHeight: 14,
    marginTop: 10,
  },
  timelineEmpty: {
    color: colors.muted,
    fontSize: 10.8,
    lineHeight: 16,
    marginTop: 12,
  },
  recoveredInsight: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  recoveredInsightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  recoveredInsightHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  recoveredInsightMeta: {
    color: colors.subtle,
    fontSize: 10.8,
    lineHeight: 15,
    marginTop: 3,
  },
  recoveredInsightStatus: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  recoveredInsightStatusScheduled: {
    borderColor: 'rgba(180,216,174,0.3)',
    backgroundColor: 'rgba(180,216,174,0.06)',
  },
  recoveredInsightStatusReflowed: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  recoveredInsightStatusProtected: {
    borderColor: 'rgba(255,196,123,0.28)',
    backgroundColor: 'rgba(255,196,123,0.055)',
  },
  recoveredInsightStatusSuppressed: {
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgRaised,
  },
  recoveredInsightStatusText: {
    color: colors.textDim,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  recoveredInsightBody: {
    marginTop: 12,
  },
  recoveredInsightTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  recoveredInsightLine: {
    color: colors.muted,
    fontSize: 10.8,
    lineHeight: 15,
    marginTop: 4,
  },
  recoveredInsightDelivery: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  recoveredExactPreview: {
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recoveredExactPreviewLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.75,
    marginBottom: 7,
  },
  recoveredExactWithheld: {
    color: colors.muted,
    fontSize: 10.2,
    lineHeight: 15,
    marginTop: 7,
  },
  recoveredPreviewButton: {
    minHeight: 57,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recoveredPreviewButtonTitle: {
    color: colors.text,
    fontSize: 12.2,
    fontWeight: '700',
  },
  recoveredPreviewButtonText: {
    color: colors.subtle,
    fontSize: 10.2,
    lineHeight: 14,
    marginTop: 3,
  },
  recoveredInsightWhy: {
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recoveredInsightWhyLabel: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.75,
  },
  recoveredInsightWhyText: {
    color: colors.textDim,
    fontSize: 10.8,
    lineHeight: 16,
    marginTop: 5,
  },
  recoveredInsightDetail: {
    color: colors.subtle,
    fontSize: 10.2,
    lineHeight: 15,
    marginTop: 4,
  },
  recoveredInsightAction: {
    minHeight: layout.minTouch,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentLine,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveredInsightActionText: {
    color: colors.accent,
    fontSize: 10.8,
    fontWeight: '800',
  },
  recoveredInsightEmpty: {
    color: colors.muted,
    fontSize: 10.8,
    lineHeight: 16,
    marginTop: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  sectionEyebrow: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  previewMeta: { color: colors.muted, fontSize: 10.5, marginTop: 3 },
  previewBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.24)',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  previewBadgeText: {
    color: colors.accent,
    fontSize: 7.4,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  previewTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  previewTab: {
    flex: 1,
    minHeight: layout.minTouch,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTabActive: {
    borderColor: 'rgba(255,128,91,0.34)',
    backgroundColor: colors.accentSoft,
  },
  previewTabText: {
    color: colors.muted,
    fontSize: 10.4,
    fontWeight: '700',
  },
  previewTabTextActive: { color: colors.accent },
  notification: {
    borderRadius: 18,
    borderWidth: 1,
    borderLeftWidth: 2,
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
  notificationSubtitle: {
    fontSize: 8.8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 10,
  },
  notificationTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginTop: 5 },
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
  voiceGrid: { flexDirection: 'row', gap: 7 },
  voiceCard: {
    flex: 1,
    minHeight: 68,
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
  voiceNameActive: { color: colors.accent },
  choiceDescription: {
    color: colors.subtle,
    fontSize: 10.8,
    lineHeight: 15.5,
    marginTop: 7,
  },
  detailGrid: { flexDirection: 'row', gap: 7 },
  detailCard: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    padding: 10,
    justifyContent: 'center',
  },
  detailCardActive: {
    borderColor: 'rgba(255,128,91,0.35)',
    backgroundColor: colors.accentSoft,
  },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  detailName: { color: colors.text, fontSize: 10.7, fontWeight: '700' },
  detailNameActive: { color: colors.accent },
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
  quietGrid: { gap: 1 },
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
