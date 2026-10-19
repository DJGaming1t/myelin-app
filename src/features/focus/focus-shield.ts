import AsyncStorage from '@react-native-async-storage/async-storage';

import { FocusKeyValueStore } from './focus-storage';

export const FOCUS_SHIELD_FORMAT = 'myelin.native.focus-shield' as const;
export const FOCUS_SHIELD_VERSION = 2 as const;
export const MAX_SHIELD_TARGETS = 80;
export const MAX_ALLOWLIST_APPS = 24;
export const MAX_ATTEMPT_LOG = 50;
export const DEFAULT_AWAY_THRESHOLD_SECONDS = 15;
export const DEFAULT_UNLOCK_DELAY_SECONDS = 10;
export const DEFAULT_RETRY_COOLDOWN_SECONDS = 30;
export const DEFAULT_BREAK_ALLOWANCES = 1;
export const DEFAULT_BREAK_PASS_MINUTES = 2;

export type FocusShieldMode = 'off' | 'gentle' | 'soft' | 'hard' | 'strict';
export type FocusShieldTargetKind = 'app' | 'website';
export type FocusShieldCategory = 'social' | 'gaming' | 'video' | 'messaging' | 'custom';
export type FocusShieldProfileId = 'school' | 'exam' | 'deep-work' | 'bedtime' | 'custom';

export type InstalledAndroidApp = {
  packageName: string;
  label: string;
  category: FocusShieldCategory;
  isSystemEmergency?: boolean;
  iconUri?: string;
};

export type FocusShieldTarget = {
  id: string;
  kind: FocusShieldTargetKind;
  category: FocusShieldCategory;
  label: string;
  identifier: string; // Real Android packageName for apps; normalized domain for websites
  enabled: boolean;
  wildcardSubdomains?: boolean;
  custom?: boolean;
};

export type FocusShieldAllowlistItem = {
  id: string;
  label: string;
  packageName: string;
  emergency?: boolean;
  enabled: boolean;
  custom?: boolean;
};

export type FocusShieldBypassVector =
  | 'blocked-app'
  | 'app-switch'
  | 'rapid-switch'
  | 'split-screen'
  | 'picture-in-picture'
  | 'permission-revoked'
  | 'early-exit';

export type FocusShieldAttemptOutcome = 'returned' | 'parked' | 'break-pass' | 'bypassed';

export type FocusShieldAttemptEntry = {
  sessionId?: string;
  id: string;
  timestamp: number;
  vector: FocusShieldBypassVector;
  packageName?: string;
  targetLabel?: string;
  parkedThought?: string;
  awaySeconds: number;
  outcome: FocusShieldAttemptOutcome;
};

export type FocusShieldConfig = {
  format: typeof FOCUS_SHIELD_FORMAT;
  version: typeof FOCUS_SHIELD_VERSION;
  mode: FocusShieldMode;
  profileId: FocusShieldProfileId;
  targets: FocusShieldTarget[];
  allowlist: FocusShieldAllowlistItem[];
  sessionOnly: boolean;
  awayThresholdSeconds: number;
  unlockDelaySeconds: number;
  retryCooldownSeconds: number;
  maxBreakAllowances: number;
  breakPassMinutes: number;
  requireReflection: boolean;
  reflectionPrompt: string;
  customMotivation: string;
  pinSalt: string;
  pinHash: string; // Salted SHA-256 hex digest; plaintext PIN is NEVER stored
  blockFloatingWindows: boolean;
  blockSplitScreen: boolean;
  updatedAt: number;
};

export type FocusShieldEnforcementLevel =
  | 'none'
  | 'os-settings-handoff'
  | 'native-usage-overlay';

export type FocusShieldCapabilities = {
  platform: string;
  supportedLevels: FocusShieldEnforcementLevel[];
  activeLevel: FocusShieldEnforcementLevel;
  nativeAppBlockingActive: boolean;
  websiteBlockingStatus: 'chunk-b-pending';
  requiresNativeRebuildForInterception: boolean;
  honestDisclosure: string;
};

export type FocusShieldAwayNotice = {
  awaySeconds: number;
  vector: FocusShieldBypassVector;
  rapidSwitchCount: number;
  label: string;
  summary: string;
  motivationalCue: string;
  reflectionQuestion: string | null;
  unlockDelaySeconds: number;
};

export type FocusShieldSessionSummary = {
  totalAttempts: number;
  nativeInterceptCount: number;
  deflectedCount: number;
  parkedCount: number;
  breakPassesUsed: number;
  bypassedCount: number;
  rapidSwitchCount: number;
  totalAwaySeconds: number;
  integrityPercent: number;
  headline: string;
  detail: string;
};

const ROOT = '@myelin/native/focus-shield';
const LOG_ROOT = '@myelin/native/focus-shield-log';

