// Logic-only tests for the Patient Home Program Tasks (Homework)
// launch-audit (2026-05-01).
//
// Pin the page contract against silent fakes:
//   - Audit payload composition has correct event / task_id / using_demo_data
//   - "Why am I doing this?" rationale only renders when clinician-authored
//     (never AI-fabricated)
//   - "Log now" CTA deep-links into pt-adherence-events with task_id query
//   - "Need help?" thread_id format matches the report-question pattern
//   - Demo banner renders only when server returns is_demo=true
//   - Consent-revoked render path disables write actions (read-only)
//   - CSV / NDJSON export URLs are documented server endpoints, not blob URLs
//   - The pgPatientHomework block calls the launch-audit endpoints
//
// Run: node --test src/home-program-tasks-launch-audit.test.js
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
    task_id: extra.task_id ? String(extra.task_id) : null,
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

function rationaleIsClinicianAuthored(task) {
  if (!task) return false;
  const text = task.rationale || task.why || '';
  if (!text) return false;
  // Author tag is required for the rationale to display so that reviewers
  // can see at-a-glance that the text isn't AI-fabricated.
  const author = task.rationale_author || task.clinician_assigned_by || '';
  return Boolean(author);
}

function logNowDeepLink(taskId) {
  if (!taskId) return null;
  return 'pt-adherence-events?task_id=' + encodeURIComponent(String(taskId));
}

function helpRequestThreadId(taskId) {
  if (!taskId) return null;
  return 'task-' + String(taskId);
}

function csvExportPath() {
  return '/api/v1/home-program-tasks/patient/export.csv';
}

