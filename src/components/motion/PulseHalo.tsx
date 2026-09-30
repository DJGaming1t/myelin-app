import { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function PulseHalo({ children, active = true, style }: Props) {
  const reduceMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.stopAnimation();

    if (!active || reduceMotion) {
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [active, pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        active && styles.active,
        !reduceMotion && active
          ? {
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.018],
                  }),
                },
              ],
              shadowOpacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.16, 0.34],
              }),
            }
          : null,
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
  active: {
    shadowColor: colors.accent,
    shadowRadius: 30,
    elevation: 8,
  },
});
