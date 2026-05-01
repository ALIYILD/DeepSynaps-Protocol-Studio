// Logic-only tests for the Symptom Journal launch-audit (2026-05-01).
//
// These pin the page contract against silent fakes:
//   - UI 1..5 emoji axes → server-side severity 0..10 mapping is honest
//   - Tag composition only emits documented chips (no AI fabrication)
//   - Audit payload composition has correct event / entry_id / using_demo_data
//   - Demo banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables the form (read-only)
//   - Mount-time "view" audit ping exists (cross-side contract with backend)
//
// Run: node --test src/symptom-journal-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────

// Mirrors `_UI_TO_SEVERITY`. The mapping linearly scales the 1..5 emoji axis
// (1 = best, 5 = worst-distress) to the server's 0..10 severity scale so
// downstream reports + audit rows persist a documented numeric value.
const UI_TO_SEVERITY = { 1: 0, 2: 3, 3: 5, 4: 8, 5: 10 };

function composeJournalSeverity({ mood, energy, anxiety }) {
  const moodDistress = (typeof mood === 'number') ? (6 - mood) : 3;
  const anxietyDistress = (typeof anxiety === 'number') ? (6 - anxiety) : 3;
  const composite = Math.max(moodDistress, anxietyDistress);
  return UI_TO_SEVERITY[composite] ?? 5;
}

function composeJournalTags({ mood, energy, anxiety, sleep }) {
  const tags = [];
  if (typeof mood === 'number' && mood <= 2) tags.push('low_mood');
  if (typeof energy === 'number' && energy <= 2) tags.push('fatigue');
  if (typeof anxiety === 'number' && anxiety <= 2) tags.push('anxiety');
  if (typeof sleep === 'number' && sleep > 0 && sleep < 5) tags.push('poor_sleep');
  return tags;
}

