import { PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  ViewStyle,
} from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';

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
  duration = 280,
  style,
}: Props) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const motion = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    opacity.stopAnimation();
    motion.stopAnimation();

    if (reduceMotion) {
      opacity.setValue(1);
      motion.setValue(1);
      return;
    }

    opacity.setValue(0);
    motion.setValue(0);

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        delay,
        duration,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(motion, {
          toValue: 1,
          damping: 18,
          stiffness: 155,
          mass: 0.72,
          overshootClamping: true,
          isInteraction: false,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start();
    return () => animation.stop();
  }, [delay, duration, motion, opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
            {
              scale: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [0.985, 1],
              }),
            },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
