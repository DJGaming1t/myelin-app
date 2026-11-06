import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { activeShieldSummary, defaultFocusShieldConfig, focusShieldStorage } from './focus-shield';

export function BlockingShortcut({
  onToggleShield,
  isShieldActive,
}: {
  onToggleShield?: () => void;
  isShieldActive?: boolean;
} = {}) {
  const { ownerKey } = useWorkspace();
  const [config, setConfig] = useState(defaultFocusShieldConfig);

  useEffect(() => {
    if (!ownerKey) return;
    let cancelled = false;
    const unsub = focusShieldStorage.subscribe(ownerKey, (next) => {
      if (!cancelled) setConfig(next);
    });
    void focusShieldStorage.load(ownerKey).then((next) => {
      if (!cancelled) setConfig(next);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ownerKey]);

  const summary = activeShieldSummary(config);
  const active = isShieldActive ?? config.mode !== 'off';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open app and website blocking settings"
      onPress={() => {
        if (onToggleShield) {
          onToggleShield();
        } else {
          router.push('/(app)/focus/blocking');
        }
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID="blocking-shortcut-toggle">
      <View style={styles.copy}>
        <Text style={styles.kicker}>FOCUS SHIELD · QUIET SPACE</Text>
        <Text style={styles.title}>
          {active ? 'App & website blocking is on' : 'App & website blocking'}
        </Text>
        <Text style={styles.detail}>
          {active
            ? `${summary.enabledAppCount} apps · ${summary.enabledWebsiteCount} sites · ${summary.modeLabel}`
            : 'Choose distracting apps, websites, and recurring quiet schedules.'}
        </Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  kicker: {
    color: colors.accent,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  arrow: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.76,
  },
});
