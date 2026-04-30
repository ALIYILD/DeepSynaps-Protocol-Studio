// Onboarding completion-key migration shim.
//
// PR #4 of the frontend hygiene rollout collapses the two onboarding flows
// (legacy `pgOnboarding` 4-step + canonical `pgOnboardingWizard` 6-step)
// into a single wizard that writes `ds_onboarding_complete`. Older clients
// wrote `ds_onboarding_done` from the simple flow. This shim copies the
// legacy key forward and removes it so existing users are not re-prompted
// to onboard at the new router gate in app.js#bootApp.
//
// Contract (covered by `onboarding-key-migration.test.js`):
//   pre  : ds_onboarding_done = '1', ds_onboarding_complete absent
//   post : ds_onboarding_complete = 'true', ds_onboarding_done absent
//
// When `ds_onboarding_complete` is already set we still strip the legacy
// key to avoid accumulating stale storage across upgrades.
//
// Idempotent and safe to call on every boot. The `storage` parameter is
// dependency-injected so the unit test can pass a fake localStorage without
// monkey-patching globalThis.
export function migrateOnboardingCompletionKey(storage) {
  let target = storage || null;
  if (!target) {
    // Newer Node test runners expose a `localStorage` getter that throws
    // ("Cannot initialize local storage without a `--localstorage-file`
    // path") when accessed outside a real browser, so the typeof guard is
    // wrapped in a try/catch to keep this module safe to import in unit
    // tests that don't pass an explicit storage argument.
    try {
      if (typeof localStorage !== 'undefined' && localStorage) target = localStorage;
    } catch { target = null; }
  }
  if (!target) return;
  let legacy = null;
  try { legacy = target.getItem('ds_onboarding_done'); } catch { return; }
  if (legacy == null) return;
  try {
    const current = target.getItem('ds_onboarding_complete');
    if (current !== 'true') {
      // Treat any truthy value of the legacy key (including '1') as a
      // "completed" signal — the old simple-flow only ever wrote '1' on
      // finish, but be defensive about the few specs that wrote 'true'.
      if (legacy && legacy !== '0' && legacy !== 'false') {
        target.setItem('ds_onboarding_complete', 'true');
      }
    }
    target.removeItem('ds_onboarding_done');
  } catch {}
}
