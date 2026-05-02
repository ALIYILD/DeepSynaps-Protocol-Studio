// Logic-only tests for the Caregiver Delivery Acknowledgement
// launch-audit (2026-05-01).
//
// Closes the bidirectional confirmation loop opened by SendGrid Adapter
// (#381) + Delivery Failure Flag (#382). Today the audit transcript
// shows whether the digest dispatch landed at the ESP — but a regulator
// cannot prove the caregiver actually received and read the message.
//
// This PR adds:
//   - A caregiver-side "I received it" CTA on the Caregiver Portal
//     (pgPatientCaregiver) that POSTs to
//     /api/v1/caregiver-consent/grants/{id}/acknowledge-delivery and
//     emits caregiver_portal.delivery_acknowledged.
//   - A "Last confirmed: <relative_time>" stamp on the Patient Digest
//     (pgPatientDigest) "Caregiver delivery confirmations" subsection.
//
// Pin the front-end against silent fakes:
//   - api.js exposes the new caregiverPortalAcknowledgeDelivery /
//     caregiverPortalLastAcknowledgement helpers, routed under
//     /api/v1/caregiver-consent/grants/{id}/...
//   - pgPatientCaregiver renders a "Recent landed digests" subsection
//     with the "I received it" CTA and an "Awaiting confirmation" /
//     "Last confirmed" stamp.
//   - pgPatientDigest renders "Last confirmed: <relative>" beneath the
//     caregiver name when last_acknowledged_at is present, and an
//     "Awaiting confirmation" tag when delivered>0 but no ack.
//   - DEMO banner reuses summary.is_demo (already covered in #376) —
//     the new section never re-renders a parallel banner.
//   - NO PHI of caregiver beyond first name leaks into the rendered
//     HTML.
//
// Run: node --test src/caregiver-delivery-ack-launch-audit.test.js
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


test('api.js exposes the new caregiver-delivery-ack helpers', () => {
  const apiSrc = readSrc('api.js');
  for (const name of [
    'caregiverPortalAcknowledgeDelivery',
    'caregiverPortalLastAcknowledgement',
  ]) {
    assert.ok(apiSrc.includes(name), `api.js must export ${name}`);
  }
});


test('caregiverPortalAcknowledgeDelivery POSTs under /api/v1/caregiver-consent/grants/', () => {
  const apiSrc = readSrc('api.js');
  assert.ok(
    apiSrc.includes('/acknowledge-delivery'),
    'helper must hit /acknowledge-delivery suffix',
  );
  const idx = apiSrc.indexOf('caregiverPortalAcknowledgeDelivery');
  assert.notEqual(idx, -1);
  const slice = apiSrc.slice(idx, idx + 400);
  assert.ok(slice.includes('POST'), 'ack helper must use POST');
  assert.ok(
    slice.includes('/api/v1/caregiver-consent/grants/'),
    'ack helper must route under /api/v1/caregiver-consent/grants/',
  );
});


test('caregiverPortalLastAcknowledgement GETs the last-acknowledgement endpoint', () => {
  const apiSrc = readSrc('api.js');
  assert.ok(
    apiSrc.includes('/last-acknowledgement'),
    'helper must hit /last-acknowledgement suffix',
  );
  const idx = apiSrc.indexOf('caregiverPortalLastAcknowledgement');
  assert.notEqual(idx, -1);
  const slice = apiSrc.slice(idx, idx + 400);
  assert.ok(
    slice.includes('/api/v1/caregiver-consent/grants/'),
    'last-ack helper must route under /api/v1/caregiver-consent/grants/',
  );
});


// ── 2. pgPatientCaregiver wires the "I received it" CTA ────────────────────


test('pgPatientCaregiver fetches per-grant last-acknowledgement on mount', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  assert.ok(
    src.includes('caregiverPortalLastAcknowledgement'),
    'pgPatientCaregiver must read last-acknowledgement per grant',
  );
});


test('pgPatientCaregiver exposes a "Recent landed digests" subsection per active digest grant', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  assert.ok(
    src.includes('Recent landed digests'),
    'page must include the recent-landed-digests subsection title',
  );
  assert.ok(
    src.includes('I received it'),
    'page must expose the "I received it" CTA label',
  );
  assert.ok(
    src.includes('data-cg-ack-delivery'),
    'CTA must carry the data-cg-ack-delivery attribute for click wiring',
  );
});


test('pgPatientCaregiver wires the ack CTA to caregiverPortalAcknowledgeDelivery', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  assert.ok(
    src.includes('api.caregiverPortalAcknowledgeDelivery'),
    'the click handler must call api.caregiverPortalAcknowledgeDelivery',
  );
  assert.ok(
    src.includes("event: 'delivery_acknowledged_ui'"),
    'the click handler must emit a delivery_acknowledged_ui audit ping',
  );
});


