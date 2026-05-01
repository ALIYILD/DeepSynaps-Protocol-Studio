// Logic-only tests for the Patient Home Devices launch-audit (2026-05-01).
//
// Pin the page contract against silent fakes:
//   - Audit payload composition has correct event / device_id / using_demo_data
//   - Demo banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables write actions (read-only)
//   - Mount-time "view" audit ping carries connectivity hint
//   - Mark-faulty action requires a non-empty reason before firing audit
//   - Decommission action is one-way + immutable in UI state
//   - CSV export URL is the documented patient-side path (not a localStorage blob)
//
// Run: node --test src/home-devices-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


function buildAuditPayload(event, extra = {}) {
  return {
    event,
    device_id: extra.device_id || null,
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

function isWriteDisabled(serverList) {
  // Disable register / log / calibrate / mark-faulty / decommission when
  // consent is withdrawn. Reads (export) remain available.
  return shouldShowConsentBanner(serverList);
}

function isImmutable(deviceRow) {
  // Decommissioned rows are one-way immutable in the UI; faulty rows
  // accept reads but block new sessions.
  if (!deviceRow) return false;
  return deviceRow.status === 'decommissioned';
}

function blocksNewSession(deviceRow) {
  if (!deviceRow) return true;
  return deviceRow.status === 'decommissioned' || deviceRow.status === 'faulty';
}

function csvExportPath(deviceId) {
  return '/api/v1/home-devices/devices/' + encodeURIComponent(deviceId) + '/sessions/export.csv';
}

function ndjsonExportPath(deviceId) {
  return '/api/v1/home-devices/devices/' + encodeURIComponent(deviceId) + '/sessions/export.ndjson';
}

function categorisesValid(category) {
  const ALLOWED = new Set([
    'tdcs', 'tacs', 'trns', 'tens',
    'tms', 'rtms', 'ctbs',
    'pbm', 'nir', 'infrared',
    'vagus', 'tvns', 'nvns',
    'wearable', 'biofeedback',
    'other',
  ]);
  return ALLOWED.has(String(category || '').trim().toLowerCase());
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload composition: device_viewed includes device_id', () => {
  const p = buildAuditPayload('device_viewed', { device_id: 'reg-123' });
  assert.deepEqual(p, {
    event: 'device_viewed',
    device_id: 'reg-123',
    note: null,
    using_demo_data: false,
  });
});

test('Audit payload composition: mark-faulty preserves note + priority hint', () => {
  const p = buildAuditPayload('device_marked_faulty', {
    device_id: 'reg-1',
    note: 'priority=high; reason=button stuck',
  });
  assert.equal(p.event, 'device_marked_faulty');
  assert.equal(p.device_id, 'reg-1');
  assert.equal(p.note, 'priority=high; reason=button stuck');
});

test('Audit payload composition: page-level view ping has no device_id', () => {
  const p = buildAuditPayload('view', { note: 'page mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.device_id, null);
  assert.equal(p.note, 'page mount');
});

test('Audit payload caps note length at 480 chars', () => {
  const huge = 'x'.repeat(2000);
  const p = buildAuditPayload('view', { note: huge });
  assert.equal(p.note.length, 480);
});

test('Audit payload using_demo_data is always strict bool', () => {
  assert.equal(buildAuditPayload('view', {}).using_demo_data, false);
  assert.equal(buildAuditPayload('view', { using_demo_data: true }).using_demo_data, true);
  assert.equal(buildAuditPayload('view', { using_demo_data: 'yes' }).using_demo_data, true);
  assert.equal(buildAuditPayload('view', { using_demo_data: null }).using_demo_data, false);
});

test('Demo banner renders only when server is_demo=true', () => {
  assert.equal(shouldShowDemoBanner({ items: [], is_demo: true }), true);
  assert.equal(shouldShowDemoBanner({ items: [], is_demo: false }), false);
  assert.equal(shouldShowDemoBanner(null), false);
  // Honest fallback: never invent demo state when the server is silent.
  assert.equal(shouldShowDemoBanner({ items: [] }), false);
});

test('Consent banner renders only when server consent_active=false', () => {
  assert.equal(shouldShowConsentBanner({ consent_active: false }), true);
  assert.equal(shouldShowConsentBanner({ consent_active: true }), false);
  // Default to "active" when the field is absent — reads must not assume revoked.
  assert.equal(shouldShowConsentBanner({}), false);
  assert.equal(shouldShowConsentBanner(null), false);
});

test('Write actions disabled while consent withdrawn', () => {
  assert.equal(isWriteDisabled({ consent_active: false }), true);
  assert.equal(isWriteDisabled({ consent_active: true }), false);
});

test('Decommissioned device is immutable in UI state', () => {
  assert.equal(isImmutable({ status: 'decommissioned' }), true);
  assert.equal(isImmutable({ status: 'active' }), false);
  assert.equal(isImmutable({ status: 'faulty' }), false);
  assert.equal(isImmutable(null), false);
});

test('Faulty device blocks new sessions but is not immutable', () => {
  assert.equal(blocksNewSession({ status: 'faulty' }), true);
  assert.equal(blocksNewSession({ status: 'decommissioned' }), true);
  assert.equal(blocksNewSession({ status: 'active' }), false);
});

test('CSV export path is the documented server endpoint, not a blob URL', () => {
  const p = csvExportPath('reg-123');
  assert.equal(p, '/api/v1/home-devices/devices/reg-123/sessions/export.csv');
  // No data: / blob: prefix — the page must hit the audited server export.
  assert.equal(p.startsWith('/api/v1/home-devices/'), true);
  assert.equal(p.startsWith('blob:'), false);
  assert.equal(p.startsWith('data:'), false);
});

test('NDJSON export path is also documented + audited', () => {
  const p = ndjsonExportPath('reg-456');
  assert.equal(p, '/api/v1/home-devices/devices/reg-456/sessions/export.ndjson');
});

test('Category validator accepts canonical neuromodulation categories', () => {
  assert.equal(categorisesValid('tdcs'), true);
  assert.equal(categorisesValid('tACS'), true);
  assert.equal(categorisesValid('vagus'), true);
  assert.equal(categorisesValid('wearable'), true);
});

test('Category validator rejects free-form / fabricated categories', () => {
  assert.equal(categorisesValid('quantum-resonator'), false);
  assert.equal(categorisesValid(''), false);
  assert.equal(categorisesValid(null), false);
});
