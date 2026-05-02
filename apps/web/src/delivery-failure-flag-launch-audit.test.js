// Logic-only tests for the Patient Delivery-Failure Flag launch-audit
// (2026-05-01).
//
// Closes the regulator gap on the SendGrid Adapter PR (#381). Today the
// audit transcript shows whether the digest dispatch succeeded or
// failed; this PR adds a patient-side aggregator of the failed
// dispatches + a "Report problem" CTA that emits a
// patient_digest.caregiver_delivery_concern audit row plus a clinician
// mirror row that surfaces in the inbox under HIGH priority.
//
// Pin the front-end against silent fakes:
//   - api.js exposes the new patientDigestCaregiverDeliveryFailures /
//     patientDigestCaregiverDeliveryConcern / careTeamCoverageDeliveryConcerns
//     helpers, all routed under /api/v1/*
//   - pgPatientDigest reads /caregiver-delivery-failures via the helper
//   - The "Caregiver delivery problems" subsection is gated on
//     failures.length > 0 (no honest empty banner — silent gap is fine
//     because no failures means no concern path needed)
//   - The "Report problem" CTA opens a modal with a required note
//   - The submit handler refuses empty / whitespace-only notes
//   - DEMO banner reuses summary.is_demo (already covered in #376) —
//     the new section never re-renders a parallel banner
//   - pgCareTeamCoverage registers a "Patient delivery concerns" tab
//     and renders the rows from the new endpoint
//   - No PHI of caregiver beyond first name leaks into the rendered
//     HTML (assert against substring patterns)
//
// Run: node --test src/delivery-failure-flag-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function readSrc(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}


// ── 1. api.js helpers exist + route correctly ──────────────────────────────


test('api.js exposes the new delivery-failure-flag helpers', () => {
  const apiSrc = readSrc('api.js');
  for (const name of [
    'patientDigestCaregiverDeliveryFailures',
    'patientDigestCaregiverDeliveryConcern',
    'careTeamCoverageDeliveryConcerns',
  ]) {
    assert.ok(apiSrc.includes(name), `api.js must export ${name}`);
  }
});


test('patientDigestCaregiverDeliveryFailures routes under /api/v1/patient-digest/', () => {
  const apiSrc = readSrc('api.js');
  assert.ok(
    apiSrc.includes('/api/v1/patient-digest/caregiver-delivery-failures'),
    'failures helper must route under /api/v1/patient-digest/',
  );
});


test('patientDigestCaregiverDeliveryConcern POSTs to the concerns endpoint', () => {
  const apiSrc = readSrc('api.js');
  assert.ok(
    apiSrc.includes('/api/v1/patient-digest/caregiver-delivery-concerns'),
    'concern helper must POST to /api/v1/patient-digest/caregiver-delivery-concerns',
  );
  // Belt + braces: the helper should declare method: POST.
  const idx = apiSrc.indexOf('patientDigestCaregiverDeliveryConcern');
  assert.notEqual(idx, -1);
  const slice = apiSrc.slice(idx, idx + 400);
  assert.ok(slice.includes('POST'), 'concern helper must use POST');
});


test('careTeamCoverageDeliveryConcerns routes under /api/v1/care-team-coverage/', () => {
  const apiSrc = readSrc('api.js');
  assert.ok(
    apiSrc.includes('/api/v1/care-team-coverage/delivery-concerns'),
    'coverage concerns helper must route under /api/v1/care-team-coverage/',
  );
});


// ── 2. pgPatientDigest wires the failures section ──────────────────────────


test('pgPatientDigest fetches caregiver delivery failures alongside summary', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('patientDigestCaregiverDeliveryFailures'),
    'pgPatientDigest must call patientDigestCaregiverDeliveryFailures',
  );
});


test('pgPatientDigest renders Caregiver delivery problems subsection only when failures exist', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('Caregiver delivery problems'),
    'page must include the failures subsection title',
  );
  // The conditional guard — section is gated on failureRows.length > 0.
  assert.ok(
    src.includes('failureRows.length === 0')
      && src.includes("? ''"),
    'failures section must be gated on failureRows.length > 0 (empty branch returns empty string)',
  );
});


