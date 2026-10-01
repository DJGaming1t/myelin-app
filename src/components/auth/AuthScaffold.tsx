import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
  compact?: boolean;
}>;

export function AuthScaffold({ eyebrow, title, description, compact, children }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}>
          <View style={styles.content}>
            <View style={styles.topbar}>
              <View style={styles.brandRow} accessible accessibilityLabel="MYELIN">
                <View style={styles.brandMark}>
                  <View style={styles.brandCore} />
                </View>
                <Text style={styles.brand}>MYELIN</Text>
              </View>

              <View style={styles.signal} accessible={false}>
                <View style={styles.signalLine} />
                <View style={styles.signalDot} />
                <View style={[styles.signalDot, styles.signalDotMuted]} />
              </View>
            </View>

            <View style={styles.heading}>
              {eyebrow ? (
                <View style={styles.eyebrowRow}>
                  <View style={styles.eyebrowDot} />
                  <Text style={styles.eyebrow}>{eyebrow}</Text>
                </View>
              ) : null}
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>

            <View style={styles.bodyCard}>{children}</View>

            <Text style={styles.footer}>
              Your study data stays on this device unless you choose to enable sync.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  scrollCompact: {
    justifyContent: 'flex-start',
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  content: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
  },
  topbar: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  brand: {
    color: colors.textDim,
    ...type.label,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  signal: {
    width: 58,
    height: 24,
    position: 'relative',
    justifyContent: 'center',
  },
  signalLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accentLine,
    marginHorizontal: 8,
  },
  signalDot: {
    position: 'absolute',
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  signalDotMuted: {
    left: 4,
    right: undefined,
    width: 5,
    height: 5,
    backgroundColor: colors.textDim,
    opacity: 0.52,
  },
  heading: {
    maxWidth: layout.readingMax,
    marginBottom: space.lg,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.sm,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    color: colors.accent,
    ...type.label,
    letterSpacing: 0.9,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '600',
    letterSpacing: -1.15,
  },
  description: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: space.sm,
    maxWidth: 470,
  },
  bodyCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panelGlass,
    padding: space.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    overflow: 'hidden',
  },
  footer: {
    color: colors.subtle,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    marginTop: space.lg,
    paddingHorizontal: space.md,
  },
});
