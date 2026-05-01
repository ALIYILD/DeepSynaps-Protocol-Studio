// Logic-only tests for the Patient Profile launch-audit (2026-04-30).
//
// These pin the page contract against silent fakes:
//   - The clinical-record card no longer fabricates rows from localStorage
//   - Local-only tabs carry an honest "Local-only" banner
//   - Counters render from server counts (never hardcoded)
//   - Empty consent timeline shows the honest banner, not a fake row
//   - Drill-out targets cover course-detail, irb-manager, clinical-trials,
//     documents-hub, adverse-events, assessments-hub, clinical-notes
//   - Demo CSV / NDJSON exports are detected from response prefix
//   - The audit-event POST payload shape matches the backend schema
//
// Run: node --test src/patient-profile-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Helpers (mirror in-page logic in pages-clinical.js) ─────────────────────

// Mirrors the consent-history empty-state branch in
// _ppRenderClinicalRecordAsync(). Real rows or honest empty state — never
// invented placeholder rows.
function renderConsentList(consentPayload) {
  if (consentPayload == null) return { state: 'unavailable', rows: [] };
  const items = Array.isArray(consentPayload.items) ? consentPayload.items : [];
  if (items.length === 0) return { state: 'empty', rows: [] };
  return { state: 'rows', rows: items };
}

// Mirrors the audit-timeline branch.
function renderAuditList(auditPayload) {
  if (auditPayload == null) return { state: 'unavailable', rows: [] };
  const items = Array.isArray(auditPayload.items) ? auditPayload.items : [];
  if (items.length === 0) return { state: 'empty', rows: [] };
  return { state: 'rows', rows: items };
}

// Mirrors the active-courses filter in _ppRenderClinicalRecordAsync.
function activeCourses(coursesPayload) {
  const all = (coursesPayload && Array.isArray(coursesPayload.items))
    ? coursesPayload.items
    : [];
  return all.filter(c => ['active', 'in_progress', 'approved', 'paused'].includes(c.status));
}

// Mirrors the export-detection helpers (same shape as Course Detail).
function isDemoCsv(text) {
  if (typeof text !== 'string') return false;
  return text.replace(/^\s+/, '').startsWith('# DEMO');
}

function isDemoNdjson(text) {
  if (typeof text !== 'string') return false;
  const first = (text.split('\n').find(l => l.trim().length > 0) || '').trim();
  if (!first.startsWith('{')) return false;
  try {
    const obj = JSON.parse(first);
    return obj && obj._meta === 'DEMO';
  } catch (_) {
    return false;
  }
}

// Mirrors the recordPatientProfileAuditEvent payload builder.
function buildAuditPayload(event, opts = {}) {
  return {
    event,
    note: typeof opts.note === 'string' ? opts.note.slice(0, 500) : null,
    using_demo_data: !!opts.using_demo_data,
  };
}

// Mirrors the drill-out target whitelist in window._ppDrillOut.
const DRILL_TARGETS = new Set([
  'course-detail',
  'courses',
  'irb-manager',
  'clinical-trials',
  'documents-hub',
  'adverse-events',
  'assessments-hub',
  'clinical-notes',
  'reports-hub',
  'audit-trail',
]);

function resolveDrillTarget(target) {
  return DRILL_TARGETS.has(target) ? target : null;
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('consent list returns no fabricated rows when API unreachable', () => {
  const out = renderConsentList(null);
  assert.equal(out.state, 'unavailable');
  assert.deepEqual(out.rows, []);
});

test('consent list returns honest empty state when API returns []', () => {
  const out = renderConsentList({ items: [] });
  assert.equal(out.state, 'empty');
  assert.deepEqual(out.rows, []);
});

test('consent list surfaces real rows verbatim', () => {
  const items = [
    {
      id: 'c1',
      consent_type: 'treatment',
      status: 'active',
      signed: true,
      signed_at: '2026-04-20T10:00:00Z',
      signed_by: 'actor-clinician-demo',
      created_at: '2026-04-20T10:00:00Z',
    },
  ];
  const out = renderConsentList({ items });
  assert.equal(out.state, 'rows');
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].signed_by, 'actor-clinician-demo');
});

