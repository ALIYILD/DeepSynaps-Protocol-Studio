// Logic-only tests for the Clinician Wellness Hub launch-audit (2026-05-01).
//
// Bidirectional counterpart to the Patient Wellness tests landed in #345.
// Pins the cross-patient triage page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs check-in
//     mutations vs export pings)
//   - DEMO banner renders only when server returns is_demo_view=true
//   - Honest empty state — "No wellness check-ins pending review." —
//     renders when the server returns zero items (no AI-fabricated rows)
//   - KPI strip is summed from server payload, not invented
//   - Filter helpers strip blanks before posting to the server
//   - Note-required actions reject blank input
//   - Export URLs target the documented server endpoints, not blob URLs
//   - Group-by-patient aggregates per-group totals correctly + computes
//     per-axis 7-day averages without fabrication
//   - The pgClinicianWellnessHub block wires the helpers and audit ping
//
// Run: node --test src/clinician-wellness-hub-launch-audit.test.js
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
  if (extra.checkin_id) out.checkin_id = String(extra.checkin_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildFilterParams(filters) {
  const params = {};
  if (filters?.severity_band) params.severity_band = filters.severity_band;
  if (filters?.axis) params.axis = filters.axis;
  if (filters?.surface_chip) params.surface_chip = filters.surface_chip;
  if (filters?.clinician_status) params.clinician_status = filters.clinician_status;
  if (filters?.patient_id) params.patient_id = filters.patient_id;
  if (filters?.q) params.q = filters.q;
  return params;
}

function shouldShowDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

function shouldShowEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

function summaryAsRendered(serverSummaryResp) {
  if (!serverSummaryResp) {
    return {
      today: 0, weekly: 0, axesDown: 0,
      candidates: 0, response: 0,
      lowMoodTop: [], streakTop: [],
    };
  }
  return {
    today: Number(serverSummaryResp.total_today || 0),
    weekly: Number(serverSummaryResp.total_7d || 0),
    axesDown: Number(serverSummaryResp.axes_trending_down_7d || 0),
    candidates: Number(serverSummaryResp.escalation_candidates || 0),
    response: Number(serverSummaryResp.response_rate_pct || 0),
    lowMoodTop: Array.isArray(serverSummaryResp.low_mood_top_patients)
      ? serverSummaryResp.low_mood_top_patients : [],
    streakTop: Array.isArray(serverSummaryResp.missed_streak_top_patients)
      ? serverSummaryResp.missed_streak_top_patients : [],
  };
}

function csvExportPath() { return '/api/v1/clinician-wellness/checkins/export.csv'; }
function ndjsonExportPath() { return '/api/v1/clinician-wellness/checkins/export.ndjson'; }

function noteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

const AXIS_KEYS = ['mood', 'energy', 'sleep', 'anxiety', 'focus', 'pain'];

function axisAvg(items, axis) {
  const vals = items.map(it => it[axis]).filter(v => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function groupByPatient(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.patient_id || '_unknown';
    if (!map.has(key)) {
      map.set(key, {
        patient_id: key,
        patient_name: it.patient_name || key,
        items: [],
        total: 0,
        candidates: 0,
        escalated: 0,
        urgent: 0,
      });
    }
    const g = map.get(key);
    g.items.push(it);
    g.total += 1;
    if (it.escalation_candidate) g.candidates += 1;
    if (it.clinician_status === 'escalated') g.escalated += 1;
    if (it.severity_band === 'urgent') g.urgent += 1;
  }
  for (const g of map.values()) {
    g.axes_avg = {};
    for (const axis of AXIS_KEYS) {
      g.axes_avg[axis] = axisAvg(g.items, axis);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no checkin_id', () => {
  const p = buildAuditPayload('view', { note: 'hub mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.checkin_id, undefined);
  assert.equal(p.note, 'hub mount');
});

test('Audit payload: checkin-scoped event includes checkin_id', () => {
  const p = buildAuditPayload('checkin_viewed', { checkin_id: 'c-123', note: 'opened detail' });
  assert.equal(p.event, 'checkin_viewed');
  assert.equal(p.checkin_id, 'c-123');
  assert.equal(p.note, 'opened detail');
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
  assert.deepEqual(buildFilterParams({ severity_band: '', axis: '' }), {});
  assert.deepEqual(buildFilterParams({ severity_band: 'high' }), { severity_band: 'high' });
  assert.deepEqual(
    buildFilterParams({
      severity_band: 'urgent', axis: 'anxiety', surface_chip: 'side_effect',
      clinician_status: 'open', patient_id: 'p1', q: 'pain',
    }),
    {
      severity_band: 'urgent', axis: 'anxiety', surface_chip: 'side_effect',
      clinician_status: 'open', patient_id: 'p1', q: 'pain',
    },
  );
});


test('Demo banner: only on server is_demo_view=true', () => {
  assert.equal(shouldShowDemoBanner(null), false);
  assert.equal(shouldShowDemoBanner({ is_demo_view: false, items: [] }), false);
  assert.equal(shouldShowDemoBanner({ is_demo_view: true, items: [] }), true);
});


test('Empty state: rendered when server returns zero rows (no AI fakes)', () => {
  assert.equal(shouldShowEmptyState(null), true);
  assert.equal(shouldShowEmptyState({ items: [] }), true);
  assert.equal(shouldShowEmptyState({ items: [{ id: 'c1' }] }), false);
});


test('Summary: numbers come from server, not invented', () => {
  const s = summaryAsRendered({
    total_today: 7,
    total_7d: 42,
    axes_trending_down_7d: 3,
    escalation_candidates: 5,
    response_rate_pct: 83.3,
    low_mood_top_patients: [{ patient_id: 'p1', patient_name: 'Alice', avg_mood_7d: 2.1, checkins_7d: 5 }],
    missed_streak_top_patients: [{ patient_id: 'p2', patient_name: 'Bob', streak_days: 4 }],
  });
  assert.equal(s.today, 7);
  assert.equal(s.weekly, 42);
  assert.equal(s.axesDown, 3);
  assert.equal(s.candidates, 5);
  assert.equal(s.response, 83.3);
  assert.equal(s.lowMoodTop.length, 1);
  assert.equal(s.lowMoodTop[0].patient_id, 'p1');
  assert.equal(s.streakTop.length, 1);
  assert.equal(s.streakTop[0].streak_days, 4);
});


test('Summary: null payload → all zeros (no fabrication)', () => {
  const s = summaryAsRendered(null);
  assert.equal(s.today, 0);
  assert.equal(s.weekly, 0);
  assert.equal(s.axesDown, 0);
  assert.equal(s.candidates, 0);
  assert.equal(s.response, 0);
  assert.deepEqual(s.lowMoodTop, []);
  assert.deepEqual(s.streakTop, []);
});


test('Export URLs: documented server endpoints (no blobs)', () => {
  assert.equal(csvExportPath(), '/api/v1/clinician-wellness/checkins/export.csv');
  assert.equal(ndjsonExportPath(), '/api/v1/clinician-wellness/checkins/export.ndjson');
  assert.ok(csvExportPath().startsWith('/api/'));
  assert.ok(ndjsonExportPath().startsWith('/api/'));
});


test('Note-required guard: blank notes are rejected', () => {
  assert.equal(noteRequiredValid(''), false);
  assert.equal(noteRequiredValid('  '), false);
  assert.equal(noteRequiredValid(null), false);
  assert.equal(noteRequiredValid(undefined), false);
  assert.equal(noteRequiredValid('Reviewed; mood acceptable for week 3.'), true);
});


test('Group-by-patient: aggregates per-group totals correctly', () => {
  const items = [
    { id: 'c1', patient_id: 'p1', patient_name: 'Alice',
      mood: 4, anxiety: 8, severity_band: 'high', clinician_status: 'open',
      escalation_candidate: true },
    { id: 'c2', patient_id: 'p1', patient_name: 'Alice',
      mood: 9, anxiety: 9, severity_band: 'urgent', clinician_status: 'escalated',
      escalation_candidate: true },
    { id: 'c3', patient_id: 'p2', patient_name: 'Bob',
      mood: 6, anxiety: 4, severity_band: 'low', clinician_status: 'open',
      escalation_candidate: false },
  ];
  const grouped = groupByPatient(items);
  assert.equal(grouped.length, 2);
  // Alice has 2 items (sorted to top).
  assert.equal(grouped[0].patient_id, 'p1');
  assert.equal(grouped[0].total, 2);
  assert.equal(grouped[0].candidates, 2);
  assert.equal(grouped[0].escalated, 1);
  assert.equal(grouped[0].urgent, 1);
  // Bob has 1 item.
  assert.equal(grouped[1].patient_id, 'p2');
  assert.equal(grouped[1].total, 1);
  assert.equal(grouped[1].candidates, 0);
  assert.equal(grouped[1].urgent, 0);
});


test('Group-by-patient: empty list → empty groups', () => {
  assert.deepEqual(groupByPatient([]), []);
});


test('Group-by-patient: per-axis avg honest with NULL for missing data', () => {
  const items = [
    { id: 'c1', patient_id: 'p1', patient_name: 'Alice',
      mood: 4, anxiety: 8, sleep: null, energy: null, focus: null, pain: null },
    { id: 'c2', patient_id: 'p1', patient_name: 'Alice',
      mood: 6, anxiety: 4, sleep: null, energy: null, focus: null, pain: null },
  ];
  const g = groupByPatient(items);
  assert.equal(g.length, 1);
  // mood avg = 5; anxiety avg = 6; others null (all undefined data).
  assert.equal(g[0].axes_avg.mood, 5);
  assert.equal(g[0].axes_avg.anxiety, 6);
  assert.equal(g[0].axes_avg.sleep, null);
  assert.equal(g[0].axes_avg.energy, null);
  assert.equal(g[0].axes_avg.focus, null);
  assert.equal(g[0].axes_avg.pain, null);
});


// ── Source-grep contract ────────────────────────────────────────────────────


function pagesCoursesSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-courses.js'), 'utf8');
}


test('Source contract: pages-courses exports pgClinicianWellnessHub', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('export async function pgClinicianWellnessHub'));
  // Mount-time audit ping must fire.
  assert.ok(src.includes('postClinicianWellnessAuditEvent'));
  // Per-action helpers wired.
  assert.ok(src.includes('clinicianWellnessAcknowledge'));
  assert.ok(src.includes('clinicianWellnessEscalate'));
  assert.ok(src.includes('clinicianWellnessResolve'));
  assert.ok(src.includes('clinicianWellnessBulkAcknowledge'));
  // Drill-out helpers must navigate to patient profile, AE Hub, and the
  // adherence hub (correlate wellness with adherence).
  assert.ok(src.includes('cwh-drill-patient-btn'));
  assert.ok(src.includes('cwh-drill-ae-btn'));
  assert.ok(src.includes('cwh-drill-adherence-btn'));
});


test('Source contract: empty-state copy is honest (no AI happy-talk)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('No wellness check-ins pending review.'));
  // Must NOT have invented "your clinic is doing great" / generic AI-positive copy.
  assert.equal(/your clinic is doing great/i.test(src), false);
});


test('Source contract: hub renders DEMO banner + disclaimers (not fabricated)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('Demo data.'));
  assert.ok(src.includes('not regulator-submittable'));
  assert.ok(src.includes('not AI-fabricated'));
});


function apiSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'api.js'), 'utf8');
}


test('Source contract: api.js exposes the clinician-wellness helpers', () => {
  const src = apiSrc();
  assert.ok(src.includes('clinicianWellnessList'));
  assert.ok(src.includes('clinicianWellnessSummary'));
  assert.ok(src.includes('clinicianWellnessGetCheckin'));
  assert.ok(src.includes('clinicianWellnessAcknowledge'));
  assert.ok(src.includes('clinicianWellnessEscalate'));
  assert.ok(src.includes('clinicianWellnessResolve'));
  assert.ok(src.includes('clinicianWellnessBulkAcknowledge'));
  assert.ok(src.includes('clinicianWellnessExportCsvUrl'));
  assert.ok(src.includes('clinicianWellnessExportNdjsonUrl'));
  assert.ok(src.includes('postClinicianWellnessAuditEvent'));
});


function appJsSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'app.js'), 'utf8');
}


test('Source contract: app.js wires clinician-wellness + wellness-hub routes', () => {
  const src = appJsSrc();
  assert.ok(src.includes("case 'clinician-wellness'"));
  assert.ok(src.includes("case 'wellness-hub'"));
  assert.ok(src.includes('pgClinicianWellnessHub'));
});
