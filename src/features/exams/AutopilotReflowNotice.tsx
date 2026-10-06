import { StyleSheet, Text, View } from 'react-native';

import { AutopilotReflowSummary } from '@/src/features/exams/autopilot-reflow';
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
}: {
  summary: AutopilotReflowSummary | null;
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
});
