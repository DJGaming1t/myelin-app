import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { motion } from '@/src/theme/tokens';

// Completion depends on the transition phase, never on a recommendation ID.
// Undo can legitimately leave the same recommendation first in the queue.
export function useRecommendationMotion() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(1);
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const pending = useRef<(() => void) | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);

  const finishExit = useCallback(() => {
    if (!mounted.current || !pending.current) return;
    const change = pending.current;
    pending.current = null;
    try {
      change();
    } finally {
      setPhase('entering');
    }
  }, []);

  const finishEnter = useCallback(() => {
    if (!mounted.current) return;
    locked.current = false;
    setPhase('idle');
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = null;
      cancelAnimation(progress);
    };
  }, [progress]);

  useEffect(() => {
    if (phase === 'idle') return;
    if (reduceMotion) {
      progress.set(1);
      if (phase === 'exiting') finishExit();
      else finishEnter();
      return;
    }
    const exiting = phase === 'exiting';
    progress.set(withTiming(exiting ? 0 : 1, {
      duration: exiting ? motion.pressMs : motion.stateMs,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
    }, (finished) => {
      if (finished) scheduleOnRN(exiting ? finishExit : finishEnter);
    }));
    return () => cancelAnimation(progress);
  }, [finishEnter, finishExit, phase, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: reduceMotion ? 0 : (1 - progress.get()) * 12 }],
  }));

  function transition(change: () => void) {
    if (locked.current) return;
    if (reduceMotion) {
      change();
      return;
    }
    locked.current = true;
    pending.current = change;
    setPhase('exiting');
  }

  return { style, busy: phase !== 'idle', transition };
}
