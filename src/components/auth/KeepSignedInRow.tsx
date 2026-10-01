import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, radius, space } from '@/src/theme/tokens';

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
        <Text style={styles.title}>Stay signed in</Text>
        <Text style={styles.caption}>Recommended on your own phone.</Text>
      </View>
      <Switch
        accessibilityLabel="Stay signed in on this device"
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
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
  },
  copy: { flex: 1 },
  title: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  caption: {
    color: colors.subtle,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
});
