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

const LEAD_IN_MS = 280;
const COVER_IN_MS = 330;
const FULL_COVER_HOLD_MS = 110;
const POST_COMMIT_HOLD_MS = 160;
const REVEAL_MS = 420;

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
  const accentProgress = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const fade = useSharedValue(0);

  const resetVisualState = useCallback(() => {
    coralProgress.set(0);
    darkProgress.set(0);
    accentProgress.set(0);
    sceneOpacity.set(1);
    fade.set(0);
  }, [accentProgress, coralProgress, darkProgress, fade, sceneOpacity]);

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

      // Phase 1: a broad coral ribbon sweeps diagonally across the old screen.
      coralProgress.set(
        withTiming(1, { duration: LEAD_IN_MS, easing: EASE_IN_OUT }),
      );

      // Phase 2: a darker field follows it, deliberately offset so a coral
      // leading edge remains visible. This is the transition identity now:
      // broad moving fields, not a circular focal object.
      darkProgress.set(
        withDelay(
          85,
          withTiming(1, { duration: COVER_IN_MS, easing: EASE_IN_OUT }),
        ),
      );

      // A thin accent strip tracks between the two surfaces and disappears once
      // the transition fully owns the frame.
      accentProgress.set(
        withDelay(
          135,
          withTiming(1, { duration: 250, easing: EASE_OUT }),
        ),
      );

      await sleep(85 + COVER_IN_MS + FULL_COVER_HOLD_MS);

      // The page swap happens only while the dark field is fully opaque.
      sceneOpacity.set(0);
      await sleep(30);
      await commit();
      await nextFrame();

      // The destination settles underneath before any reveal begins.
      await sleep(POST_COMMIT_HOLD_MS);
      sceneOpacity.set(1);

      // Phase 3: the same surfaces continue their motion off the opposite edge.
      // Dark leaves first, then coral follows, so the destination is revealed in
      // one continuous diagonal sweep rather than a fade or shrinking circle.
      darkProgress.set(
        withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
      );
      accentProgress.set(
        withTiming(2, { duration: 280, easing: EASE_OUT }),
      );
      coralProgress.set(
        withDelay(
          95,
          withTiming(2, { duration: REVEAL_MS, easing: EASE_OUT }),
        ),
      );

      await sleep(REVEAL_MS + 125);
    },
    [
      accentProgress,
      coralProgress,
      darkProgress,
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
        // Keep native authentication separate from the visible handoff.
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
            accentProgress={accentProgress}
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
  accentProgress,
  fade,
  reduceMotion,
}: {
  coralProgress: SharedValue<number>;
  darkProgress: SharedValue<number>;
  accentProgress: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const diagonal = Math.hypot(width, height);
  const panelSize = diagonal * 1.45;
  const travelX = width * 1.15;
  const travelY = height * 0.92;

  const coralStyle = useAnimatedStyle(() => {
    const progress = coralProgress.get();

    return {
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [-travelX, 0, travelX],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [travelY, 0, -travelY],
          ),
        },
        { rotateZ: '-12deg' },
      ],
    };
  });

  const darkStyle = useAnimatedStyle(() => {
    const progress = darkProgress.get();

    return {
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [-travelX * 0.9, 0, travelX * 1.05],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [travelY * 0.86, 0, -travelY * 1.02],
          ),
        },
        { rotateZ: '-12deg' },
      ],
    };
  });

  const accentStyle = useAnimatedStyle(() => {
    const progress = accentProgress.get();

    return {
      opacity: interpolate(progress, [0, 0.3, 1, 2], [0, 0.95, 0.55, 0]),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1, 2],
            [-travelX * 0.75, width * 0.08, travelX],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1, 2],
            [travelY * 0.72, -height * 0.02, -travelY * 0.9],
          ),
        },
        { rotateZ: '-12deg' },
      ],
    };
  });

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.get(),
  }));

  const panelFrame = {
    width: panelSize,
    height: panelSize,
    marginLeft: -panelSize / 2,
    marginTop: -panelSize / 2,
    borderRadius: panelSize * 0.16,
  };

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
              styles.field,
              styles.coralField,
              panelFrame,
              coralStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.field,
              styles.darkField,
              panelFrame,
              darkStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.accentRibbon,
              {
                width: panelSize * 0.95,
                marginLeft: -(panelSize * 0.95) / 2,
              },
              accentStyle,
            ]}
          />
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
  field: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  coralField: {
    backgroundColor: colors.accent,
  },
  darkField: {
    backgroundColor: colors.bgRaised,
  },
  accentRibbon: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    height: 18,
    marginTop: -9,
    borderRadius: 9,
    backgroundColor: colors.accentBright,
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
