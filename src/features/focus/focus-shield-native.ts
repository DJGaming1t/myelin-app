import { Linking, NativeModules, Platform } from 'react-native';

import {
  FocusShieldAttemptEntry,
  FocusShieldCapabilities,
  FocusShieldConfig,
  InstalledAndroidApp,
  activeShieldSummary,
  getFocusShieldCapabilities,
} from './focus-shield';

export type NativePermissionState = {
  nativeModuleInstalled: boolean;
  usageStatsGranted: boolean;
  overlayGranted: boolean;
  batteryOptimizationIgnored: boolean;
  isInMultiWindowMode: boolean;
  isInPictureInPictureMode: boolean;
};

export type NativeSessionSyncPayload = {
  active: boolean;
  sessionId: string | null;
  phase: 'focus' | 'break' | 'idle';
  sessionEndEpochMs: number;
  topicName: string;
  tinyStep: string;
  mode: FocusShieldConfig['mode'];
  blockedPackages: string[];
  allowlistedPackages: string[];
  unlockDelaySeconds: number;
  maxBreakAllowances: number;
  breakPassMinutes: number;
  customMotivation: string;
  reflectionPrompt: string;
  pinSalt: string;
  pinHash: string;
  blockFloatingWindows: boolean;
  blockSplitScreen: boolean;
};

type MyelinFocusShieldNativeModuleShape = {
  getPermissionStatus?: () => Promise<Partial<NativePermissionState>>;
  openPermissionSettings?: (kind: string) => Promise<boolean>;
  getInstalledApps?: () => Promise<InstalledAndroidApp[]>;
  syncSessionState?: (payloadJson: string) => Promise<boolean>;
  consumeInterceptEvents?: () => Promise<string>;
};

function getNativeModule(): MyelinFocusShieldNativeModuleShape | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = (NativeModules as Record<string, unknown> | undefined)?.MyelinFocusShield;
    if (mod && typeof mod === 'object') {
      return mod as MyelinFocusShieldNativeModuleShape;
    }
  } catch {
    // Fallback when native binary does not include MyelinFocusShield
  }
  return null;
}

export function isNativeFocusShieldAvailable(): boolean {
  return Boolean(getNativeModule()?.syncSessionState);
}

export async function probeFocusShieldNativeStatus(): Promise<NativePermissionState> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.getPermissionStatus) {
    return {
      nativeModuleInstalled: false,
      usageStatsGranted: false,
      overlayGranted: false,
      batteryOptimizationIgnored: false,
      isInMultiWindowMode: false,
      isInPictureInPictureMode: false,
    };
  }
  try {
    const raw = await nativeMod.getPermissionStatus();
    return {
      nativeModuleInstalled: true,
      usageStatsGranted: raw?.usageStatsGranted === true,
      overlayGranted: raw?.overlayGranted === true,
      batteryOptimizationIgnored: raw?.batteryOptimizationIgnored === true,
      isInMultiWindowMode: raw?.isInMultiWindowMode === true,
      isInPictureInPictureMode: raw?.isInPictureInPictureMode === true,
    };
  } catch {
    return {
      nativeModuleInstalled: true,
      usageStatsGranted: false,
      overlayGranted: false,
      batteryOptimizationIgnored: false,
      isInMultiWindowMode: false,
      isInPictureInPictureMode: false,
    };
  }
}

export async function fetchInstalledAndroidApps(): Promise<InstalledAndroidApp[]> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.getInstalledApps) return [];
  try {
    const list = await nativeMod.getInstalledApps();
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item) =>
        item &&
        typeof item.packageName === 'string' &&
        item.packageName.includes('.') &&
        typeof item.label === 'string',
    );
  } catch {
    return [];
  }
}

