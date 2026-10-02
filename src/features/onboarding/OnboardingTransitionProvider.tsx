import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { colors, type } from '@/src/theme/tokens';

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

  const shutter = useSharedValue(0);
  const seam = useSharedValue(0);
  const coreOpacity = useSharedValue(0);
  const coreScale = useSharedValue(0.94);
  const wordmarkOpacity = useSharedValue(0);
  const fade = useSharedValue(0);
  const sceneScale = useSharedValue(1);
  const sceneOpacity = useSharedValue(1);

  const resetVisualState = useCallback(() => {
    shutter.set(0);
    seam.set(0);
    coreOpacity.set(0);
    coreScale.set(0.94);
    wordmarkOpacity.set(0);
    fade.set(0);
    sceneScale.set(1);
    sceneOpacity.set(1);
  }, [
    coreOpacity,
    coreScale,
    fade,
    sceneOpacity,
    sceneScale,
    seam,
    shutter,
    wordmarkOpacity,
  ]);

  const playHandoff = useCallback(
    async (commit: TransitionTask) => {
      if (reduceMotion) {
        fade.set(withTiming(1, { duration: 130, easing: EASE_OUT }));
        await sleep(140);
        await commit();
        await sleep(50);
        fade.set(withTiming(0, { duration: 170, easing: EASE_OUT }));
        await sleep(180);
        return;
      }

      // Phase 1: the current screen visibly yields to the transition surface.
      sceneScale.set(withTiming(0.985, { duration: 180, easing: EASE_OUT }));
      sceneOpacity.set(withTiming(0.82, { duration: 180, easing: EASE_OUT }));
      shutter.set(withTiming(1, { duration: 250, easing: EASE_IN_OUT }));
      seam.set(
        withDelay(70, withTiming(1, { duration: 170, easing: EASE_OUT })),
      );
      coreOpacity.set(
        withDelay(100, withTiming(1, { duration: 140, easing: EASE_OUT })),
      );
      coreScale.set(
        withDelay(
          90,
          withSequence(
            withTiming(1.06, { duration: 170, easing: EASE_OUT }),
            withTiming(1, { duration: 90, easing: EASE_IN_OUT }),
          ),
        ),
      );
      wordmarkOpacity.set(
        withDelay(145, withTiming(1, { duration: 150, easing: EASE_OUT })),
      );

      // The shutters now fully cover the outgoing route.
      await sleep(265);
      await commit();

      // Give the destination one frame plus a short settle while fully hidden.
      await nextFrame();
      await sleep(85);

      // Phase 2: reveal the destination as the shutters separate.
      shutter.set(withTiming(2, { duration: 310, easing: EASE_OUT }));
      seam.set(withTiming(0, { duration: 150, easing: EASE_OUT }));
      coreOpacity.set(
        withDelay(40, withTiming(0, { duration: 150, easing: EASE_OUT })),
      );
      wordmarkOpacity.set(
        withTiming(0, { duration: 120, easing: EASE_OUT }),
      );
      sceneScale.set(
        withDelay(45, withTiming(1, { duration: 255, easing: EASE_OUT })),
      );
      sceneOpacity.set(
        withDelay(20, withTiming(1, { duration: 190, easing: EASE_OUT })),
      );

      await sleep(325);
    },
    [
      coreOpacity,
      coreScale,
      fade,
      reduceMotion,
      sceneOpacity,
      sceneScale,
      seam,
      shutter,
      wordmarkOpacity,
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
        // Authentication finishes first. The transition only becomes visible
        // after the native Google picker has returned successfully.
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
            shutter={shutter}
            seam={seam}
            coreOpacity={coreOpacity}
            coreScale={coreScale}
            wordmarkOpacity={wordmarkOpacity}
            fade={fade}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </View>
    </OnboardingTransitionContext.Provider>
  );
}

function TransitionOverlay({
  shutter,
  seam,
  coreOpacity,
  coreScale,
  wordmarkOpacity,
  fade,
  reduceMotion,
}: {
  shutter: SharedValue<number>;
  seam: SharedValue<number>;
  coreOpacity: SharedValue<number>;
  coreScale: SharedValue<number>;
  wordmarkOpacity: SharedValue<number>;
  fade: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const { height } = useWindowDimensions();
  const travel = Math.max(360, height * 0.53);

  const topPanelStyle = useAnimatedStyle(() => {
    const progress = shutter.get();
    const y = progress <= 1
      ? -travel * (1 - progress)
      : -travel * (progress - 1);

    return {
      transform: [{ translateY: y }],
    };
  });

  const bottomPanelStyle = useAnimatedStyle(() => {
    const progress = shutter.get();
    const y = progress <= 1
      ? travel * (1 - progress)
      : travel * (progress - 1);

    return {
      transform: [{ translateY: y }],
    };
  });

  const seamStyle = useAnimatedStyle(() => ({
    opacity: seam.get(),
    transform: reduceMotion
      ? []
      : [{ scaleX: interpolate(seam.get(), [0, 1], [0.16, 1]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: seam.get() * 0.72,
    transform: reduceMotion
      ? []
      : [{ scaleX: interpolate(seam.get(), [0, 1], [0.25, 1.05]) }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: coreOpacity.get(),
    transform: reduceMotion ? [] : [{ scale: coreScale.get() }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.get(),
    transform: reduceMotion
      ? []
      : [
          {
            translateY: interpolate(
              wordmarkOpacity.get(),
              [0, 1],
              [7, 0],
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
          <Animated.View style={[styles.panel, styles.topPanel, topPanelStyle]}>
            <View style={[styles.panelAccent, styles.topAccent]} />
          </Animated.View>

          <Animated.View
            style={[styles.panel, styles.bottomPanel, bottomPanelStyle]}>
            <View style={[styles.panelAccent, styles.bottomAccent]} />
          </Animated.View>

          <View style={styles.centerStage} pointerEvents="none">
            <Animated.View style={[styles.seamGlow, glowStyle]} />
            <Animated.View style={[styles.seam, seamStyle]} />

            <Animated.View style={[styles.core, coreStyle]}>
              <View style={styles.coreInner} />
            </Animated.View>

            <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
              <Text style={styles.wordmark}>MYELIN</Text>
              <Text style={styles.wordmarkMeta}>FOCUS, CONTINUED</Text>
            </Animated.View>
          </View>
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
  },
  fadeLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
  },
  panel: {
    position: 'absolute',
    left: -16,
    right: -16,
    height: '52%',
    backgroundColor: colors.bgRaised,
    overflow: 'hidden',
  },
  topPanel: {
    top: 0,
    justifyContent: 'flex-end',
  },
  bottomPanel: {
    bottom: 0,
    justifyContent: 'flex-start',
  },
  panelAccent: {
    height: 28,
    backgroundColor: colors.accentFaint,
  },
  topAccent: {
    borderBottomWidth: 1,
    borderBottomColor: colors.accentLine,
  },
  bottomAccent: {
    borderTopWidth: 1,
    borderTopColor: colors.accentLine,
  },
  centerStage: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '50%',
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seamGlow: {
    position: 'absolute',
    width: '100%',
    height: 34,
    backgroundColor: colors.accentFaint,
  },
  seam: {
    position: 'absolute',
    width: '100%',
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  core: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  coreInner: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  wordmarkWrap: {
    position: 'absolute',
    top: 46,
    alignItems: 'center',
  },
  wordmark: {
    color: colors.text,
    ...type.label,
    fontWeight: '900',
    letterSpacing: 3.5,
  },
  wordmarkMeta: {
    color: colors.subtle,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginTop: 5,
  },
});