test('pgPatientDigest exposes a "Report problem" CTA for each failure row', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('Report problem'),
    'each failure row must expose a Report problem CTA',
  );
  assert.ok(
    src.includes('window._pdOpenConcernModal'),
    'CTA must wire into the concern modal',
  );
});


test('Concern modal exposes a required note textarea + submit', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('id="pd-concern-text"'),
    'modal must include a textarea with id pd-concern-text',
  );
  assert.ok(
    src.includes('window._pdSubmitConcern'),
    'modal must wire a submit handler',
  );
  assert.ok(
    src.includes('Please describe the problem before submitting'),
    'submit handler must reject empty notes with a user-visible message',
  );
});


// ── 3. Audit ping wiring ────────────────────────────────────────────────────


test('Concern modal initiator emits a patient_digest audit ping', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // The handler must call postPatientDigestAuditEvent with a
  // delivery_concern_initiated event so the regulator transcript
  // captures the user's intent before the POST goes out.
  assert.ok(
    src.includes("postPatientDigestAuditEvent({ event: 'delivery_concern_initiated'"),
    'opening the concern modal must emit delivery_concern_initiated audit',
  );
});


test('pgPatientDigest mount-time audit ping covers the new section without re-pinging', () => {
  // The mount ping in #376 fires once on render. The delivery-failure
  // flag must NOT introduce a parallel mount ping that double-counts
  // the page view.
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  const mounts = src.match(/postPatientDigestAuditEvent\(\{ event: 'view'/g) || [];
  assert.equal(
    mounts.length, 1,
    'only ONE patient_digest.view ping should fire on mount even with the new section',
  );
});


// ── 4. pgCareTeamCoverage mirror tab ────────────────────────────────────────


test('pgCareTeamCoverage registers the Patient delivery concerns tab', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(
    src.includes("id: 'concerns'"),
    'coverage page must register a concerns tab',
  );
  assert.ok(
    src.includes('Patient delivery concerns'),
    'coverage tab label must mention Patient delivery concerns',
  );
});


test('pgCareTeamCoverage loads delivery concerns alongside the other tabs', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(
    src.includes('careTeamCoverageDeliveryConcerns'),
    'coverage page must call careTeamCoverageDeliveryConcerns in loadAll',
  );
});


test('renderConcernsTab emits a delivery_concerns_view audit ping', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(
    src.includes("postCareTeamCoverageAuditEvent({ event: 'delivery_concerns_view'"),
    'concerns tab must emit a delivery_concerns_view audit ping',
  );
});


test('Investigate CTA is wired and emits an audit ping with patient deep-link', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(
    src.includes('window._coverageInvestigateConcern'),
    'concerns tab must expose a global Investigate handler',
  );
  assert.ok(
    src.includes('delivery_concern_investigate'),
    'Investigate CTA must emit a delivery_concern_investigate audit',
  );
});


// ── 5. NO PHI of caregiver beyond first name in the rendered HTML ──────────


test('Failure row markup binds caregiver_first_name, never email or full name', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // Find the failures section by anchor and slice a window of 1500
  // chars after; the caregiver email field MUST NOT appear inside
  // that window (we deliberately bind to caregiver_first_name only).
  const idx = src.indexOf('Caregiver delivery problems');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 1800);
  assert.ok(slice.includes('caregiver_first_name'));
  assert.ok(!slice.includes('caregiver_email'), 'failure row must not bind caregiver_email');
});


test('Concerns tab markup binds first_name fields, never full email', () => {
  const src = readSrc('pages-knowledge.js');
  const idx = src.indexOf('renderConcernsTab(d)');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 2000);
  assert.ok(slice.includes('caregiver_first_name'));
  assert.ok(slice.includes('patient_first_name'));
  assert.ok(!slice.includes('caregiver_email'), 'concerns row must not bind caregiver_email');
});
