import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ReminderSettings,
  defaultReminderSettings,
  normalizeReminderSettings,
} from './reminder-engine';

export type ReminderDeviceState = {
  settings: ReminderSettings;
  scheduledIds: string[];
  planSignature: string;
};

const ROOT = '@myelin/reminders';
const LEGACY_OWNERLESS_CLEANUP_KEY =
  `${ROOT}/migration/ownerless-v1`;

function key(ownerKey: string) {
  return `${ROOT}/${encodeURIComponent(ownerKey)}`;
}

function normalizeState(value: unknown): ReminderDeviceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      settings: defaultReminderSettings(),
      scheduledIds: [],
      planSignature: '',
    };
  }

  const raw = value as Record<string, unknown>;
  const scheduledIds = Array.isArray(raw.scheduledIds)
    ? raw.scheduledIds
        .filter((item): item is string => typeof item === 'string')
        .filter((item) => item.length > 0 && item.length < 300)
        .slice(0, 80)
    : [];

  return {
    settings: normalizeReminderSettings(
      raw.settings && typeof raw.settings === 'object'
        ? (raw.settings as Partial<ReminderSettings>)
        : null,
    ),
    scheduledIds,
    planSignature:
      typeof raw.planSignature === 'string' && raw.planSignature.length < 50_000
        ? raw.planSignature
        : '',
  };
}

export const reminderMigrationStorage = {
  async legacyOwnerlessCleanupCompleted() {
    return (
      (await AsyncStorage.getItem(
        LEGACY_OWNERLESS_CLEANUP_KEY,
      )) === '1'
    );
  },

  async markLegacyOwnerlessCleanupCompleted() {
    await AsyncStorage.setItem(
      LEGACY_OWNERLESS_CLEANUP_KEY,
      '1',
    );
  },
};

export const reminderStorage = {
  async load(ownerKey: string): Promise<ReminderDeviceState> {
    const raw = await AsyncStorage.getItem(key(ownerKey));
    if (!raw) return normalizeState(null);

    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      return normalizeState(null);
    }
  },

  async save(ownerKey: string, state: ReminderDeviceState) {
    await AsyncStorage.setItem(
      key(ownerKey),
      JSON.stringify(normalizeState(state)),
    );
  },

  async clear(ownerKey: string) {
    await AsyncStorage.removeItem(key(ownerKey));
  },
};
