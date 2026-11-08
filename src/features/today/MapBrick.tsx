import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence, withTiming } from 'react-native-reanimated';

type Tone = 'active' | 'upcoming' | 'completed' | 'overdue';
const palette: Record<Tone, [string,string,string]> = {
  active: ['#A9BAC0','#6F8991','#526B73'],
  upcoming: ['#E8DDC9','#CDBFA9','#B5A58D'],
  completed: ['#B9C4B6','#8B9C8D','#687B6C'],
  overdue: ['#D7B2A4','#B48273','#95685E'],
};
/** Low-cost matte isometric block; no per-brick GL context or network assets. */
export function MapBrick({ tone, selected, reduceMotion = false }: { tone: Tone; selected: boolean; reduceMotion?: boolean }) {
  const [top, left, right] = palette[tone];
  const lift = useSharedValue(selected ? -3 : 0);
  const settle = useSharedValue(1);
  useEffect(() => { lift.value = reduceMotion ? (selected ? -3 : 0) : withSpring(selected ? -3 : 0, { damping: 16, stiffness: 210 }); }, [selected, reduceMotion]);
  useEffect(() => { if (!reduceMotion) settle.value = withSequence(withTiming(.94, { duration: 100 }), withSpring(1, { damping: 14, stiffness: 200 })); else settle.value = 1; }, [tone, reduceMotion]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }, { scale: settle.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.frame, motion]}>
    <View style={styles.shadow} />
    <View style={[styles.left, { backgroundColor: left }]} />
    <View style={[styles.right, { backgroundColor: right }]} />
    <View style={[styles.top, { backgroundColor: top }]} />
    <View style={styles.grain1} /><View style={styles.grain2} />
  </Animated.View>;
}
const styles = StyleSheet.create({
  frame: { width: 72, height: 62 }, lift: { transform: [{ translateY: -3 }] },
  shadow: { position:'absolute', left:13, top:50, width:48, height:5, borderRadius:6, backgroundColor:'rgba(48,42,35,.12)' },
  left: { position:'absolute', left:12, top:28, width:24, height:20, transform:[{skewY:'27deg'}] },
  right: { position:'absolute', left:36, top:28, width:24, height:20, transform:[{skewY:'-27deg'}] },
  top: { position:'absolute', left:19, top:10, width:34, height:34, transform:[{rotate:'45deg'},{scaleY:.52}] },
  grain1: { position:'absolute', left:19, top:35, width:9, height:1, backgroundColor:'rgba(255,250,230,.18)', transform:[{rotate:'27deg'}] },
  grain2: { position:'absolute', left:43, top:41, width:7, height:1, backgroundColor:'rgba(40,34,28,.12)', transform:[{rotate:'-27deg'}] },
});
