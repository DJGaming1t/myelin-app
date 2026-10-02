import { useSegments } from 'expo-router';
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

type TransitionTask = () => Promise<void> | void;
type TransitionGroup = '(onboarding)' | '(app)' | '(verification)';

type OnboardingTransitionContextValue = {
  runTransition: (
    commit: TransitionTask,
    destinationGroups?: TransitionGroup[],
  ) => Promise<void>;
  runEntryTransition: (
    task: TransitionTask,
    commit: TransitionTask,
    destinationGroups?: TransitionGroup[],
  ) => Promise<void>;
  entryPending: boolean;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const COVER_MS = 380;
const REVEAL_MS = 360;

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
  const segments = useSegments();
  const [active, setActive] = useState(false);
  const [entryPending, setEntryPending] = useState(false);
  const running = useRef(false);
  const routeReadyResolver = useRef<(() => void) | null>(null);
  const routeReadyTargets = useRef<Set<TransitionGroup> | null>(null);
  const routeReadyScheduled = useRef(false);

  const circleProgress = useSharedValue(0);
  const fadeOpacity = useSharedValue(0);

  useEffect(() => {
    const firstSegment = segments[0] as string | undefined;
    const resolver = routeReadyResolver.current;
    const targets = routeReadyTargets.current;

    if (
      !resolver ||
      !targets ||
      !firstSegment ||
      !targets.has(firstSegment as TransitionGroup) ||
      routeReadyScheduled.current
    ) {
      return;
    }

    routeReadyScheduled.current = true;

    // Expo Router has reached the final route group. Give React Native two
    // frames to commit and paint that route before exposing any pixels.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentResolver = routeReadyResolver.current;
        routeReadyResolver.current = null;
        routeReadyTargets.current = null;
        routeReadyScheduled.current = false;
        currentResolver?.();
      });
    });
  }, [segments]);

  const armRouteReady = useCallback((destinationGroups: TransitionGroup[]) => {
    return new Promise<void>((resolve) => {
      routeReadyTargets.current = new Set(destinationGroups);
      routeReadyResolver.current = resolve;
      routeReadyScheduled.current = false;
    });
  }, []);

  const clearRouteReady = useCallback(() => {
    routeReadyResolver.current = null;
    routeReadyTargets.current = null;
    routeReadyScheduled.current = false;
  }, []);

  const resetVisualState = useCallback(() => {
    circleProgress.set(0);
    fadeOpacity.set(0);
  }, [circleProgress, fadeOpacity]);

  const playCircleHandoff = useCallback(
    async (
      commit: TransitionTask,
      destinationGroups: TransitionGroup[],
    ) => {
      resetVisualState();
      setActive(true);
      await nextFrame();

      if (reduceMotion) {
        fadeOpacity.set(withTiming(1, { duration: 150, easing: EASE_OUT }));
        await sleep(165);
      } else {
        circleProgress.set(
          withTiming(1, { duration: COVER_MS, easing: EASE_IN_OUT }),
        );
        await sleep(COVER_MS + 20);
      }

      // Arm before navigation so even a fast redirect chain cannot beat us.
      const routeReady = armRouteReady(destinationGroups);

      await commit();
      await routeReady;

      if (reduceMotion) {
        fadeOpacity.set(withTiming(0, { duration: 190, easing: EASE_OUT }));
        await sleep(205);
      } else {
        circleProgress.set(
          withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
        );
        await sleep(REVEAL_MS + 20);
      }
    },
    [
      armRouteReady,
      circleProgress,
      fadeOpacity,
      reduceMotion,
      resetVisualState,
    ],
  );

  const runTransition = useCallback(
    async (
      commit: TransitionTask,
      destinationGroups: TransitionGroup[] = ['(app)'],
    ) => {
      if (running.current) return;

      running.current = true;
      try {
        await playCircleHandoff(commit, destinationGroups);
      } finally {
        clearRouteReady();
        setActive(false);
        running.current = false;
      }
    },
    [clearRouteReady, playCircleHandoff],
  );

  const runEntryTransition = useCallback(
    async (
      task: TransitionTask,
      commit: TransitionTask,
      destinationGroups: TransitionGroup[] = [
        '(onboarding)',
        '(app)',
        '(verification)',
      ],
    ) => {
      if (running.current) return;

      running.current = true;
      setEntryPending(true);

      try {
        // Native auth/account selection finishes before any MYELIN animation.
        await task();
        await playCircleHandoff(commit, destinationGroups);
      } finally {
        clearRouteReady();
        setActive(false);
        setEntryPending(false);
        running.current = false;
      }
    },
    [clearRouteReady, playCircleHandoff],
  );

  const value = useMemo(
    () => ({
      runTransition,
      runEntryTransition,
      entryPending,
    }),
    [entryPending, runEntryTransition, runTransition],
  );

  return (
    <OnboardingTransitionContext.Provider value={value}>
      <View style={styles.root}>
        {children}

        {active ? (
          <CircleTransitionOverlay
            progress={circleProgress}
            fadeOpacity={fadeOpacity}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </View>
    </OnboardingTransitionContext.Provider>
  );
}

function CircleTransitionOverlay({
  progress,
  fadeOpacity,
  reduceMotion,
}: {
  progress: SharedValue<number>;
  fadeOpacity: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const diameter = 240;
  const fullCoverScale =
    (Math.hypot(width, height) / diameter) * 1.12;

  const circleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.get(),
      [0, 0.08, 1, 1.72, 2],
      [0, 1, 1, 1, 0],
    ),
    transform: [
      {
        translateY: interpolate(
          progress.get(),
          [0, 1, 2],
          [height * 0.34, 0, -height * 0.08],
        ),
      },
      {
        scale: interpolate(
          progress.get(),
          [0, 1, 2],
          [0.42, fullCoverScale, 0.74],
        ),
      },
    ],
  }));

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.get(),
  }));

  return (
    <View
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Opening MYELIN"
      style={styles.overlay}>
      {reduceMotion ? (
        <Animated.View style={[styles.fadeLayer, fadeStyle]} />
      ) : (
        <Animated.View style={[styles.circle, circleStyle]} />
      )}
    </View>
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    elevation: 999,
    overflow: 'hidden',
  },
  fadeLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bgRaised,
  },
  circle: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    left: '50%',
    top: '50%',
    marginLeft: -120,
    marginTop: -120,
    backgroundColor: colors.accent,
  },
});
