import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

// Deterministic native drawing. Cached as one layer, with no timers or network assets.
const flecks = Array.from({ length: 420 }, (_, i) => ({
  left: `${((i * 73 + 19) % 997) / 10}%` as `${number}%`,
  top: `${((i * 137 + 31) % 991) / 10}%` as `${number}%`,
  width: i % 4 === 0 ? 1.2 : .6,
  height: i % 4 === 0 ? 1.2 : .6,
  opacity: i % 3 === 0 ? .12 : .06,
  transform: [{ rotate: '-23deg' }],
}));
export const ChalkGrain = memo(function ChalkGrain({ paper = false }: { paper?: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" renderToHardwareTextureAndroid shouldRasterizeIOS style={StyleSheet.absoluteFill}>
    {flecks.map((style, i) => <View key={i} style={[styles.fleck, style, { backgroundColor: paper ? '#584B36' : '#F2E7D0' }]} />)}
  </View>;
});
const styles = StyleSheet.create({ fleck: { position: 'absolute', borderRadius: 1 } });
