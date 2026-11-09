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
  visible: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function AnimatedDisclosure({ visible, style, children }: Props) {
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(motion.stateMs)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(motion.pressMs + 20)}
      layout={reduceMotion ? undefined : LinearTransition.duration(motion.stateMs)}
      style={style}>
      {children}
    </Animated.View>
  );
}
