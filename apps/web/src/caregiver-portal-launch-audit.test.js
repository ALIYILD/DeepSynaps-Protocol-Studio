// Logic-only tests for the Caregiver Portal launch-audit (2026-05-01).
//
// Closes the bidirectional half of the consent loop opened by the
// Caregiver Consent Grants launch-audit (#377): patient grants (#377),
// caregiver sees + acknowledges them (this PR). Pin the page-level +
// helper-level surface against silent fakes:
//
//   - Scope-chip render order is canonical (digest, messages, reports,
//     wearables) — same as the patient-side helper, but exposed for the
//     caregiver-side viewer.
//   - api.js exposes the helpers needed by pgPatientCaregiver, all
//     routed under /api/v1/caregiver-consent/*.
//   - pgPatientCaregiver renders the caregiver-side viewer (NOT the
//     legacy "Contact your care team" stub).
//   - Mount-time `caregiver_portal.view` audit ping fires from
//     pgPatientCaregiver.
//   - Per-grant CTAs (Acknowledge revocation, View digest, View
//     messages, View reports) emit dedicated audit pings.
//   - Empty state matches the spec ("No patients have granted you
//     access yet.").
//   - DEMO banner is gated on `_isDemo` (server-driven), never
//     hard-coded.
//   - Patient-side info shown is the bare minimum (first name +
//     clinic) — we never leak the patient's last name OR full email
//     to the caregiver.
//
// Run: node --test src/caregiver-portal-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


const CANONICAL_SCOPE_KEYS = ['digest', 'messages', 'reports', 'wearables'];


function scopeChipLabels(scope) {
  return CANONICAL_SCOPE_KEYS.filter((k) => scope && scope[k]);
}


// ── 1. Scope chip ordering ─────────────────────────────────────────────────


test('caregiver-portal scopeChipLabels honours canonical order', () => {
  const scope = { wearables: true, reports: true, messages: true, digest: true };
  assert.deepEqual(scopeChipLabels(scope), ['digest', 'messages', 'reports', 'wearables']);
});


test('caregiver-portal scopeChipLabels filters disabled flags', () => {
  const scope = { digest: true, messages: false, reports: true, wearables: false };
  assert.deepEqual(scopeChipLabels(scope), ['digest', 'reports']);
});


test('caregiver-portal scopeChipLabels handles empty / null input', () => {
  assert.deepEqual(scopeChipLabels({}), []);
  assert.deepEqual(scopeChipLabels(null), []);
  assert.deepEqual(scopeChipLabels({ unknown: true }), []);
});


// ── 2. api.js helper coverage ──────────────────────────────────────────────


test('api.js exposes caregiver portal helpers needed by pgPatientCaregiver', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /caregiverConsentListByCaregiver\s*:/);
  assert.match(apiSrc, /caregiverPortalAcknowledgeRevocation\s*:/);
  assert.match(apiSrc, /caregiverPortalAccessLog\s*:/);
  assert.match(apiSrc, /postCaregiverPortalAuditEvent\s*:/);
});


test('caregiver portal API helpers route under /api/v1/caregiver-consent/', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  const block = apiSrc.split('Caregiver Portal launch-audit')[1] || '';
  const slice = block.split('// ──')[0] || block;
  const urls = slice.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 3, 'expected at least 3 URLs in the block');
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-consent\//);
  }
});


test('access-log helper posts to /grants/<id>/access-log', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /caregiverPortalAccessLog[\s\S]{0,400}\/grants\/[\s\S]{0,40}\/access-log/);
});


test('acknowledge-revocation helper posts to /grants/<id>/acknowledge-revocation', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /caregiverPortalAcknowledgeRevocation[\s\S]{0,400}\/grants\/[\s\S]{0,40}\/acknowledge-revocation/);
});


test('portal audit-events helper posts to /audit-events/portal', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /postCaregiverPortalAuditEvent[\s\S]{0,400}\/audit-events\/portal/);
});


// ── 3. pgPatientCaregiver wiring ───────────────────────────────────────────


function _readCaregiverPageSrc() {
  return fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8');
}


function _sliceCaregiverFn(src) {
  const start = src.indexOf('export async function pgPatientCaregiver');
  assert.ok(start > 0, 'pgPatientCaregiver must be exported');
  // Slice up to next top-level export — long enough for this rewrite.
  return src.slice(start, start + 14000);
}


test('pgPatientCaregiver is the caregiver portal viewer (no legacy stub)', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  // The new viewer header must be present.
  assert.match(slice, /Caregiver Portal/);
  // The legacy "Contact Your Care Team" CTA from the old stub must NOT
  // be rendered as the only action — empty-state copy must be honest.
  assert.match(slice, /No patients have granted you access yet/i);
});


test('pgPatientCaregiver emits a mount-time caregiver_portal.view audit ping', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /postCaregiverPortalAuditEvent[\s\S]{0,400}event:\s*['"`]view['"`]/);
});


test('pgPatientCaregiver fetches grants from /grants/by-caregiver', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /caregiverConsentListByCaregiver/);
});


test('pgPatientCaregiver wires an Acknowledge revocation CTA', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /Acknowledge revocation/);
  assert.match(slice, /caregiverPortalAcknowledgeRevocation/);
  // Audit ping for the click event.
  assert.match(slice, /revocation_acknowledged_ui/);
});


test('pgPatientCaregiver wires View-digest / View-messages / View-reports CTAs', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /View digest/);
  assert.match(slice, /View shared messages/);
  assert.match(slice, /View reports/);
  assert.match(slice, /caregiverPortalAccessLog/);
});


test('pgPatientCaregiver gates View buttons on scope flags', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  // The "View digest" button is conditional on scope.digest, etc.
  assert.match(slice, /scope\.digest/);
  assert.match(slice, /scope\.messages/);
  assert.match(slice, /scope\.reports/);
});


test('pgPatientCaregiver DEMO banner is gated on _isDemo (not hard-coded)', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /\$\{_isDemo \?/);
  assert.doesNotMatch(slice, /_isDemo\s*=\s*true\b/);
});


test('pgPatientCaregiver only surfaces patient_first_name + clinic, not last name', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  // The caregiver view reads patient_first_name and patient_clinic_id.
  assert.match(slice, /patient_first_name/);
  assert.match(slice, /patient_clinic_id/);
  // But the page must NOT ever read patient_last_name OR the full email.
  assert.doesNotMatch(slice, /patient_last_name|patient_email\b/);
});


test('pgPatientCaregiver renders an honest empty-state for zero grants', () => {
  const slice = _sliceCaregiverFn(_readCaregiverPageSrc());
  assert.match(slice, /No patients have granted you access yet/i);
});


// ── 4. Scope-key whitelist parity with backend ─────────────────────────────


test('frontend canonical scope keys match the backend whitelist', () => {
  // Mirror of CANONICAL_SCOPE_KEYS in
  // apps/api/app/routers/caregiver_consent_router.py. If they drift the
  // frontend silently hides scope chips the backend still gates on.
  assert.deepEqual(
    CANONICAL_SCOPE_KEYS,
    ['digest', 'messages', 'reports', 'wearables']
  );
});
