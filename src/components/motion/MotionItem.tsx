import { PropsWithChildren } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { motion } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  delay?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function MotionItem({ children, delay = 0, style }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(delay).duration(motion.stateMs)
      }
      exiting={
        reduceMotion
          ? undefined
          : FadeOutUp.duration(motion.pressMs + 40)
      }
      layout={
        reduceMotion
          ? undefined
          : LinearTransition.duration(motion.hierarchyMs)
      }
      style={style}>
      {children}
    </Animated.View>
  );
}
