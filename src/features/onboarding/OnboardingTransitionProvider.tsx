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

import { useWorkspace } from '@/src/data/WorkspaceProvider';
import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useOnboarding } from '@/src/features/onboarding/OnboardingProvider';
import {
  resolveEntryTransitionDestination,
  transitionSegmentsMatch,
  type TransitionDestination,
  type TransitionRoutingState,
} from '@/src/features/onboarding/transition-routing';
import { colors } from '@/src/theme/tokens';

type TransitionTask = () => Promise<void> | void;

type OnboardingTransitionContextValue = {
  runTransition: (
    task: TransitionTask,
    destination: TransitionDestination,
  ) => Promise<void>;
  runEntryTransition: (task: TransitionTask) => Promise<void>;
  transitionPending: boolean;
  entryPending: boolean;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const COVER_MS = 340;
const REVEAL_MS = 330;
const STATE_READY_TIMEOUT_MS = 5000;
const ROUTE_READY_TIMEOUT_MS = 4000;

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

function timeoutError(message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = 'transition/timeout';
  return error;
}

export function OnboardingTransitionProvider({ children }: PropsWithChildren) {
  const reduceMotion = useReducedMotion();
  const segments = useSegments();
  const { ready: authReady, user, localMode } = useAuth();
  const {
    status: workspaceStatus,
    ownerKey: workspaceOwnerKey,
    workspace,
  } = useWorkspace();
  const { ready: onboardingReady, shouldShow: shouldShowOnboarding } =
    useOnboarding();

  const [active, setActive] = useState(false);
  const [transitionPending, setTransitionPending] = useState(false);
  const running = useRef(false);

  const routingStateRef = useRef<TransitionRoutingState>({
    authReady,
    userUid: user?.uid ?? null,
    emailVerified: Boolean(user?.emailVerified),
    localMode,
    workspaceOwnerKey,
    workspaceStatus,
    workspacePresent: Boolean(workspace),
    onboardingReady,
    shouldShowOnboarding,
  });

  routingStateRef.current = {
    authReady,
    userUid: user?.uid ?? null,
    emailVerified: Boolean(user?.emailVerified),
    localMode,
    workspaceOwnerKey,
    workspaceStatus,
    workspacePresent: Boolean(workspace),
    onboardingReady,
    shouldShowOnboarding,
  };

  const entryDestinationResolver =
    useRef<((destination: TransitionDestination) => void) | null>(null);
  const entryDestinationExpected =
    useRef<TransitionDestination | null>(null);
  const entryDestinationRejecter = useRef<((error: Error) => void) | null>(null);
  const entryDestinationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const routeReadyResolver = useRef<(() => void) | null>(null);
  const routeReadyRejecter = useRef<((error: Error) => void) | null>(null);
  const routeReadyTarget = useRef<TransitionDestination | null>(null);
  const routeReadyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeReadyFrames = useRef<number[]>([]);
  const routeReadyScheduled = useRef(false);

  const circleProgress = useSharedValue(0);
  const fadeOpacity = useSharedValue(0);

  const clearEntryDestinationWait = useCallback(() => {
    if (entryDestinationTimer.current) {
      clearTimeout(entryDestinationTimer.current);
      entryDestinationTimer.current = null;
    }
    entryDestinationResolver.current = null;
    entryDestinationExpected.current = null;
    entryDestinationRejecter.current = null;
  }, []);

  const clearRouteReady = useCallback(() => {
    if (routeReadyTimer.current) {
      clearTimeout(routeReadyTimer.current);
      routeReadyTimer.current = null;
    }
    for (const frame of routeReadyFrames.current) {
      cancelAnimationFrame(frame);
    }
    routeReadyFrames.current = [];
    routeReadyResolver.current = null;
    routeReadyRejecter.current = null;
    routeReadyTarget.current = null;
    routeReadyScheduled.current = false;
  }, []);

  useEffect(() => {
    const resolver = entryDestinationResolver.current;
    if (!resolver) return;

    const destination = resolveEntryTransitionDestination(
      routingStateRef.current,
    );
    if (
      !destination ||
      (entryDestinationExpected.current &&
        destination !== entryDestinationExpected.current)
    ) {
      return;
    }

    clearEntryDestinationWait();
    resolver(destination);
  }, [
    authReady,
    clearEntryDestinationWait,
    localMode,
    onboardingReady,
    shouldShowOnboarding,
    user?.emailVerified,
    user?.uid,
    workspaceOwnerKey,
    workspaceStatus,
    workspace,
  ]);

  useEffect(() => {
    const target = routeReadyTarget.current;
    const resolver = routeReadyResolver.current;

    if (
      !resolver ||
      !target ||
      !transitionSegmentsMatch(target, segments as readonly string[]) ||
      routeReadyScheduled.current
    ) {
      return;
    }

    routeReadyScheduled.current = true;

    // The group has actually changed. Give the destination two paint frames
    // before the circle exposes any of it.
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        const currentResolver = routeReadyResolver.current;
        clearRouteReady();
        currentResolver?.();
      });
      routeReadyFrames.current.push(secondFrame);
    });
    routeReadyFrames.current.push(firstFrame);
  }, [clearRouteReady, segments]);

  const waitForEntryDestination = useCallback(
    (expected: TransitionDestination | null = null) => {
      const immediate = resolveEntryTransitionDestination(
        routingStateRef.current,
      );
      if (immediate && (!expected || immediate === expected)) {
        return Promise.resolve(immediate);
      }

      return new Promise<TransitionDestination>((resolve, reject) => {
        clearEntryDestinationWait();
        entryDestinationExpected.current = expected;
        entryDestinationResolver.current = resolve;
      entryDestinationRejecter.current = reject;
      entryDestinationTimer.current = setTimeout(() => {
        const currentRejecter = entryDestinationRejecter.current;
        clearEntryDestinationWait();
        currentRejecter?.(
          timeoutError('MYELIN could not finish preparing the next screen.'),
        );
        }, STATE_READY_TIMEOUT_MS);
      });
    },
    [clearEntryDestinationWait],
  );

  const waitForRouteDestination = useCallback(
    (target: TransitionDestination) => {
      return new Promise<void>((resolve, reject) => {
        clearRouteReady();
        routeReadyTarget.current = target;
        routeReadyResolver.current = resolve;
        routeReadyRejecter.current = reject;
        routeReadyTimer.current = setTimeout(() => {
          const currentRejecter = routeReadyRejecter.current;
          clearRouteReady();
          currentRejecter?.(
            timeoutError('MYELIN could not open the requested screen.'),
          );
        }, ROUTE_READY_TIMEOUT_MS);
      });
    },
    [clearRouteReady],
  );

  const resetVisualState = useCallback(() => {
    circleProgress.set(0);
    fadeOpacity.set(0);
  }, [circleProgress, fadeOpacity]);

  const cover = useCallback(async () => {
    resetVisualState();
    setActive(true);
    await nextFrame();

    if (reduceMotion) {
      fadeOpacity.set(withTiming(1, { duration: 140, easing: EASE_OUT }));
      await sleep(155);
      return;
    }

    circleProgress.set(
      withTiming(1, { duration: COVER_MS, easing: EASE_IN_OUT }),
    );
    await sleep(COVER_MS + 15);
  }, [circleProgress, fadeOpacity, reduceMotion, resetVisualState]);

  const reveal = useCallback(async () => {
    if (reduceMotion) {
      fadeOpacity.set(withTiming(0, { duration: 180, easing: EASE_OUT }));
      await sleep(195);
      return;
    }

    circleProgress.set(
      withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
    );
    await sleep(REVEAL_MS + 20);
  }, [circleProgress, fadeOpacity, reduceMotion]);

  const navigateUnderCover = useCallback(
    async (destination: TransitionDestination) => {
      const routeReady = waitForRouteDestination(destination);

      router.replace(destination);
      await routeReady;
      await reveal();
    },
    [reveal, waitForRouteDestination],
  );

  const finishTransition = useCallback(() => {
    clearEntryDestinationWait();
    clearRouteReady();
    setActive(false);
    setTransitionPending(false);
    running.current = false;
  }, [clearEntryDestinationWait, clearRouteReady]);

  const runEntryTransition = useCallback(
    async (task: TransitionTask) => {
      if (running.current) return;

      running.current = true;
      setTransitionPending(true);

      try {
        // Google/native account selection must complete before MYELIN takes over.
        await task();

        // Resolve auth/workspace/onboarding state while the circle is expanding.
        const destinationPromise = waitForEntryDestination();
        await cover();
        const destination = await destinationPromise;

        await navigateUnderCover(destination);
      } finally {
        finishTransition();
      }
    },
    [cover, finishTransition, navigateUnderCover, waitForEntryDestination],
  );

  const runTransition = useCallback(
    async (
      task: TransitionTask,
      destination: TransitionDestination,
    ) => {
      if (running.current) return;

      running.current = true;
      setTransitionPending(true);

      try {
        // First own the old screen. State mutations that trigger route guards
        // happen only after the circle is completely opaque.
        await cover();
        await task();

        // Do not navigate until React has committed the state mutation that
        // makes this destination valid (for example shouldShow=false).
        await waitForEntryDestination(destination);
        await navigateUnderCover(destination);
      } finally {
        finishTransition();
      }
    },
    [
      cover,
      finishTransition,
      navigateUnderCover,
      waitForEntryDestination,
    ],
  );

  const value = useMemo(
    () => ({
      runTransition,
      runEntryTransition,
      transitionPending,
      // Temporary alias keeps any older callers safe while guards migrate.
      entryPending: transitionPending,
    }),
    [
      runEntryTransition,
      runTransition,
      transitionPending,
    ],
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
  const diameter = 220;
  const fullCoverScale =
    (Math.hypot(width, height) / diameter) * 1.12;

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
          [height * 0.32, 0, -height * 0.06],
        ),
      },
      {
        scale: interpolate(
          progress.get(),
          [0, 1, 2],
          [0.56, fullCoverScale, 0.62],
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
    width: 220,
    height: 220,
    borderRadius: 110,
    left: '50%',
    top: '50%',
    marginLeft: -110,
    marginTop: -110,
    backgroundColor: colors.accent,
  },
});
