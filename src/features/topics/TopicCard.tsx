import { StyleSheet, Text, View } from 'react-native';

import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { Topic } from '@/src/data/schema';
import { colors, spacing } from '@/src/theme/tokens';

const STATUS_LABEL: Record<Topic['status'], string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
};

const PRIORITY_LABEL: Record<Topic['priority'], string> = {
  1: 'Low',
  2: 'Normal',
  3: 'High',
};

export function TopicCard({ topic, onPress }: { topic: Topic; onPress: () => void }) {
  const dueCount = topic.cards.filter(
    (card) => card.dueAt > 0 && card.dueAt <= Date.now(),
  ).length;

  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityLabel={`${topic.name}, ${topic.subject}`}
      onPress={onPress}
      style={styles.row}
      scaleTo={0.99}
      lift={0}>
      <View
        style={[
          styles.stateRail,
          topic.status === 'review' && styles.stateRailReview,
          topic.priority === 3 && styles.stateRailPriority,
        ]}
      />

      <View style={styles.copy}>
        <View style={styles.top}>
          <Text style={styles.subject} numberOfLines={1}>{topic.subject}</Text>
          <Text style={styles.status}>{STATUS_LABEL[topic.status]}</Text>
        </View>

        <Text style={styles.name}>{topic.name}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaText}>{topic.estimate} min</Text>
          <View style={styles.dot} />
          <Text style={styles.metaText}>
            {topic.cards.length} recall {topic.cards.length === 1 ? 'question' : 'questions'}
          </Text>
          {dueCount > 0 ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.dueText}>{dueCount} due</Text>
            </>
          ) : null}
          {topic.priority === 3 ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.priorityText}>{PRIORITY_LABEL[topic.priority]} priority</Text>
            </>
          ) : null}
        </View>

        {topic.notes ? (
          <Text style={styles.notes} numberOfLines={1}>{topic.notes}</Text>
        ) : null}
      </View>

      <Text accessible={false} style={styles.arrow}>›</Text>
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  stateRail: {
    width: 3,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  stateRailReview: {
    backgroundColor: colors.success,
  },
  stateRailPriority: {
    backgroundColor: colors.accent,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subject: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  status: {
    color: colors.subtle,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 5,
    letterSpacing: -0.15,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  metaText: {
    color: colors.subtle,
    fontSize: 10,
    lineHeight: 14,
  },
  dot: {
    width: 2,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.subtle,
  },
  dueText: {
    color: colors.success,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  priorityText: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  notes: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 6,
  },
  arrow: {
    alignSelf: 'center',
    color: colors.subtle,
    fontSize: 22,
    lineHeight: 24,
    paddingLeft: spacing.xs,
  },
});