function key(ownerKey: string) {
  return `${ROOT}/${encodeURIComponent(ownerKey)}`;
}

function logKey(ownerKey: string) {
  return `${LOG_ROOT}/${encodeURIComponent(ownerKey)}`;
}

// Pure TypeScript SHA-256 implementation (matches java.security.MessageDigest("SHA-256") byte-for-byte)
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const codePoint = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

export function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  // Append 64-bit big-endian length
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  bytes.push(
    (highBits >>> 24) & 0xff,
    (highBits >>> 16) & 0xff,
    (highBits >>> 8) & 0xff,
    highBits & 0xff,
    (lowBits >>> 24) & 0xff,
    (lowBits >>> 16) & 0xff,
    (lowBits >>> 8) & 0xff,
    lowBits & 0xff,
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      w[i] =
        ((bytes[idx] << 24) |
          (bytes[idx + 1] << 16) |
          (bytes[idx + 2] << 8) |
          bytes[idx + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export const DEFAULT_REFLECTION_PROMPT =
  'Will leaving this block right now help you finish your current tiny step?';

export const DEFAULT_MOTIVATION_MESSAGE =
  'Protect this single block. Everything else can wait in Distraction Parking.';

export const FOCUS_SHIELD_PROFILES: ReadonlyArray<{
  id: FocusShieldProfileId;
  label: string;
  badge: string;
  description: string;
  mode: FocusShieldMode;
  categories: FocusShieldCategory[];
  unlockDelaySeconds: number;
  maxBreakAllowances: number;
  requireReflection: boolean;
}> = [
  {
    id: 'school',
    label: 'School',
    badge: 'BALANCED',
    description: 'Blocks Social, Gaming & Video apps while keeping Messaging and emergency tools open.',
    mode: 'gentle',
    categories: ['social', 'gaming', 'video'],
    unlockDelaySeconds: 5,
    maxBreakAllowances: 2,
    requireReflection: false,
  },
  {
    id: 'exam',
    label: 'Exam Prep',
    badge: 'LOCKED',
    description: 'Strict lock across Social, Gaming, Video & Messaging with 20s friction and 0 passes.',
    mode: 'strict',
    categories: ['social', 'gaming', 'video', 'messaging'],
    unlockDelaySeconds: 20,
    maxBreakAllowances: 0,
    requireReflection: true,
  },
  {
    id: 'deep-work',
    label: 'Deep Work',
    badge: 'FIRM',
    description: 'Firm friction with a 10s pause, reflection prompt, and 1 emergency break pass.',
    mode: 'hard',
    categories: ['social', 'gaming', 'video', 'messaging'],
    unlockDelaySeconds: 10,
    maxBreakAllowances: 1,
    requireReflection: true,
  },
  {
    id: 'bedtime',
    label: 'Bedtime',
    badge: 'WIND-DOWN',
    description: 'Protects late-night sleep windows from short-form video and social feeds.',
    mode: 'strict',
    categories: ['social', 'gaming', 'video'],
    unlockDelaySeconds: 15,
    maxBreakAllowances: 0,
    requireReflection: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    badge: 'TUNED',
    description: 'Your custom selection of installed Android apps, friction delay, and break rules.',
    mode: 'strict',
    categories: ['social', 'gaming', 'video'],
    unlockDelaySeconds: 10,
    maxBreakAllowances: 1,
    requireReflection: true,
  },
];

// All default app targets use real, verified Android package names (never fake custom:* or category:* strings)
export const DEFAULT_SHIELD_TARGETS: readonly FocusShieldTarget[] = [
  {
    id: 'app_youtube',
    kind: 'app',
    category: 'video',
    label: 'YouTube',
    identifier: 'com.google.android.youtube',
    enabled: true,
  },
  {
    id: 'app_instagram',
    kind: 'app',
    category: 'social',
    label: 'Instagram',
    identifier: 'com.instagram.android',
    enabled: true,
  },
  {
    id: 'app_tiktok',
    kind: 'app',
    category: 'video',
    label: 'TikTok',
    identifier: 'com.zhiliaoapp.musically',
    enabled: true,
  },
  {
    id: 'app_reddit',
    kind: 'app',
    category: 'social',
    label: 'Reddit',
    identifier: 'com.reddit.frontpage',
    enabled: true,
  },
  {
    id: 'app_x',
    kind: 'app',
    category: 'social',
    label: 'X (Twitter)',
    identifier: 'com.twitter.android',
    enabled: false,
  },
  {
    id: 'app_discord',
    kind: 'app',
    category: 'messaging',
    label: 'Discord',
    identifier: 'com.discord',
    enabled: false,
  },
  {
    id: 'app_whatsapp',
    kind: 'app',
    category: 'messaging',
    label: 'WhatsApp',
    identifier: 'com.whatsapp',
    enabled: false,
  },
  {
    id: 'app_minecraft',
    kind: 'app',
    category: 'gaming',
    label: 'Minecraft',
    identifier: 'com.mojang.minecraftpe',
    enabled: true,
  },
  {
    id: 'app_genshin',
    kind: 'app',
    category: 'gaming',
    label: 'Genshin Impact',
    identifier: 'com.miHoYo.GenshinImpact',
    enabled: true,
  },
  {
    id: 'app_hsr',
    kind: 'app',
    category: 'gaming',
    label: 'Honkai: Star Rail',
    identifier: 'com.HoYoverse.hkrpgoversea',
    enabled: true,
  },
  {
    id: 'app_zzz',
    kind: 'app',
    category: 'gaming',
    label: 'Zenless Zone Zero',
    identifier: 'com.HoYoverse.Nap',
    enabled: true,
  },
  {
    id: 'site_youtube',
    kind: 'website',
    category: 'video',
    label: 'youtube.com',
    identifier: 'youtube.com',
    wildcardSubdomains: true,
    enabled: true,
  },
  {
    id: 'site_reddit',
    kind: 'website',
    category: 'social',
    label: 'reddit.com',
    identifier: 'reddit.com',
    wildcardSubdomains: true,
    enabled: true,
  },
];

export const DEFAULT_EMERGENCY_ALLOWLIST: readonly FocusShieldAllowlistItem[] = [
  {
    id: 'allow_dialer',
    label: 'Phone & Emergency Calls',
    packageName: 'com.google.android.dialer',
    emergency: true,
    enabled: true,
  },
  {
    id: 'allow_sms',
    label: 'SMS Messages',
    packageName: 'com.google.android.apps.messaging',
    emergency: true,
    enabled: true,
  },
  {
    id: 'allow_clock',
    label: 'Clock & Alarms',
    packageName: 'com.google.android.deskclock',
    emergency: true,
    enabled: true,
  },
  {
    id: 'allow_calendar',
    label: 'Calendar',
    packageName: 'com.google.android.calendar',
    emergency: false,
    enabled: true,
  },
];

export function isValidAndroidPackageName(input: string): boolean {
  const clean = input.trim();
  if (!clean || clean.length > 160) return false;
  if (clean.startsWith('custom:') || clean.startsWith('category:')) return false;
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(clean);
}

export function normalizeWebsiteDomain(input: string): string | null {
  let clean = input.trim().toLowerCase();
  if (!clean || /\s/.test(clean)) return null;
  clean = clean.replace(/^[a-z]+:\/\//, '');
  clean = clean.split('/')[0]?.split('?')[0]?.split('#')[0] ?? '';
  if (/\s/.test(clean)) return null;
  clean = clean.replace(/^\*\./, '').replace(/^www\./, '').replace(/:\d+$/, '');
  if (!clean || clean.length > 120) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) return null;
  if (clean.startsWith('-') || clean.endsWith('-') || clean.includes('..')) return null;
  return clean;
}

export function defaultFocusShieldConfig(now = Date.now()): FocusShieldConfig {
  return {
    format: FOCUS_SHIELD_FORMAT,
    version: FOCUS_SHIELD_VERSION,
    mode: 'off',
    profileId: 'deep-work',
    targets: DEFAULT_SHIELD_TARGETS.map((item) => ({ ...item })),
    allowlist: DEFAULT_EMERGENCY_ALLOWLIST.map((item) => ({ ...item })),
    sessionOnly: true,
    awayThresholdSeconds: DEFAULT_AWAY_THRESHOLD_SECONDS,
    unlockDelaySeconds: DEFAULT_UNLOCK_DELAY_SECONDS,
    retryCooldownSeconds: DEFAULT_RETRY_COOLDOWN_SECONDS,
    maxBreakAllowances: DEFAULT_BREAK_ALLOWANCES,
    breakPassMinutes: DEFAULT_BREAK_PASS_MINUTES,
    requireReflection: true,
    reflectionPrompt: DEFAULT_REFLECTION_PROMPT,
    customMotivation: DEFAULT_MOTIVATION_MESSAGE,
    pinSalt: '',
    pinHash: '',
    blockFloatingWindows: true,
    blockSplitScreen: true,
    updatedAt: now,
  };
}

export function getFocusShieldCapabilities(
  platform: string,
  nativeAppBlockingReady = false,
): FocusShieldCapabilities {
  if (platform === 'android') {
    return {
      platform,
      supportedLevels: nativeAppBlockingReady
        ? ['none', 'os-settings-handoff', 'native-usage-overlay']
        : ['none', 'os-settings-handoff'],
      activeLevel: nativeAppBlockingReady ? 'native-usage-overlay' : 'os-settings-handoff',
      nativeAppBlockingActive: nativeAppBlockingReady,
      websiteBlockingStatus: 'chunk-b-pending',
      requiresNativeRebuildForInterception: !nativeAppBlockingReady,
      honestDisclosure: nativeAppBlockingReady
        ? 'Native Android app blocking is active via Usage Access + MYELIN Overlay. Website domain blocking requires the Chunk B local DNS VPN module.'
        : 'Grant Usage Access and Overlay permissions on Android to activate real app interception during Focus.',
    };
  }
  return {
    platform,
    supportedLevels: ['none', 'os-settings-handoff'],
    activeLevel: platform === 'ios' ? 'os-settings-handoff' : 'none',
    nativeAppBlockingActive: false,
    websiteBlockingStatus: 'chunk-b-pending',
    requiresNativeRebuildForInterception: true,
    honestDisclosure: 'Native Android app blocking requires an Android device with Usage Access granted.',
  };
}

export function matchesBlockedDomain(
  candidateHostOrUrl: string,
  config: FocusShieldConfig,
): FocusShieldTarget | null {
  if (config.mode === 'off') return null;
  const host = normalizeWebsiteDomain(candidateHostOrUrl);
  if (!host) return null;

  for (const target of config.targets) {
    if (target.kind !== 'website' || !target.enabled) continue;
    const rule = normalizeWebsiteDomain(target.identifier);
    if (!rule) continue;
    if (host === rule) return target;
    if (target.wildcardSubdomains !== false && host.endsWith(`.${rule}`)) {
      return target;
    }
  }
  return null;
}

export function isAppAllowlisted(
  packageName: string,
  config: FocusShieldConfig,
): boolean {
  const clean = packageName.trim().toLowerCase();
  if (!clean) return false;
  return config.allowlist.some(
    (item) => item.enabled && item.packageName.toLowerCase() === clean,
  );
}

function inferCategory(kind: FocusShieldTargetKind, identifier: string, label: string): FocusShieldCategory {
  const combined = `${identifier} ${label}`.toLowerCase();
  if (/youtube|tiktok|musically|twitch|netflix|video|shorts|stream/.test(combined)) return 'video';
  if (/instagram|reddit|x\.com|twitter|snapchat|threads|social/.test(combined)) return 'social';
  if (/discord|whatsapp|telegram|signal|messenger|chat/.test(combined)) return 'messaging';
  if (/game|minecraft|genshin|mihoyo|hoyoverse|hkrpg|nap|roblox|steam/.test(combined)) return 'gaming';
  return 'custom';
}

function validateTarget(raw: unknown): FocusShieldTarget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (item.kind !== 'app' && item.kind !== 'website') return null;
  if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 120) return null;
  if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) return null;
  if (
    typeof item.identifier !== 'string' ||
    !item.identifier.trim() ||
    item.identifier.length > 160
  ) {
    return null;
  }

  const cleanIdentifier = item.identifier.trim();
  if (item.kind === 'app' && !isValidAndroidPackageName(cleanIdentifier)) {
    return null;
  }
  if (item.kind === 'website' && !normalizeWebsiteDomain(cleanIdentifier)) {
    return null;
  }

  const category: FocusShieldCategory =
    item.category === 'social' ||
    item.category === 'gaming' ||
    item.category === 'video' ||
    item.category === 'messaging' ||
    item.category === 'custom'
      ? item.category
      : inferCategory(item.kind, cleanIdentifier, item.label);

  return {
    id: item.id.trim(),
    kind: item.kind,
    category,
    label: item.label.trim(),
    identifier: item.kind === 'website' ? normalizeWebsiteDomain(cleanIdentifier)! : cleanIdentifier,
    enabled: item.enabled === true,
    ...(item.kind === 'website'
      ? { wildcardSubdomains: item.wildcardSubdomains !== false }
      : {}),
    ...(item.custom === true ? { custom: true } : {}),
  };
}

