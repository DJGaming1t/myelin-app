import { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { colors, layout, radius, spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  title: ReactNode;
  description?: string;
  topActionLabel?: string;
  onTopAction?: () => void;
  visual?: ReactNode;
}>;

export function OnboardingShell({
  title,
  description,
  topActionLabel,
  onTopAction,
  visual,
  children,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.topbar}>
            <View style={styles.brand} accessible accessibilityLabel="MYELIN">
              <View style={styles.brandMark}><View style={styles.brandCore} /></View>
              <Text style={styles.brandName}>MYELIN</Text>
            </View>

            {topActionLabel && onTopAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={onTopAction}
                hitSlop={8}
                style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
                <Text style={styles.topActionText}>{topActionLabel}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>

          {visual ? <View style={styles.visual}>{visual}</View> : <View style={styles.flexSpacer} />}

          <View style={styles.actions}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function StudyPathVisual() {
  return (
    <View style={visualStyles.stage} accessible={false}>
      <View style={visualStyles.track}>
        <View style={[visualStyles.node, visualStyles.nodeMuted]} />
        <View style={visualStyles.trackLine} />
        <View style={[visualStyles.node, visualStyles.nodeAccent]} />
        <View style={visualStyles.trackLine} />
        <View style={[visualStyles.node, visualStyles.nodeMuted]} />
      </View>

      <View style={visualStyles.orbit} />

      <View style={visualStyles.primaryCard}>
        <Text style={visualStyles.cardEyebrow}>NEXT</Text>
        <Text style={visualStyles.cardTitle}>Trigonometry</Text>
        <View style={visualStyles.cardMetaRow}>
          <Text style={visualStyles.cardMeta}>45 min</Text>
          <View style={visualStyles.dot} />
          <Text style={visualStyles.cardMeta}>exam soon</Text>
        </View>
      </View>

      <View style={visualStyles.smallCard}>
        <View style={visualStyles.smallBar} />
        <View style={[visualStyles.smallBar, visualStyles.smallBarShort]} />
      </View>
    </View>
  );
}

export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.primaryText}>{label}</Text>
      <Text style={styles.primaryArrow}>→</Text>
    </Pressable>
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
  },
  topbar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCore: { width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent },
  brandName: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 2.1,
  },
  topAction: {
    minHeight: layout.minTouch,
    minWidth: layout.minTouch,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
  },
  hero: {
    paddingTop: spacing.xl,
    maxWidth: layout.readingMax,
  },
  title: {
    color: colors.text,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '600',
    letterSpacing: -1.6,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
    maxWidth: 430,
  },
  visual: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  flexSpacer: { flex: 1, minHeight: spacing.xl },
  actions: { paddingBottom: spacing.sm },
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
  primaryArrow: { color: '#25140e', fontSize: 20, lineHeight: 22, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.45 },
});

const visualStyles = StyleSheet.create({
  stage: {
    height: 220,
    position: 'relative',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 26,
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  node: { width: 8, height: 8, borderRadius: 8 },
  nodeMuted: { backgroundColor: colors.subtle },
  nodeAccent: { backgroundColor: colors.accent },
  orbit: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    borderWidth: 1,
    borderColor: colors.accentLine,
    right: -48,
    top: 10,
    opacity: 0.45,
  },
  primaryCard: {
    width: '78%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: 18,
    transform: [{ rotate: '-2deg' }],
  },
  cardEyebrow: {
    color: colors.accent,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '650',
    marginTop: 8,
    letterSpacing: -0.55,
  },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  cardMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 4, backgroundColor: colors.accent },
  smallCard: {
    position: 'absolute',
    right: 8,
    bottom: 50,
    width: 100,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 14,
    justifyContent: 'center',
    gap: 8,
    transform: [{ rotate: '4deg' }],
  },
  smallBar: {
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.textDim,
    opacity: 0.52,
  },
  smallBarShort: { width: '62%', backgroundColor: colors.accent },
});
