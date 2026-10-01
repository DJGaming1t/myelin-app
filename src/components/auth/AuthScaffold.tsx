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
import { colors, layout, spacing } from '@/src/theme/tokens';

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
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><View style={styles.brandCore} /></View>
              <Text style={styles.brand}>MYELIN</Text>
            </View>

            <View style={styles.heading}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>

            <View style={styles.body}>{children}</View>

            <Text style={styles.footer}>
              Study data stays on this device unless you enable sync.
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  scrollCompact: {
    justifyContent: 'flex-start',
    paddingTop: spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  brandRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: spacing.xl,
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
  brand: {
    color: colors.text,
    fontWeight: '900',
    letterSpacing: 2.2,
    fontSize: 12,
    lineHeight: 16,
  },
  heading: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1,
    maxWidth: layout.readingMax,
  },
  description: {
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 9,
    maxWidth: layout.readingMax,
  },
  body: {},
  footer: {
    color: colors.subtle,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
