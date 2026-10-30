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
      <View style={[styles.orb, styles.orbSynapse]} />
      <View style={[styles.ring, styles.ringTop]} />
      <View style={[styles.ring, styles.ringSide]} />
      <View style={[styles.ring, styles.ringSynapse]} />
      <View style={[styles.node, styles.nodeTopRight]} />
      <View style={[styles.node, styles.nodeMidLeft]} />
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
    opacity: 0.14,
  },
  gridLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.022)',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  orbTop: {
    width: 360,
    height: 360,
    top: -225,
    right: -115,
    opacity: 0.055,
  },
  orbSide: {
    width: 260,
    height: 260,
    top: '45%',
    left: -200,
    opacity: 0.028,
  },
  orbSynapse: {
    width: 300,
    height: 300,
    bottom: -180,
    right: -130,
    backgroundColor: colors.synapse,
    opacity: 0.032,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,130,93,0.055)',
  },
  ringTop: {
    width: 256,
    height: 256,
    top: -92,
    right: -74,
  },
  ringSide: {
    width: 196,
    height: 196,
    top: '52%',
    left: -128,
  },
  ringSynapse: {
    width: 220,
    height: 220,
    bottom: -110,
    right: -84,
    borderColor: 'rgba(76,224,210,0.05)',
  },
  node: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  nodeTopRight: {
    top: 86,
    right: 52,
    backgroundColor: colors.accent,
    opacity: 0.28,
  },
  nodeMidLeft: {
    top: '56%',
    left: 34,
    backgroundColor: colors.synapse,
    opacity: 0.24,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: colors.accentLine,
    opacity: 0.3,
  },
});