test('pgPatientCaregiver renders "Awaiting confirmation" when no ack on record', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  // Anchor on the subsection MARKUP (not the comment that mentions the
  // subsection name). The data-testid is unique to the subsection.
  const idx = src.indexOf('data-testid="pt-cg-recent-digests"');
  assert.notEqual(idx, -1, 'pt-cg-recent-digests testid anchor must exist');
  const slice = src.slice(idx, idx + 1500);
  assert.ok(
    slice.includes('Awaiting confirmation'),
    'recent-digests subsection must render the Awaiting confirmation tag',
  );
  assert.ok(
    slice.includes('Last confirmed:'),
    'recent-digests subsection must render the Last confirmed stamp',
  );
});


// ── 3. pgPatientDigest renders the patient-side stamp ──────────────────────


test('pgPatientDigest reads last_acknowledged_at on each caregiver row', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  // The summary row schema gained `last_acknowledged_at`. The page
  // binds it under the existing "Caregiver delivery confirmations"
  // subsection — never re-renders a parallel banner.
  assert.ok(
    src.includes('last_acknowledged_at'),
    'page must read last_acknowledged_at from the caregiver-delivery summary',
  );
  assert.ok(
    src.includes('Caregiver delivery confirmations'),
    'page must render under the existing Caregiver delivery confirmations subsection',
  );
});


test('pgPatientDigest renders the relative-time helper output', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  assert.ok(
    src.includes('_pdRelativeTime'),
    'page must use the new _pdRelativeTime helper',
  );
  // Anchor on the data-testid for the patient-side row (unique to the
  // ack stamp markup) so we never accidentally hit the leading comment
  // block.
  const idx = src.indexOf('data-testid="pd-cg-last-confirmed"');
  assert.notEqual(idx, -1, 'pd-cg-last-confirmed testid anchor must exist');
  const slice = src.slice(idx - 500, idx + 1200);
  assert.ok(
    slice.includes('Last confirmed:'),
    'caregiver delivery confirmations subsection must render Last confirmed stamp',
  );
  assert.ok(
    slice.includes('Awaiting confirmation'),
    'caregiver delivery confirmations subsection must render Awaiting confirmation tag',
  );
});


test('_pdRelativeTime helper exists and handles null inputs', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  // Defensive: the helper must short-circuit on null/undefined, never
  // throw on a missing last_acknowledged_at.
  const idx = src.indexOf('function _pdRelativeTime');
  assert.notEqual(idx, -1, '_pdRelativeTime must be defined');
  const slice = src.slice(idx, idx + 600);
  assert.ok(
    slice.includes("if (!iso)"),
    '_pdRelativeTime must guard against null/undefined inputs',
  );
});


// ── 4. Mount ping discipline: no double-counting ───────────────────────────


test('pgPatientDigest mount ping count stays at 1 with the new last-confirmed stamp', () => {
  // The mount ping in #376 fires once on render. Adding the
  // last-confirmed stamp must NOT introduce a parallel mount ping.
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  const mounts = src.match(/postPatientDigestAuditEvent\(\{ event: 'view'/g) || [];
  assert.equal(
    mounts.length, 1,
    'only ONE patient_digest.view ping should fire on mount even with the new stamp',
  );
});


// ── 5. NO PHI of caregiver beyond first name in the rendered HTML ──────────


test('Recent landed digests subsection binds first name only, never email', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  const idx = src.indexOf('Recent landed digests');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 1200);
  assert.ok(
    !slice.includes('caregiver_email'),
    'recent-digests subsection must not bind caregiver_email',
  );
  assert.ok(
    !slice.includes('caregiver_full_name'),
    'recent-digests subsection must not bind caregiver_full_name',
  );
});


test('Caregiver delivery confirmations subsection binds first name only, never email', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js'));
  const idx = src.indexOf('Caregiver delivery confirmations');
  assert.notEqual(idx, -1);
  // Slice is intentionally large so we cover the full row template
  // including the new Last confirmed stamp.
  const slice = src.slice(idx, idx + 2400);
  assert.ok(
    slice.includes('caregiver_first_name'),
    'subsection must continue to bind caregiver_first_name',
  );
  assert.ok(
    !slice.includes('caregiver_email'),
    'subsection must not start binding caregiver_email when adding the ack stamp',
  );
});


// ── 6. Test file is registered in the test:unit script ─────────────────────


test('apps/web/package.json::test:unit registers this file', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  const cmd = (pkg.scripts && pkg.scripts['test:unit']) || '';
  assert.ok(
    cmd.includes('caregiver-delivery-ack-launch-audit.test.js'),
    'apps/web/package.json::test:unit must register this test file',
  );
});