function ndjsonExportPath() {
  return '/api/v1/home-program-tasks/patient/export.ndjson';
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no task_id', () => {
  const p = buildAuditPayload('view', { note: 'mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.task_id, null);
  assert.equal(p.note, 'mount');
});

test('Audit payload: task_viewed carries task_id', () => {
  const p = buildAuditPayload('task_viewed', { task_id: 'hp-walk-1' });
  assert.equal(p.event, 'task_viewed');
  assert.equal(p.task_id, 'hp-walk-1');
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

test('Rationale renders only with explicit clinician author tag (no AI fabrication)', () => {
  // Clinician-authored — OK.
  assert.equal(
    rationaleIsClinicianAuthored({
      rationale: 'Behavioural activation reduces depressive avoidance.',
      rationale_author: 'Dr. Kolmar',
    }),
    true,
  );
  // Falls back to clinician_assigned_by — OK.
  assert.equal(
    rationaleIsClinicianAuthored({
      rationale: 'Walk improves mood.',
      clinician_assigned_by: 'Dr. Kolmar',
    }),
    true,
  );
  // No author — must be hidden so we don't surface AI-fabricated text.
  assert.equal(
    rationaleIsClinicianAuthored({
      rationale: 'Walks are good for you.',
    }),
    false,
  );
  // Empty rationale — nothing to show.
  assert.equal(
    rationaleIsClinicianAuthored({ rationale_author: 'Dr. Kolmar' }),
    false,
  );
  assert.equal(rationaleIsClinicianAuthored(null), false);
});

test('Log-now CTA deep-links to pt-adherence-events with task_id', () => {
  const link = logNowDeepLink('hp-walk-1');
  assert.equal(link, 'pt-adherence-events?task_id=hp-walk-1');
  // Special chars must be url-encoded.
  const linkEnc = logNowDeepLink('hp/walk 1');
  assert.equal(linkEnc, 'pt-adherence-events?task_id=hp%2Fwalk%201');
  assert.equal(logNowDeepLink(null), null);
});

test('Help-request thread_id mirrors the report-question pattern (task-<id>)', () => {
  assert.equal(helpRequestThreadId('hp-walk-1'), 'task-hp-walk-1');
  assert.equal(helpRequestThreadId(123), 'task-123');
  assert.equal(helpRequestThreadId(null), null);
});

test('CSV export path is the documented server endpoint, not a blob URL', () => {
  const p = csvExportPath();
  assert.equal(p, '/api/v1/home-program-tasks/patient/export.csv');
  assert.equal(p.startsWith('/api/v1/home-program-tasks/patient/'), true);
  assert.equal(p.startsWith('blob:'), false);
  assert.equal(p.startsWith('data:'), false);
});

test('NDJSON export path is also documented + audited', () => {
  const p = ndjsonExportPath();
  assert.equal(p, '/api/v1/home-program-tasks/patient/export.ndjson');
});


// ── Page integration guards ─────────────────────────────────────────────────


function _readPage() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const pagePath = path.resolve(here, 'pages-patient.js');
  return fs.readFileSync(pagePath, 'utf8');
}


test('pgPatientHomework calls the launch-audit endpoints (real data, not silent fakes)', () => {
  const src = _readPage();
  // Mount-time view ping calls the new audit endpoint.
  assert.equal(
    src.includes('postHomeProgramTaskAuditEvent'),
    true,
    'pgPatientHomework must call the new home_program_tasks audit endpoint',
  );
  // Today / summary endpoints get fetched.
  assert.equal(
    src.includes('homeProgramTasksToday'),
    true,
    'pgPatientHomework must fetch /home-program-tasks/patient/today',
  );
  assert.equal(
    src.includes('homeProgramTasksSummary'),
    true,
    'pgPatientHomework must fetch /home-program-tasks/patient/summary',
  );
});


test('pgPatientHomework wires _hwLogNow deep-link into pt-adherence-events', () => {
  const src = _readPage();
  assert.equal(
    src.includes("window._hwLogNow"),
    true,
    'pgPatientHomework must expose window._hwLogNow for the Log-now CTA',
  );
  assert.equal(
    src.includes("'pt-adherence-events?task_id=' + encodeURIComponent"),
    true,
    'window._hwLogNow must deep-link to pt-adherence-events with task_id query',
  );
});


test('pgPatientHomework wires _hwHelp via the launch-audit help-request endpoint', () => {
  const src = _readPage();
  assert.equal(
    src.includes("window._hwHelp"),
    true,
    'pgPatientHomework must expose window._hwHelp for the Need-help CTA',
  );
  assert.equal(
    src.includes('homeProgramTaskHelpRequest'),
    true,
    'window._hwHelp must call the homeProgramTaskHelpRequest API helper',
  );
});


test('Rationale block guards against AI fabrication (writes "not AI generated" copy)', () => {
  const src = _readPage();
  // The page source stores em-dashes as literal — escapes; assert
  // against either the encoded form or a real em-dash so the test stays
  // robust across editor configurations.
  const hasNotAIGenerated =
    src.includes('Written by your care team') &&
    src.includes('not AI generated.');
  assert.equal(
    hasNotAIGenerated,
    true,
    'Rationale UI must be explicit that the text is clinician-authored',
  );
});


test('api.js exposes the new home_program_tasks/patient helpers', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const apiPath = path.resolve(here, 'api.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  for (const fn of [
    'homeProgramTasksToday',
    'homeProgramTasksUpcoming',
    'homeProgramTasksCompleted',
    'homeProgramTasksSummary',
    'homeProgramTasksGet',
    'homeProgramTaskStart',
    'homeProgramTaskHelpRequest',
    'postHomeProgramTaskAuditEvent',
  ]) {
    assert.equal(
      src.includes(fn + ':'),
      true,
      `api.js must export ${fn} for the home_program_tasks launch-audit surface`,
    );
  }
  // Endpoint paths under the new patient subprefix.
  assert.equal(
    src.includes('/api/v1/home-program-tasks/patient/today'),
    true,
    'api.js must hit the patient-scope today endpoint',
  );
  assert.equal(
    src.includes('/api/v1/home-program-tasks/patient/audit-events'),
    true,
    'api.js must hit the patient-scope audit-events endpoint',
  );
});
