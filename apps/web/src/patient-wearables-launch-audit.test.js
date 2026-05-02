// Logic-only tests for the Patient Wearables launch-audit (2026-05-01).
//
// EIGHTH and final patient-facing surface in the chain after Symptom
// Journal (#344), Wellness Hub (#345), Patient Reports (#346), Patient
// Messages (#347), Home Devices (#348), Adherence Events (#350) and
// Home Program Tasks (#351).
//
// Pin the page contract against silent fakes:
//   - Audit payload composition has correct event / device_id / using_demo_data
//   - DEMO banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables write actions (read-only)
//   - Anomaly banner renders only when pending_anomalies > 0
//   - Sync-now CTA targets the launch-audit endpoint, not localStorage
//   - Disconnect requires a non-blank reason
//   - CSV / NDJSON export URLs are documented server endpoints, not blob URLs
//   - The pgPatientWearables block calls the launch-audit endpoints
//
// Run: node --test src/patient-wearables-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


function buildAuditPayload(event, extra = {}) {
  return {
    event,
    device_id: extra.device_id ? String(extra.device_id) : null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}

function shouldShowDemoBanner(serverDevicesResp) {
  return !!(serverDevicesResp && serverDevicesResp.is_demo);
}

function shouldShowConsentBanner(serverDevicesResp) {
  return !!(serverDevicesResp && serverDevicesResp.consent_active === false);
}

function isWriteDisabled(serverDevicesResp) {
  return shouldShowConsentBanner(serverDevicesResp);
}

function shouldShowAnomalyBanner(serverSummaryResp) {
  return !!(serverSummaryResp && (serverSummaryResp.pending_anomalies || 0) > 0);
}

function csvExportPath(deviceId) {
  if (!deviceId) return null;
  return '/api/v1/patient-wearables/devices/' + encodeURIComponent(String(deviceId)) + '/observations/export.csv';
}

function ndjsonExportPath(deviceId) {
  if (!deviceId) return null;
  return '/api/v1/patient-wearables/devices/' + encodeURIComponent(String(deviceId)) + '/observations/export.ndjson';
}

function disconnectReasonValid(reason) {
  if (reason == null) return false;
  return String(reason).trim().length > 0;
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no device_id', () => {
  const p = buildAuditPayload('view', { note: 'mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.device_id, null);
  assert.equal(p.note, 'mount');
});

test('Audit payload: device_viewed carries device_id', () => {
  const p = buildAuditPayload('device_viewed', { device_id: 'dev-fitbit-1' });
  assert.equal(p.event, 'device_viewed');
  assert.equal(p.device_id, 'dev-fitbit-1');
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
  assert.equal(shouldShowDemoBanner({ items: [] }), false);
});

test('Consent banner renders only when server consent_active=false', () => {
  assert.equal(shouldShowConsentBanner({ consent_active: false }), true);
  assert.equal(shouldShowConsentBanner({ consent_active: true }), false);
  // Default to "active" when the field is absent.
  assert.equal(shouldShowConsentBanner({}), false);
  assert.equal(shouldShowConsentBanner(null), false);
});

test('Write actions disabled while consent withdrawn', () => {
  assert.equal(isWriteDisabled({ consent_active: false }), true);
  assert.equal(isWriteDisabled({ consent_active: true }), false);
});

test('Anomaly banner renders only when pending_anomalies > 0', () => {
  assert.equal(shouldShowAnomalyBanner({ pending_anomalies: 0 }), false);
  assert.equal(shouldShowAnomalyBanner({ pending_anomalies: 1 }), true);
  assert.equal(shouldShowAnomalyBanner({ pending_anomalies: 5 }), true);
  assert.equal(shouldShowAnomalyBanner({}), false);
  assert.equal(shouldShowAnomalyBanner(null), false);
});

test('CSV export path is the documented server endpoint, not a blob URL', () => {
  const p = csvExportPath('dev-fitbit-1');
  assert.equal(p, '/api/v1/patient-wearables/devices/dev-fitbit-1/observations/export.csv');
  assert.equal(p.startsWith('/api/v1/patient-wearables/devices/'), true);
  assert.equal(p.startsWith('blob:'), false);
  assert.equal(p.startsWith('data:'), false);
  assert.equal(csvExportPath(null), null);
  // Special chars in device id must be url-encoded so the path is safe.
  assert.equal(
    csvExportPath('dev/fitbit 1'),
    '/api/v1/patient-wearables/devices/dev%2Ffitbit%201/observations/export.csv',
  );
});

test('NDJSON export path is also documented + audited', () => {
  const p = ndjsonExportPath('dev-fitbit-1');
  assert.equal(p, '/api/v1/patient-wearables/devices/dev-fitbit-1/observations/export.ndjson');
});

test('Disconnect reason must be non-blank', () => {
  assert.equal(disconnectReasonValid(null), false);
  assert.equal(disconnectReasonValid(''), false);
  assert.equal(disconnectReasonValid('   '), false);
  assert.equal(disconnectReasonValid('device misplaced'), true);
  // Whitespace-padded input is still valid once trimmed.
  assert.equal(disconnectReasonValid('  device misplaced  '), true);
});


// ── Page integration guards ─────────────────────────────────────────────────


function _readPage() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  return (fs.readFileSync(pagePath, 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'wearables.js'), 'utf8'));
}


