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

type Props = PropsWithChildren<
  Omit<PressableProps, 'children' | 'style'> & {
    style?: StyleProp<ViewStyle>;
    scaleTo?: number;
    lift?: number;
  }
>;

const PRESS_SPRING = {
  stiffness: 320,
  damping: 24,
  mass: 0.58,
  overshootClamping: true,
};

const RELEASE_SPRING = {
  stiffness: 245,
  damping: 24,
  mass: 0.58,
  overshootClamping: true,
};

export function SpringPressable({
  children,
  style,
  scaleTo = 0.985,
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
      { scale: scale.value },
      { translateY: translateY.value },
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

    const spring = pressed ? PRESS_SPRING : RELEASE_SPRING;
    scale.value = withSpring(pressed ? scaleTo : 1, spring);
    translateY.value = withSpring(pressed ? lift : 0, spring);
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
