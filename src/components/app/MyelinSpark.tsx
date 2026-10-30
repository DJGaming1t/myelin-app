import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/src/features/accessibility/useReducedMotion';
import { colors, radius } from '@/src/theme/tokens';

export type SparkMood =
  | 'focus'
  | 'recall'
  | 'consolidated'
  | 'rest'
  | 'overdue'
  | 'idle';

type Props = {
  mood: SparkMood;
  caption?: string;
  compact?: boolean;
};

const MOOD_THEME: Record<
  SparkMood,
  {
    badge: string;
    defaultCaption: string;
    coreColor: string;
    ringColor: string;
    glowColor: string;
    eyeStyle: 'focused' | 'spark' | 'happy' | 'sleep' | 'alert';
  }
> = {
  focus: {
    badge: 'Focus time',
    defaultCaption: 'One task, one small step at a time.',
    coreColor: colors.accent,
    ringColor: colors.accentLine,
    glowColor: colors.accentSoft,
    eyeStyle: 'focused',
  },
  recall: {
    badge: 'Recall practice',
    defaultCaption: 'Try an answer before checking your notes.',
    coreColor: colors.synapse,
    ringColor: colors.synapseLine,
    glowColor: colors.synapseSoft,
    eyeStyle: 'spark',
  },
  consolidated: {
    badge: 'Progress recorded',
    defaultCaption: 'Your work is saved. Take a moment to notice it.',
    coreColor: colors.consolidated,
    ringColor: colors.consolidatedLine,
    glowColor: colors.consolidatedSoft,
    eyeStyle: 'happy',
  },
  rest: {
    badge: 'Room to rest',
    defaultCaption: 'Step away, stretch, or let your eyes rest.',
    coreColor: colors.twilight,
    ringColor: colors.twilightLine,
    glowColor: colors.twilightSoft,
    eyeStyle: 'sleep',
  },
  overdue: {
    badge: 'A small restart',
    defaultCaption: 'Choose one due item. The rest can wait.',
    coreColor: colors.pulseAmber,
    ringColor: colors.pulseAmberLine,
    glowColor: colors.pulseAmberSoft,
    eyeStyle: 'alert',
  },
  idle: {
    badge: 'Ready when you are',
    defaultCaption: 'Add a topic or choose a short study block.',
    coreColor: colors.accentBright,
    ringColor: colors.accentLine,
    glowColor: colors.accentFaint,
    eyeStyle: 'focused',
  },
};

