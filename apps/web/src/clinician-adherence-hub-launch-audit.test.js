// Logic-only tests for the Clinician Adherence Hub launch-audit (2026-05-01).
//
// Bidirectional counterpart to the Patient Adherence Events tests landed in
// #350. Pins the cross-patient triage page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs event
//     mutations vs export pings)
//   - DEMO banner renders only when server returns is_demo_view=true
//   - Honest empty state — "No adherence events pending review." —
//     renders when the server returns zero items (no AI-fabricated rows)
//   - KPI strip is summed from server payload, not invented
//   - Filter helpers strip blanks before posting to the server
//   - Note-required actions reject blank input
//   - Export URLs target the documented server endpoints, not blob URLs
//   - Group-by-patient aggregates per-group totals correctly
//   - The pgClinicianAdherenceHub block wires the helpers and audit ping
//
// Run: node --test src/clinician-adherence-hub-launch-audit.test.js
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
  if (extra.event_record_id) out.event_record_id = String(extra.event_record_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildFilterParams(filters) {
  const params = {};
  if (filters?.severity) params.severity = filters.severity;
  if (filters?.status) params.status = filters.status;
  if (filters?.surface_chip) params.surface_chip = filters.surface_chip;
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
  if (!serverSummaryResp) return { today: 0, weekly: 0, sideEffects: 0, escalated: 0, sae: 0, response: 0 };
  return {
    today: Number(serverSummaryResp.total_today || 0),
    weekly: Number(serverSummaryResp.total_7d || 0),
    sideEffects: Number(serverSummaryResp.side_effects_7d || 0),
    escalated: Number(serverSummaryResp.escalated_7d || 0),
    sae: Number(serverSummaryResp.sae_flagged || 0),
    response: Number(serverSummaryResp.response_rate_pct || 0),
  };
}

function csvExportPath() { return '/api/v1/clinician-adherence/events/export.csv'; }
function ndjsonExportPath() { return '/api/v1/clinician-adherence/events/export.ndjson'; }

function noteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
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
        side_effects: 0,
        escalated: 0,
        sae: 0,
      });
    }
    const g = map.get(key);
    g.items.push(it);
    g.total += 1;
    if (it.event_type === 'side_effect') g.side_effects += 1;
    if (it.status === 'escalated') g.escalated += 1;
    if (it.event_type === 'side_effect' && it.severity === 'urgent') g.sae += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no event_record_id', () => {
  const p = buildAuditPayload('view', { note: 'hub mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.event_record_id, undefined);
  assert.equal(p.note, 'hub mount');
});

test('Audit payload: event-scoped event includes event_record_id', () => {
  const p = buildAuditPayload('event_viewed', { event_record_id: 'e-123', note: 'opened detail' });
  assert.equal(p.event, 'event_viewed');
  assert.equal(p.event_record_id, 'e-123');
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
  assert.deepEqual(buildFilterParams({ severity: '', status: '' }), {});
  assert.deepEqual(buildFilterParams({ severity: 'urgent' }), { severity: 'urgent' });
  assert.deepEqual(
    buildFilterParams({ status: 'open', severity: 'high', surface_chip: 'side_effect', patient_id: 'p1', q: 'pain' }),
    { status: 'open', severity: 'high', surface_chip: 'side_effect', patient_id: 'p1', q: 'pain' },
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
  assert.equal(shouldShowEmptyState({ items: [{ id: 'e1' }] }), false);
});


test('Summary: numbers come from server, not invented', () => {
  const s = summaryAsRendered({
    total_today: 7,
    total_7d: 42,
    side_effects_7d: 5,
    escalated_7d: 2,
    sae_flagged: 1,
    response_rate_pct: 83.3,
  });
  assert.equal(s.today, 7);
  assert.equal(s.weekly, 42);
  assert.equal(s.sideEffects, 5);
  assert.equal(s.escalated, 2);
  assert.equal(s.sae, 1);
  assert.equal(s.response, 83.3);
});


test('Summary: null payload → all zeros (no fabrication)', () => {
  const s = summaryAsRendered(null);
  assert.equal(s.today, 0);
  assert.equal(s.weekly, 0);
  assert.equal(s.sideEffects, 0);
  assert.equal(s.escalated, 0);
  assert.equal(s.sae, 0);
  assert.equal(s.response, 0);
});


test('Export URLs: documented server endpoints (no blobs)', () => {
  assert.equal(csvExportPath(), '/api/v1/clinician-adherence/events/export.csv');
  assert.equal(ndjsonExportPath(), '/api/v1/clinician-adherence/events/export.ndjson');
  assert.ok(csvExportPath().startsWith('/api/'));
  assert.ok(ndjsonExportPath().startsWith('/api/'));
});


test('Note-required guard: blank notes are rejected', () => {
  assert.equal(noteRequiredValid(''), false);
  assert.equal(noteRequiredValid('  '), false);
  assert.equal(noteRequiredValid(null), false);
  assert.equal(noteRequiredValid(undefined), false);
  assert.equal(noteRequiredValid('Reviewed; patient confirmed.'), true);
});


test('Group-by-patient: aggregates per-group totals correctly', () => {
  const items = [
    { id: 'e1', patient_id: 'p1', patient_name: 'Alice', event_type: 'adherence_report', status: 'open' },
    { id: 'e2', patient_id: 'p1', patient_name: 'Alice', event_type: 'side_effect', severity: 'urgent', status: 'escalated' },
    { id: 'e3', patient_id: 'p2', patient_name: 'Bob', event_type: 'side_effect', severity: 'high', status: 'open' },
  ];
  const grouped = groupByPatient(items);
  assert.equal(grouped.length, 2);
  // Alice has 2 items (sorted to top).
  assert.equal(grouped[0].patient_id, 'p1');
  assert.equal(grouped[0].total, 2);
  assert.equal(grouped[0].side_effects, 1);
  assert.equal(grouped[0].escalated, 1);
  assert.equal(grouped[0].sae, 1);
  // Bob has 1 item.
  assert.equal(grouped[1].patient_id, 'p2');
  assert.equal(grouped[1].total, 1);
  assert.equal(grouped[1].side_effects, 1);
  assert.equal(grouped[1].sae, 0); // severity high, not urgent
});


test('Group-by-patient: empty list → empty groups', () => {
  assert.deepEqual(groupByPatient([]), []);
});


// ── Source-grep contract ────────────────────────────────────────────────────


function pagesCoursesSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-courses.js'), 'utf8');
}


