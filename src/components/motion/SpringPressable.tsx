import { PropsWithChildren, useEffect } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { motion } from '@/src/theme/tokens';

type Props = PropsWithChildren<
  Omit<PressableProps, 'children' | 'style'> & {
    style?: StyleProp<ViewStyle>;
    scaleTo?: number;
    lift?: number;
  }
>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SpringPressable({
  children,
  style,
  scaleTo = motion.pressScale,
  lift = 1,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (disabled || reduceMotion) {
      cancelAnimation(scale);
      cancelAnimation(translateY);
      scale.set(1);
      translateY.set(0);
    }
  }, [disabled, reduceMotion, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.get() },
      { scale: scale.get() },
    ],
  }));

  function animate(pressed: boolean) {
    cancelAnimation(scale);
    cancelAnimation(translateY);

    if (reduceMotion) {
      scale.set(1);
      translateY.set(0);
      return;
    }

    const spring = pressed ? motion.pressSpring : motion.releaseSpring;
    scale.set(withSpring(pressed ? scaleTo : 1, { ...spring }));
    translateY.set(withSpring(pressed ? lift : 0, { ...spring }));
  }

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        animate(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(false);
        onPressOut?.(event);
      }}
      style={[styles.pressable, style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
  },
});
