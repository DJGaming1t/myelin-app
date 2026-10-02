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

const CORAL_RISE_MS = 270;
const DARK_DELAY_MS = 80;
const DARK_RISE_MS = 300;
const FULL_COVER_HOLD_MS = 120;
const POST_COMMIT_HOLD_MS = 150;
const REVEAL_MS = 350;

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
  const darkProgress = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const fade = useSharedValue(0);

  const resetVisualState = useCallback(() => {
    coralProgress.set(0);
    darkProgress.set(0);
    sceneOpacity.set(1);
    fade.set(0);
  }, [coralProgress, darkProgress, fade, sceneOpacity]);

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

      // One simple spatial idea: two sheets rise from the bottom.
      coralProgress.set(
        withTiming(1, { duration: CORAL_RISE_MS, easing: EASE_IN_OUT }),
      );

      darkProgress.set(
        withDelay(
          DARK_DELAY_MS,
          withTiming(1, { duration: DARK_RISE_MS, easing: EASE_IN_OUT }),
        ),
      );

      // Navigation only changes after the dark sheet fully owns the frame.
      await sleep(DARK_DELAY_MS + DARK_RISE_MS + FULL_COVER_HOLD_MS);

      sceneOpacity.set(0);
      await sleep(30);
      await commit();
      await nextFrame();

      // Give the destination a quiet hidden settle before revealing it.
      await sleep(POST_COMMIT_HOLD_MS);
      sceneOpacity.set(1);

      // The same sheets continue upward. Dark leaves first; coral trails behind
      // as a thin branded edge, then exits too.
      darkProgress.set(
        withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
      );
      coralProgress.set(
        withDelay(
          65,
          withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
        ),
      );

      await sleep(REVEAL_MS + 100);
    },
    [coralProgress, darkProgress, fade, reduceMotion, sceneOpacity],
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
        // Native authentication finishes before this transition appears.
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
            darkProgress={darkProgress}
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
  darkProgress,
  fade,
  reduceMotion,
}: {
  coralProgress: SharedValue<number>;
  darkProgress: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const sheetHeight = height + 120;
  const sheetWidth = width + 40;
  const entryY = height + 70;
  const coveredY = -60;
  const exitY = -(height + 140);

  const coralStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          coralProgress.get(),
          [0, 1, 2],
          [entryY, coveredY, exitY],
        ),
      },
    ],
  }));

  const darkStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          darkProgress.get(),
          [0, 1, 2],
          [entryY + 26, coveredY, exitY - 20],
        ),
      },
    ],
  }));

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
          <Animated.View
            style={[
              styles.sheet,
              styles.coralSheet,
              {
                width: sheetWidth,
                height: sheetHeight,
                left: -20,
              },
              coralStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.sheet,
              styles.darkSheet,
              {
                width: sheetWidth,
                height: sheetHeight,
                left: -20,
              },
              darkStyle,
            ]}>
            <View style={styles.edgeLine} />
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
  sheet: {
    position: 'absolute',
    top: 0,
    borderRadius: 32,
  },
  coralSheet: {
    backgroundColor: colors.accent,
  },
  darkSheet: {
    backgroundColor: colors.bgRaised,
    borderTopWidth: 1,
    borderTopColor: colors.accentLine,
    overflow: 'hidden',
  },
  edgeLine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accentBright,
    opacity: 0.7,
  },
});