test('pgPatientWearables calls the launch-audit endpoints (real data, not silent fakes)', () => {
  const src = _readPage();
  // Mount-time view ping calls the new audit endpoint.
  assert.equal(
    src.includes('postPatientWearablesAuditEvent'),
    true,
    'pgPatientWearables must call the new wearables audit endpoint',
  );
  // Devices / summary endpoints get fetched.
  assert.equal(
    src.includes('patientWearablesDevices'),
    true,
    'pgPatientWearables must fetch /patient-wearables/devices',
  );
  assert.equal(
    src.includes('patientWearablesSummary'),
    true,
    'pgPatientWearables must fetch /patient-wearables/devices/summary',
  );
});


test('pgPatientWearables wires _pdwSyncNow via the launch-audit sync endpoint', () => {
  const src = _readPage();
  assert.equal(
    src.includes('window._pdwSyncNow'),
    true,
    'pgPatientWearables must expose window._pdwSyncNow for the Sync-now CTA',
  );
  assert.equal(
    src.includes('patientWearablesSync'),
    true,
    'window._pdwSyncNow must call the patientWearablesSync API helper',
  );
});


test('pgPatientWearables wires _pdwExportObs via the launch-audit export endpoint', () => {
  const src = _readPage();
  assert.equal(
    src.includes('window._pdwExportObs'),
    true,
    'pgPatientWearables must expose window._pdwExportObs for the Export CSV CTA',
  );
  assert.equal(
    src.includes('/api/v1/patient-wearables/devices/'),
    true,
    'window._pdwExportObs must hit the documented server endpoint',
  );
});


test('Disconnect prompts for a reason and uses the launch-audit endpoint when available', () => {
  const src = _readPage();
  assert.equal(
    src.includes("Reason (required)"),
    true,
    'Disconnect flow must prompt the patient for a reason',
  );
  assert.equal(
    src.includes('patientWearablesDisconnect'),
    true,
    'Disconnect must call the launch-audit patientWearablesDisconnect helper when the audited row is known',
  );
});


test('DEMO banner copy explains exports prefix and non-regulator-submittable status', () => {
  const src = _readPage();
  // Use a robust substring that should survive minor copy edits.
  const hasDemoBanner =
    src.includes('Demo mode') && src.includes('DEMO-') && src.includes('regulator-submittable');
  assert.equal(
    hasDemoBanner,
    true,
    'Wearables DEMO banner must explain DEMO export prefix and non-regulator-submittable status',
  );
});


test('Consent-revoked banner copy explains read-only mode', () => {
  const src = _readPage();
  const hasConsentBanner =
    src.includes('Consent withdrawn') &&
    src.includes('read-only mode');
  assert.equal(
    hasConsentBanner,
    true,
    'Wearables consent-revoked banner must call out read-only mode',
  );
});


test('api.js exposes the new patient-wearables helpers', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const apiPath = path.resolve(here, 'api.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  for (const fn of [
    'patientWearablesDevices',
    'patientWearablesSummary',
    'patientWearablesGet',
    'patientWearablesObservations',
    'patientWearablesSync',
    'patientWearablesDisconnect',
    'postPatientWearablesAuditEvent',
  ]) {
    assert.equal(
      src.includes(fn + ':'),
      true,
      `api.js must export ${fn} for the patient wearables launch-audit surface`,
    );
  }
  // Endpoint paths under the new patient subprefix.
  assert.equal(
    src.includes('/api/v1/patient-wearables/devices'),
    true,
    'api.js must hit the patient-scope devices endpoint',
  );
  assert.equal(
    src.includes('/api/v1/patient-wearables/audit-events'),
    true,
    'api.js must hit the patient-scope audit-events endpoint',
  );
});
