import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type TodayHeroVisualModel = 'bottle' | 'stopwatch' | 'cycle';

export declare const NativeProgressVisual: ComponentType<{
  progress: number;
  model?: TodayHeroVisualModel;
  paused?: boolean;
  viewportHeight: number;
}>;

export declare const StaticChalkVisualFallback: ComponentType<{
  progress?: number;
  model?: TodayHeroVisualModel;
}>;

export declare const NativeLegoIcon: ComponentType<{
  colorIndex?: number;
  color?: string | number | readonly [number, number, number, number];
  size?: number;
  style?: StyleProp<ViewStyle>;
}>;

export declare const CHALK_BOTTLE_FALLBACK_TEXTURES: {
  readonly bottleEmpty: string;
  readonly bottleFull: string;
  readonly stopwatchBase: string;
};

export declare const LIQUID_GLASS_TEXTURES: {
  readonly glassRest: string;
  readonly glassCaustic: string;
  readonly horizonGlow: string;
};

export declare const LEGO_3D_GLB_RENDERS: readonly string[];

export declare function patchGlContextForThree<T>(gl: T): T;
export declare function getBottleMeniscusNormalizedY(percent: number): number;
export declare function preloadBrainBuffer(): Promise<ArrayBuffer>;
export declare function preloadLegoBuffer(): Promise<ArrayBuffer | null>;
