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
  withSequence,
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

const CORAL_COVER_MS = 300;
const DARK_COVER_DELAY_MS = 205;
const DARK_COVER_MS = 255;
const EYE_CLOSE_MS = 125;
const POST_COMMIT_HOLD_MS = 145;
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
  const [active, setActive] = useState(false);
  const [entryPending, setEntryPending] = useState(false);
  const running = useRef(false);

  const coralProgress = useSharedValue(0);
  const coralOpacity = useSharedValue(0);
  const darkProgress = useSharedValue(0);
  const darkOpacity = useSharedValue(0);
  const eyeOpacity = useSharedValue(0);
  const eyeOpen = useSharedValue(0.08);
  const coreScale = useSharedValue(0.92);
  const sceneOpacity = useSharedValue(1);
  const fade = useSharedValue(0);

  const resetVisualState = useCallback(() => {
    coralProgress.set(0);
    coralOpacity.set(0);
    darkProgress.set(0);
    darkOpacity.set(0);
    eyeOpacity.set(0);
    eyeOpen.set(0.08);
    coreScale.set(0.92);
    sceneOpacity.set(1);
    fade.set(0);
  }, [
    coralOpacity,
    coralProgress,
    coreScale,
    darkOpacity,
    darkProgress,
    eyeOpen,
    eyeOpacity,
    fade,
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

      // 1. The outgoing screen stays still. A coral signal rises from below
      //    and expands until it owns the whole frame.
      coralOpacity.set(1);
      coralProgress.set(
        withTiming(1, { duration: CORAL_COVER_MS, easing: EASE_IN_OUT }),
      );

      // 2. Before coral has completely settled, the darker MYELIN field grows
      //    through it. This creates a continuous morph rather than a cut.
      darkOpacity.set(
        withDelay(
          DARK_COVER_DELAY_MS,
          withTiming(1, { duration: 70, easing: EASE_OUT }),
        ),
      );
      darkProgress.set(
        withDelay(
          DARK_COVER_DELAY_MS,
          withTiming(1, { duration: DARK_COVER_MS, easing: EASE_IN_OUT }),
        ),
      );

      // 3. The central aperture forms only once the transition already owns
      //    most of the screen.
      eyeOpacity.set(
        withDelay(350, withTiming(1, { duration: 110, easing: EASE_OUT })),
      );
      eyeOpen.set(
        withDelay(345, withTiming(1, { duration: 175, easing: EASE_OUT })),
      );
      coreScale.set(
        withDelay(
          355,
          withSequence(
            withTiming(1.07, { duration: 115, easing: EASE_OUT }),
            withTiming(1, { duration: 75, easing: EASE_IN_OUT }),
          ),
        ),
      );

      // Dark has fully replaced coral at this point.
      await sleep(DARK_COVER_DELAY_MS + DARK_COVER_MS + 70);
      coralOpacity.set(
        withTiming(0, { duration: 100, easing: EASE_OUT }),
      );

      // 4. Close the aperture down to a line. The route change happens while
      //    the screen is visually sealed — not while the destination is visible.
      eyeOpen.set(
        withTiming(0.08, { duration: EYE_CLOSE_MS, easing: EASE_IN_OUT }),
      );
      coreScale.set(
        withTiming(0.78, { duration: EYE_CLOSE_MS, easing: EASE_IN_OUT }),
      );
      await sleep(EYE_CLOSE_MS + 35);

      sceneOpacity.set(0);
      await sleep(35);
      await commit();
      await nextFrame();

      // 5. The destination gets time to mount and settle while still invisible.
      await sleep(POST_COMMIT_HOLD_MS);
      sceneOpacity.set(1);

      // 6. Re-open the aperture first, then shrink the dark field away. The
      //    destination is revealed from the outside inward, like the reference.
      eyeOpen.set(
        withTiming(1, { duration: 165, easing: EASE_OUT }),
      );
      coreScale.set(
        withSequence(
          withTiming(1.06, { duration: 125, easing: EASE_OUT }),
          withTiming(1, { duration: 75, easing: EASE_IN_OUT }),
        ),
      );

      await sleep(105);

      darkProgress.set(
        withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
      );
      eyeOpacity.set(
        withDelay(
          REVEAL_MS - 95,
          withTiming(0, { duration: 105, easing: EASE_OUT }),
        ),
      );
      darkOpacity.set(
        withDelay(
          REVEAL_MS - 65,
          withTiming(0, { duration: 85, easing: EASE_OUT }),
        ),
      );

      await sleep(REVEAL_MS + 30);
    },
    [
      coralOpacity,
      coralProgress,
      coreScale,
      darkOpacity,
      darkProgress,
      eyeOpen,
      eyeOpacity,
      fade,
      reduceMotion,
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
        // Keep native authentication completely separate from the visible
        // transition. The animation starts only after the account picker returns.
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
            eyeOpacity={eyeOpacity}
            eyeOpen={eyeOpen}
            coreScale={coreScale}
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
  eyeOpacity,
  eyeOpen,
  coreScale,
  fade,
  reduceMotion,
}: {
  coralProgress: SharedValue<number>;
  coralOpacity: SharedValue<number>;
  darkProgress: SharedValue<number>;
  darkOpacity: SharedValue<number>;
  eyeOpacity: SharedValue<number>;
  eyeOpen: SharedValue<number>;
  coreScale: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const fullCoverScale = Math.max(width, height) * 1.75 / 280;

  const coralStyle = useAnimatedStyle(() => ({
    opacity: coralOpacity.get(),
    transform: [
      {
        translateY: interpolate(
          coralProgress.get(),
          [0, 1],
          [height * 0.62, 0],
        ),
      },
      {
        scale: interpolate(
          coralProgress.get(),
          [0, 1],
          [0.72, fullCoverScale],
        ),
      },
    ],
  }));

  const darkStyle = useAnimatedStyle(() => {
    const progress = darkProgress.get();

    return {
      opacity: darkOpacity.get(),
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [height * 0.48, 0, 0],
          ),
        },
        {
          scale: interpolate(
            progress,
            [0, 1, 2],
            [0.68, fullCoverScale, 0.72],
          ),
        },
      ],
    };
  });

  const eyeStyle = useAnimatedStyle(() => ({
    opacity: eyeOpacity.get(),
    transform: [
      {
        scaleY: interpolate(
          eyeOpen.get(),
          [0.08, 1],
          [0.08, 1],
        ),
      },
    ],
  }));

  const traceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(eyeOpen.get(), [0.08, 1], [0.12, 0.7]),
    transform: [
      {
        scaleX: interpolate(eyeOpen.get(), [0.08, 1], [0.25, 1]),
      },
    ],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.get() }],
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
          <Animated.View style={[styles.disc, styles.coralDisc, coralStyle]} />
          <Animated.View style={[styles.disc, styles.darkDisc, darkStyle]} />

          <Animated.View style={[styles.eyeStage, eyeStyle]}>
            <Animated.View style={[styles.eye, styles.eyeShell]}>
              <Animated.View
                style={[styles.trace, styles.traceLeft, traceStyle]}
              />
              <Animated.View
                style={[styles.trace, styles.traceRight, traceStyle]}
              />

              <Animated.View style={[styles.core, coreStyle]}>
                <View style={styles.coreInner} />
              </Animated.View>
            </Animated.View>
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
    width: 280,
    height: 280,
    borderRadius: 140,
    left: '50%',
    top: '50%',
    marginLeft: -140,
    marginTop: -140,
  },
  coralDisc: {
    backgroundColor: colors.accent,
  },
  darkDisc: {
    backgroundColor: colors.bgRaised,
  },
  eyeStage: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 230,
    height: 100,
    marginLeft: -115,
    marginTop: -50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eye: {
    width: 218,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  eyeShell: {
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panelRaised,
  },
  trace: {
    position: 'absolute',
    width: 70,
    height: 1,
    backgroundColor: colors.accentLine,
  },
  traceLeft: {
    left: 18,
  },
  traceRight: {
    right: 18,
  },
  core: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreInner: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.accent,
  },
});
