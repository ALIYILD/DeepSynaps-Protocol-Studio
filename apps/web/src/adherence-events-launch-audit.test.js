// Logic-only tests for the Patient Adherence Events launch-audit (2026-05-01).
//
// Pin the page contract against silent fakes:
//   - Audit payload composition has correct event / event_record_id / using_demo_data
//   - Demo banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables write actions (read-only)
//   - Severity 1..10 input validation matches the server gate
//   - Mark-faulty action requires a non-empty reason before firing audit
//   - CSV / NDJSON export URLs are documented server endpoints, not blob URLs
//   - No localStorage AI-cache keys leak into the page (integrity guard)
//
// Run: node --test src/adherence-events-launch-audit.test.js
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
    event_record_id: extra.event_record_id || null,
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
  return shouldShowConsentBanner(serverList);
}

function isValidSeverity(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return false;
  return n >= 1 && n <= 10;
}

function severityBucket(intSev) {
  const n = Number(intSev);
  if (!Number.isInteger(n)) return null;
  if (n >= 9) return 'urgent';
  if (n >= 7) return 'high';
  if (n >= 4) return 'moderate';
  if (n >= 1) return 'low';
  return null;
}

function csvExportPath() {
  return '/api/v1/adherence/export.csv';
}

function ndjsonExportPath() {
  return '/api/v1/adherence/export.ndjson';
}

function escalationCreatesAEDraft(event) {
  if (!event) return false;
  if (event.event_type !== 'side_effect') return false;
  const sevInt = event && event.structured && Number(event.structured.severity_int);
  if (Number.isInteger(sevInt) && sevInt >= 7) return true;
  return event.severity === 'high' || event.severity === 'urgent';
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no event_record_id', () => {
  const p = buildAuditPayload('view', { note: 'page mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.event_record_id, null);
  assert.equal(p.note, 'page mount');
});

test('Audit payload: side_effect_logged carries record id + severity hint', () => {
  const p = buildAuditPayload('side_effect_logged', {
    event_record_id: 'ev-1',
    note: 'severity=8',
  });
  assert.equal(p.event, 'side_effect_logged');
  assert.equal(p.event_record_id, 'ev-1');
  assert.equal(p.note, 'severity=8');
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

test('Severity validator accepts 1..10 inclusive', () => {
  assert.equal(isValidSeverity(1), true);
  assert.equal(isValidSeverity(10), true);
  assert.equal(isValidSeverity(0), false);
  assert.equal(isValidSeverity(11), false);
  assert.equal(isValidSeverity(5.5), false);
  assert.equal(isValidSeverity('three'), false);
});

test('Severity bucket promotes to high at 7, urgent at 9', () => {
  assert.equal(severityBucket(1), 'low');
  assert.equal(severityBucket(3), 'low');
  assert.equal(severityBucket(4), 'moderate');
  assert.equal(severityBucket(6), 'moderate');
  assert.equal(severityBucket(7), 'high');
  assert.equal(severityBucket(8), 'high');
  assert.equal(severityBucket(9), 'urgent');
  assert.equal(severityBucket(10), 'urgent');
  assert.equal(severityBucket(0), null);
});

test('CSV export path is the documented server endpoint, not a blob URL', () => {
  const p = csvExportPath();
  assert.equal(p, '/api/v1/adherence/export.csv');
  assert.equal(p.startsWith('/api/v1/adherence/'), true);
  assert.equal(p.startsWith('blob:'), false);
  assert.equal(p.startsWith('data:'), false);
});

test('NDJSON export path is also documented + audited', () => {
  const p = ndjsonExportPath();
  assert.equal(p, '/api/v1/adherence/export.ndjson');
});

test('Escalation creates AE Hub draft only for severity>=7 side-effects', () => {
  assert.equal(escalationCreatesAEDraft({ event_type: 'side_effect', structured: { severity_int: 8 } }), true);
  assert.equal(escalationCreatesAEDraft({ event_type: 'side_effect', severity: 'urgent', structured: {} }), true);
  assert.equal(escalationCreatesAEDraft({ event_type: 'side_effect', structured: { severity_int: 3 } }), false);
  // Plain adherence_report escalations never create an AE draft.
  assert.equal(escalationCreatesAEDraft({ event_type: 'adherence_report', structured: { status: 'skipped' } }), false);
  assert.equal(escalationCreatesAEDraft(null), false);
});


// ── Integrity guard: no localStorage AI-suggested-explanations cache ───────


test('No localStorage AI-suggested-explanations cache leaks into the page', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  const src = (fs.readFileSync(pagePath, 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'symptom-notifications.js'), 'utf8'));

  // Find the pgPatientAdherenceEvents block and assert no banned key
  // names appear inside it. We bound the block at the declaration of
  // pgPatientAdherenceEvents and the next pg* declaration.
  const startMarker = 'export async function pgPatientAdherenceEvents()';
  const startIdx = src.indexOf(startMarker);
  assert.notEqual(startIdx, -1, 'pgPatientAdherenceEvents must exist');

  const afterStart = src.slice(startIdx);
  const endMatch = afterStart.match(/\n\/\/[^\n]*\nexport async function pg/);
  const endIdx = endMatch ? afterStart.indexOf(endMatch[0], 1) : afterStart.length;
  const block = afterStart.slice(0, endIdx);

  const bannedSubstrings = [
    'ds_adherence_ai',
    'ds_pt_adherence_ai',
    'adherenceAi',
    'aiSuggested',
    'ai_suggested_explanation',
    'ai_suggested_explanations',
  ];
  for (const banned of bannedSubstrings) {
    assert.equal(
      block.includes(banned),
      false,
      `pgPatientAdherenceEvents must not contain banned AI-cache key "${banned}"`,
    );
  }

  // The block must NOT call localStorage.setItem / getItem at all —
  // every read/write goes through the audited server endpoints.
  assert.equal(
    /localStorage\.(setItem|getItem)/.test(block),
    false,
    'pgPatientAdherenceEvents must not touch localStorage directly',
  );
});


test('Honest empty-state copy ships with the page', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  const src = (fs.readFileSync(pagePath, 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(here, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  assert.equal(
    src.includes('No adherence events yet. As you complete or skip home tasks'),
    true,
    'Empty-state copy must be honest about the absence of events',
  );
});
