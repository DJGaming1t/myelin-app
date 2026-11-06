import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  OnboardingRecord,
  normalizeOnboardingRecord,
} from './onboarding-engine';

const ROOT = '@myelin/onboarding';

export function onboardingStorageKey(ownerKey: string) {
  return `${ROOT}/${encodeURIComponent(ownerKey)}`;
}

export const onboardingStorage = {
  async load(ownerKey: string): Promise<OnboardingRecord | null> {
    const raw = await AsyncStorage.getItem(onboardingStorageKey(ownerKey));
    if (!raw) return null;

    try {
      return normalizeOnboardingRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  },

  async save(ownerKey: string, record: OnboardingRecord) {
    const normalized = normalizeOnboardingRecord(record);
    if (!normalized) throw new Error('Invalid onboarding state.');

    await AsyncStorage.setItem(
      onboardingStorageKey(ownerKey),
      JSON.stringify(normalized),
    );
  },

  async clear(ownerKey: string) {
    await AsyncStorage.removeItem(onboardingStorageKey(ownerKey));
  },
};
