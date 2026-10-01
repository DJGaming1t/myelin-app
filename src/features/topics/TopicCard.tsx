import { StyleSheet, Text, View } from 'react-native';

import { SpringPressable } from '@/src/components/motion/SpringPressable';

import { Topic } from '@/src/data/schema';
import { colors, radius, spacing } from '@/src/theme/tokens';

const STATUS_LABEL: Record<Topic['status'], string> = {
  new: 'NEW',
  learning: 'LEARNING',
  review: 'REVIEW',
};

const PRIORITY_LABEL: Record<Topic['priority'], string> = {
  1: 'LOW',
  2: 'NORMAL',
  3: 'HIGH',
};

export function TopicCard({ topic, onPress }: { topic: Topic; onPress: () => void }) {
  return (
    <SpringPressable
      accessibilityRole="button"
      accessibilityLabel={`${topic.name}, ${topic.subject}`}
      onPress={onPress}
      style={styles.card}
      scaleTo={0.982}
      lift={1}>
      <View style={styles.top}>
        <View style={styles.subjectRow}>
          <Text style={styles.subject}>{topic.subject}</Text>
          <View style={styles.dot} />
          <Text style={styles.status}>{STATUS_LABEL[topic.status]}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </View>

      <Text style={styles.name}>{topic.name}</Text>

      {topic.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {topic.notes}
        </Text>
      ) : (
        <Text style={styles.notesMuted}>No notes yet.</Text>
      )}

      <View style={styles.meta}>
        <Meta value={`${topic.estimate} min`} />
        <Meta value={`${topic.cards.length} recall ${topic.cards.length === 1 ? 'question' : 'questions'}`} />
        <Meta value={`${PRIORITY_LABEL[topic.priority]} priority`} accent={topic.priority === 3} />
      </View>
    </SpringPressable>
  );
}

function Meta({ value, accent }: { value: string; accent?: boolean }) {
  return (
    <View style={[styles.metaPill, accent && styles.metaPillAccent]}>
      <Text style={[styles.metaText, accent && styles.metaTextAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelGlass,
    borderRadius: radius.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
    padding: spacing.md,
    marginBottom: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  subject: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  dot: { width: 3, height: 3, borderRadius: 3, backgroundColor: colors.subtle },
  status: { color: colors.accent, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.1 },
  arrow: { color: colors.subtle, fontSize: 17 },
  name: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '700', marginTop: 10 },
  notes: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  notesMuted: { color: colors.subtle, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  metaPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  metaPillAccent: { borderColor: 'rgba(255,128,91,0.2)', backgroundColor: colors.accentSoft },
  metaText: { color: colors.subtle, fontSize: 9.5, fontWeight: '600' },
  metaTextAccent: { color: colors.accent },
});
