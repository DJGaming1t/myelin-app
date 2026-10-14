/// <reference types="node" />
import assert from 'node:assert/strict';
import {
  createGuideOfferController, createGuideOfferStorage, emptyGuideOfferState,
  guideOfferStorageKey, normalizeGuideOffer, GuideOfferState,
} from '../src/features/guides/guide-offer-state';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

export async function verifyGuideOffers() {
  const data = new Map<string, string>();
  const kv = { getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); } };
  const storage = createGuideOfferStorage(kv);
  const record = { version: 1 as const, choice: 'later' as const, at: 123 };
  for (const raw of [null, [], {}, { ...record, version: 2 }, { ...record, choice: 'yes' },
    { ...record, at: 0 }, { ...record, at: NaN }, { ...record, at: Infinity }]) assert.equal(normalizeGuideOffer(raw), null);
  assert.deepEqual(normalizeGuideOffer(record), record);
  const owners = ['local:device', 'user:alice', 'user:bob', 'user:a/b', 'user:a%2Fb'];
  assert.equal(new Set(owners.map(owner => guideOfferStorageKey(owner, 'today'))).size, owners.length);
  data.set('workspace', 'unchanged'); data.set('onboarding', 'unchanged');
  for (const owner of owners) await storage.save(owner, 'today', record);
  assert.equal(await storage.load('user:new', 'today'), null);
  assert.equal(await storage.load('user:alice', 'focus'), null);
  for (const owner of owners) assert.deepEqual(await storage.load(owner, 'today'), record);
  data.set(guideOfferStorageKey('user:invalid', 'today'), '{bad json');
  assert.equal(await storage.load('user:invalid', 'today'), null);
  assert.equal(data.get('workspace'), 'unchanged'); assert.equal(data.get('onboarding'), 'unchanged');
  console.log('✓ Guide choices validate versions and stay isolated by encoded owner/tutorial, outside study/onboarding data');

  let todayState = emptyGuideOfferState(); let focusState = emptyGuideOfferState();
  const todayController = createGuideOfferController(storage, 'today', next => { todayState = next; });
  const focusController = createGuideOfferController(storage, 'focus', next => { focusState = next; });
  await Promise.all([todayController.activate('user:both'), focusController.activate('user:both')]);
  await Promise.all([todayController.choose('user:both', 'later'), focusController.choose('user:both', 'shown')]);
  assert.equal(todayState.choice, 'later'); assert.equal(focusState.choice, 'shown');
  assert.equal((await storage.load('user:both', 'today'))?.choice, 'later');
  assert.equal((await storage.load('user:both', 'focus'))?.choice, 'shown');
  let reviewState = emptyGuideOfferState();
  const reviewController = createGuideOfferController(storage, 'review', next => { reviewState = next; });
  await reviewController.activate('user:both'); assert.equal(reviewState.choice, null);
  await reviewController.choose('user:both', 'later');
  assert.equal((await storage.load('user:both', 'review'))?.choice, 'later');
  assert.equal((await storage.load('user:both', 'today'))?.choice, 'later');
  assert.equal((await storage.load('user:both', 'focus'))?.choice, 'shown');
  assert.equal(await storage.load('user:both', 'progress'), null);
  await focusController.activate('user:another'); assert.equal(focusState.choice, null);
  console.log('✓ Today/Focus/Review choices remain independent for the same owner');

  let state: GuideOfferState = emptyGuideOfferState();
  const emit = (next: GuideOfferState) => { state = next; };
  const oldLoad = deferred<string | null>();
  const delayedStorage = createGuideOfferStorage({ ...kv, getItem: key => key === guideOfferStorageKey('user:alice', 'today') ? oldLoad.promise : kv.getItem(key) });
  let controller = createGuideOfferController(delayedStorage, 'today', emit);
  const firstLoad = controller.activate('user:alice');
  await controller.activate('user:bob'); oldLoad.resolve(JSON.stringify({ ...record, choice: 'shown' })); await firstLoad;
  assert.equal(state.ownerKey, 'user:bob'); assert.equal(state.choice, 'later');
  await controller.choose('user:alice', 'shown'); assert.equal(state.ownerKey, 'user:bob');
  await controller.activate(null); assert.equal(state.ready, false); assert.equal(state.choice, null);
  console.log('✓ Late loads and stale actions cannot display or dismiss another owner’s offer');

  const pendingLoad = deferred<string | null>();
  controller = createGuideOfferController(createGuideOfferStorage({ ...kv, getItem: () => pendingLoad.promise }), 'today', emit);
  const load = controller.activate('user:fresh');
  await controller.choose('user:fresh', 'shown'); pendingLoad.resolve(null); await load;
  assert.equal(state.choice, 'shown'); assert.equal(state.ready, true); assert.equal(state.saveFailed, false);
  console.log('✓ Explicit tutorial selection wins over a delayed empty preference load');

  const pendingSave = deferred<void>(); let writes = 0;
  controller = createGuideOfferController(createGuideOfferStorage({ ...kv, setItem: async (key, value) => {
    writes += 1; await pendingSave.promise; data.set(key, value);
  } }), 'today', emit);
  await controller.activate('user:save-a');
  const save = controller.choose('user:save-a', 'later');
  assert.equal(state.choice, 'later'); assert.equal(state.saving, true);
  await controller.choose('user:save-a', 'later'); assert.equal(writes, 1);
  await controller.activate('user:save-b'); pendingSave.resolve(); await save;
  assert.equal(state.ownerKey, 'user:save-b'); assert.equal(state.choice, null); assert.equal(state.saving, false);
  assert.equal((await storage.load('user:save-a', 'today'))?.choice, 'later');
  console.log('✓ Dismissal is immediate/single-flight; an old save completes only for its original owner');

  let failSave = true;
  controller = createGuideOfferController(createGuideOfferStorage({ ...kv, setItem: async (key, value) => {
    if (failSave) throw new Error('Write unavailable'); data.set(key, value);
  } }), 'today', emit);
  await controller.activate('user:retry'); await controller.choose('user:retry', 'later');
  assert.equal(state.choice, 'later'); assert.equal(state.saveFailed, true); assert.equal(state.saving, false);
  failSave = false; await controller.choose('user:retry', 'later');
  assert.equal(state.saveFailed, false); assert.equal((await storage.load('user:retry', 'today'))?.choice, 'later');
  controller = createGuideOfferController(createGuideOfferStorage({ ...kv, getItem: async () => { throw new Error('Read unavailable'); } }), 'today', emit);
  await controller.activate('user:read-error'); assert.equal(state.ready, false);
  await controller.choose('user:read-error', 'shown'); assert.equal(state.choice, 'shown');
  console.log('✓ Read failure keeps the optional offer hidden; write failure stays dismissed and retries without blocking tutorials');

  const abandonedLoad = deferred<string | null>(); let updates = 0;
  controller = createGuideOfferController(createGuideOfferStorage({ ...kv, getItem: () => abandonedLoad.promise }), 'today', () => { updates += 1; });
  const abandoned = controller.activate('user:unmounted'); controller.deactivate();
  abandonedLoad.resolve(null); await abandoned; assert.equal(updates, 1);
  console.log('✓ Unmounted preference loads cannot update the former screen');
}
