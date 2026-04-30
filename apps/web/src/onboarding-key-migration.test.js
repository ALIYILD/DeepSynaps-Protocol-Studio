// Unit test for the onboarding-key migration shim introduced by PR #4 of
// the frontend hygiene rollout. Mirrors the node:test style used by the
// other unit tests in this folder and exercises the pure module without
// touching the global localStorage.

import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateOnboardingCompletionKey } from './onboarding-key-migration.js';

// Tiny in-memory localStorage stand-in. Matches the subset of the Web
// Storage API that the migration shim uses (getItem / setItem / removeItem)
// and exposes the underlying map for assertions.
function makeFakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(k)   { return store.has(k) ? store.get(k) : null; },
    setItem(k,v) { store.set(k, String(v)); },
    removeItem(k){ store.delete(k); },
    has(k)       { return store.has(k); },
    _dump()      { return Object.fromEntries(store); },
  };
}

test('migrates ds_onboarding_done → ds_onboarding_complete and removes legacy key', () => {
  const storage = makeFakeStorage({ ds_onboarding_done: '1' });

  migrateOnboardingCompletionKey(storage);

  assert.equal(storage.getItem('ds_onboarding_complete'), 'true',
    'new key should be set to "true"');
  assert.equal(storage.getItem('ds_onboarding_done'), null,
    'legacy key should be removed');
});

test('does nothing when no legacy key is present', () => {
  const storage = makeFakeStorage({});
  migrateOnboardingCompletionKey(storage);
  assert.deepEqual(storage._dump(), {},
    'storage should be untouched when the legacy key is absent');
});

test('does not overwrite an existing ds_onboarding_complete=true', () => {
  const storage = makeFakeStorage({
    ds_onboarding_done: '1',
    ds_onboarding_complete: 'true',
  });
  migrateOnboardingCompletionKey(storage);
  assert.equal(storage.getItem('ds_onboarding_complete'), 'true');
  assert.equal(storage.getItem('ds_onboarding_done'), null,
    'legacy key still removed even when new key was already set');
});

test('strips legacy "0"/"false" without setting the new key', () => {
  // The legacy flow only ever wrote '1', but be defensive — a literal '0'
  // or 'false' should NOT migrate to a "completed" state.
  const storage = makeFakeStorage({ ds_onboarding_done: '0' });
  migrateOnboardingCompletionKey(storage);
  assert.equal(storage.getItem('ds_onboarding_complete'), null,
    'falsy legacy values must not produce a completion flag');
  assert.equal(storage.getItem('ds_onboarding_done'), null,
    'legacy key removed regardless of value');
});

test('is idempotent — second call is a no-op', () => {
  const storage = makeFakeStorage({ ds_onboarding_done: '1' });
  migrateOnboardingCompletionKey(storage);
  const after1 = storage._dump();
  migrateOnboardingCompletionKey(storage);
  const after2 = storage._dump();
  assert.deepEqual(after1, after2, 'second invocation must not change storage');
});

test('handles a null/undefined storage argument by no-op (no throw)', () => {
  // The explicit-null branch must early-return rather than throwing. We
  // pass null directly so this test does not depend on whether some other
  // unit test in the same `node --test` invocation has installed a global
  // `localStorage` stub.
  assert.doesNotThrow(() => migrateOnboardingCompletionKey(null));
});
