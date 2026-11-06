import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = { size: number; tone?: 'current' | 'done' | 'missed' | 'fixed' };
const tones = { current: '#7E98A4', done: '#909F86', missed: '#B67E68', fixed: '#B3A58F' };

export const TimeBrick = memo(function TimeBrick({ size, tone = 'fixed' }: Props) {
  const fill = tones[tone];
  return <View accessible={false} style={[styles.body, { width: size, height: size * .62, backgroundColor: fill }]}>
    <View style={[styles.stud, { backgroundColor: fill }]} />
    <View style={[styles.stud, { backgroundColor: fill }]} />
  </View>;
});

const styles = StyleSheet.create({
  body: { borderRadius: 5, borderBottomWidth: 3, borderBottomColor: '#594F43', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  stud: { width: 8, height: 8, borderRadius: 4, borderTopWidth: 1, borderTopColor: '#F2E7D0', borderBottomWidth: 1, borderBottomColor: '#685E52' },
});
