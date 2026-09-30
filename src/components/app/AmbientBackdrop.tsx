import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

export function AmbientBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.orb, styles.orbTop]} />
      <View style={[styles.orb, styles.orbSide]} />
      <View style={styles.vignetteTop} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.045,
  },
  orbTop: {
    width: 330,
    height: 330,
    top: -190,
    right: -110,
  },
  orbSide: {
    width: 260,
    height: 260,
    top: '38%',
    left: -190,
    opacity: 0.025,
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.accentLine,
    opacity: 0.45,
  },
});
