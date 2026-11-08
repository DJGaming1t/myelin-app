import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

/** Works before workspace hydration, including while the update gate is active. */
export function MyelinArrival({ loading = false, label = 'Opening Myelin', reducedMotion = false }: { loading?: boolean; label?: string; reducedMotion?: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    phase.stopAnimation();
    if (reduceMotion || reducedMotion) { phase.setValue(0.5); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(phase, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    return () => { animation.stop(); phase.stopAnimation(); };
  }, [phase, reduceMotion, reducedMotion]);
  const moving = { opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }), transform: [{ translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-38, 38] }) }] };
  return <View style={[styles.stage, loading && styles.loading]} accessible accessibilityLabel={loading ? label : 'Myelin, one step at a time'} accessibilityLiveRegion={loading ? 'polite' : 'none'}>
    {loading ? <StatusBar style="light" /> : null}
    <Text style={styles.brand}>MYELIN</Text>
    <View style={styles.symbol}>
      <View style={styles.line} />
      <View style={styles.lineFine} />
      <Animated.View style={[styles.signal, moving]} />
    </View>
    <Text style={styles.caption}>{loading ? label : 'ONE STEP AT A TIME'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  stage: { minHeight: 156, width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 24, backgroundColor: '#151514', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  loading: { flex: 1, maxWidth: undefined, borderRadius: 0 },
  brand: { color: '#F2E7D0', fontSize: 15, letterSpacing: 5, fontWeight: '500' },
  symbol: { width: 160, height: 34, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', width: 160, height: 1, backgroundColor: 'rgba(242,231,208,.3)' },
  lineFine: { position: 'absolute', width: 110, height: 1, top: 20, backgroundColor: 'rgba(242,231,208,.12)' },
  signal: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D98A60' },
  caption: { color: '#C6BEAD', fontSize: 10, letterSpacing: 1.4, marginTop: 13 },
});
