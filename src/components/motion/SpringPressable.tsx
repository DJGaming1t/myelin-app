import { PropsWithChildren } from 'react';
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

export function SpringPressable({
  children,
  style,
  scaleTo = motion.pressScale,
  lift = 1,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  function animate(pressed: boolean) {
    cancelAnimation(scale);
    cancelAnimation(translateY);

    if (reduceMotion) {
      scale.value = 1;
      translateY.value = 0;
      return;
    }

    const spring = pressed ? motion.pressSpring : motion.releaseSpring;
    scale.value = withSpring(pressed ? scaleTo : 1, { ...spring });
    translateY.value = withSpring(pressed ? lift : 0, { ...spring });
  }

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        animate(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(false);
        onPressOut?.(event);
      }}
      style={styles.pressable}>
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
  },
});