export function validateFocusShieldConfig(raw: unknown, now = Date.now()): FocusShieldConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid focus shield config.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== FOCUS_SHIELD_FORMAT) {
    throw new Error('Unsupported focus shield format.');
  }
  const mode: FocusShieldMode =
    obj.mode === 'gentle' ||
    obj.mode === 'soft' ||
    obj.mode === 'hard' ||
    obj.mode === 'strict'
      ? obj.mode
      : 'off';

  const profileId: FocusShieldProfileId =
    obj.profileId === 'school' ||
    obj.profileId === 'exam' ||
    obj.profileId === 'deep-work' ||
    obj.profileId === 'bedtime' ||
    obj.profileId === 'custom'
      ? obj.profileId
      : 'deep-work';

  if (!Array.isArray(obj.targets) || obj.targets.length > MAX_SHIELD_TARGETS) {
    throw new Error('Invalid focus shield target list.');
  }

  const seenIds = new Set<string>();
  const targets: FocusShieldTarget[] = [];
  for (const candidate of obj.targets) {
    const valid = validateTarget(candidate);
    if (!valid || seenIds.has(valid.id)) continue;
    seenIds.add(valid.id);
    targets.push(valid);
  }

  const awayThresholdSeconds =
    typeof obj.awayThresholdSeconds === 'number' && Number.isFinite(obj.awayThresholdSeconds)
      ? Math.max(5, Math.min(300, Math.round(obj.awayThresholdSeconds)))
      : DEFAULT_AWAY_THRESHOLD_SECONDS;

  const unlockDelaySeconds =
    typeof obj.unlockDelaySeconds === 'number' && Number.isFinite(obj.unlockDelaySeconds)
      ? Math.max(0, Math.min(120, Math.round(obj.unlockDelaySeconds)))
      : DEFAULT_UNLOCK_DELAY_SECONDS;

  const retryCooldownSeconds =
    typeof obj.retryCooldownSeconds === 'number' && Number.isFinite(obj.retryCooldownSeconds)
      ? Math.max(5, Math.min(300, Math.round(obj.retryCooldownSeconds)))
      : DEFAULT_RETRY_COOLDOWN_SECONDS;

  const maxBreakAllowances =
    typeof obj.maxBreakAllowances === 'number' && Number.isFinite(obj.maxBreakAllowances)
      ? Math.max(0, Math.min(5, Math.round(obj.maxBreakAllowances)))
      : DEFAULT_BREAK_ALLOWANCES;

  const breakPassMinutes =
    typeof obj.breakPassMinutes === 'number' && Number.isFinite(obj.breakPassMinutes)
      ? Math.max(1, Math.min(10, Math.round(obj.breakPassMinutes)))
      : DEFAULT_BREAK_PASS_MINUTES;

  const reflectionPrompt =
    typeof obj.reflectionPrompt === 'string' && obj.reflectionPrompt.trim()
      ? obj.reflectionPrompt.trim().slice(0, 240)
      : DEFAULT_REFLECTION_PROMPT;

  const customMotivation =
    typeof obj.customMotivation === 'string' && obj.customMotivation.trim()
      ? obj.customMotivation.trim().slice(0, 240)
      : DEFAULT_MOTIVATION_MESSAGE;

  const pinSalt =
    typeof obj.pinSalt === 'string' && /^[a-z0-9_-]{4,40}$/i.test(obj.pinSalt)
      ? obj.pinSalt
      : '';
  const pinHash =
    typeof obj.pinHash === 'string' && /^[a-f0-9]{64}$/i.test(obj.pinHash)
      ? obj.pinHash.toLowerCase()
      : '';

  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) && obj.updatedAt > 0
      ? obj.updatedAt
      : now;

  return {
    format: FOCUS_SHIELD_FORMAT,
    version: FOCUS_SHIELD_VERSION,
    mode,
    profileId,
    targets: targets.length ? targets : DEFAULT_SHIELD_TARGETS.map((item) => ({ ...item })),
    allowlist: DEFAULT_EMERGENCY_ALLOWLIST.map((item) => ({ ...item })),
    sessionOnly: obj.sessionOnly !== false,
    awayThresholdSeconds,
    unlockDelaySeconds,
    retryCooldownSeconds,
    maxBreakAllowances,
    breakPassMinutes,
    requireReflection: obj.requireReflection !== false,
    reflectionPrompt,
    customMotivation,
    pinSalt: pinHash ? pinSalt : '',
    pinHash: pinSalt ? pinHash : '',
    blockFloatingWindows: obj.blockFloatingWindows !== false,
    blockSplitScreen: obj.blockSplitScreen !== false,
    updatedAt,
  };
}

