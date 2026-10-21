import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/src/components/app/AppIcon';
import { colors } from '@/src/theme/tokens';

export function BlockingShortcut() {
  return <Pressable accessibilityRole="button" accessibilityLabel="App blocking" accessibilityHint="Choose apps, websites and blocking times" onPress={() => router.push('/(app)/blocking')} style={({ pressed }) => [s.row, pressed && s.pressed]}>
    <View style={s.mark} accessible={false}><View style={s.shield}><Text style={s.check}>✓</Text></View></View>
    <View style={s.copy}><Text style={s.eyebrow}>FEWER DISTRACTIONS</Text><Text style={s.title}>App blocking</Text><Text style={s.body}>Your apps. Your schedule. Your space.</Text></View>
    <AppIcon name="chevron" color={colors.accentBright} size={18} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16, padding: 18, minHeight: 104, borderRadius: 22, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.panelWarm },
  mark: { width: 44, height: 48, justifyContent: 'center', alignItems: 'center' },
  shield: { width: 31, height: 36, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentFaint, alignItems: 'center', justifyContent: 'center' },
  check: { color: colors.accentBright, fontSize: 16 }, copy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: colors.accentBright, fontSize: 9, lineHeight: 14, letterSpacing: 1.3, fontWeight: '700' }, title: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 19 }, pressed: { opacity: 0.75 },
});
