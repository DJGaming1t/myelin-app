import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

export function AmbientBackdrop() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={styles.base} />
      <View style={styles.grid}>
        {Array.from({ length: 5 }, (_, index) => (
          <View key={index} style={[styles.gridLine, { top: 96 + index * 96 }]} />
        ))}
      </View>
      <View style={[styles.orb, styles.orbTop]} />
      <View style={[styles.orb, styles.orbSide]} />
      <View style={[styles.ring, styles.ringTop]} />
      <View style={[styles.ring, styles.ringSide]} />
      <View style={styles.topHairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  base: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
  },
  grid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.12,
  },
  gridLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.018)',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  orbTop: {
    width: 340,
    height: 340,
    top: -225,
    right: -120,
    opacity: 0.045,
  },
  orbSide: {
    width: 260,
    height: 260,
    top: '45%',
    left: -210,
    opacity: 0.022,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,130,93,0.04)',
  },
  ringTop: {
    width: 250,
    height: 250,
    top: -94,
    right: -78,
  },
  ringSide: {
    width: 190,
    height: 190,
    top: '52%',
    left: -132,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: colors.accentLine,
    opacity: 0.24,
  },
});