export function canModifyShieldConfig(
  config: FocusShieldConfig,
  sessionRunning: boolean,
): { allowed: boolean; reason?: string } {
  if (sessionRunning && config.mode === 'strict') {
    return {
      allowed: false,
      reason:
        'Strict Mode locks Focus Shield settings while a Focus timer is actively running. Pause or finish the block to edit targets.',
    };
  }
  return { allowed: true };
}

export function setFocusShieldMode(
  config: FocusShieldConfig,
  mode: FocusShieldMode,
  now = Date.now(),
): FocusShieldConfig {
  return {
    ...config,
    mode,
    updatedAt: now,
  };
}

export function applyFocusShieldProfile(
  config: FocusShieldConfig,
  profileId: FocusShieldProfileId,
  now = Date.now(),
): FocusShieldConfig {
  const profile = FOCUS_SHIELD_PROFILES.find((item) => item.id === profileId);
  if (!profile) return config;
  const activeCategories = new Set(profile.categories);

  return {
    ...config,
    profileId,
    mode: profile.mode,
    unlockDelaySeconds: profile.unlockDelaySeconds,
    maxBreakAllowances: profile.maxBreakAllowances,
    requireReflection: profile.requireReflection,
    targets: config.targets.map((target) =>
      target.custom
        ? target
        : {
            ...target,
            enabled: activeCategories.has(target.category),
          },
    ),
    updatedAt: now,
  };
}

