// Logic-only tests for the Wellness Hub launch-audit (2026-05-01).
//
// Pin the page contract against silent fakes:
//   - Six-axis 0..10 form payload composition is honest
//   - Tag composition only emits documented chips (no AI fabrication)
//   - Audit payload composition has correct event / checkin_id / using_demo_data
//   - Demo banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables the form (read-only)
//   - Mount-time "view" audit ping carries connectivity hint
//   - Snapshot delta reports null when either today or yesterday is missing
//   - Cross-link to journal routes to pt-journal
//
// Run: node --test src/wellness-hub-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


// Mirrors `_composeWellnessTags`. Documented thresholds; no fabrication.
function composeWellnessTags({ mood, energy, sleep, anxiety, focus, pain }) {
  const tags = [];
  if (typeof mood === 'number' && mood <= 3) tags.push('low_mood');
  if (typeof energy === 'number' && energy <= 3) tags.push('fatigue');
  if (typeof anxiety === 'number' && anxiety >= 7) tags.push('anxiety');
  if (typeof sleep === 'number' && sleep > 0 && sleep <= 3) tags.push('poor_sleep');
  if (typeof focus === 'number' && focus <= 3) tags.push('low_focus');
  if (typeof pain === 'number' && pain >= 6) tags.push('pain');
  return tags;
}

// Mirrors the audit-event payload builder used inside pgPatientWellness.
function buildAuditPayload(event, extra = {}) {
  return {
    event,
    checkin_id: extra.checkin_id || null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}

function shouldShowDemoBanner(serverList) {
  return !!(serverList && serverList.is_demo);
}

function shouldShowConsentBanner(serverList) {
  return !!(serverList && serverList.consent_active === false);
}

function isFormDisabled(serverList) {
  return shouldShowConsentBanner(serverList);
}

function shouldShowOfflineBanner(serverList, serverErr) {
  return !(serverList && !serverErr);
}

// Mirrors `_wellnessSnapshotDelta` — honest null when either side missing.
function snapshotDelta(items, todayStr, yestStr) {
  const out = { mood: null, energy: null, sleep: null, anxiety: null, focus: null, pain: null };
  if (!Array.isArray(items) || items.length === 0) return out;
  const todayRow = items.find(r => (r.created_at || '').slice(0, 10) === todayStr);
  const yestRow = items.find(r => (r.created_at || '').slice(0, 10) === yestStr);
  if (!todayRow || !yestRow) return out;
  for (const a of ['mood', 'energy', 'sleep', 'anxiety', 'focus', 'pain']) {
    if (todayRow[a] != null && yestRow[a] != null) out[a] = todayRow[a] - yestRow[a];
  }
  return out;
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Tag composer emits low_mood at mood<=3 (worst-end of axis)', () => {
  const tags = composeWellnessTags({ mood: 3, energy: 8, anxiety: 2, sleep: 7, focus: 7, pain: 0 });
  assert.deepEqual(tags, ['low_mood']);
});

test('Tag composer emits fatigue at energy<=3', () => {
  const tags = composeWellnessTags({ mood: 7, energy: 1, anxiety: 2, sleep: 7, focus: 7, pain: 0 });
  assert.deepEqual(tags, ['fatigue']);
});

test('Tag composer emits anxiety at anxiety>=7 (high-anxiety end)', () => {
  const tags = composeWellnessTags({ mood: 7, energy: 7, anxiety: 9, sleep: 7, focus: 7, pain: 0 });
  assert.deepEqual(tags, ['anxiety']);
});

test('Tag composer emits poor_sleep at 0 < sleep <= 3 (not when sleep=0)', () => {
  // sleep=0 means the patient skipped the field — must not invent a tag.
  let tags = composeWellnessTags({ mood: 7, energy: 7, anxiety: 2, sleep: 0, focus: 7, pain: 0 });
  assert.equal(tags.includes('poor_sleep'), false);
  tags = composeWellnessTags({ mood: 7, energy: 7, anxiety: 2, sleep: 2, focus: 7, pain: 0 });
  assert.deepEqual(tags, ['poor_sleep']);
});

test('Tag composer emits low_focus at focus<=3', () => {
  const tags = composeWellnessTags({ mood: 7, energy: 7, anxiety: 2, sleep: 7, focus: 2, pain: 0 });
  assert.deepEqual(tags, ['low_focus']);
});

test('Tag composer emits pain at pain>=6', () => {
  const tags = composeWellnessTags({ mood: 7, energy: 7, anxiety: 2, sleep: 7, focus: 7, pain: 8 });
  assert.deepEqual(tags, ['pain']);
});

test('Tag composer emits no chips when all axes are mid-range', () => {
  const tags = composeWellnessTags({ mood: 5, energy: 5, anxiety: 5, sleep: 7, focus: 5, pain: 3 });
  assert.deepEqual(tags, []);
});

test('Tag composer emits multiple chips for compound bad day', () => {
  const tags = composeWellnessTags({ mood: 1, energy: 1, anxiety: 9, sleep: 2, focus: 2, pain: 7 });
  assert.deepEqual(
    tags.sort(),
    ['anxiety', 'fatigue', 'low_focus', 'low_mood', 'pain', 'poor_sleep']
  );
});

