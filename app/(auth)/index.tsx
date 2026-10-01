import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { Reveal } from '@/src/components/motion/Reveal';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Reveal distance={7}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <View style={styles.brandCore} />
              </View>
              <Text style={styles.brand}>MYELIN</Text>
              <Text style={styles.brandMeta}>STUDY SYSTEM</Text>
            </View>
          </Reveal>

          <Reveal delay={35} distance={8}>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>STUDY WITHOUT DECIDING EVERYTHING YOURSELF</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Know what to study. Then do it.
              </Text>
              <Text style={styles.description}>
                MYELIN turns your topics, exams, tasks, recall and available time into one useful
                next move—then learns from what happened.
              </Text>
            </View>
          </Reveal>

          <Reveal delay={70} distance={8}>
            <View style={styles.system}>
              <View style={styles.inputs}>
                <Signal label="TOPICS" value="What you need to learn" />
                <Signal label="EXAMS" value="What is becoming urgent" />
                <Signal label="TIME" value="What actually fits today" />
              </View>

              <View style={styles.connection}>
                <View style={styles.connectionLine} />
                <View style={styles.connectionDot} />
                <View style={styles.connectionLine} />
              </View>

              <View style={styles.next}>
                <View style={styles.nextTop}>
                  <Text style={styles.nextLabel}>NEXT</Text>
                  <Text style={styles.nextTime}>45 MIN</Text>
                </View>
                <Text style={styles.nextTitle}>Trigonometry practice</Text>
                <Text style={styles.nextReason}>Exam approaching · confidence low</Text>
                <View style={styles.nextAction}>
                  <Text style={styles.nextActionText}>Start focus</Text>
                  <Text style={styles.nextActionArrow}>→</Text>
                </View>
              </View>

              <View style={styles.loop}>
                <LoopStep title="FOCUS" text="Do one thing" />
                <View style={styles.loopDivider} />
                <LoopStep title="RECALL" text="Pull it from memory" />
                <View style={styles.loopDivider} />
                <LoopStep title="ADAPT" text="Tomorrow gets smarter" />
              </View>
            </View>
          </Reveal>

          <Reveal delay={105} distance={6}>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/access')}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Continue to MYELIN</Text>
                <Text style={styles.primaryArrow}>→</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/sign-in')}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>I already use MYELIN</Text>
              </Pressable>
            </View>

            <Text style={styles.promise}>
              No fake streaks. No endless task dashboard. The goal is to reduce the decision load
              before studying.
            </Text>
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.signal}>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={styles.signalValue}>{value}</Text>
    </View>
  );
}

function LoopStep({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.loopStep}>
      <Text style={styles.loopTitle}>{title}</Text>
      <Text style={styles.loopText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center' },
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
  brand: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 2.3 },
  brandMeta: {
    color: colors.subtle,
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginLeft: 2,
  },
  hero: { marginTop: 42 },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '600',
    letterSpacing: -1.55,
    marginTop: 11,
    maxWidth: layout.readingMax,
  },
  description: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 560,
  },
  system: {
    marginTop: 34,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  inputs: { gap: 0 },
  signal: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  signalLabel: {
    width: 68,
    color: colors.subtle,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1.15,
  },
  signalValue: { flex: 1, color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  connection: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionLine: { height: 8, width: 1, backgroundColor: colors.lineStrong },
  connectionDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.accent },
  next: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    padding: spacing.md,
  },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: { color: colors.accent, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.3 },
  nextTime: { color: colors.muted, fontSize: 9.5, fontWeight: '800' },
  nextTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 12,
  },
  nextReason: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  nextAction: {
    minHeight: 46,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.accentLine,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  nextActionText: { color: colors.accentBright, fontSize: 11.5, fontWeight: '800' },
  nextActionArrow: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  loop: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  loopStep: { flex: 1, justifyContent: 'center', paddingVertical: 10 },
  loopDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 12 },
  loopTitle: { color: colors.textDim, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.05 },
  loopText: { color: colors.subtle, fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  actions: { marginTop: spacing.xl, gap: 9 },
  primary: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryText: { color: '#25140e', fontSize: 13, fontWeight: '900' },
  primaryArrow: { color: '#25140e', fontSize: 20, fontWeight: '900' },
  secondary: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  promise: {
    color: colors.subtle,
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