export function toggleShieldTarget(
  config: FocusShieldConfig,
  targetId: string,
  now = Date.now(),
): FocusShieldConfig {
  return {
    ...config,
    targets: config.targets.map((item) =>
      item.id === targetId ? { ...item, enabled: !item.enabled } : item,
    ),
    updatedAt: now,
  };
}

export function upsertInstalledAppTarget(
  config: FocusShieldConfig,
  app: { packageName: string; label: string; category?: FocusShieldCategory },
  now = Date.now(),
): { config: FocusShieldConfig; added: boolean; error?: string } {
  const pkg = app.packageName.trim();
  if (!isValidAndroidPackageName(pkg)) {
    return {
      config,
      added: false,
      error: 'Select an installed Android app or enter a valid package ID (e.g. com.discord).',
    };
  }
  if (isAppAllowlisted(pkg, config)) {
    return {
      config,
      added: false,
      error: 'That app is in the emergency allowlist and cannot be blocked.',
    };
  }

  const existing = config.targets.find(
    (item) => item.kind === 'app' && item.identifier.toLowerCase() === pkg.toLowerCase(),
  );
  if (existing) {
    return {
      config: toggleShieldTarget(config, existing.id, now),
      added: true,
    };
  }

  if (config.targets.length >= MAX_SHIELD_TARGETS) {
    return {
      config,
      added: false,
      error: `Keep the shield list under ${MAX_SHIELD_TARGETS} items.`,
    };
  }

  const label = app.label.trim().slice(0, 80) || pkg;
  const nextTarget: FocusShieldTarget = {
    id: `app_${pkg.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    kind: 'app',
    category: app.category ?? inferCategory('app', pkg, label),
    label,
    identifier: pkg,
    enabled: true,
    custom: true,
  };

  return {
    config: {
      ...config,
      targets: [...config.targets, nextTarget],
      updatedAt: now,
    },
    added: true,
  };
}

export function addCustomShieldTarget(
  config: FocusShieldConfig,
  kind: FocusShieldTargetKind,
  rawInput: string,
  now = Date.now(),
): { config: FocusShieldConfig; added: boolean; error?: string } {
  if (config.targets.length >= MAX_SHIELD_TARGETS) {
    return {
      config,
      added: false,
      error: `Keep the shield list under ${MAX_SHIELD_TARGETS} items.`,
    };
  }

  if (kind === 'website') {
    const domain = normalizeWebsiteDomain(rawInput);
    if (!domain) {
      return {
        config,
        added: false,
        error: 'Enter a valid domain such as youtube.com or reddit.com.',
      };
    }
    const existing = config.targets.find(
      (item) => item.kind === 'website' && item.identifier.toLowerCase() === domain,
    );
    if (existing) {
      return {
        config: existing.enabled ? config : toggleShieldTarget(config, existing.id, now),
        added: true,
      };
    }
    const nextTarget: FocusShieldTarget = {
      id: `site_custom_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'website',
      category: inferCategory('website', domain, domain),
      label: domain,
      identifier: domain,
      wildcardSubdomains: true,
      enabled: true,
      custom: true,
    };
    return {
      config: {
        ...config,
        targets: [...config.targets, nextTarget],
        updatedAt: now,
      },
      added: true,
    };
  }

  // For apps, require a real Android package name or match a known installed/default app label
  const clean = rawInput.trim();
  const matchedByLabel = config.targets.find(
    (item) => item.kind === 'app' && item.label.toLowerCase() === clean.toLowerCase(),
  );
  if (matchedByLabel) {
    return {
      config: matchedByLabel.enabled
        ? config
        : toggleShieldTarget(config, matchedByLabel.id, now),
      added: true,
    };
  }

  if (!isValidAndroidPackageName(clean)) {
    return {
      config,
      added: false,
      error:
        'Pick an app from Installed Apps above or enter a valid Android package ID (e.g. com.snapchat.android).',
    };
  }

  return upsertInstalledAppTarget(
    config,
    {
      packageName: clean,
      label: clean.split('.').pop() || clean,
    },
    now,
  );
}

