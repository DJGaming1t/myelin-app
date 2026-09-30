import { StyleSheet, Text, View } from 'react-native';

import { getPasswordRules } from '@/src/features/auth/password';
import { colors, radius, spacing } from '@/src/theme/tokens';

export function PasswordChecklist({ password }: { password: string }) {
  const rules = getPasswordRules(password);
  const passed = rules.filter((rule) => rule.passes).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.meter}>
        {rules.map((rule, index) => (
          <View
            key={rule.key}
            style={[styles.segment, index < passed && styles.segmentOn]}
          />
        ))}
      </View>
      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule.key} style={styles.rule}>
            <View style={[styles.dot, rule.passes && styles.dotOn]} />
            <Text style={[styles.text, rule.passes && styles.textOn]}>{rule.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: -5,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: 13,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  meter: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  segment: { flex: 1, height: 3, borderRadius: 3, backgroundColor: colors.lineStrong },
  segmentOn: { backgroundColor: colors.accent },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rule: { flexDirection: 'row', alignItems: 'center', minWidth: '46%', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.subtle },
  dotOn: { backgroundColor: colors.success },
  text: { color: colors.subtle, fontSize: 10.5 },
  textOn: { color: colors.muted },
});
