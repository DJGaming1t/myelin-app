import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
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
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors } from '@/src/theme/tokens';

type TransitionTask = () => Promise<void> | void;

type OnboardingTransitionContextValue = {
  runTransition: (commit: TransitionTask) => Promise<void>;
  runEntryTransition: (
    task: TransitionTask,
    commit: TransitionTask,
  ) => Promise<void>;
  entryPending: boolean;
};

const OnboardingTransitionContext =
  createContext<OnboardingTransitionContextValue | null>(null);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const CORAL_COVER_MS = 330;
const DARK_DELAY_MS = 170;
const DARK_COVER_MS = 310;
const FULL_COVER_HOLD_MS = 110;
const POST_COMMIT_HOLD_MS = 150;
const REVEAL_MS = 390;

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
  const [entryPending, setEntryPending] = useState(false);
  const running = useRef(false);

  const coralProgress = useSharedValue(0);
  const coralOpacity = useSharedValue(0);
  const darkProgress = useSharedValue(0);
  const darkOpacity = useSharedValue(0);
  const rimProgress = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const fade = useSharedValue(0);

  const resetVisualState = useCallback(() => {
    coralProgress.set(0);
    coralOpacity.set(0);
    darkProgress.set(0);
    darkOpacity.set(0);
    rimProgress.set(0);
    sceneOpacity.set(1);
    fade.set(0);
  }, [
    coralOpacity,
    coralProgress,
    darkOpacity,
    darkProgress,
    fade,
    rimProgress,
    sceneOpacity,
  ]);

  const playHandoff = useCallback(
    async (commit: TransitionTask) => {
      if (reduceMotion) {
        fade.set(withTiming(1, { duration: 160, easing: EASE_OUT }));
        await sleep(175);

        sceneOpacity.set(0);
        await commit();
        await nextFrame();
        await sleep(POST_COMMIT_HOLD_MS);

        sceneOpacity.set(1);
        fade.set(withTiming(0, { duration: 210, easing: EASE_OUT }));
        await sleep(220);
        return;
      }

      // 1. A coral field rises from below and expands across the old screen.
      coralOpacity.set(1);
      coralProgress.set(
        withTiming(1, { duration: CORAL_COVER_MS, easing: EASE_IN_OUT }),
      );

      // 2. A darker field follows from a different origin, carving a moving
      //    coral crescent instead of introducing a separate logo/eye object.
      darkOpacity.set(
        withDelay(
          DARK_DELAY_MS,
          withTiming(1, { duration: 90, easing: EASE_OUT }),
        ),
      );
      darkProgress.set(
        withDelay(
          DARK_DELAY_MS,
          withTiming(1, { duration: DARK_COVER_MS, easing: EASE_IN_OUT }),
        ),
      );

      // 3. A thin signal rim arrives after both surfaces are already moving.
      //    It gives the morph depth without becoming a standalone focal icon.
      rimProgress.set(
        withDelay(
          DARK_DELAY_MS + 60,
          withTiming(1, { duration: 220, easing: EASE_OUT }),
        ),
      );

      // The transition owns the full frame before navigation changes.
      await sleep(DARK_DELAY_MS + DARK_COVER_MS + FULL_COVER_HOLD_MS);

      sceneOpacity.set(0);
      await sleep(30);
      await commit();
      await nextFrame();

      // Let the destination settle entirely underneath the opaque fields.
      await sleep(POST_COMMIT_HOLD_MS);
      sceneOpacity.set(1);

      // 4. Reveal by reversing the same layered surfaces in staggered timing.
      //    The dark field peels away first, leaving a short coral after-image,
      //    then coral follows. This is the actual screen reveal.
      darkProgress.set(
        withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
      );
      rimProgress.set(
        withTiming(2, { duration: 230, easing: EASE_OUT }),
      );
      coralProgress.set(
        withDelay(
          90,
          withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
        ),
      );

      darkOpacity.set(
        withDelay(
          REVEAL_MS - 80,
          withTiming(0, { duration: 100, easing: EASE_OUT }),
        ),
      );
      coralOpacity.set(
        withDelay(
          REVEAL_MS + 15,
          withTiming(0, { duration: 110, easing: EASE_OUT }),
        ),
      );

      await sleep(REVEAL_MS + 130);
    },
    [
      coralOpacity,
      coralProgress,
      darkOpacity,
      darkProgress,
      fade,
      reduceMotion,
      rimProgress,
      sceneOpacity,
    ],
  );

  const runTransition = useCallback(
    async (commit: TransitionTask) => {
      if (running.current) return;

      running.current = true;
      resetVisualState();
      setActive(true);

      try {
        await nextFrame();
        await playHandoff(commit);
      } catch (error) {
        resetVisualState();
        throw error;
      } finally {
        setActive(false);
        running.current = false;
      }
    },
    [playHandoff, resetVisualState],
  );

  const runEntryTransition = useCallback(
    async (task: TransitionTask, commit: TransitionTask) => {
      if (running.current) return;

      running.current = true;
      setEntryPending(true);
      resetVisualState();

      try {
        // Native authentication finishes first. The visible transition begins
        // only after control has returned from the account picker.
        await task();

        setActive(true);
        await nextFrame();
        await playHandoff(commit);
      } catch (error) {
        resetVisualState();
        throw error;
      } finally {
        setActive(false);
        setEntryPending(false);
        running.current = false;
      }
    },
    [playHandoff, resetVisualState],
  );

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.get(),
  }));

  const value = useMemo(
    () => ({ runTransition, runEntryTransition, entryPending }),
    [entryPending, runEntryTransition, runTransition],
  );

  return (
    <OnboardingTransitionContext.Provider value={value}>
      <View style={styles.root}>
        <Animated.View style={[styles.scene, sceneStyle]}>
          {children}
        </Animated.View>

        {active ? (
          <TransitionOverlay
            coralProgress={coralProgress}
            coralOpacity={coralOpacity}
            darkProgress={darkProgress}
            darkOpacity={darkOpacity}
            rimProgress={rimProgress}
            fade={fade}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </View>
    </OnboardingTransitionContext.Provider>
  );
}

function TransitionOverlay({
  coralProgress,
  coralOpacity,
  darkProgress,
  darkOpacity,
  rimProgress,
  fade,
  reduceMotion,
}: {
  coralProgress: SharedValue<number>;
  coralOpacity: SharedValue<number>;
  darkProgress: SharedValue<number>;
  darkOpacity: SharedValue<number>;
  rimProgress: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const fullCoverScale = (Math.max(width, height) * 1.9) / 320;

  const coralStyle = useAnimatedStyle(() => {
    const progress = coralProgress.get();

    return {
      opacity: coralOpacity.get(),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [-width * 0.1, 0, width * 0.08],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [height * 0.62, 0, height * 0.58],
          ),
        },
        {
          scale: interpolate(
            progress,
            [0, 1, 2],
            [0.74, fullCoverScale, 0.84],
          ),
        },
      ],
    };
  });

  const darkStyle = useAnimatedStyle(() => {
    const progress = darkProgress.get();

    return {
      opacity: darkOpacity.get(),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [width * 0.2, 0, width * 0.2],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [height * 0.48, 0, -height * 0.42],
          ),
        },
        {
          scaleX: interpolate(
            progress,
            [0, 1, 2],
            [0.68, fullCoverScale * 1.03, 0.78],
          ),
        },
        {
          scaleY: interpolate(
            progress,
            [0, 1, 2],
            [0.74, fullCoverScale, 0.72],
          ),
        },
      ],
    };
  });

  const rimStyle = useAnimatedStyle(() => {
    const progress = rimProgress.get();

    return {
      opacity: interpolate(progress, [0, 1, 2], [0, 0.42, 0]),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [width * 0.15, 0, -width * 0.08],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [height * 0.16, 0, -height * 0.18],
          ),
        },
        {
          scale: interpolate(progress, [0, 1, 2], [0.72, 1.08, 1.28]),
        },
      ],
    };
  });

  const rimEchoStyle = useAnimatedStyle(() => {
    const progress = rimProgress.get();

    return {
      opacity: interpolate(progress, [0, 1, 2], [0, 0.16, 0]),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [-width * 0.08, 0, width * 0.1],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [height * 0.2, 0, height * 0.12],
          ),
        },
        {
          scale: interpolate(progress, [0, 1, 2], [0.66, 1.2, 1.34]),
        },
      ],
    };
  });

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.get(),
  }));

  return (
    <View
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Opening MYELIN"
      style={styles.overlay}>
      <Animated.View style={[styles.fadeLayer, fadeStyle]} />

      {!reduceMotion ? (
        <>
          <Animated.View style={[styles.disc, styles.coralDisc, coralStyle]} />
          <Animated.View style={[styles.disc, styles.darkDisc, darkStyle]} />

          <Animated.View style={[styles.rimStage, rimStyle]}>
            <View style={styles.rim} />
          </Animated.View>
          <Animated.View style={[styles.rimStage, rimEchoStyle]}>
            <View style={styles.rimEcho} />
          </Animated.View>
        </>
      ) : null}
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
  scene: {
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
    backgroundColor: colors.bg,
  },
  disc: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    left: '50%',
    top: '50%',
    marginLeft: -160,
    marginTop: -160,
  },
  coralDisc: {
    backgroundColor: colors.accent,
  },
  darkDisc: {
    backgroundColor: colors.bgRaised,
  },
  rimStage: {
    position: 'absolute',
    width: 280,
    height: 280,
    left: '50%',
    top: '50%',
    marginLeft: -140,
    marginTop: -140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    width: 242,
    height: 242,
    borderRadius: 121,
    borderWidth: 2,
    borderColor: colors.accentBright,
  },
  rimEcho: {
    width: 272,
    height: 272,
    borderRadius: 136,
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
});