export function MyelinSpark({ mood, caption, compact = false }: Props) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0.5);
  const orbit = useSharedValue(0);
  const meta = MOOD_THEME[mood];

  useEffect(() => {
    cancelAnimation(breathe);
    cancelAnimation(orbit);
    if (reduced) {
      breathe.set(0.5);
      orbit.set(0.25);
      return;
    }
    // A brief greeting settles; the companion never loops beside a study task.
    breathe.set(withSequence(withTiming(1, { duration: 450 }), withTiming(0.5, { duration: 650 })));
    orbit.set(withTiming(0.25, { duration: 900 }));
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(orbit);
    };
  }, [breathe, mood, orbit, reduced]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + breathe.get() * 0.45,
    transform: [{ scale: 0.92 + breathe.get() * 0.14 }],
  }));

  const somaStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (breathe.get() - 0.5) * -3 }],
  }));

  const satelliteStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (orbit.get() - 0.5) * 8 },
      { translateY: (0.5 - orbit.get()) * 6 },
    ],
  }));

  return (
    <View
      accessible
      accessibilityLabel={`${meta.badge}. ${caption ?? meta.defaultCaption}`}
      style={[styles.banner, compact && styles.bannerCompact, { borderColor: meta.ringColor, backgroundColor: meta.glowColor }]}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.avatarStage}>
        <Animated.View
          style={[
            styles.outerHalo,
            { borderColor: meta.ringColor, backgroundColor: meta.glowColor },
            auraStyle,
          ]}
        />
        {/* Dendrite arms */}
        <View style={[styles.dendrite, styles.dendriteTopLeft, { backgroundColor: meta.ringColor }]} />
        <View style={[styles.dendrite, styles.dendriteTopRight, { backgroundColor: meta.ringColor }]} />
        <View style={[styles.dendrite, styles.dendriteBottom, { backgroundColor: meta.ringColor }]} />

        {/* Orbiting synaptic vesicle */}
        <Animated.View
          style={[
            styles.vesicle,
            { backgroundColor: meta.coreColor },
            satelliteStyle,
          ]}
        />

        {/* Neuron Soma (Character Face) */}
        <Animated.View
          style={[
            styles.soma,
            { borderColor: meta.coreColor, backgroundColor: colors.panelRaised },
            somaStyle,
          ]}>
          <View style={[styles.innerGlow, { backgroundColor: meta.glowColor }]} />
          <View style={styles.eyeRow}>
            {meta.eyeStyle === 'sleep' ? (
              <>
                <View style={[styles.eyeSleep, { backgroundColor: meta.coreColor }]} />
                <View style={[styles.eyeSleep, { backgroundColor: meta.coreColor }]} />
              </>
            ) : meta.eyeStyle === 'happy' ? (
              <>
                <View style={[styles.eyeHappy, { borderColor: meta.coreColor }]} />
                <View style={[styles.eyeHappy, { borderColor: meta.coreColor }]} />
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.eyeDot,
                    meta.eyeStyle === 'spark' && styles.eyeSpark,
                    meta.eyeStyle === 'alert' && styles.eyeAlert,
                    { backgroundColor: meta.coreColor },
                  ]}
                />
                <View
                  style={[
                    styles.eyeDot,
                    meta.eyeStyle === 'spark' && styles.eyeSpark,
                    { backgroundColor: meta.coreColor },
                  ]}
                />
              </>
            )}
          </View>
          <View
            style={[
              styles.mouth,
              meta.eyeStyle === 'happy' && styles.mouthHappy,
              meta.eyeStyle === 'sleep' && styles.mouthSleep,
              { backgroundColor: meta.coreColor },
            ]}
          />
        </Animated.View>
      </View>

      <View style={styles.copy}>
        <View style={styles.badgeRow}>
          <View style={[styles.badgeDot, { backgroundColor: meta.coreColor }]} />
          <Text style={[styles.badgeText, { color: meta.coreColor }]}>{meta.badge}</Text>
        </View>
        <Text style={styles.caption}>
          {caption ?? meta.defaultCaption}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bannerCompact: {
    paddingVertical: 8,
    marginBottom: 10,
  },
  avatarStage: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerHalo: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
  },
  dendrite: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 2,
  },
  dendriteTopLeft: {
    top: 8,
    left: 3,
    transform: [{ rotate: '38deg' }],
  },
  dendriteTopRight: {
    top: 8,
    right: 3,
    transform: [{ rotate: '-38deg' }],
  },
  dendriteBottom: {
    bottom: 4,
    width: 10,
    transform: [{ rotate: '90deg' }],
  },
  vesicle: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  soma: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  innerGlow: {
    ...StyleSheet.absoluteFill,
    opacity: 0.45,
  },
  eyeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 1,
  },
  eyeDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 3,
  },
  eyeSpark: {
    width: 5.5,
    height: 5.5,
    borderRadius: 3,
  },
  eyeAlert: { width: 5, height: 7, borderRadius: 3 },
  eyeSleep: {
    width: 6,
    height: 2,
    borderRadius: 1,
  },
  eyeHappy: {
    width: 6,
    height: 4,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  mouth: {
    width: 6,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
    opacity: 0.85,
  },
  mouthHappy: {
    width: 8,
    height: 3,
    borderRadius: 2,
  },
  mouthSleep: {
    width: 4,
    height: 2,
    opacity: 0.5,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    flexShrink: 1,
  },
  caption: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
});
