import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/src/components/app/AppIcon';
import { SpringPressable } from '@/src/components/motion/SpringPressable';
import { Topic } from '@/src/data/schema';
import { isCardReady } from '@/src/features/review/review-engine';
import { colors, space, type } from '@/src/theme/tokens';

const STATUS_LABEL: Record<Topic['status'], string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
};

export function TopicCard({ topic, onPress, now = Date.now() }: { topic: Topic; onPress: () => void; now?: number }) {
  const dueCount = topic.cards.filter(
    (card) => isCardReady(topic, card, now),
  ).length;

  const rightMeta =
    dueCount > 0
      ? `${dueCount} due`
      : topic.priority === 3
        ? 'High priority'
        : topic.status === 'review'
          ? 'Review'
          : `${topic.estimate}m`;

  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityLabel={`${topic.name}, ${topic.subject}, ${rightMeta}`}
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
        <Text style={styles.name} numberOfLines={2}>{topic.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {topic.subject} · {STATUS_LABEL[topic.status]}
          {topic.cards.length ? ` · ${topic.cards.length} recall` : ''}
        </Text>
      </View>

      <Text
        style={[
          styles.rightMeta,
          dueCount > 0 && styles.rightMetaDue,
          topic.priority === 3 && dueCount === 0 && styles.rightMetaPriority,
        ]}>
        {rightMeta}
      </Text>
      <AppIcon name="chevron" size={15} color={colors.subtle} />
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  stateRail: {
    width: 3,
    height: 38,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  stateRailReview: { backgroundColor: colors.success },
  stateRailPriority: { backgroundColor: colors.accent },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    ...type.bodyStrong,
  },
  meta: {
    color: colors.muted,
    ...type.meta,
    marginTop: 3,
  },
  rightMeta: {
    maxWidth: '26%',
    flexShrink: 1,
    textAlign: 'right',
    color: colors.subtle,
    ...type.meta,
    fontWeight: '600',
  },
  rightMetaDue: { color: colors.success },
  rightMetaPriority: { color: colors.accent },
});
