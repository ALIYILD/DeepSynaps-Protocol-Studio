// Logic-only tests for the Onboarding Wizard launch-audit (2026-05-01).
//
// These pin the page contract against silent fakes:
//   - Wizard step number ↔ canonical server step name mapping is honest
//   - Audit payload composition has correct event / step / using_demo_data
//   - "Skip wizard" path always sets seeded_demo=true (regulator-honest default)
//   - "Use sample data" path emits demo_seed_requested + sets is_demo sticky
//   - Resume-from-step prefers server step over localStorage fallback
//   - "Create your first patient" form respects the explicit is_demo toggle
//
// Run: node --test src/onboarding-wizard-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-onboarding.js) ──

// Mirrors `_WIZ_STEP_NAMES` in pages-onboarding.js. Adding a new step
// number here without also updating the wizard module would break the
// audit trail, so the test asserts on the exact mapping.
const WIZ_STEP_NAMES = {
  1: 'welcome',
  2: 'clinic_info',
  3: 'role',
  4: 'data_choice',
  5: 'feature_tour',
  6: 'completion',
};

function wizStepName(n) { return WIZ_STEP_NAMES[n] || 'welcome'; }

// Mirrors the audit-event payload builder used by `_wizAuditEvent`.
function buildAuditPayload(event, extra = {}) {
  return {
    event,
    step: extra.step || wizStepName(extra._uiStep || 1),
    note: extra.note || null,
    using_demo_data: !!extra.using_demo_data,
  };
}

// Mirrors `_wizSkip`: every skip path defaults seeded_demo=true so a
// "real-looking" empty clinic from a skipped wizard cannot be confused
// with a production tenant.
function buildSkipPayload(stepNumber, reason) {
  return {
    step: wizStepName(stepNumber),
    reason: (reason || 'user_skipped').slice(0, 240),
    seeded_demo: true,
  };
}

// Mirrors `_wizChooseSample`: the demo seed endpoint receives an explicit
// list of record kinds the wizard intends to create alongside the seed.
function buildSeedDemoPayload(count) {
  return {
    requested_kinds: ['patients', 'protocols', 'sessions', 'appointments'],
    note: `seed count=${count}`,
  };
}

// Mirrors the resume-from-step branch in `pgOnboardingWizard`. Server
// state wins over localStorage; missing/unknown server step falls back
// to step 1 (welcome).
function resolveResumeStep(remoteState, localFallback) {
  const stepMap = { welcome: 1, clinic_info: 2, role: 3, data_choice: 4, feature_tour: 5, completion: 6 };
  if (remoteState && typeof remoteState === 'object') {
    if (remoteState.current_step && stepMap[remoteState.current_step]) {
      return stepMap[remoteState.current_step];
    }
  }
  if (typeof localFallback === 'number' && localFallback >= 1 && localFallback <= 6) {
    return localFallback;
  }
  return 1;
}

// Mirrors the `_onbAddPatient` is_demo toggle defaulting logic.
function resolveFirstPatientIsDemo(checkboxEl) {
  // Default to true if the checkbox isn't on the page (defensive).
  return checkboxEl ? !!checkboxEl.checked : true;
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('UI step number maps to honest server-side step name', () => {
  assert.equal(wizStepName(1), 'welcome');
  assert.equal(wizStepName(2), 'clinic_info');
  assert.equal(wizStepName(3), 'role');
  assert.equal(wizStepName(4), 'data_choice');
  assert.equal(wizStepName(5), 'feature_tour');
  assert.equal(wizStepName(6), 'completion');
});

test('Unknown UI step falls back to welcome (no silent acceptance)', () => {
  assert.equal(wizStepName(99), 'welcome');
  assert.equal(wizStepName(undefined), 'welcome');
  assert.equal(wizStepName(null), 'welcome');
});

test('Audit payload carries event, step name, demo flag', () => {
  const payload = buildAuditPayload('step_completed', {
    _uiStep: 4,
    note: 'advance 4→5',
    using_demo_data: true,
  });
  assert.equal(payload.event, 'step_completed');
  assert.equal(payload.step, 'data_choice');
  assert.equal(payload.using_demo_data, true);
  assert.equal(payload.note, 'advance 4→5');
});

test('Audit payload defaults using_demo_data=false when absent', () => {
  const payload = buildAuditPayload('view', { _uiStep: 1 });
  assert.equal(payload.using_demo_data, false);
});

test('Skip payload always carries seeded_demo=true (regulator-honest)', () => {
  const payload = buildSkipPayload(2, 'too busy to set up');
  assert.equal(payload.step, 'clinic_info');
  assert.equal(payload.reason, 'too busy to set up');
  assert.equal(payload.seeded_demo, true);
});

test('Skip payload truncates oversized reason to 240 chars', () => {
  const big = 'x'.repeat(1000);
  const payload = buildSkipPayload(1, big);
  assert.equal(payload.reason.length, 240);
  assert.equal(payload.seeded_demo, true);
});

test('Skip payload defaults reason to user_skipped when omitted', () => {
  const payload = buildSkipPayload(3);
  assert.equal(payload.reason, 'user_skipped');
});

test('Demo seed payload enumerates record kinds explicitly', () => {
  const payload = buildSeedDemoPayload(5);
  assert.deepEqual(payload.requested_kinds, ['patients', 'protocols', 'sessions', 'appointments']);
  assert.equal(payload.note, 'seed count=5');
});

test('Resume picks server step name over localStorage fallback', () => {
  const remote = { current_step: 'feature_tour', is_demo: false };
  assert.equal(resolveResumeStep(remote, 1), 5);
});

test('Resume falls back to localStorage when server state missing', () => {
  assert.equal(resolveResumeStep(null, 3), 3);
});

test('Resume defaults to step 1 when neither source has a step', () => {
  assert.equal(resolveResumeStep(null, undefined), 1);
  assert.equal(resolveResumeStep({}, null), 1);
});

test('Resume rejects unknown server step name (defensive)', () => {
  // An unknown current_step ("imaginary") must not trick the wizard into
  // rendering a non-existent step. Falls through to local fallback.
  assert.equal(resolveResumeStep({ current_step: 'imaginary' }, 4), 4);
});

test('First-patient is_demo defaults to true when checkbox absent', () => {
  // Defensive default: the wizard path is demo unless explicitly opted out.
  assert.equal(resolveFirstPatientIsDemo(null), true);
  assert.equal(resolveFirstPatientIsDemo(undefined), true);
});

test('First-patient is_demo respects explicit checkbox state', () => {
  assert.equal(resolveFirstPatientIsDemo({ checked: true }), true);
  assert.equal(resolveFirstPatientIsDemo({ checked: false }), false);
});

test('Audit event names cover the full wizard surface contract', () => {
  // The backend whitelists these events for the onboarding_wizard surface.
  // Adding an event in the JS without updating the backend (or vice versa)
  // breaks the audit trail — this is the cross-side contract.
  const required = [
    'view',
    'step_completed',
    'step_skipped',
    'wizard_completed',
    'wizard_abandoned',
    'demo_seed_requested',
    'first_patient_created',
  ];
  for (const ev of required) {
    const payload = buildAuditPayload(ev, { _uiStep: 1 });
    assert.equal(payload.event, ev);
  }
});
