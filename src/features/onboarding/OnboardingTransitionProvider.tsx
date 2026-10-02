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

  const coverProgress = useSharedValue(0);
  const coverOpacity = useSharedValue(0);
  const fieldOpacity = useSharedValue(0);
  const lensOpacity = useSharedValue(0);
  const lensOpen = useSharedValue(0.12);
  const lensScale = useSharedValue(1);
  const lensTravel = useSharedValue(0);
  const coreScale = useSharedValue(0.92);
  const sceneScale = useSharedValue(1);
  const sceneOpacity = useSharedValue(1);
  const fade = useSharedValue(0);

  const resetVisualState = useCallback(() => {
    coverProgress.set(0);
    coverOpacity.set(0);
    fieldOpacity.set(0);
    lensOpacity.set(0);
    lensOpen.set(0.12);
    lensScale.set(1);
    lensTravel.set(0);
    coreScale.set(0.92);
    sceneScale.set(1);
    sceneOpacity.set(1);
    fade.set(0);
  }, [
    coreScale,
    coverOpacity,
    coverProgress,
    fade,
    fieldOpacity,
    lensOpen,
    lensOpacity,
    lensScale,
    lensTravel,
    sceneOpacity,
    sceneScale,
  ]);

  const playHandoff = useCallback(
    async (commit: TransitionTask) => {
      if (reduceMotion) {
        fade.set(withTiming(1, { duration: 130, easing: EASE_OUT }));
        await sleep(140);
        await commit();
        await sleep(45);
        fade.set(withTiming(0, { duration: 170, easing: EASE_OUT }));
        await sleep(180);
        return;
      }

      // The outgoing screen yields while one signal object grows to own the frame.
      sceneScale.set(withTiming(0.986, { duration: 170, easing: EASE_OUT }));
      sceneOpacity.set(withTiming(0.8, { duration: 170, easing: EASE_OUT }));
      coverOpacity.set(1);
      coverProgress.set(
        withTiming(1, { duration: 230, easing: EASE_IN_OUT }),
      );

      // Once the signal owns the frame it morphs into the MYELIN aperture.
      fieldOpacity.set(
        withDelay(165, withTiming(1, { duration: 85, easing: EASE_OUT })),
      );
      lensOpacity.set(
        withDelay(185, withTiming(1, { duration: 95, easing: EASE_OUT })),
      );
      lensOpen.set(
        withDelay(180, withTiming(1, { duration: 145, easing: EASE_OUT })),
      );
      coreScale.set(
        withDelay(
          185,
          withSequence(
            withTiming(1.08, { duration: 115, easing: EASE_OUT }),
            withTiming(1, { duration: 70, easing: EASE_IN_OUT }),
          ),
        ),
      );

      // Route swap happens only after the old screen is completely obscured.
      await sleep(285);
      await commit();
      await nextFrame();
      await sleep(45);

      // The same aperture now belongs to the destination: it contracts toward
      // the bottom-center action while the new screen appears around it.
      coverOpacity.set(withTiming(0, { duration: 80, easing: EASE_OUT }));
      fieldOpacity.set(withTiming(0, { duration: 280, easing: EASE_OUT }));
      sceneScale.set(
        withDelay(20, withTiming(1, { duration: 235, easing: EASE_OUT })),
      );
      sceneOpacity.set(
        withDelay(15, withTiming(1, { duration: 185, easing: EASE_OUT })),
      );
      lensTravel.set(withTiming(1, { duration: 300, easing: EASE_OUT }));
      lensScale.set(withTiming(0.27, { duration: 300, easing: EASE_OUT }));
      lensOpen.set(withTiming(0.3, { duration: 245, easing: EASE_IN_OUT }));
      coreScale.set(withTiming(1.08, { duration: 245, easing: EASE_OUT }));
      lensOpacity.set(
        withDelay(225, withTiming(0, { duration: 90, easing: EASE_OUT })),
      );

      await sleep(325);
    },
    [
      coreScale,
      coverOpacity,
      coverProgress,
      fade,
      fieldOpacity,
      lensOpen,
      lensOpacity,
      lensScale,
      lensTravel,
      reduceMotion,
      sceneOpacity,
      sceneScale,
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
        // The native account picker finishes first. The visible handoff starts
        // only after authentication has succeeded and React is back on screen.
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
    transform: reduceMotion ? [] : [{ scale: sceneScale.get() }],
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
            coverProgress={coverProgress}
            coverOpacity={coverOpacity}
            fieldOpacity={fieldOpacity}
            lensOpacity={lensOpacity}
            lensOpen={lensOpen}
            lensScale={lensScale}
            lensTravel={lensTravel}
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
  coverProgress,
  coverOpacity,
  fieldOpacity,
  lensOpacity,
  lensOpen,
  lensScale,
  lensTravel,
  coreScale,
  fade,
  reduceMotion,
}: {
  coverProgress: SharedValue<number>;
  coverOpacity: SharedValue<number>;
  fieldOpacity: SharedValue<number>;
  lensOpacity: SharedValue<number>;
  lensOpen: SharedValue<number>;
  lensScale: SharedValue<number>;
  lensTravel: SharedValue<number>;
  coreScale: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const coverScale = Math.max(width, height) * 1.7 / 260;
  const landingY = Math.max(190, height * 0.38);

  const coverStyle = useAnimatedStyle(() => ({
    opacity: coverOpacity.get(),
    transform: [
      {
        translateY: interpolate(
          coverProgress.get(),
          [0, 1],
          [height * 0.5, 0],
        ),
      },
      {
        scale: interpolate(
          coverProgress.get(),
          [0, 1],
          [0.78, coverScale],
        ),
      },
    ],
  }));

  const fieldStyle = useAnimatedStyle(() => ({
    opacity: fieldOpacity.get(),
  }));

  const lensStyle = useAnimatedStyle(() => ({
    opacity: lensOpacity.get(),
    transform: [
      {
        translateY: interpolate(
          lensTravel.get(),
          [0, 1],
          [0, landingY],
        ),
      },
      { scale: lensScale.get() },
    ],
  }));

  const apertureStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleX: interpolate(lensOpen.get(), [0.12, 1], [0.18, 1]),
      },
    ],
  }));

  const traceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lensOpen.get(), [0.12, 1], [0.08, 0.7]),
    transform: [
      {
        scaleX: interpolate(lensOpen.get(), [0.12, 1], [0.25, 1]),
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
          <Animated.View style={[styles.coverDisc, coverStyle]} />
          <Animated.View style={[styles.field, fieldStyle]} />

          <Animated.View style={[styles.lensStage, lensStyle]}>
            <Animated.View style={[styles.aperture, apertureStyle]}>
              <Animated.View style={[styles.trace, styles.traceLeft, traceStyle]} />
              <Animated.View style={[styles.trace, styles.traceRight, traceStyle]} />

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
  coverDisc: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    left: '50%',
    top: '50%',
    marginLeft: -130,
    marginTop: -130,
    backgroundColor: colors.accent,
  },
  field: {
    position: 'absolute',
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    backgroundColor: colors.bgRaised,
  },
  lensStage: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 216,
    height: 112,
    marginLeft: -108,
    marginTop: -56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aperture: {
    width: 208,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  trace: {
    position: 'absolute',
    width: 66,
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
    width: 56,
    height: 56,
    borderRadius: 28,
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
