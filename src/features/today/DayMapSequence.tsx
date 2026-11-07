import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/src/components/app/AppIcon';
import { TimeBrick } from '@/src/features/planning/TimeBrick';
import { chalkTheme } from '@/src/theme/tokens';
import type { DayMapStep } from './today-progress';

type Props = {
  steps: readonly DayMapStep[];
  onOpen: (step: DayMapStep) => void;
  onComplete: (step: DayMapStep) => void;
};

/** A real task sequence: the paper rail connects the bricks to their task copy. */
export function DayMapSequence({ steps, onOpen, onComplete }: Props) {
  return <View style={styles.sequence}>
    {steps.map((step, index) => (
      <View key={step.id} style={styles.row}>
        <Pressable
          testID={`day-map-open-${step.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${step.title}, ${step.minutes} minutes${step.completed ? ', completed' : step.current ? ', next up' : ''}`}
          accessibilityHint="Open details"
          onPress={() => onOpen(step)}
          style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
          <View pointerEvents="none" style={styles.marker}>
            {index > 0 ? <View style={styles.railAbove} /> : null}
            {index < steps.length - 1 ? <View style={styles.railBelow} /> : null}
            <View style={styles.brick}>
              <TimeBrick size={46} tone={step.completed ? 'done' : step.current ? 'current' : 'fixed'} />
            </View>
          </View>
          <View style={styles.copy}>
            <Text style={styles.meta}>
              {step.scheduledStart > 0
                ? new Date(step.scheduledStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : 'Any time'}
              {' · '}{step.minutes} min
            </Text>
            <Text style={[styles.title, step.completed && styles.done]}>{step.title}</Text>
            {step.current && !step.completed ? <Text style={styles.next}>NEXT STEP</Text> : null}
          </View>
        </Pressable>
        {step.taskId && !step.completed ? (
          <Pressable
            testID={`day-map-complete-${step.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${step.title} complete`}
            accessibilityHint="Completion can be undone"
            onPress={() => onComplete(step)}
            style={({ pressed }) => [styles.completion, pressed && styles.pressed]}>
            <AppIcon name="checkbox" size={22} color={chalkTheme.inkSoft} />
          </Pressable>
        ) : step.completed ? (
          <View accessible accessibilityLabel="Completed" style={styles.completion}>
            <AppIcon name="checkbox-checked" size={22} color={chalkTheme.inkSoft} />
          </View>
        ) : null}
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  sequence: { width: '100%', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 86 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignSelf: 'stretch', alignItems: 'stretch' },
  marker: { width: 52, alignItems: 'center', justifyContent: 'center' },
  railAbove: { position: 'absolute', top: 0, bottom: '50%', left: 25, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(63,56,46,.25)' },
  railBelow: { position: 'absolute', top: '50%', bottom: 0, left: 25, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(63,56,46,.25)' },
  brick: { paddingVertical: 6, backgroundColor: chalkTheme.paper, borderRadius: 24 },
  copy: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 16, paddingLeft: 12, paddingRight: 4 },
  meta: { color: chalkTheme.inkSoft, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  title: { color: chalkTheme.graphite, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  done: { color: chalkTheme.inkSoft, textDecorationLine: 'line-through' },
  next: { color: chalkTheme.nextUpBadge, fontSize: 9, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, marginTop: 5 },
  completion: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .6 },
});
