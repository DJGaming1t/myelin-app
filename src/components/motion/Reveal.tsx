import { PropsWithChildren, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { motion as motionTokens } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function Reveal({
  children,
  delay = 0,
  distance = 12,
  duration = motionTokens.hierarchyMs,
  style,
}: Props) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const motion = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(motion);

    if (reduceMotion) {
      opacity.value = 1;
      motion.value = 1;
      return;
    }

    opacity.value = 0;
    motion.value = 0;

    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
      }),
    );

    motion.value = withDelay(
      delay,
      withSpring(1, { ...motionTokens.revealSpring }),
    );
  }, [delay, duration, motion, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: (1 - motion.value) * distance },
      { scale: 0.99 + motion.value * 0.01 },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
