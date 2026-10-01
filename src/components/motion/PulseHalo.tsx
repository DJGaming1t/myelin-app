import { PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

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
          duration: 2200,
          isInteraction: false,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2200,
          isInteraction: false,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [active, pulse, reduceMotion]);

  const haloMotion =
    !reduceMotion && active
      ? {
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.15, 0.42],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1.08],
              }),
            },
          ],
        }
      : null;

  return (
    <View style={[styles.wrap, style]}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, haloMotion]}
        />
      ) : null}
      <Animated.View
        style={
          !reduceMotion && active
            ? {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.012],
                    }),
                  },
                ],
              }
            : undefined
        }>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    top: -16,
    right: -16,
    bottom: -16,
    left: -16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 7,
  },
});
