// Logic-only tests for the Clinician Notifications Pulse / Daily Digest
// launch-audit (2026-05-01).
//
// Pins the page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs send /
//     share / drill-out / export pings)
//   - DEMO banner renders only when server returns is_demo_view=true
//   - Honest empty state — "No events to summarise for this shift." —
//     renders when the server returns zero events (no AI-fabricated rows)
//   - KPI strip is summed from server payload, not invented
//   - Filter helpers strip blanks before posting to the server
//   - Date-range presets compute correctly (today / yesterday / 7d / 12h)
//   - Send-email confirmation copy is honest about queued vs sent
//   - Note-required guards reject blank input
//   - Export URLs target the documented server endpoints, not blob URLs
//   - The pgClinicianDailyDigest block wires the helpers and audit ping
//
// Run: node --test src/clinician-digest-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-courses.js) ────


function buildAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.target_id) out.target_id = String(extra.target_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildFilterParams(state) {
  const params = {};
  if (state?.since) params.since = state.since;
  if (state?.until) params.until = state.until;
  if (state?.surface) params.surface = state.surface;
  if (state?.severity) params.severity = state.severity;
  if (state?.patientId) params.patient_id = state.patientId;
  return params;
}

function shouldShowDemoBanner(serverResp) {
  return !!(serverResp && serverResp.is_demo_view);
}

function shouldShowEmptyState(sectionsArray) {
  if (!Array.isArray(sectionsArray) || sectionsArray.length === 0) return true;
  const totalActivity = sectionsArray.reduce((acc, sx) =>
    acc + (sx.handled || 0) + (sx.escalated || 0) + (sx.paged || 0) + (sx.open || 0), 0);
  return totalActivity === 0;
}

function summaryAsRendered(serverSummaryResp) {
  if (!serverSummaryResp) {
    return {
      handled: 0, escalated: 0, paged: 0, open: 0, sla_breached: 0,
      bySurface: {},
    };
  }
  return {
    handled: Number(serverSummaryResp.handled || 0),
    escalated: Number(serverSummaryResp.escalated || 0),
    paged: Number(serverSummaryResp.paged || 0),
    open: Number(serverSummaryResp.open || 0),
    sla_breached: Number(serverSummaryResp.sla_breached || 0),
    bySurface: serverSummaryResp.by_surface || {},
  };
}

function csvExportPath(params = {}) {
  const q = new URLSearchParams(params).toString();
  return `/api/v1/clinician-digest/export.csv${q ? '?' + q : ''}`;
}

function ndjsonExportPath(params = {}) {
  const q = new URLSearchParams(params).toString();
  return `/api/v1/clinician-digest/export.ndjson${q ? '?' + q : ''}`;
}

function noteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function presetWindow(preset) {
  const now = new Date();
  if (preset === 'yesterday') {
    const until = new Date(now);
    until.setUTCHours(0, 0, 0, 0);
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - 1);
    return { since: since.toISOString(), until: until.toISOString() };
  }
  if (preset === '7d') {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - 7);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  if (preset === '30d') {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - 30);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  if (preset === 'today') {
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  return { since: null, until: null };
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no target_id', () => {
  const p = buildAuditPayload('view', { note: 'page mounted' });
  assert.equal(p.event, 'view');
  assert.equal(p.target_id, undefined);
  assert.equal(p.note, 'page mounted');
});

test('Audit payload: scoped events include target_id', () => {
  const p = buildAuditPayload('drill_out', { target_id: 'audit-x', note: 'opened' });
  assert.equal(p.event, 'drill_out');
  assert.equal(p.target_id, 'audit-x');
});

test('Audit payload: using_demo_data only set when truthy', () => {
  assert.equal(buildAuditPayload('view', {}).using_demo_data, undefined);
  assert.equal(buildAuditPayload('view', { using_demo_data: true }).using_demo_data, true);
});

test('Audit payload: note is truncated at 480 chars', () => {
  const long = 'x'.repeat(2000);
  const p = buildAuditPayload('view', { note: long });
  assert.equal(p.note.length, 480);
});