export async function syncFocusShieldNativeSession(input: {
  config: FocusShieldConfig;
  sessionId: string | null;
  sessionRunning: boolean;
  phase: 'focus' | 'break' | 'idle';
  remainingMs: number;
  topicName: string;
  tinyStep: string;
}): Promise<boolean> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.syncSessionState) return false;

  const summary = activeShieldSummary(input.config);
  const now = Date.now();
  const payload: NativeSessionSyncPayload = {
    active: summary.enabled && summary.apps.length > 0 && input.sessionRunning && input.phase === 'focus' && input.remainingMs > 0,
    sessionId: input.sessionId,
    phase: input.phase,
    sessionEndEpochMs: now + Math.max(0, input.remainingMs),
    topicName: input.topicName || 'Focus Session',
    tinyStep: input.tinyStep || '',
    mode: input.config.mode,
    blockedPackages: summary.apps.map((item) => item.identifier),
    allowlistedPackages: summary.allowlisted.map((item) => item.packageName),
    unlockDelaySeconds: input.config.unlockDelaySeconds,
    maxBreakAllowances: input.config.maxBreakAllowances,
    breakPassMinutes: input.config.breakPassMinutes,
    customMotivation: input.config.customMotivation,
    reflectionPrompt: input.config.reflectionPrompt,
    pinSalt: input.config.pinSalt,
    pinHash: input.config.pinHash,
    blockFloatingWindows: input.config.blockFloatingWindows,
    blockSplitScreen: input.config.blockSplitScreen,
  };

  try {
    return await nativeMod.syncSessionState(JSON.stringify(payload));
  } catch {
    return false;
  }
}

export async function drainNativeInterceptEvents(): Promise<FocusShieldAttemptEntry[]> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.consumeInterceptEvents) return [];
  try {
    const rawJson = await nativeMod.consumeInterceptEvents();
    if (!rawJson) return [];
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      sessionId: typeof item.sessionId === 'string' ? item.sessionId : undefined,
      id: typeof item.id === 'string' ? item.id : `native_${Date.now()}`,
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      vector: item.vector === 'permission-revoked' ? 'permission-revoked' : 'blocked-app',
      packageName: typeof item.packageName === 'string' ? item.packageName : undefined,
      targetLabel: typeof item.targetLabel === 'string' ? item.targetLabel : undefined,
      parkedThought: typeof item.parkedThought === 'string' ? item.parkedThought : undefined,
      awaySeconds: typeof item.awaySeconds === 'number' ? item.awaySeconds : 5,
      outcome:
        item.outcome === 'parked' ||
        item.outcome === 'break-pass' ||
        item.outcome === 'bypassed'
          ? item.outcome
          : 'returned',
    }));
  } catch {
    return [];
  }
}

export type FocusShieldPermissionKind =
  | 'usage-access'
  | 'overlay'
  | 'battery'
  | 'digital-wellbeing';

export async function openFocusShieldPermissionSettings(
  kind: FocusShieldPermissionKind,
): Promise<boolean> {
  const nativeMod = getNativeModule();
  if (nativeMod?.openPermissionSettings) {
    try {
      const ok = await nativeMod.openPermissionSettings(kind);
      if (ok) return true;
    } catch {
      // Fall back to Linking intents
    }
  }

  if (Platform.OS === 'android') {
    const action =
      kind === 'usage-access'
        ? 'android.settings.USAGE_ACCESS_SETTINGS'
        : kind === 'overlay'
          ? 'android.settings.action.MANAGE_OVERLAY_PERMISSION'
          : kind === 'battery'
            ? 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
            : 'android.settings.ZEN_MODE_SETTINGS';
    try {
      await Linking.sendIntent(action);
      return true;
    } catch {
      try { await Linking.sendIntent('android.settings.SETTINGS'); return true; } catch { return false; }
    }
  } else if (Platform.OS === 'ios') {
    try { await Linking.openSettings(); return true; } catch { return false; }
  } else {
    try { await Linking.openURL('https://support.google.com/android/answer/9346420'); return true; } catch { return false; }
  }
}

export function resolveFocusShieldCapabilities(
  permState: NativePermissionState,
): FocusShieldCapabilities {
  const ready =
    permState.nativeModuleInstalled &&
    permState.usageStatsGranted &&
    permState.overlayGranted;
  return getFocusShieldCapabilities(Platform.OS, ready);
}