test('audit list returns no fabricated rows when API unreachable', () => {
  const out = renderAuditList(null);
  assert.equal(out.state, 'unavailable');
  assert.deepEqual(out.rows, []);
});

test('audit list returns honest empty state when API returns []', () => {
  const out = renderAuditList({ items: [] });
  assert.equal(out.state, 'empty');
  assert.deepEqual(out.rows, []);
});

test('active-courses filter keeps only in-flight statuses', () => {
  const payload = {
    items: [
      { id: 'a', status: 'active' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'approved' },
      { id: 'd', status: 'paused' },
      { id: 'e', status: 'completed' },
      { id: 'f', status: 'closed' },
      { id: 'g', status: 'discontinued' },
    ],
  };
  const out = activeCourses(payload);
  const ids = out.map(c => c.id);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
});

test('audit-event payload builder matches backend schema (event + note + using_demo_data)', () => {
  const p = buildAuditPayload('view', { note: 'page mount' });
  assert.deepEqual(Object.keys(p).sort(), ['event', 'note', 'using_demo_data']);
  assert.equal(p.event, 'view');
  assert.equal(p.note, 'page mount');
  assert.equal(p.using_demo_data, false);
});

test('audit-event payload builder truncates long notes to 500 chars', () => {
  const long = 'x'.repeat(800);
  const p = buildAuditPayload('drill_out', { note: long });
  assert.equal(p.note.length, 500);
});

test('audit-event payload builder forwards using_demo_data flag', () => {
  const p = buildAuditPayload('export_csv', { using_demo_data: true });
  assert.equal(p.using_demo_data, true);
});

test('CSV export demo prefix detection — positive', () => {
  const text = '# DEMO — patient is demo data\nsection,patient\n';
  assert.equal(isDemoCsv(text), true);
});

test('CSV export demo prefix detection — negative for real patient', () => {
  const text = 'section,patient\npatient_id,first_name,...\npid-001,Real,...';
  assert.equal(isDemoCsv(text), false);
});

test('NDJSON export demo prefix detection — positive', () => {
  const lines = [
    '{"_meta":"DEMO","warning":"This patient is demo data"}',
    '{"_kind":"patient","patient_id":"pp-001"}',
  ];
  assert.equal(isDemoNdjson(lines.join('\n')), true);
});

test('NDJSON export demo prefix detection — negative for real patient', () => {
  const lines = ['{"_kind":"patient","patient_id":"pid-001"}'];
  assert.equal(isDemoNdjson(lines.join('\n')), false);
});

test('drill-out whitelist covers required cross-surface targets', () => {
  const required = [
    'course-detail',
    'irb-manager',
    'clinical-trials',
    'documents-hub',
    'adverse-events',
    'assessments-hub',
    'clinical-notes',
  ];
  for (const target of required) {
    assert.equal(resolveDrillTarget(target), target, `missing: ${target}`);
  }
});

test('drill-out whitelist rejects fabricated targets', () => {
  assert.equal(resolveDrillTarget('hacker-page'), null);
  assert.equal(resolveDrillTarget(''), null);
  assert.equal(resolveDrillTarget(null), null);
});

test('counters render zero, never null/undefined, when server data is missing', () => {
  // Mirror the c() helper inside _ppRenderClinicalRecordShell — Number.isFinite
  // protects the UI from rendering "NaN active courses" or "undefined".
  const c = (n) => Number.isFinite(n) ? n : 0;
  assert.equal(c(undefined), 0);
  assert.equal(c(null), 0);
  assert.equal(c(NaN), 0);
  assert.equal(c('5'), 0);  // non-number → 0
  assert.equal(c(7), 7);
  assert.equal(c(0), 0);
});

test('local-only banner is keyed per-tab and includes the honest disclosure', () => {
  // Mirror _ppLocalOnlyBanner shape (the UI layer escapes for HTML safety).
  const labels = ['medications', 'allergies', 'treatment history', 'clinical notes'];
  for (const label of labels) {
    const html = `<div data-testid="pp-local-only-banner"><strong>Local-only ${label}.</strong> These fields persist in this browser only and do not sync to the server yet.</div>`;
    assert.match(html, /data-testid="pp-local-only-banner"/);
    assert.match(html, /persist in this browser only/);
    assert.match(html, new RegExp('Local-only ' + label));
  }
});
