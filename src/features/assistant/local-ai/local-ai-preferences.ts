import { LocalAiModelId } from './model-catalog';
import {
  LocalAiPreferenceStore,
  LocalAiPreferences,
} from './local-ai-manager';

export type LocalAiKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const KEY = '@myelin/local-ai/preferences';

export function defaultLocalAiPreferences(): LocalAiPreferences {
  return {
    selectedModelId: null,
    acceptedLicenseModelIds: [],
    autoUnload: true,
  };
}

function modelId(value: unknown): LocalAiModelId | null {
  if (value === 'functiongemma-270m' || value === 'qwen3.5-0.8b') return value;
  return null;
}

export function normalizeLocalAiPreferences(value: unknown): LocalAiPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultLocalAiPreferences();
  }

  const raw = value as Record<string, unknown>;
  const accepted = Array.isArray(raw.acceptedLicenseModelIds)
    ? raw.acceptedLicenseModelIds
        .map(modelId)
        .filter((item): item is LocalAiModelId => Boolean(item))
    : [];

  return {
    selectedModelId: modelId(raw.selectedModelId),
    acceptedLicenseModelIds: [...new Set(accepted)],
    autoUnload: raw.autoUnload !== false,
  };
}

export function createLocalAiPreferenceStore(
  store: LocalAiKeyValueStore,
): LocalAiPreferenceStore {
  return {
    async load() {
      const raw = await store.getItem(KEY);
      if (!raw) return defaultLocalAiPreferences();
      try {
        return normalizeLocalAiPreferences(JSON.parse(raw));
      } catch {
        await store.removeItem(KEY);
        return defaultLocalAiPreferences();
      }
    },

    async save(preferences) {
      const normalized = normalizeLocalAiPreferences(preferences);
      await store.setItem(KEY, JSON.stringify(normalized));
    },
  };
}