test('Filter params: blanks are dropped', () => {
  assert.deepEqual(buildFilterParams({}), {});
  assert.deepEqual(buildFilterParams({ since: '', until: '' }), {});
  assert.deepEqual(
    buildFilterParams({
      since: '2026-04-30T00:00:00+00:00',
      until: '2026-05-01T00:00:00+00:00',
      surface: 'clinician_inbox',
      severity: 'high',
      patientId: 'p1',
    }),
    {
      since: '2026-04-30T00:00:00+00:00',
      until: '2026-05-01T00:00:00+00:00',
      surface: 'clinician_inbox',
      severity: 'high',
      patient_id: 'p1',
    },
  );
});

test('Demo banner: only on server is_demo_view=true', () => {
  assert.equal(shouldShowDemoBanner(null), false);
  assert.equal(shouldShowDemoBanner({ is_demo_view: false }), false);
  assert.equal(shouldShowDemoBanner({ is_demo_view: true }), true);
});

test('Empty state: rendered when sections are empty / all-zero', () => {
  assert.equal(shouldShowEmptyState(null), true);
  assert.equal(shouldShowEmptyState([]), true);
  assert.equal(shouldShowEmptyState([
    { surface: 'clinician_inbox', handled: 0, escalated: 0, paged: 0, open: 0 },
    { surface: 'wearables_workbench', handled: 0, escalated: 0, paged: 0, open: 0 },
  ]), true);
  assert.equal(shouldShowEmptyState([
    { surface: 'clinician_inbox', handled: 1, escalated: 0, paged: 0, open: 0 },
  ]), false);
});

test('Summary: numbers come from server, not invented', () => {
  const s = summaryAsRendered({
    handled: 7,
    escalated: 2,
    paged: 1,
    open: 12,
    sla_breached: 3,
    by_surface: {
      clinician_inbox: { handled: 5, escalated: 0, paged: 1, open: 4 },
      wearables_workbench: { handled: 2, escalated: 1, paged: 0, open: 3 },
    },
  });
  assert.equal(s.handled, 7);
  assert.equal(s.escalated, 2);
  assert.equal(s.paged, 1);
  assert.equal(s.open, 12);
  assert.equal(s.sla_breached, 3);
  assert.equal(s.bySurface.clinician_inbox.handled, 5);
  assert.equal(s.bySurface.wearables_workbench.escalated, 1);
});

test('Summary: null payload → all zeros (no fabrication)', () => {
  const s = summaryAsRendered(null);
  assert.equal(s.handled, 0);
  assert.equal(s.escalated, 0);
  assert.equal(s.paged, 0);
  assert.equal(s.open, 0);
  assert.equal(s.sla_breached, 0);
  assert.deepEqual(s.bySurface, {});
});

test('Export URLs: documented server endpoints (no blobs)', () => {
  assert.equal(csvExportPath(), '/api/v1/clinician-digest/export.csv');
  assert.equal(ndjsonExportPath(), '/api/v1/clinician-digest/export.ndjson');
  assert.ok(csvExportPath().startsWith('/api/'));
  assert.ok(ndjsonExportPath().startsWith('/api/'));
  // Filters carry through to query string.
  const csv = csvExportPath({ surface: 'clinician_inbox', patient_id: 'p1' });
  assert.ok(csv.includes('surface=clinician_inbox'));
  assert.ok(csv.includes('patient_id=p1'));
});

test('Note-required guard: blank notes are rejected', () => {
  assert.equal(noteRequiredValid(''), false);
  assert.equal(noteRequiredValid('  '), false);
  assert.equal(noteRequiredValid(null), false);
  assert.equal(noteRequiredValid(undefined), false);
  assert.equal(noteRequiredValid('FYI — please review.'), true);
});

test('Date-range preset: today window starts at UTC midnight', () => {
  const w = presetWindow('today');
  assert.ok(typeof w.since === 'string' && w.since.endsWith('T00:00:00.000Z'));
  assert.ok(typeof w.until === 'string');
  assert.ok(new Date(w.since) <= new Date(w.until));
});

test('Date-range preset: yesterday window is the prior 24h block', () => {
  const w = presetWindow('yesterday');
  const sinceDt = new Date(w.since);
  const untilDt = new Date(w.until);
  const diffH = (untilDt - sinceDt) / (1000 * 60 * 60);
  assert.equal(diffH, 24);
});

