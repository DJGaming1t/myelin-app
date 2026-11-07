import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

// A fixed, offline paper grain. A small seeded hash avoids visible rows or animation.
function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}
const flecks = Array.from({ length: 300 }, (_, i) => ({
  left: `${noise(i * 5 + 1) * 100}%` as `${number}%`,
  top: `${noise(i * 5 + 2) * 100}%` as `${number}%`,
  width: i % 11 === 0 ? 2.4 : i % 3 === 0 ? 1.2 : .6,
  height: i % 11 === 0 ? .7 : i % 3 === 0 ? 1.2 : .6,
  opacity: .035 + noise(i * 5 + 3) * .10,
  transform: [{ rotate: `${Math.round(noise(i * 5 + 4) * 140 - 70)}deg` }],
}));
export const ChalkGrain = memo(function ChalkGrain({ paper = false }: { paper?: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" renderToHardwareTextureAndroid shouldRasterizeIOS style={StyleSheet.absoluteFill}>
    {flecks.map((style, i) => <View key={i} style={[styles.fleck, style, { backgroundColor: paper ? (i % 4 === 0 ? '#FFF9E8' : '#655746') : '#F2E7D0' }]} />)}
  </View>;
});
const styles = StyleSheet.create({ fleck: { position: 'absolute', borderRadius: 1 } });