export function removeCustomShieldTarget(
  config: FocusShieldConfig,
  targetId: string,
  now = Date.now(),
): FocusShieldConfig {
  return {
    ...config,
    targets: config.targets.filter((item) => !(item.id === targetId && item.custom)),
    updatedAt: now,
  };
}

export function setAccountabilityPin(
  config: FocusShieldConfig,
  rawPin: string,
  now = Date.now(),
): { config: FocusShieldConfig; ok: boolean; error?: string } {
  const clean = rawPin.trim();
  if (!clean) {
    return {
      config: {
        ...config,
        pinSalt: '',
        pinHash: '',
        updatedAt: now,
      },
      ok: true,
    };
  }
  if (!/^[0-9]{4,8}$/.test(clean)) {
    return {
      config,
      ok: false,
      error: 'Accountability PIN must be 4 to 8 digits.',
    };
  }
  const salt = `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const hash = sha256Hex(`${salt}:${clean}`);
  return {
    config: {
      ...config,
      pinSalt: salt,
      pinHash: hash,
      updatedAt: now,
    },
    ok: true,
  };
}

export function verifyAccountabilityChallenge(
  config: FocusShieldConfig,
  userInput: string,
): boolean {
  const clean = userInput.trim();
  if (config.pinHash && config.pinSalt) {
    return sha256Hex(`${config.pinSalt}:${clean}`) === config.pinHash.toLowerCase();
  }
  return clean.toLowerCase() === 'pause focus';
}

export function updateFocusShieldCustomization(
  config: FocusShieldConfig,
  patch: Partial<
    Pick<
      FocusShieldConfig,
      | 'unlockDelaySeconds'
      | 'retryCooldownSeconds'
      | 'maxBreakAllowances'
      | 'requireReflection'
      | 'reflectionPrompt'
      | 'customMotivation'
      | 'sessionOnly'
      | 'blockFloatingWindows'
      | 'blockSplitScreen'
    >
  >,
  now = Date.now(),
): FocusShieldConfig {
  return validateFocusShieldConfig(
    {
      ...config,
      ...patch,
      updatedAt: now,
    },
    now,
  );
}

export function activeShieldSummary(config: FocusShieldConfig) {
  const apps = config.targets.filter(
    (item) => item.kind === 'app' && item.enabled && isValidAndroidPackageName(item.identifier),
  );
  const websites = config.targets.filter((item) => item.kind === 'website' && item.enabled);
  const allowlisted = config.allowlist.filter((item) => item.enabled);
  return {
    enabled: config.mode !== 'off',
    mode: config.mode,
    profileId: config.profileId,
    apps,
    websites,
    allowlisted,
    total: apps.length + websites.length,
    hasPin: Boolean(config.pinHash && config.pinSalt),
    isStrict: config.mode === 'strict',
    isHardOrStrict: config.mode === 'hard' || config.mode === 'strict',
  };
}

export function evaluateFocusAwayReturn(input: {
  config: FocusShieldConfig;
  sessionRunning: boolean;
  phase: 'focus' | 'break';
  backgroundedAt: number | null;
  returnedAt: number;
  recentBackgroundTimestamps?: number[];
}): FocusShieldAwayNotice | null {
  const {
    config,
    sessionRunning,
    phase,
    backgroundedAt,
    returnedAt,
    recentBackgroundTimestamps = [],
  } = input;
  if (
    config.mode === 'off' ||
    !sessionRunning ||
    phase !== 'focus' ||
    backgroundedAt === null ||
    returnedAt <= backgroundedAt
  ) {
    return null;
  }

  const awaySeconds = Math.round((returnedAt - backgroundedAt) / 1000);
  const recentSwitches = recentBackgroundTimestamps.filter(
    (ts) => returnedAt - ts <= 90_000,
  ).length;
  const isRapidSwitch = recentSwitches >= 2 && awaySeconds >= 3;

  if (awaySeconds < config.awayThresholdSeconds && !isRapidSwitch) return null;

  const durationText =
    awaySeconds < 60
      ? `${awaySeconds}s`
      : `${Math.floor(awaySeconds / 60)}m ${awaySeconds % 60 ? `${awaySeconds % 60}s` : ''}`.trim();

  const summary = activeShieldSummary(config);
  const targetSample = summary.apps
    .slice(0, 2)
    .map((item) => item.label)
    .join(', ');

  return {
    awaySeconds,
    vector: isRapidSwitch ? 'rapid-switch' : 'app-switch',
    rapidSwitchCount: recentSwitches,
    label: isRapidSwitch
      ? `Rapid app-switching detected (${recentSwitches}x in 90s)`
      : `Stepped away for ${durationText}`,
    summary:
      config.mode === 'strict' || config.mode === 'hard'
        ? targetSample
          ? `Focus Shield is guarding ${targetSample}. Park what pulled you away and return to your step.`
          : 'If another app pulled you away, park the thought below and return to your step.'
        : 'Welcome back. Your timer kept running—park any lingering thought below if it helps.',
    motivationalCue: config.customMotivation || DEFAULT_MOTIVATION_MESSAGE,
    reflectionQuestion:
      (config.mode === 'hard' || config.mode === 'strict') && config.requireReflection
        ? config.reflectionPrompt
        : null,
    unlockDelaySeconds: config.unlockDelaySeconds,
  };
}

export function buildSessionTemptationReport(
  attempts: readonly FocusShieldAttemptEntry[],
  plannedFocusMinutes: number,
): FocusShieldSessionSummary {
  const totalAttempts = attempts.length;
  const nativeInterceptCount = attempts.filter((a) => a.vector === 'blocked-app').length;
  const deflectedCount = attempts.filter((a) => a.outcome === 'returned').length;
  const parkedCount = attempts.filter((a) => a.outcome === 'parked').length;
  const breakPassesUsed = attempts.filter((a) => a.outcome === 'break-pass').length;
  const bypassedCount = attempts.filter((a) => a.outcome === 'bypassed').length;
  const rapidSwitchCount = attempts.filter((a) => a.vector === 'rapid-switch').length;
  const totalAwaySeconds = attempts.reduce((acc, item) => acc + Math.max(0, item.awaySeconds), 0);

  const plannedSeconds = Math.max(60, plannedFocusMinutes * 60);
  const penaltySeconds = totalAwaySeconds + bypassedCount * 45;
  const integrityPercent = Math.max(
    0,
    Math.min(100, Math.round(((plannedSeconds - penaltySeconds) / plannedSeconds) * 100)),
  );

  let headline = '100% Clean Focus Block';
  if (totalAttempts > 0) {
    const recovered = deflectedCount + parkedCount;
    headline = `${integrityPercent}% Focus Integrity · ${recovered}/${totalAttempts} pulls recovered`;
  }

  const detail =
    totalAttempts === 0
      ? 'Zero blocked-app launches or unscheduled switches recorded during this block.'
      : `Intercepted ${nativeInterceptCount} blocked app launch${nativeInterceptCount === 1 ? '' : 'es'}, deflected ${deflectedCount}, parked ${parkedCount} thought${parkedCount === 1 ? '' : 's'}.`;

  return {
    totalAttempts,
    nativeInterceptCount,
    deflectedCount,
    parkedCount,
    breakPassesUsed,
    bypassedCount,
    rapidSwitchCount,
    totalAwaySeconds,
    integrityPercent,
    headline,
    detail,
  };
}

export function createFocusShieldStorage(store: FocusKeyValueStore) {
  const listeners = new Map<string, Set<(config: FocusShieldConfig) => void>>();
  let writes: Promise<unknown> = Promise.resolve();
  return {
    subscribe(ownerKey: string, listener: (config: FocusShieldConfig) => void) {
      const group = listeners.get(ownerKey) ?? new Set();
      group.add(listener); listeners.set(ownerKey, group);
      return () => { group.delete(listener); if (!group.size) listeners.delete(ownerKey); };
    },
    async load(ownerKey: string, now = Date.now()): Promise<FocusShieldConfig> {
      const raw = await store.getItem(key(ownerKey));
      if (!raw) return defaultFocusShieldConfig(now);
      try {
        return validateFocusShieldConfig(JSON.parse(raw), now);
      } catch {
        await store.removeItem(key(ownerKey));
        return defaultFocusShieldConfig(now);
      }
    },

    async save(ownerKey: string, config: FocusShieldConfig): Promise<FocusShieldConfig> {
      const valid = validateFocusShieldConfig(config);
      const write = writes.catch(() => undefined).then(async () => {
        await store.setItem(key(ownerKey), JSON.stringify(valid));
        listeners.get(ownerKey)?.forEach(listener => listener(valid));
      });
      writes = write;
      await write;
      return valid;
    },

    async clear(ownerKey: string) {
      await store.removeItem(key(ownerKey));
      await store.removeItem(logKey(ownerKey));
    },

    async loadAttempts(ownerKey: string): Promise<FocusShieldAttemptEntry[]> {
      const raw = await store.getItem(logKey(ownerKey));
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(-MAX_ATTEMPT_LOG);
      } catch {
        return [];
      }
    },

    async appendAttempt(
      ownerKey: string,
      entry: Omit<FocusShieldAttemptEntry, 'id'>,
    ): Promise<FocusShieldAttemptEntry[]> {
      const current = await this.loadAttempts(ownerKey);
      const nextEntry: FocusShieldAttemptEntry = {
        ...entry,
        id: `attempt_${entry.timestamp.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      };
      const updated = [...current, nextEntry].slice(-MAX_ATTEMPT_LOG);
      await store.setItem(logKey(ownerKey), JSON.stringify(updated));
      return updated;
    },
  };
}

export const focusShieldStorage = createFocusShieldStorage(AsyncStorage);
