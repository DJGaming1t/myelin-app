import { router, useSegments } from 'expo-router';
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
import {
  destinationSegments,
  type EntryDestination,
} from '@/src/features/onboarding/entry-destination';
import { useEntryDestination } from '@/src/features/onboarding/use-entry-destination';
import { colors } from '@/src/theme/tokens';

type TransitionTask = () => Promise<void> | void;
type FinalEntryDestination = Exclude<EntryDestination, '/(auth)'>;

type OnboardingTransitionContextValue = {
  runTransition: (
    task: TransitionTask,
    destination?: FinalEntryDestination,
  ) => Promise<void>;
  runEntryTransition: (
    task: TransitionTask,
    allowedDestinations?: FinalEntryDestination[],
  ) => Promise<void>;
  transitionPending: boolean;
  entryPending: boolean;
};

type EntryWaiter = {
  allowed: Set<FinalEntryDestination>;
  resolve: (destination: FinalEntryDestination) => void;
};

type RouteWaiter = {
  expected: readonly string[];
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  scheduled: boolean;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const COVER_MS = 320;
const REVEAL_MS = 290;
const ROUTE_WATCHDOG_MS = 1800;

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

function segmentsMatch(
  current: readonly string[],
  expected: readonly string[],
) {
  if (current.length < expected.length) return false;
  return expected.every((segment, index) => current[index] === segment);
}

export function OnboardingTransitionProvider({ children }: PropsWithChildren) {
  const reduceMotion = useReducedMotion();
  const segments = useSegments();
  const entryDestination = useEntryDestination();

  const [active, setActive] = useState(false);
  const [transitionPending, setTransitionPending] = useState(false);
  const running = useRef(false);

  const entryWaiter = useRef<EntryWaiter | null>(null);
  const routeWaiter = useRef<RouteWaiter | null>(null);

  const circleProgress = useSharedValue(0);
  const fadeOpacity = useSharedValue(0);

  const entryDestinationRef = useRef<EntryDestination | null>(entryDestination);
  entryDestinationRef.current = entryDestination;

  useEffect(() => {
    const waiter = entryWaiter.current;
    if (
      !waiter ||
      !entryDestination ||
      entryDestination === '/(auth)' ||
      !waiter.allowed.has(entryDestination)
    ) {
      return;
    }

    entryWaiter.current = null;
    waiter.resolve(entryDestination);
  }, [entryDestination]);

  useEffect(() => {
    const waiter = routeWaiter.current;
    if (
      !waiter ||
      waiter.scheduled ||
      !segmentsMatch(segments as readonly string[], waiter.expected)
    ) {
      return;
    }

    waiter.scheduled = true;
    clearTimeout(waiter.timeout);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const current = routeWaiter.current;
        if (current !== waiter) return;
        routeWaiter.current = null;
        waiter.resolve();
      });
    });
  }, [segments]);

  const waitForEntryDestination = useCallback(
    (allowedDestinations: FinalEntryDestination[]) => {
      const current = entryDestinationRef.current;
      if (
        current &&
        current !== '/(auth)' &&
        allowedDestinations.includes(current)
      ) {
        return Promise.resolve(current);
      }

      return new Promise<FinalEntryDestination>((resolve) => {
        entryWaiter.current = {
          allowed: new Set(allowedDestinations),
          resolve,
        };
      });
    },
    [],
  );

  const waitForRoute = useCallback(
    (destination: FinalEntryDestination) => {
      const expected = destinationSegments(destination);
      if (segmentsMatch(segments as readonly string[], expected)) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const current = routeWaiter.current;
          if (!current || current.expected !== expected) {
            return;
          }

          routeWaiter.current = null;
          reject(
            new Error(
              `Navigation did not reach ${destination} during the transition.`,
            ),
          );
        }, ROUTE_WATCHDOG_MS);

        routeWaiter.current = {
          expected,
          resolve,
          reject,
          timeout,
          scheduled: false,
        };
      });
    },
    [segments],
  );

  const clearWaiters = useCallback(() => {
    entryWaiter.current = null;

    if (routeWaiter.current) {
      clearTimeout(routeWaiter.current.timeout);
      routeWaiter.current = null;
    }
  }, []);

  const resetVisualState = useCallback(() => {
    circleProgress.set(0);
    fadeOpacity.set(0);
  }, [circleProgress, fadeOpacity]);

  const playCircleTo = useCallback(
    async (destination: FinalEntryDestination) => {
      resetVisualState();
      setActive(true);
      await nextFrame();

      if (reduceMotion) {
        fadeOpacity.set(withTiming(1, { duration: 120, easing: EASE_OUT }));
        await sleep(135);
      } else {
        circleProgress.set(
          withTiming(1, { duration: COVER_MS, easing: EASE_IN_OUT }),
        );
        await sleep(COVER_MS + 10);
      }

      // The next screen is already known before the circle starts. Navigation is
      // therefore one direct replace, not a redirect chain under the overlay.
      const routeReady = waitForRoute(destination);
      router.replace(destination);
      await routeReady;

      if (reduceMotion) {
        fadeOpacity.set(withTiming(0, { duration: 170, easing: EASE_OUT }));
        await sleep(185);
      } else {
        circleProgress.set(
          withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
        );
        await sleep(REVEAL_MS + 15);
      }
    },
    [
      circleProgress,
      fadeOpacity,
      reduceMotion,
      resetVisualState,
      waitForRoute,
    ],
  );

  const runTransition = useCallback(
    async (
      task: TransitionTask,
      destination: FinalEntryDestination = '/(app)/today',
    ) => {
      if (running.current) return;

      running.current = true;
      setTransitionPending(true);

      try {
        // Finish/save state first while the current page remains visible.
        // This keeps storage latency out of the visible circle animation.
        await task();
        await playCircleTo(destination);
      } finally {
        clearWaiters();
        setActive(false);
        setTransitionPending(false);
        running.current = false;
      }
    },
    [clearWaiters, playCircleTo],
  );

  const runEntryTransition = useCallback(
    async (
      task: TransitionTask,
      allowedDestinations: FinalEntryDestination[] = [
        '/(verification)/verify-email',
        '/(onboarding)',
        '/(app)/today',
      ],
    ) => {
      if (running.current) return;

      running.current = true;
      setTransitionPending(true);

      try {
        // Native authentication/account selection finishes first. Then wait for
        // Auth -> Workspace -> Onboarding state to settle before showing the
        // circle, so the circle is never used as a loading screen.
        await task();
        const destination = await waitForEntryDestination(allowedDestinations);
        await playCircleTo(destination);
      } finally {
        clearWaiters();
        setActive(false);
        setTransitionPending(false);
        running.current = false;
      }
    },
    [clearWaiters, playCircleTo, waitForEntryDestination],
  );

  const value = useMemo(
    () => ({
      runTransition,
      runEntryTransition,
      transitionPending,
      // Temporary alias for callers/tests while the routing guards migrate.
      entryPending: transitionPending,
    }),
    [runEntryTransition, runTransition, transitionPending],
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
  const fullCoverScale = (Math.hypot(width, height) / diameter) * 1.14;

  const circleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.get(),
      [0, 0.06, 1, 1.76, 2],
      [0, 1, 1, 1, 0],
    ),
    transform: [
      {
        translateY: interpolate(
          progress.get(),
          [0, 1, 2],
          [height * 0.32, 0, -height * 0.05],
        ),
      },
      {
        scale: interpolate(
          progress.get(),
          [0, 1, 2],
          [0.46, fullCoverScale, 0.82],
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
