import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, spacing } from '@/src/theme/tokens';

export function KeepSignedInRow({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>Keep me signed in</Text>
        <Text style={styles.caption}>Leave this off on a shared computer or phone.</Text>
      </View>
      <Switch
        accessibilityLabel="Keep me signed in"
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#2a2a2d', true: 'rgba(255,128,91,0.42)' }}
        thumbColor={value ? colors.accent : '#b2b2ae'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 12, fontWeight: '600' },
  caption: { color: colors.subtle, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
});
