import { StyleSheet, View } from 'react-native';
import { colors } from '@/src/theme/tokens';

export function AmbientBackdrop() {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={[StyleSheet.absoluteFill, styles.base]} />
      <View style={styles.orbTop} />
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  base: { backgroundColor: colors.bg },
  orbTop: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: -254, right: -110, backgroundColor: colors.panelWarm },
  rule: { position: 'absolute', top: 0, left: 24, width: 28, height: 2, backgroundColor: colors.accentFill },
});