test('Date-range preset: 7d window spans seven days', () => {
  const w = presetWindow('7d');
  const sinceDt = new Date(w.since);
  const untilDt = new Date(w.until);
  const diffH = (untilDt - sinceDt) / (1000 * 60 * 60);
  // Exactly 7 * 24h within a small slack for browsers that round.
  assert.ok(diffH >= 168 - 0.1 && diffH <= 168 + 0.1);
});

test('Date-range preset: 30d window spans thirty days', () => {
  const w = presetWindow('30d');
  const sinceDt = new Date(w.since);
  const untilDt = new Date(w.until);
  const diffH = (untilDt - sinceDt) / (1000 * 60 * 60);
  assert.ok(diffH >= 720 - 0.2 && diffH <= 720 + 0.2);
});

test('Date-range preset: default (12h) returns null+null to honour API default', () => {
  const w = presetWindow('12h');
  assert.equal(w.since, null);
  assert.equal(w.until, null);
});


// ── Source-grep contract ────────────────────────────────────────────────────


function pagesCoursesSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-courses.js'), 'utf8');
}


test('Source contract: pages-courses exports pgClinicianDailyDigest', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('export async function pgClinicianDailyDigest'));
  // Mount-time audit ping must fire.
  assert.ok(src.includes('postClinicianDigestAuditEvent'));
  // Per-action helpers wired.
  assert.ok(src.includes('clinicianDigestSummary'));
  assert.ok(src.includes('clinicianDigestSections'));
  assert.ok(src.includes('clinicianDigestEvents'));
  assert.ok(src.includes('clinicianDigestSendEmail'));
  assert.ok(src.includes('clinicianDigestShareColleague'));
  // Drill-out wiring.
  assert.ok(src.includes('cdg-drill-section-btn'));
  assert.ok(src.includes('cdg-drill-patient-btn'));
  assert.ok(src.includes('cdg-drill-event-btn'));
});


test('Source contract: empty-state copy is honest (no AI happy-talk)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('No events to summarise for this shift.'));
  assert.equal(/your shift was a triumph/i.test(src), false);
  assert.equal(/great job, on-call/i.test(src), false);
});


test('Source contract: digest renders DEMO banner + queued copy (not fabricated)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('Demo session.'));
  assert.ok(src.includes('not regulator-submittable'));
  // Honest about queued vs delivered status.
  assert.ok(src.includes('Email queued'));
  assert.ok(src.includes('SMTP wire-up'));
});

test('Source contract: scope note + shortcut table (no fake module counts)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('DIGEST_LIVE_READINESS'));
  assert.ok(/not autonomous diagnosis, prescribing, emergency triage, or treatment approval/i.test(src));
  assert.ok(src.includes('cdg-scope-note'));
  assert.ok(src.includes('Not yet aggregated into digest'));
  assert.ok(src.includes('Open module'));
  assert.ok(/navigation only/i.test(src));
});


function apiSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'api.js'), 'utf8');
}


test('Source contract: api.js exposes the clinician-digest helpers', () => {
  const src = apiSrc();
  assert.ok(src.includes('clinicianDigestSummary'));
  assert.ok(src.includes('clinicianDigestSections'));
  assert.ok(src.includes('clinicianDigestEvents'));
  assert.ok(src.includes('clinicianDigestSendEmail'));
  assert.ok(src.includes('clinicianDigestShareColleague'));
  assert.ok(src.includes('clinicianDigestExportCsvUrl'));
  assert.ok(src.includes('clinicianDigestExportNdjsonUrl'));
  assert.ok(src.includes('postClinicianDigestAuditEvent'));
});


function appJsSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'app.js'), 'utf8');
}


test('Source contract: app.js wires clinician-digest + daily-digest routes', () => {
  const src = appJsSrc();
  assert.ok(src.includes("case 'clinician-digest'"));
  assert.ok(src.includes("case 'daily-digest'"));
  assert.ok(src.includes('pgClinicianDailyDigest'));
});


test('Source contract: app.js NAV registers Clinician Digest sidebar entry', () => {
  const src = appJsSrc();
  assert.ok(src.includes("id: 'clinician-digest'"));
  assert.ok(src.includes("'Clinician Digest'"));
});
