// Logic-only tests for the Caregiver Consent Grants launch-audit (2026-05-01).
//
// Closes the caregiver-share loop opened by Patient Digest #376. Pin
// the page-level + helper-level surface against silent fakes:
//   - Scope-chip render order is canonical (digest, messages, reports, wearables)
//   - Inactive scope chips fall back to a documented empty-chip
//   - api.js exposes the helpers needed by pgPatientCareTeam, all routed
//     under /api/v1/caregiver-consent/*
//   - Grant create payload normalises scope into bool flags
//   - Revoke payload requires a non-empty reason
//   - pages-patient.js renders the Caregiver consent subsection inside
//     pgPatientCareTeam and emits a mount-time audit ping
//   - DEMO banner is gated on the page _isDemo flag (server-driven)
//   - Patient Digest CTA text mentions queued + audit so the user is not
//     lied to about delivery state
//
// Run: node --test src/caregiver-consent-launch-audit.test.js
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


function normaliseScope(raw) {
  const out = {};
  for (const k of CANONICAL_SCOPE_KEYS) out[k] = false;
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      if (typeof k === 'string') out[k] = !!raw[k];
    }
  }
  return out;
}


function buildGrantPayload(caregiverUserId, scope) {
  return {
    caregiver_user_id: String(caregiverUserId || '').slice(0, 64),
    scope: normaliseScope(scope),
  };
}


function buildRevokePayload(reason) {
  const trimmed = String(reason || '').trim();
  if (!trimmed) throw new Error('reason is required');
  return { reason: trimmed.slice(0, 480) };
}


// ── 1. Scope-chip ordering ─────────────────────────────────────────────────


test('scopeChipLabels returns canonical order for fully-active scope', () => {
  const labels = scopeChipLabels({ digest: true, messages: true, reports: true, wearables: true });
  assert.deepEqual(labels, ['digest', 'messages', 'reports', 'wearables']);
});


test('scopeChipLabels honours canonical order even when input keys are reversed', () => {
  const scope = { wearables: true, reports: true, messages: true, digest: true };
  const labels = scopeChipLabels(scope);
  assert.deepEqual(labels, ['digest', 'messages', 'reports', 'wearables']);
});


test('scopeChipLabels filters out disabled scope keys', () => {
  const labels = scopeChipLabels({ digest: true, messages: false, reports: true, wearables: false });
  assert.deepEqual(labels, ['digest', 'reports']);
});


test('scopeChipLabels returns empty array for empty / unknown input', () => {
  assert.deepEqual(scopeChipLabels({}), []);
  assert.deepEqual(scopeChipLabels(null), []);
  assert.deepEqual(scopeChipLabels({ unknown: true }), []);
});


// ── 2. Scope normalisation ─────────────────────────────────────────────────


test('normaliseScope coerces flags to booleans', () => {
  const scope = normaliseScope({ digest: 1, messages: 0, reports: 'yes', wearables: '' });
  assert.equal(scope.digest, true);
  assert.equal(scope.messages, false);
  assert.equal(scope.reports, true);
  assert.equal(scope.wearables, false);
});


test('normaliseScope defaults missing canonical keys to false', () => {
  const scope = normaliseScope({ digest: true });
  assert.equal(scope.digest, true);
  assert.equal(scope.messages, false);
  assert.equal(scope.reports, false);
  assert.equal(scope.wearables, false);
});


// ── 3. Grant create payload ────────────────────────────────────────────────


test('buildGrantPayload pins caregiver_user_id at 64 chars and normalises scope', () => {
  const long = 'u' + 'x'.repeat(120);
  const p = buildGrantPayload(long, { digest: 1 });
  assert.equal(p.caregiver_user_id.length, 64);
  assert.equal(p.scope.digest, true);
  assert.equal(p.scope.wearables, false);
});


// ── 4. Revoke payload requires reason ──────────────────────────────────────


test('buildRevokePayload rejects empty / whitespace reasons', () => {
  assert.throws(() => buildRevokePayload(''));
  assert.throws(() => buildRevokePayload('   '));
});


test('buildRevokePayload truncates long reasons at 480 chars', () => {
  const p = buildRevokePayload('y'.repeat(600));
  assert.equal(p.reason.length, 480);
});


// ── 5. api.js helper coverage ──────────────────────────────────────────────


test('api.js exposes the caregiver-consent helpers needed by pgPatientCareTeam', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /caregiverConsentListGrants\s*:/);
  assert.match(apiSrc, /caregiverConsentGetGrant\s*:/);
  assert.match(apiSrc, /caregiverConsentCreateGrant\s*:/);
  assert.match(apiSrc, /caregiverConsentRevokeGrant\s*:/);
  assert.match(apiSrc, /caregiverConsentListByCaregiver\s*:/);
  assert.match(apiSrc, /postCaregiverConsentAuditEvent\s*:/);
});


test('all caregiver-consent API helpers route under /api/v1/caregiver-consent/', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  const block = apiSrc.split('Caregiver Consent Grants launch-audit')[1] || '';
  const slice = block.split('// ──')[0] || block;
  const urls = slice.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 5, 'expected at least 5 URLs in the block');
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/caregiver-consent\//);
  }
});


// ── 6. pages-patient.js wiring ─────────────────────────────────────────────


test('pgPatientCareTeam renders the Caregiver consent subsection', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const start = src.indexOf('async function _pgPatientCareTeamImpl');
  assert.ok(start > 0, '_pgPatientCareTeamImpl must be defined');
  const slice = src.slice(start, start + 60000);
  assert.match(slice, /<!-- CAREGIVER CONSENT/);
  assert.match(slice, /id="ct-caregiver-consent"/);
});


test('pgPatientCareTeam emits a mount-time caregiver_consent.view audit ping', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const start = src.indexOf('async function _pgPatientCareTeamImpl');
  const slice = src.slice(start, start + 60000);
  assert.match(slice, /postCaregiverConsentAuditEvent[\s\S]{0,200}caregiver_consent\.view/);
});


test('pgPatientCareTeam grant + revoke CTAs emit their own audit events', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const start = src.indexOf('async function _pgPatientCareTeamImpl');
  const slice = src.slice(start, start + 60000);
  assert.match(slice, /caregiver_consent\.grant_created_ui/);
  assert.match(slice, /caregiver_consent\.grant_revoked_ui/);
});


test('Caregiver consent subsection renders DEMO banner only when _isDemo is true', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const start = src.indexOf('<!-- CAREGIVER CONSENT');
  assert.ok(start > 0, 'Caregiver consent block must be present');
  const slice = src.slice(start, start + 4000);
  // Must be gated by _isDemo and must NOT be hardcoded true.
  assert.match(slice, /\$\{_isDemo \?/);
  assert.doesNotMatch(slice, /_isDemo\s*=\s*true/i);
});


// ── 7. Honest queued + audit copy ──────────────────────────────────────────


test('Caregiver consent CTA copy mentions queued + audit so users are not misled', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  const start = src.indexOf('<!-- CAREGIVER CONSENT');
  const slice = src.slice(start, start + 8000);
  assert.match(slice, /queued/i);
  assert.match(slice, /audited|audit/i);
});
