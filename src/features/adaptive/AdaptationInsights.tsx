import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkspaceState } from '@/src/data/schema';
import {
  TopicAdaptationInsight,
  buildTopicAdaptationInsight,
  buildTopicAdaptationInsights,
} from '@/src/features/adaptive/topic-feedback';
import { chalkTheme, colors, radius, spacing } from '@/src/theme/tokens';

export function TodayAdaptationInsight({
  workspace,
  topicId,
  now,
}: {
  workspace: WorkspaceState;
  topicId: string | null | undefined;
  now: number;
}) {
  if (!topicId) return null;
  const insight = buildTopicAdaptationInsight(workspace, topicId, now);
  if (!insight) return null;

  return (
    <View style={styles.todayCard} testID="today-myelin-learned">
      <Text style={styles.kicker}>MYELIN LEARNED</Text>
      <Text style={styles.todayTitle}>
        {insight.topicName} · {insight.title}
      </Text>
      <Text style={styles.todayBody}>{insight.summary}</Text>
      <Text style={styles.todayAction}>{insight.actionableAdvice}</Text>
    </View>
  );
}

export function TopicAdaptationCard({
  insight,
  onPress,
}: {
  insight: TopicAdaptationInsight;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.topicCard} testID={`topic-adaptation-${insight.topicId}`}>
      <View style={styles.topRow}>
        <Text style={styles.kicker}>ADAPTIVE INSIGHT</Text>
        <Text style={styles.statusLabel}>{insight.title.toUpperCase()}</Text>
      </View>
      <Text style={styles.topicName}>{insight.topicName}</Text>
      <Text style={styles.summaryText}>{insight.summary}</Text>
      <Text style={styles.adviceText}>{insight.actionableAdvice}</Text>
      <View style={styles.metricsRow}>
        <MetricChip label="Review urgency" value={insight.metrics.urgency} />
        <MetricChip label="Mistake density" value={insight.metrics.mistakeDensity} />
        <MetricChip label="Exam weight" value={insight.metrics.examWeight} />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return content;
}

export function AdaptationInsightList({
  workspace,
  topicId,
  now,
  onOpenTopic,
}: {
  workspace: WorkspaceState;
  topicId?: string | null;
  now: number;
  onOpenTopic?: (topicId: string) => void;
}) {
  const insights = buildTopicAdaptationInsights(workspace, now);
  const targetInsights = topicId
    ? insights.filter((item) => item.topicId === topicId)
    : insights.slice(0, 3);

  if (targetInsights.length === 0) return null;

  return (
    <View style={styles.sectionContainer} testID="topic-adaptation-section">
      <Text style={styles.sectionHeader}>ADAPTIVE SYSTEM FEEDBACK</Text>
      {targetInsights.map((insight) => (
        <TopicAdaptationCard
          key={insight.topicId}
          insight={insight}
          onPress={onOpenTopic ? () => onOpenTopic(insight.topicId) : undefined}
        />
      ))}
    </View>
  );
}

export const TopicAdaptationSection = AdaptationInsightList;

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricChip}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  todayCard: {
    backgroundColor: chalkTheme.paper,
    borderColor: chalkTheme.paperContour,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  todayBody: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  todayAction: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textDim,
  },
  topicCard: {
    backgroundColor: chalkTheme.paper,
    borderColor: chalkTheme.paperContour,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.subtle,
  },
  topicName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  summaryText: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  adviceText: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metricChip: {
    backgroundColor: chalkTheme.paperRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metricLabel: {
    fontSize: 9,
    color: colors.subtle,
  },
  metricValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  sectionContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.subtle,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
});
