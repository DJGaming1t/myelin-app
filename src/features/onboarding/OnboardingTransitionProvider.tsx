import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, radius, type } from '@/src/theme/tokens';

type TransitionTask = () => Promise<void> | void;

type OnboardingTransitionContextValue = {
  runTransition: (commit: TransitionTask) => Promise<void>;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function OnboardingTransitionProvider({ children }: PropsWithChildren) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const running = useRef(false);

  const overlayOpacity = useSharedValue(0);
  const gather = useSharedValue(0);
  const coreScale = useSharedValue(0.86);
  const wordmarkOpacity = useSharedValue(0);
  const lift = useSharedValue(0);

  const runTransition = useCallback(
    async (commit: TransitionTask) => {
      if (running.current) return;

      running.current = true;
      overlayOpacity.set(0);
      gather.set(0);
      coreScale.set(0.86);
      wordmarkOpacity.set(0);
      lift.set(0);
      setActive(true);

      try {
        await nextFrame();

        if (reduceMotion) {
          overlayOpacity.set(
            withTiming(1, { duration: 120, easing: EASE_OUT }),
          );
          await sleep(130);

          await commit();
          await sleep(40);

          overlayOpacity.set(
            withTiming(0, { duration: 150, easing: EASE_OUT }),
          );
          await sleep(160);
          setActive(false);
          return;
        }

        overlayOpacity.set(
          withTiming(1, { duration: 180, easing: EASE_OUT }),
        );
        gather.set(
          withTiming(1, { duration: 260, easing: EASE_IN_OUT }),
        );
        coreScale.set(
          withSequence(
            withTiming(1.08, { duration: 220, easing: EASE_OUT }),
            withTiming(1, { duration: 140, easing: EASE_IN_OUT }),
          ),
        );
        wordmarkOpacity.set(
          withDelay(115, withTiming(1, { duration: 180, easing: EASE_OUT })),
        );

        await sleep(270);
        await commit();

        // Keep the transition surface opaque long enough for the dashboard route
        // to settle underneath it, then reveal Today instead of exposing a route flash.
        await sleep(150);

        lift.set(withTiming(-8, { duration: 220, easing: EASE_OUT }));
        overlayOpacity.set(
          withTiming(0, { duration: 240, easing: EASE_OUT }),
        );
        await sleep(250);
        setActive(false);
      } catch (error) {
        overlayOpacity.set(
          withTiming(0, { duration: 150, easing: EASE_OUT }),
        );
        await sleep(160);
        setActive(false);
        throw error;
      } finally {
        running.current = false;
      }
    },
    [
      coreScale,
      gather,
      lift,
      overlayOpacity,
      reduceMotion,
      wordmarkOpacity,
    ],
  );

  const value = useMemo(
    () => ({ runTransition }),
    [runTransition],
  );

  return (
    <OnboardingTransitionContext.Provider value={value}>
      {children}
      {active ? (
        <TransitionOverlay
          overlayOpacity={overlayOpacity}
          gather={gather}
          coreScale={coreScale}
          wordmarkOpacity={wordmarkOpacity}
          lift={lift}
          reduceMotion={reduceMotion}
        />
      ) : null}
    </OnboardingTransitionContext.Provider>
  );
}

function TransitionOverlay({
  overlayOpacity,
  gather,
  coreScale,
  wordmarkOpacity,
  lift,
  reduceMotion,
}: {
  overlayOpacity: SharedValue<number>;
  gather: SharedValue<number>;
  coreScale: SharedValue<number>;
  wordmarkOpacity: SharedValue<number>;
  lift: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get(),
  }));

  const stageStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ translateY: lift.get() }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 0.52 + gather.get() * 0.48,
    transform: reduceMotion ? [] : [{ scale: coreScale.get() }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.2 : 0.08 + gather.get() * 0.28,
    transform: reduceMotion
      ? []
      : [{ scale: 1.28 - gather.get() * 0.22 }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : wordmarkOpacity.get(),
    transform: reduceMotion
      ? []
      : [{ translateY: 5 - wordmarkOpacity.get() * 5 }],
  }));

  const lineAStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.24 : 0.12 + gather.get() * 0.62,
    transform: reduceMotion
      ? [{ rotate: '-24deg' }]
      : [
          { translateX: (1 - gather.get()) * -72 },
          { translateY: (1 - gather.get()) * -46 },
          { rotate: '-24deg' },
          { scaleX: 0.72 + gather.get() * 0.28 },
        ],
  }));

  const lineBStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.2 : 0.1 + gather.get() * 0.56,
    transform: reduceMotion
      ? [{ rotate: '18deg' }]
      : [
          { translateX: (1 - gather.get()) * 74 },
          { translateY: (1 - gather.get()) * -26 },
          { rotate: '18deg' },
          { scaleX: 0.74 + gather.get() * 0.26 },
        ],
  }));

  const lineCStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.18 : 0.08 + gather.get() * 0.48,
    transform: reduceMotion
      ? [{ rotate: '6deg' }]
      : [
          { translateX: (1 - gather.get()) * 44 },
          { translateY: (1 - gather.get()) * 58 },
          { rotate: '6deg' },
          { scaleX: 0.68 + gather.get() * 0.32 },
        ],
  }));

  return (
    <Animated.View
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Opening MYELIN"
      style={[styles.overlay, overlayStyle]}>
      <Animated.View style={[styles.stage, stageStyle]}>
        <Animated.View style={[styles.halo, haloStyle]} />

        <Animated.View style={[styles.trace, styles.traceA, lineAStyle]}>
          <View style={styles.traceDot} />
        </Animated.View>
        <Animated.View style={[styles.trace, styles.traceB, lineBStyle]}>
          <View style={styles.traceDot} />
        </Animated.View>
        <Animated.View style={[styles.trace, styles.traceC, lineCStyle]}>
          <View style={styles.traceDot} />
        </Animated.View>

        <Animated.View style={[styles.mark, coreStyle]}>
          <View style={styles.markCore} />
        </Animated.View>

        <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
          <Text style={styles.wordmark}>MYELIN</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export function useOnboardingTransition() {
  const value = useContext(OnboardingTransitionContext);
  if (!value) {
    throw new Error(
      'useOnboardingTransition must be used inside OnboardingTransitionProvider.',
    );
  }
  return value;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    elevation: 999,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: 236,
    height: 236,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentFaint,
  },
  trace: {
    position: 'absolute',
    width: 116,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accentLine,
  },
  traceA: {
    left: 28,
    top: 68,
  },
  traceB: {
    right: 24,
    top: 78,
  },
  traceC: {
    right: 34,
    bottom: 62,
  },
  traceDot: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentBright,
  },
  mark: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  markCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  wordmarkWrap: {
    position: 'absolute',
    top: 170,
  },
  wordmark: {
    color: colors.textDim,
    ...type.label,
    letterSpacing: 3.4,
    fontWeight: '900',
  },
});
