import { Linking, NativeModules, Platform } from 'react-native';

import {
  FocusShieldAttemptEntry,
  FocusShieldCapabilities,
  FocusShieldConfig,
  FocusShieldScheduleWindow,
  InstalledAndroidApp,
  activeShieldSummary,
  getFocusShieldCapabilities,
} from './focus-shield';

export type NativePermissionState = {
  nativeModuleInstalled: boolean;
  usageStatsGranted: boolean;
  overlayGranted: boolean;
  batteryOptimizationIgnored: boolean;
  privateDnsActive?: boolean;
  vpnError?: string;
  vpnPrepared: boolean;
  vpnActive: boolean;
  otherVpnActive: boolean;
  scheduleActiveNow: boolean;
  activeScheduleLabel: string;
  isInMultiWindowMode: boolean;
  isInPictureInPictureMode: boolean;
};

export type NativeVpnPrepResult = {
  granted: boolean;
  vpnPrepared: boolean;
  otherVpnActive: boolean;
};

export type NativeSessionSyncPayload = {
  active: boolean;
  ownerKey: string | null;
  sessionId: string | null;
  phase: 'focus' | 'break' | 'idle';
  sessionEndEpochMs: number;
  topicName: string;
  tinyStep: string;
  mode: FocusShieldConfig['mode'];
  sessionOnly: boolean;
  schedules: FocusShieldScheduleWindow[];
  blockedPackages: string[];
  allowlistedPackages: string[];
  websiteBlockingEnabled: boolean;
  blockedDomains: string[];
  wildcardDomains: string[];
  blockDohCanary: boolean;
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
  prepareWebsiteVpn?: () => Promise<Partial<NativeVpnPrepResult>>;
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
      vpnPrepared: false,
      vpnActive: false,
      otherVpnActive: false,
      scheduleActiveNow: false,
      activeScheduleLabel: '',
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
      vpnPrepared: raw?.vpnPrepared === true,
      vpnActive: raw?.vpnActive === true,
      privateDnsActive: raw?.privateDnsActive === true,
      vpnError: typeof raw?.vpnError === 'string' ? raw.vpnError : '',
      otherVpnActive: raw?.otherVpnActive === true,
      scheduleActiveNow: raw?.scheduleActiveNow === true,
      activeScheduleLabel:
        typeof raw?.activeScheduleLabel === 'string' ? raw.activeScheduleLabel : '',
      isInMultiWindowMode: raw?.isInMultiWindowMode === true,
      isInPictureInPictureMode: raw?.isInPictureInPictureMode === true,
    };
  } catch {
    return {
      nativeModuleInstalled: true,
      usageStatsGranted: false,
      overlayGranted: false,
      batteryOptimizationIgnored: false,
      vpnPrepared: false,
      vpnActive: false,
      otherVpnActive: false,
      scheduleActiveNow: false,
      activeScheduleLabel: '',
      isInMultiWindowMode: false,
      isInPictureInPictureMode: false,
    };
  }
}

export async function requestWebsiteVpnAuthorization(): Promise<NativeVpnPrepResult> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.prepareWebsiteVpn) {
    return {
      granted: false,
      vpnPrepared: false,
      otherVpnActive: false,
    };
  }
  try {
    const res = await nativeMod.prepareWebsiteVpn();
    return {
      granted: res?.granted === true,
      vpnPrepared: res?.vpnPrepared === true,
      otherVpnActive: res?.otherVpnActive === true,
    };
  } catch {
    return {
      granted: false,
      vpnPrepared: false,
      otherVpnActive: false,
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
  ownerKey?: string | null;
  sessionId: string | null;
  sessionRunning: boolean;
  phase: 'focus' | 'break' | 'idle';
  remainingMs: number;
  topicName: string;
  tinyStep: string;
}): Promise<boolean> {
  const nativeMod = getNativeModule();
  if (!nativeMod?.syncSessionState) return false;

  const now = Date.now();
  const summary = activeShieldSummary(input.config, now);
  const payload: NativeSessionSyncPayload = {
    active: summary.enabled && input.config.focusBlockingEnabled && input.sessionRunning && input.phase === 'focus' && input.remainingMs > 0,
    sessionId: input.sessionId,
    ownerKey: input.ownerKey ?? null,
    phase: input.phase,
    sessionEndEpochMs: now + Math.max(0, input.remainingMs),
    topicName: input.topicName || 'Focus Session',
    tinyStep: input.tinyStep || '',
    mode: input.config.mode,
    sessionOnly: input.config.sessionOnly,
    schedules: input.config.schedules,
    blockedPackages: summary.apps.map((item) => item.identifier),
    allowlistedPackages: summary.allowlisted.map((item) => item.packageName),
    websiteBlockingEnabled: input.config.websiteBlockingEnabled,
    blockedDomains: summary.websites.map((item) => item.identifier),
    wildcardDomains: summary.websites
      .filter((item) => item.wildcardSubdomains !== false)
      .map((item) => item.identifier),
    blockDohCanary: input.config.blockDohCanary,
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
      ownerKey: typeof item.ownerKey === 'string' ? item.ownerKey : undefined,
      id: typeof item.id === 'string' ? item.id : `native_${Date.now()}`,
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      vector:
        item.vector === 'permission-revoked'
          ? 'permission-revoked'
          : item.vector === 'blocked-website'
            ? 'blocked-website'
            : 'blocked-app',
      packageName: typeof item.packageName === 'string' ? item.packageName : undefined,
      targetLabel: typeof item.targetLabel === 'string' ? item.targetLabel : undefined,
      parkedThought: typeof item.parkedThought === 'string' ? item.parkedThought : undefined,
      awaySeconds: typeof item.awaySeconds === 'number' ? item.awaySeconds : 5,
      outcome:
        item.outcome === 'blocked' ||
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
  | 'vpn'
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
          : kind === 'vpn' ? 'android.settings.VPN_SETTINGS'
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
  websiteBlockingEnabled = false,
): FocusShieldCapabilities {
  const appReady =
    permState.nativeModuleInstalled &&
    permState.usageStatsGranted &&
    permState.overlayGranted;
  return getFocusShieldCapabilities(Platform.OS, appReady, {
    websiteBlockingEnabled,
    vpnPrepared: permState.vpnPrepared,
    otherVpnActive: permState.otherVpnActive,
  });
}
