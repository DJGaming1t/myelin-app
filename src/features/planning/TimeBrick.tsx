import { memo } from 'react';
import { Image, View } from 'react-native';
import { brickRenders } from './brickRenders';

type Props = { size: number; tone?: 'current' | 'done' | 'missed' | 'fixed' };
const toneIndex = { current: 2, done: 2, missed: 4, fixed: 1 };
/** Offline renders of the actual bundled model, without a GL context per timeline row. */
export const TimeBrick = memo(function TimeBrick({ size, tone = 'fixed' }: Props) {
  const uri = brickRenders[toneIndex[tone] % brickRenders.length];
  return <View accessible={false} style={{ width: size, height: size * .8 }}>
    <Image source={{ uri }} resizeMode="contain" fadeDuration={0} style={{ width: size, height: size * .8 }} />
    <Image source={{ uri }} resizeMode="contain" fadeDuration={0} style={{ position: 'absolute', width: size, height: size * .8, tintColor: tone === 'fixed' ? '#F2E7D0' : tone === 'missed' ? '#B89C88' : '#7E98A4', opacity: .34 }} />
  </View>;
});
