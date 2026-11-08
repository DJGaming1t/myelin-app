import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chalkTheme, colors } from '@/src/theme/tokens';
import { paperSurfaces } from '@/src/theme/paperSurfaces';

type Option<T extends string> = { value: T; label: string };

/** A compact single-choice control; selected state is also exposed to screen readers. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }}
        onPress={() => onChange(option.value)} style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}>
        <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 14, padding: 3, backgroundColor: chalkTheme.paper, gap: 3 },
  option: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  selected: { backgroundColor: paperSurfaces.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  label: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', fontWeight: '600' },
  selectedLabel: { color: colors.text, fontWeight: '700' },
  pressed: { opacity: .72 },
});