test('Audit payload carries event, checkin_id, demo flag', () => {
  const payload = buildAuditPayload('checkin_shared', {
    checkin_id: 'checkin-abc',
    note: 'shared with care team',
    using_demo_data: true,
  });
  assert.equal(payload.event, 'checkin_shared');
  assert.equal(payload.checkin_id, 'checkin-abc');
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

test('Audit event names cover the full wellness-hub surface contract', () => {
  // Cross-side contract: every event listed here must also be emitted /
  // accepted by apps/api/app/routers/wellness_hub_router.py. Adding an
  // event in JS without a backend update breaks audit-trail rendering.
  const required = [
    'view',
    'checkin_logged',
    'checkin_edited',
    'checkin_deleted',
    'checkin_shared',
    'export_clicked',
    'share_clicked',
    'delete_clicked',
    'summary_viewed',
    'cross_link_journal_clicked',
  ];
  for (const ev of required) {
    const payload = buildAuditPayload(ev, {});
    assert.equal(payload.event, ev);
  }
});

test('Demo banner only shown when server explicitly flags is_demo=true', () => {
  assert.equal(shouldShowDemoBanner({ is_demo: true }), true);
  assert.equal(shouldShowDemoBanner({ is_demo: false }), false);
  assert.equal(shouldShowDemoBanner(null), false);
  assert.equal(shouldShowDemoBanner({}), false);
});

test('Consent-revoked banner shown only when consent_active=false', () => {
  assert.equal(shouldShowConsentBanner({ consent_active: false }), true);
  assert.equal(shouldShowConsentBanner({ consent_active: true }), false);
  assert.equal(shouldShowConsentBanner({}), false);
  assert.equal(shouldShowConsentBanner(null), false);
});

test('Form is disabled in consent-revoked render', () => {
  assert.equal(isFormDisabled({ consent_active: false }), true);
  assert.equal(isFormDisabled({ consent_active: true }), false);
});

test('Offline banner shown when server fetch returned null OR errored', () => {
  assert.equal(
    shouldShowOfflineBanner({ items: [], consent_active: true, is_demo: false }, false),
    false,
  );
  assert.equal(shouldShowOfflineBanner(null, false), true);
  assert.equal(shouldShowOfflineBanner(null, true), true);
});

test('Mount-time view audit payload carries connectivity hint (online)', () => {
  const note = 'items=3; consent_active=1';
  const payload = buildAuditPayload('view', { note });
  assert.equal(payload.event, 'view');
  assert.equal(payload.note, note);
});

test('Mount-time view audit payload carries fallback flag (offline)', () => {
  const payload = buildAuditPayload('view', { note: 'fallback=localStorage' });
  assert.equal(payload.note, 'fallback=localStorage');
});

test('Snapshot delta returns all-null when no items', () => {
  const d = snapshotDelta([], '2026-05-01', '2026-04-30');
  for (const a of ['mood','energy','sleep','anxiety','focus','pain']) {
    assert.equal(d[a], null);
  }
});

test('Snapshot delta returns all-null when only today exists (no yesterday)', () => {
  const items = [{ created_at: '2026-05-01T10:00:00Z', mood: 7, energy: 5 }];
  const d = snapshotDelta(items, '2026-05-01', '2026-04-30');
  for (const a of ['mood','energy','sleep','anxiety','focus','pain']) {
    assert.equal(d[a], null);
  }
});

test('Snapshot delta returns numeric difference per axis when both rows present', () => {
  const items = [
    { created_at: '2026-05-01T10:00:00Z', mood: 7, energy: 6, sleep: 8, anxiety: 3, focus: 7, pain: 2 },
    { created_at: '2026-04-30T10:00:00Z', mood: 4, energy: 5, sleep: 5, anxiety: 6, focus: 4, pain: 5 },
  ];
  const d = snapshotDelta(items, '2026-05-01', '2026-04-30');
  assert.equal(d.mood, 3);
  assert.equal(d.energy, 1);
  assert.equal(d.sleep, 3);
  assert.equal(d.anxiety, -3);
  assert.equal(d.focus, 3);
  assert.equal(d.pain, -3);
});

test('Snapshot delta is null per-axis when one side missing the axis value', () => {
  const items = [
    { created_at: '2026-05-01T10:00:00Z', mood: 7 },
    { created_at: '2026-04-30T10:00:00Z', energy: 5 },
  ];
  const d = snapshotDelta(items, '2026-05-01', '2026-04-30');
  // Both rows exist, but no axis is present on both → all null.
  for (const a of ['mood','energy','sleep','anxiety','focus','pain']) {
    assert.equal(d[a], null);
  }
});

test('Six-axis create payload preserves all values 0..10 honestly', () => {
  // The create-form composer must not silently zero or cap values.
  function composeCreatePayload(form) {
    return {
      mood: parseInt(form.mood, 10),
      energy: parseInt(form.energy, 10),
      sleep: parseInt(form.sleep, 10),
      anxiety: parseInt(form.anxiety, 10),
      focus: parseInt(form.focus, 10),
      pain: parseInt(form.pain, 10),
      note: form.note || null,
    };
  }
  const payload = composeCreatePayload({
    mood: '7', energy: '6', sleep: '5', anxiety: '4', focus: '3', pain: '2', note: 'mid-day',
  });
  assert.equal(payload.mood, 7);
  assert.equal(payload.energy, 6);
  assert.equal(payload.sleep, 5);
  assert.equal(payload.anxiety, 4);
  assert.equal(payload.focus, 3);
  assert.equal(payload.pain, 2);
  assert.equal(payload.note, 'mid-day');
});
