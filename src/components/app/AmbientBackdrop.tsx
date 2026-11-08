import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { PaperGrain } from '@/src/components/app/ChalkGrain';
import { chalkTheme, colors, getActiveThemePalette, subscribeThemePalette } from '@/src/theme/tokens';

const subscribe = (listener: () => void) => subscribeThemePalette(listener);

export function AmbientBackdrop({ dark = false }: { dark?: boolean }) {
  const palette = useSyncExternalStore(subscribe, getActiveThemePalette, getActiveThemePalette);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={[StyleSheet.absoluteFill, styles.base, dark && { backgroundColor: chalkTheme.hero }]} />
      {!dark && palette === 'editorial' ? <PaperGrain /> : null}
      {!dark ? <View style={styles.orbTop} /> : null}
      {!dark ? <View style={styles.rule} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  base: { backgroundColor: colors.bg },
  orbTop: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: -254, right: -110, backgroundColor: colors.panelWarm },
  rule: { position: 'absolute', top: 0, left: 24, width: 28, height: 2, backgroundColor: colors.accentFill },
});
