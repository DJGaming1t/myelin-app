import type { TutorialId } from './guide-registry';

export type GuideOfferChoice = 'shown' | 'later';
export type GuideOfferRecord = { version: 1; choice: GuideOfferChoice; at: number };
export type GuideOfferState = {
  ownerKey: string | null;
  ready: boolean;
  choice: GuideOfferChoice | null;
  saving: boolean;
  saveFailed: boolean;
};
type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function guideOfferStorageKey(ownerKey: string, tutorialId: TutorialId) {
  return `@myelin/guide-offers/v1/${encodeURIComponent(ownerKey)}/${tutorialId}`;
}

export function normalizeGuideOffer(raw: unknown): GuideOfferRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || (value.choice !== 'shown' && value.choice !== 'later') ||
    typeof value.at !== 'number' || !Number.isFinite(value.at) || value.at <= 0) return null;
  return { version: 1, choice: value.choice, at: value.at };
}

export function createGuideOfferStorage(store: KeyValueStore) {
  return {
    async load(ownerKey: string, tutorialId: TutorialId) {
      const raw = await store.getItem(guideOfferStorageKey(ownerKey, tutorialId));
      if (!raw) return null;
      try { return normalizeGuideOffer(JSON.parse(raw)); } catch { return null; }
    },
    async save(ownerKey: string, tutorialId: TutorialId, record: GuideOfferRecord) {
      const valid = normalizeGuideOffer(record);
      if (!valid) throw new Error('Invalid guide offer choice.');
      await store.setItem(guideOfferStorageKey(ownerKey, tutorialId), JSON.stringify(valid));
    },
  };
}

export function emptyGuideOfferState(ownerKey: string | null = null): GuideOfferState {
  return { ownerKey, ready: false, choice: null, saving: false, saveFailed: false };
}

/** Isolated UI preference: never writes workspace, onboarding or study sessions. */
export function createGuideOfferController(storage: ReturnType<typeof createGuideOfferStorage>,
  tutorialId: TutorialId, onChange: (state: GuideOfferState) => void) {
  let state = emptyGuideOfferState();
  let epoch = 0;
  const publish = (next: GuideOfferState) => { state = next; onChange(next); };
  return {
    async activate(ownerKey: string | null) {
      const operation = ++epoch;
      publish(emptyGuideOfferState(ownerKey));
      if (!ownerKey) return;
      try {
        const stored = await storage.load(ownerKey, tutorialId);
        if (operation === epoch) publish({ ...state, ready: true, choice: stored?.choice ?? null });
      } catch {
        // A failed read must not interrupt Today or repeatedly ask a returning user.
      }
    },
    deactivate() { epoch += 1; },
    async choose(ownerKey: string | null, choice: GuideOfferChoice) {
      if (!ownerKey || ownerKey !== state.ownerKey || state.saving ||
        (state.choice === choice && !state.saveFailed)) return;
      const operation = ++epoch;
      publish({ ownerKey, ready: true, choice, saving: true, saveFailed: false });
      try {
        await storage.save(ownerKey, tutorialId, { version: 1, choice, at: Date.now() });
        if (operation === epoch) publish({ ...state, saving: false });
      } catch {
        if (operation === epoch) publish({ ...state, saving: false, saveFailed: true });
      }
    },
  };
}
