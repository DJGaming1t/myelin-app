import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkspaceState } from '@/src/data/schema';
import {
  TopicAdaptationInsight,
  buildTopicAdaptationInsight,
  buildTopicAdaptationInsights,
} from '@/src/features/adaptive/topic-feedback';
import { colors, radius, spacing } from '@/src/theme/tokens';

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
      <Text style={styles.todayDetail}>{insight.detail}</Text>
      <Text style={styles.evidence}>{insight.evidence}</Text>
    </View>
  );
}

export function AdaptationInsightList({
  workspace,
  now,
  onOpenTopic,
}: {
  workspace: WorkspaceState;
  now: number;
  onOpenTopic: (topicId: string) => void;
}) {
  const insights = buildTopicAdaptationInsights(workspace, now, 3);
  if (!insights.length) return null;

  return (
    <View style={styles.progressSection} testID="progress-myelin-learned">
      <View style={styles.heading}>
        <Text style={styles.kicker}>MYELIN LEARNED</Text>
        <Text style={styles.headingTitle}>How your plan is adapting</Text>
        <Text style={styles.headingCopy}>
          Only shown when repeated study or recall evidence is strong enough to change planning.
        </Text>
      </View>

      <View style={styles.list}>
        {insights.map((insight) => (
          <AdaptationInsightRow
            key={insight.topicId}
            insight={insight}
            onPress={() => onOpenTopic(insight.topicId)}
          />
        ))}
      </View>
    </View>
  );
}

function AdaptationInsightRow({
  insight,
  onPress,
}: {
  insight: TopicAdaptationInsight;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${insight.topicName}. ${insight.title}. ${insight.detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        insight.tone === 'progress' && styles.rowProgress,
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowCopy}>
        <Text style={styles.subject}>{insight.subject.toUpperCase()}</Text>
        <Text style={styles.rowTitle}>
          {insight.topicName} · {insight.title}
        </Text>
        <Text style={styles.rowDetail}>{insight.detail}</Text>
        <Text style={styles.evidence}>{insight.evidence}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  todayCard: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.20)',
    backgroundColor: 'rgba(255,128,91,0.045)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  kicker: {
    color: colors.accent,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  todayTitle: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  todayDetail: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  evidence: {
    color: colors.subtle,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 5,
  },
  progressSection: {
    marginBottom: spacing.md,
  },
  heading: {
    marginBottom: 9,
  },
  headingTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    marginTop: 3,
  },
  headingCopy: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 3,
    maxWidth: 540,
  },
  list: {
    gap: 8,
  },
  row: {
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowProgress: {
    borderColor: 'rgba(116,201,152,0.22)',
    backgroundColor: 'rgba(116,201,152,0.035)',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  subject: {
    color: colors.accent,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  rowDetail: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  arrow: {
    color: colors.accent,
    fontSize: 17,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.995 }],
  },
});
