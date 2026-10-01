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
        trackColor={{ false: colors.panelHighlight, true: colors.accentLine }}
        thumbColor={value ? colors.accent : colors.textDim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  copy: { flex: 1 },
  title: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
  caption: { color: colors.subtle, fontSize: 10, lineHeight: 14, marginTop: 3 },
});