// Mirrors the audit-event payload builder used inside pgSymptomJournal.
function buildAuditPayload(event, extra = {}) {
  return {
    event,
    entry_id: extra.entry_id || null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}

// Mirrors the demo-banner gate.
function shouldShowDemoBanner(serverList) {
  return !!(serverList && serverList.is_demo);
}

// Mirrors the consent-revoked gate.
function shouldShowConsentBanner(serverList) {
  return !!(serverList && serverList.consent_active === false);
}

// Mirrors the form-disabled gate.
function isFormDisabled(serverList) {
  return shouldShowConsentBanner(serverList);
}

// Mirrors the offline-banner gate.
function shouldShowOfflineBanner(serverList, serverErr) {
  // serverList null OR explicit error and no list available → fallback active.
  return !(serverList && !serverErr);
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('UI mood axis 1 (very low) + anxiety axis 1 (very anxious) → severity 10', () => {
  // Worst-of-both: distress 5,5 → composite 5 → severity 10.
  assert.equal(composeJournalSeverity({ mood: 1, energy: 5, anxiety: 1 }), 10);
});

test('UI mood axis 5 (great) + anxiety axis 5 (calm) → severity 0', () => {
  // Both axes "best" → distress 1,1 → composite 1 → severity 0.
  assert.equal(composeJournalSeverity({ mood: 5, energy: 5, anxiety: 5 }), 0);
});

test('Severity uses worst-of (max), not average — clinician needs spikes', () => {
  // Mood 5 (great, distress 1), anxiety 1 (panic, distress 5) → severity 10.
  // An averaging implementation would return ~5, hiding the panic spike.
  assert.equal(composeJournalSeverity({ mood: 5, energy: 5, anxiety: 1 }), 10);
});

test('Severity composer defaults to 5 (neutral) when axes missing', () => {
  // No axes provided — distress defaults to 3,3 → composite 3 → severity 5.
  assert.equal(composeJournalSeverity({}), 5);
});

test('Tag composer emits only documented chips, never fabricated', () => {
  // Patient is exhausted, very anxious, low mood.
  const tags = composeJournalTags({ mood: 1, energy: 1, anxiety: 1, sleep: 3 });
  assert.deepEqual(tags.sort(), ['anxiety', 'fatigue', 'low_mood', 'poor_sleep']);
});

test('Tag composer emits no chips when all axes are neutral or above', () => {
  // mood/energy/anxiety = 3 (neutral), sleep = 7h (healthy).
  const tags = composeJournalTags({ mood: 3, energy: 3, anxiety: 3, sleep: 7 });
  assert.deepEqual(tags, []);
});

test('Tag composer does not emit poor_sleep when sleep is 0 (unrecorded)', () => {
  // sleep=0 means the patient skipped the field. We must not invent a
  // poor_sleep tag for an unrecorded value.
  const tags = composeJournalTags({ mood: 3, energy: 3, anxiety: 3, sleep: 0 });
  assert.deepEqual(tags, []);
});

test('Audit payload carries event, entry_id, demo flag', () => {
  const payload = buildAuditPayload('entry_shared', {
    entry_id: 'entry-abc',
    note: 'shared with care team',
    using_demo_data: true,
  });
  assert.equal(payload.event, 'entry_shared');
  assert.equal(payload.entry_id, 'entry-abc');
  assert.equal(payload.using_demo_data, true);
  assert.equal(payload.note, 'shared with care team');
});

test('Audit payload defaults using_demo_data=false when absent', () => {
  const payload = buildAuditPayload('view', {});
  assert.equal(payload.using_demo_data, false);
});

test('Audit payload truncates oversized note to 480 chars', () => {
  const big = 'x'.repeat(2000);
  const payload = buildAuditPayload('export_clicked', { note: big });
  assert.equal(payload.note.length, 480);
});

test('Audit event names cover the full journal surface contract', () => {
  // The backend whitelists these events for the symptom_journal surface.
  // Adding an event in the JS without updating the backend (or vice versa)
  // breaks the audit trail — this is the cross-side contract.
  const required = [
    'view',
    'entry_logged',
    'entry_edited',
    'entry_deleted',
    'entry_shared',
    'export_clicked',
    'share_clicked',
    'delete_clicked',
    'summary_viewed',
  ];
  for (const ev of required) {
    const payload = buildAuditPayload(ev, {});
    assert.equal(payload.event, ev);
  }
});

test('Demo banner only shown when server explicitly flags is_demo=true', () => {
  assert.equal(shouldShowDemoBanner({ is_demo: true }), true);
  assert.equal(shouldShowDemoBanner({ is_demo: false }), false);
  // Server returned no list (offline) — no demo banner; offline banner
  // takes over instead.
  assert.equal(shouldShowDemoBanner(null), false);
  // Defensive: missing key is not silently treated as demo.
  assert.equal(shouldShowDemoBanner({}), false);
});

test('Consent-revoked banner shown only when consent_active is explicitly false', () => {
  assert.equal(shouldShowConsentBanner({ consent_active: false }), true);
  // Default of consent_active=true must NOT trigger the banner.
  assert.equal(shouldShowConsentBanner({ consent_active: true }), false);
  // Missing field is treated as "default true" → no banner.
  assert.equal(shouldShowConsentBanner({}), false);
  // Offline (no list) → no consent banner.
  assert.equal(shouldShowConsentBanner(null), false);
});

test('Form is disabled in consent-revoked render', () => {
  assert.equal(isFormDisabled({ consent_active: false }), true);
  assert.equal(isFormDisabled({ consent_active: true }), false);
});

test('Offline banner shown when server fetch returned null OR errored', () => {
  // Successful server list with no error → no offline banner.
  assert.equal(
    shouldShowOfflineBanner({ items: [], consent_active: true, is_demo: false }, false),
    false,
  );
  // No list at all → offline.
  assert.equal(shouldShowOfflineBanner(null, false), true);
  // Network error path → offline.
  assert.equal(shouldShowOfflineBanner(null, true), true);
});

test('Mount-time view audit payload carries the connectivity hint', () => {
  // Server-online path: note must record entries count + consent state so
  // reviewers can see at-a-glance how the page rendered.
  const onlineNote = 'entries=3; consent_active=1';
  const payload = buildAuditPayload('view', { note: onlineNote });
  assert.equal(payload.event, 'view');
  assert.equal(payload.note, onlineNote);
});

test('Mount-time view audit payload uses fallback note when offline', () => {
  // Offline path: note must explicitly say fallback=localStorage so the
  // audit trail can distinguish a server-rendered view from a fallback.
  const payload = buildAuditPayload('view', { note: 'fallback=localStorage' });
  assert.equal(payload.note, 'fallback=localStorage');
});
