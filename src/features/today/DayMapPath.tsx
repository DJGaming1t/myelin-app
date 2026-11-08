import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TimeBrick } from '@/src/features/planning/TimeBrick';
import { chalkTheme } from '@/src/theme/tokens';
import type { DayMapStep } from './today-progress';

/** A repeatable shallow curve; spacing remains constant for arbitrarily many tasks. */
export function dayMapPathPoint(index: number) {
  return { x: 12 + index * 92, y: 30 + 13 * Math.sin(index * .8) };
}
export function DayMapPath({ steps, selectedId, onSelect }: {
  steps: readonly DayMapStep[]; selectedId: string | null; onSelect: (step: DayMapStep) => void;
}) {
  if (!steps.length) return <Text style={styles.empty}>Your path starts with one task. Add one when you’re ready.</Text>;
  const width = Math.max(110, 24 + (steps.length - 1) * 92 + 76);
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} accessibilityLabel="Day sequence path">
    <View style={{ width, height: 112 }}>
      {steps.slice(1).map((step, index) => {
        const a = dayMapPathPoint(index), b = dayMapPathPoint(index + 1);
        const dy = b.y - a.y, length = Math.sqrt(92 * 92 + dy * dy);
        return <View key={`path-${step.id}`} pointerEvents="none" style={[styles.line, { left: a.x + 36, top: a.y + 29 + dy / 2, width: length, transform: [{ rotate: `${Math.atan2(dy, 92)}rad` }] }]} />;
      })}
      {steps.map((step, index) => {
        const point = dayMapPathPoint(index), selected = selectedId === step.id;
        const state = step.completed ? 'completed' : step.overdue ? 'overdue' : step.current ? 'next' : 'upcoming';
        return <Pressable key={step.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${step.title}, ${state}, ${step.minutes} minutes`} accessibilityHint="Show task actions"
          onPress={() => onSelect(step)} style={({ pressed }) => [styles.node, { left: point.x, top: point.y }, pressed && { opacity: .65 }]}>
          <View style={styles.contact} /><TimeBrick size={64} tone={step.completed ? 'done' : step.overdue ? 'missed' : step.current ? 'current' : 'fixed'} />
          {selected ? <View style={styles.selected} /> : null}
          <Text numberOfLines={1} style={styles.label}>{state.toUpperCase()}</Text>
        </Pressable>;
      })}
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  empty: { color: chalkTheme.inkSoft, fontSize: 13, lineHeight: 20, marginVertical: 12 },
  line: { position: 'absolute', borderBottomWidth: 1, borderColor: 'rgba(63,56,46,.45)', borderStyle: 'dashed' },
  node: { position: 'absolute', width: 76, minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  contact: { position: 'absolute', top: 38, width: 43, height: 6, borderRadius: 6, backgroundColor: 'rgba(56,49,40,.10)' },
  selected: { width: 20, height: 2, backgroundColor: chalkTheme.nextUpBadge, borderRadius: 1 },
  label: { color: chalkTheme.inkSoft, fontSize: 9, letterSpacing: .7, marginTop: 3 },
});
