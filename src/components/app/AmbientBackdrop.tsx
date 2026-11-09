import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperGrain } from '@/src/components/app/ChalkGrain';
import { chalkTheme, colors, getActiveThemePalette, subscribeThemePalette } from '@/src/theme/tokens';

const subscribe = (listener: () => void) => subscribeThemePalette(listener);

export function AmbientBackdrop({ dark = false, darkTop = false, warmPaper = false }: { dark?: boolean; darkTop?: boolean; warmPaper?: boolean }) {
  const insets = useSafeAreaInsets();
  const palette = useSyncExternalStore(subscribe, getActiveThemePalette, getActiveThemePalette);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={[StyleSheet.absoluteFill, styles.base, warmPaper && { backgroundColor: chalkTheme.paper }, dark && { backgroundColor: chalkTheme.hero }]} />
      {!dark && (warmPaper || palette === 'editorial') ? <PaperGrain /> : null}
      {!dark && !warmPaper ? <View style={styles.orbTop} /> : null}
      {!dark && !warmPaper ? <View style={styles.rule} /> : null}
      {darkTop ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top, backgroundColor: chalkTheme.hero }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  base: { backgroundColor: colors.bg },
  orbTop: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: -254, right: -110, backgroundColor: colors.panelWarm },
  rule: { position: 'absolute', top: 0, left: 24, width: 28, height: 2, backgroundColor: colors.accentFill },
});
