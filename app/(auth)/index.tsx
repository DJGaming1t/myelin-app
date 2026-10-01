import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><View style={styles.brandCore} /></View>
            <Text style={styles.brand}>MYELIN</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.signature} accessibilityElementsHidden>
              <View style={styles.signatureRing}>
                <View style={styles.signatureCore} />
              </View>
            </View>

            <Text accessibilityRole="header" style={styles.title}>
              Know what to study next.
            </Text>
            <Text style={styles.description}>
              MYELIN turns what you need to learn into one clear next move.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/access')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Continue</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/sign-in')}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    minHeight: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentFaint,
  },
  brandCore: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 2.2 },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  signature: {
    width: 114,
    height: 114,
    borderRadius: 57,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentFaint,
    marginBottom: spacing.xl,
  },
  signatureRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureCore: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '600',
    letterSpacing: -1.35,
    textAlign: 'center',
    maxWidth: layout.readingMax,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 430,
  },
  actions: { gap: 8, paddingBottom: spacing.sm },
  primary: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryText: { color: '#25140e', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  primaryArrow: { color: '#25140e', fontSize: 20, fontWeight: '800' },
  secondary: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  pressed: { opacity: 0.68 },
});