test('Source contract: pages-courses exports pgClinicianAdherenceHub', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('export async function pgClinicianAdherenceHub'));
  // Mount-time audit ping must fire.
  assert.ok(src.includes('postClinicianAdherenceAuditEvent'));
  // Per-action helpers wired.
  assert.ok(src.includes('clinicianAdherenceAcknowledge'));
  assert.ok(src.includes('clinicianAdherenceEscalate'));
  assert.ok(src.includes('clinicianAdherenceResolve'));
  assert.ok(src.includes('clinicianAdherenceBulkAcknowledge'));
  // Drill-out helpers must navigate to patient profile + AE Hub.
  assert.ok(src.includes('cah-drill-patient-btn'));
  assert.ok(src.includes('cah-drill-ae-btn'));
});


test('Source contract: empty-state copy is honest (no AI happy-talk)', () => {
  const src = pagesCoursesSrc();
  assert.ok(src.includes('No adherence events pending review.'));
  // Must NOT have invented "your clinic is doing great" style copy.
  assert.equal(/your clinic is doing great/i.test(src), false);
});


test('Source contract: hub renders DEMO banner + disclaimers (not fabricated)', () => {
  const src = pagesCoursesSrc();
  // DEMO banner only on server is_demo_view; honest disclaimer about data source.
  assert.ok(src.includes('Demo data.'));
  assert.ok(src.includes('not regulator-submittable'));
  // Honest counts copy — counts come from API, not AI scoring.
  assert.ok(src.includes('not AI-fabricated'));
});


function apiSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'api.js'), 'utf8');
}


test('Source contract: api.js exposes the clinician-adherence helpers', () => {
  const src = apiSrc();
  assert.ok(src.includes('clinicianAdherenceList'));
  assert.ok(src.includes('clinicianAdherenceSummary'));
  assert.ok(src.includes('clinicianAdherenceGetEvent'));
  assert.ok(src.includes('clinicianAdherenceAcknowledge'));
  assert.ok(src.includes('clinicianAdherenceEscalate'));
  assert.ok(src.includes('clinicianAdherenceResolve'));
  assert.ok(src.includes('clinicianAdherenceBulkAcknowledge'));
  assert.ok(src.includes('clinicianAdherenceExportCsvUrl'));
  assert.ok(src.includes('clinicianAdherenceExportNdjsonUrl'));
  assert.ok(src.includes('postClinicianAdherenceAuditEvent'));
});


function appJsSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'app.js'), 'utf8');
}


test('Source contract: app.js wires clinician-adherence + adherence-hub routes', () => {
  const src = appJsSrc();
  assert.ok(src.includes("case 'clinician-adherence'"));
  assert.ok(src.includes("case 'adherence-hub'"));
  assert.ok(src.includes('pgClinicianAdherenceHub'));
});
