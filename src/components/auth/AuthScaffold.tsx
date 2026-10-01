import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { Reveal } from '@/src/components/motion/Reveal';
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}>
          <View style={styles.content}>
            <Reveal distance={8}>
              <View style={styles.brandRow}>
                <View style={styles.brandMark}>
                  <View style={styles.brandCore} />
                </View>
                <Text style={styles.brand}>MYELIN</Text>
                <Text style={styles.brandDescriptor}>STUDY SYSTEM</Text>
              </View>
            </Reveal>

            <Reveal delay={35} distance={8}>
              <View style={styles.heading}>
                {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                {description ? <Text style={styles.description}>{description}</Text> : null}
              </View>
            </Reveal>

            <Reveal delay={70} distance={7}>
              <View style={styles.body}>{children}</View>
            </Reveal>

            <Text style={styles.footer}>
              Your study data stays local unless you explicitly enable a sync feature.
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
    maxWidth: 560,
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
  brandCore: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  brand: {
    color: colors.text,
    fontWeight: '900',
    letterSpacing: 2.3,
    fontSize: 11,
  },
  brandDescriptor: {
    color: colors.subtle,
    fontWeight: '800',
    letterSpacing: 1.3,
    fontSize: 7.5,
    marginLeft: 2,
  },
  heading: { marginBottom: spacing.xl },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.45,
    marginBottom: 9,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -1.1,
    maxWidth: layout.readingMax,
  },
  description: {
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 9,
    maxWidth: layout.readingMax,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  footer: {
    color: colors.subtle,
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
