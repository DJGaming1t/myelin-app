import {
  PropsWithChildren,
  useCallback,
  useRef,
} from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';

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
  scaleTo = 0.985,
  lift = 1,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (pressed: boolean) => {
      scale.stopAnimation();
      translateY.stopAnimation();

      if (reduceMotion) {
        scale.setValue(1);
        translateY.setValue(0);
        return;
      }

      Animated.parallel([
        Animated.spring(scale, {
          toValue: pressed ? scaleTo : 1,
          stiffness: pressed ? 320 : 245,
          damping: 24,
          mass: 0.58,
          overshootClamping: true,
          isInteraction: false,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: pressed ? lift : 0,
          stiffness: pressed ? 320 : 245,
          damping: 24,
          mass: 0.58,
          overshootClamping: true,
          isInteraction: false,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [lift, reduceMotion, scale, scaleTo, translateY],
  );

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
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale }, { translateY }],
          },
        ]}>
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
