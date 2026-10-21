import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/tokens';
export function BlockingShortcut() {
  return <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/blocking')} style={s.row}>
    <View style={s.copy}><Text style={s.title}>App blocking</Text><Text style={s.body}>Choose apps, websites and times. Optional during Focus.</Text></View><Text style={s.arrow}>↗</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel },
  copy: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, arrow: { color: colors.accent, fontSize: 24 },
});
