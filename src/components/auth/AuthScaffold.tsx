import { PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
  compact?: boolean;
}>;

export function AuthScaffold({ eyebrow, title, description, compact, children }: Props) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.orbOne} />
      <View pointerEvents="none" style={styles.orbTwo} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: entrance,
                transform: [
                  {
                    translateY: entrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}>
            <View style={styles.brandRow}>
              <View style={styles.mark}>
                <View style={styles.markLineLeft} />
                <View style={styles.markDot} />
                <View style={styles.markLineRight} />
              </View>
              <Text style={styles.brand}>MYELIN</Text>
            </View>

            <View style={styles.heading}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>

            <View style={styles.panel}>{children}</View>

            <Text style={styles.footer}>
              Your study data stays local unless a future sync feature clearly says otherwise.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  scrollCompact: { justifyContent: 'flex-start' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: spacing.xxl },
  mark: {
    width: 31,
    height: 31,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  markLineLeft: { width: 5, height: 1, backgroundColor: colors.muted, transform: [{ rotate: '35deg' }] },
  markDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.accent },
  markLineRight: { width: 5, height: 1, backgroundColor: colors.muted, transform: [{ rotate: '-35deg' }] },
  brand: { color: colors.text, fontWeight: '800', letterSpacing: 3.2, fontSize: 15 },
  heading: { marginBottom: spacing.lg },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '600',
    letterSpacing: -1.5,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 450,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15,15,16,0.96)',
    padding: spacing.lg,
  },
  footer: {
    color: colors.subtle,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  orbOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(255,128,91,0.055)',
    right: -115,
    top: -95,
  },
  orbTwo: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    borderWidth: 1,
    borderColor: 'rgba(255,128,91,0.09)',
    left: -105,
    bottom: 90,
  },
});
