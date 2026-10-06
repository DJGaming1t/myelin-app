import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AutopilotReflowSummary } from '@/src/features/exams/autopilot-reflow';
import { AutopilotRecoveryOption } from '@/src/features/exams/autopilot-recovery';
import { colors, radius, spacing } from '@/src/theme/tokens';

function minutesLabel(minutes: number) {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function dayLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function strainLabel(value: AutopilotReflowSummary['afterStrain']) {
  return value === 'overloaded'
    ? 'Overloaded'
    : value === 'tight'
      ? 'Tight'
      : value === 'balanced'
        ? 'Balanced'
        : 'Comfortable';
}

export function AutopilotReflowNotice({
  summary,
  recoveryOptions = [],
  selectedRecoveryId = null,
  onPreviewRecovery,
  onApplyRecovery,
  undoLabel = null,
  onUndoRecovery,
}: {
  summary: AutopilotReflowSummary | null;
  recoveryOptions?: AutopilotRecoveryOption[];
  selectedRecoveryId?: string | null;
  onPreviewRecovery?: (option: AutopilotRecoveryOption) => void;
  onApplyRecovery?: (option: AutopilotRecoveryOption) => void;
  undoLabel?: string | null;
  onUndoRecovery?: () => void;
}) {
  if (!summary) return null;

  const title = summary.becameImpossible
    ? 'The current deadline no longer fits'
    : summary.becameFeasible
      ? 'The plan fits again'
      : summary.movedLaterMinutes > 0
        ? `${minutesLabel(summary.movedLaterMinutes)} moved later`
        : summary.capacityDeltaMinutes < 0
          ? `${minutesLabel(-summary.capacityDeltaMinutes)} less study capacity`
          : summary.resolvedUnallocatedMinutes > 0
            ? `${minutesLabel(summary.resolvedUnallocatedMinutes)} recovered`
            : 'Plan recalculated';

  return (
    <View
      accessibilityRole={summary.becameImpossible ? 'alert' : undefined}
      style={[
        styles.card,
        summary.becameImpossible && styles.cardDanger,
      ]}
      testID="autopilot-reflow-notice">
      <Text
        style={[
          styles.kicker,
          summary.becameImpossible && styles.kickerDanger,
        ]}>
        AUTOPILOT REFLOW
      </Text>
      <Text style={styles.title}>{title}</Text>

      {summary.capacityDeltaMinutes < 0 ? (
        <Text style={styles.detail}>
          Schedule changes removed {minutesLabel(-summary.capacityDeltaMinutes)} of
          safe study capacity inside the current exam horizon.
        </Text>
      ) : summary.capacityDeltaMinutes > 0 ? (
        <Text style={styles.detail}>
          The updated schedule opened {minutesLabel(summary.capacityDeltaMinutes)} of
          safe study capacity.
        </Text>
      ) : null}

      {summary.moves.map((move) => (
        <View
          key={`${move.kind}:${move.topicId}:${move.fromDay}:${move.toDay}`}
          style={styles.move}>
          <Text style={styles.moveTopic}>{move.topicName}</Text>
          <Text style={styles.moveMeta}>
            {minutesLabel(move.minutes)} · {dayLabel(move.fromDay)} →{' '}
            {dayLabel(move.toDay)}
          </Text>
        </View>
      ))}

      {summary.newlyUnallocatedMinutes > 0 ? (
        <Text style={styles.dangerText}>
          {minutesLabel(summary.newlyUnallocatedMinutes)} of new work no longer fits
          before the relevant deadlines.
        </Text>
      ) : null}

      {summary.firstBrokenDeadline ? (
        <Text style={styles.deadline}>
          First capacity break: {dayLabel(summary.firstBrokenDeadline)}
        </Text>
      ) : null}

      {summary.beforeStrain !== summary.afterStrain ? (
        <Text style={styles.strain}>
          Plan strain: {strainLabel(summary.beforeStrain)} →{' '}
          {strainLabel(summary.afterStrain)}
        </Text>
      ) : null}

      {undoLabel && onUndoRecovery ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Undo recovery: ${undoLabel}`}
          onPress={onUndoRecovery}
          style={({ pressed }) => [
            styles.undoButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.undoText}>Undo recovery</Text>
          <Text style={styles.undoMeta}>{undoLabel}</Text>
        </Pressable>
      ) : null}

      {recoveryOptions.length ? (
        <View style={styles.recoverySection}>
          <Text style={styles.recoveryKicker}>SAFE RECOVERY OPTIONS</Text>
          <Text style={styles.recoveryIntro}>
            Preview first. MYELIN will not change tasks, exam scope, or block preferences until you apply one option.
          </Text>

          {recoveryOptions.map((option) => {
            const selected = option.id === selectedRecoveryId;
            return (
              <View key={option.id} style={styles.recoveryOption}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: selected }}
                  onPress={() => onPreviewRecovery?.(option)}
                  style={({ pressed }) => [
                    styles.recoveryHeader,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.recoveryCopy}>
                    <Text style={styles.recoveryTitle}>{option.title}</Text>
                    <Text style={styles.recoveryMeta}>Preview effect</Text>
                  </View>
                  <Text style={styles.recoveryArrow}>{selected ? '−' : '→'}</Text>
                </Pressable>

                {selected ? (
                  <View style={styles.recoveryPreview}>
                    <Text style={styles.recoveryDetail}>{option.detail}</Text>
                    <View style={styles.effectRow}>
                      <Effect
                        label="OVERLOAD"
                        before={option.effect.beforeOverloadMinutes}
                        after={option.effect.afterOverloadMinutes}
                      />
                      <Effect
                        label="UNALLOCATED"
                        before={option.effect.beforeUnallocatedMinutes}
                        after={option.effect.afterUnallocatedMinutes}
                      />
                    </View>
                    {option.kind === 'split-topic' ? (
                      <Text style={styles.recoveryOutcome}>
                        Preview: total required work stays the same. Future {option.topicName}{' '}
                        blocks are capped at about {option.targetBlockMinutes}m so the topic can
                        interleave with other work. This does not create extra capacity by itself.
                      </Text>
                    ) : (
                      <Text style={styles.recoveryOutcome}>
                        {option.effect.feasibleAfter
                          ? 'Preview: the current plan becomes feasible.'
                          : option.effect.overloadReducedMinutes > 0 ||
                              option.effect.unallocatedReducedMinutes > 0
                            ? 'Preview: this helps, but some pressure still remains.'
                            : 'Preview: this does not materially improve the broken deadline.'}
                      </Text>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Apply recovery option: ${option.title}`}
                      onPress={() => onApplyRecovery?.(option)}
                      style={({ pressed }) => [
                        styles.applyButton,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.applyText}>Apply this recovery</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : summary.becameImpossible || summary.newlyUnallocatedMinutes > 0 ? (
        <Text style={styles.noRecovery}>
          MYELIN could not find a safe automatic recovery. Adjust the deadline, required scope, or fixed commitments manually.
        </Text>
      ) : null}
    </View>
  );
}

function Effect({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  return (
    <View style={styles.effect}>
      <Text style={styles.effectLabel}>{label}</Text>
      <Text style={styles.effectValue}>
        {minutesLabel(before)} → {minutesLabel(after)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.22)',
    backgroundColor: 'rgba(255,128,91,0.045)',
    padding: 11,
  },
  cardDanger: {
    borderColor: 'rgba(255,165,150,0.24)',
    backgroundColor: 'rgba(255,165,150,0.055)',
  },
  kicker: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  kickerDanger: { color: colors.danger },
  title: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  detail: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  move: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  moveTopic: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  moveMeta: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },
  dangerText: {
    color: colors.danger,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  deadline: {
    color: colors.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 5,
  },
  strain: {
    color: colors.subtle,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 5,
  },
  undoButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  undoText: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
  },
  undoMeta: {
    color: colors.muted,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 2,
  },
  recoverySection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recoveryKicker: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  recoveryIntro: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 3,
    marginBottom: 4,
  },
  recoveryOption: {
    marginTop: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  recoveryHeader: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recoveryCopy: { flex: 1, minWidth: 0 },
  recoveryTitle: {
    color: colors.text,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '800',
  },
  recoveryMeta: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 2,
  },
  recoveryArrow: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 18,
  },
  recoveryPreview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    padding: 10,
  },
  recoveryDetail: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
  },
  effectRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  effect: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    padding: 8,
  },
  effectLabel: {
    color: colors.subtle,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  effectValue: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  recoveryOutcome: {
    color: colors.textDim,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 8,
  },
  applyButton: {
    minHeight: 44,
    marginTop: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  applyText: {
    color: '#25140e',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
  },
  noRecovery: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 9,
  },
  pressed: {
    opacity: 0.7,
  },
});
