import { chalkTheme } from '@/src/theme/tokens';

/** Shared native-stack transition for detail screens and their return journey. */
export function detailTransition(reduceMotion: boolean) {
  return {
    animation: reduceMotion ? 'none' as const : 'slide_from_right' as const,
    animationTypeForReplace: 'pop' as const,
    animationDuration: reduceMotion ? 0 : 260,
    contentStyle: { backgroundColor: chalkTheme.hero },
  };
}
