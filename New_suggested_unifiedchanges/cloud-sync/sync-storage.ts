import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncPreference = {
  enabled: boolean;
  baselineFingerprint: string | null;
  lastSyncAt: number;
};

const ROOT = '@myelin/cloud-sync';

function key(uid: string) {
  return `${ROOT}/${encodeURIComponent(uid)}`;
}

function clean(raw: unknown): SyncPreference {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { enabled: false, baselineFingerprint: null, lastSyncAt: 0 };
  }
  const value = raw as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    baselineFingerprint:
      typeof value.baselineFingerprint === 'string' &&
      value.baselineFingerprint.length <= 120
        ? value.baselineFingerprint
        : null,
    lastSyncAt:
      typeof value.lastSyncAt === 'number' &&
      Number.isFinite(value.lastSyncAt) &&
      value.lastSyncAt > 0
        ? value.lastSyncAt
        : 0,
  };
}

export const syncPreferenceStorage = {
  async load(uid: string): Promise<SyncPreference> {
    const raw = await AsyncStorage.getItem(key(uid));
    if (!raw) return clean(null);
    try {
      return clean(JSON.parse(raw));
    } catch {
      return clean(null);
    }
  },

  async save(uid: string, preference: SyncPreference) {
    await AsyncStorage.setItem(key(uid), JSON.stringify(clean(preference)));
  },

  async clear(uid: string) {
    await AsyncStorage.removeItem(key(uid));
  },
};
