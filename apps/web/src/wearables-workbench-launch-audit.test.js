// Logic-only tests for the Wearables Workbench launch-audit (2026-05-01).
//
// Bidirectional counterpart to the Patient Wearables tests landed in
// #352. Pins the clinician triage page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs flag
//     mutations vs export pings)
//   - DEMO banner renders only when server returns is_demo_view=true
//   - Honest empty state — "No alert flags pending review." — renders
//     when the server returns zero items (no AI-fabricated rows)
//   - KPI strip is summed from server payload, not invented
//   - Filter helpers strip blanks before posting to the server
//   - Note-required actions reject blank input
//   - Export URLs target the documented server endpoints, not blob URLs
//   - The pgMonitor block wires the workbench helpers and the audit ping
//
// Run: node --test src/wearables-workbench-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-monitor.js) ───


function buildAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.flag_id) out.flag_id = String(extra.flag_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildFilterParams(filters) {
  const params = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.severity) params.severity = filters.severity;
  return params;
}

function shouldShowDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

function shouldShowEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

function summaryTotal(serverSummaryResp) {
  if (!serverSummaryResp) return 0;
  return Number(serverSummaryResp.open || 0)
    + Number(serverSummaryResp.acknowledged || 0)
    + Number(serverSummaryResp.escalated || 0)
    + Number(serverSummaryResp.resolved || 0);
}

function csvExportPath() {
  return '/api/v1/wearables/workbench/flags/export.csv';
}

function ndjsonExportPath() {
  return '/api/v1/wearables/workbench/flags/export.ndjson';
}

function noteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload: view ping has no flag_id', () => {
  const p = buildAuditPayload('view', { note: 'monitor mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.flag_id, undefined);
  assert.equal(p.note, 'monitor mount');
});

test('Audit payload: flag-scoped event includes flag_id', () => {
  const p = buildAuditPayload('flag_viewed', { flag_id: 'f-123', note: 'opened detail' });
  assert.equal(p.event, 'flag_viewed');
  assert.equal(p.flag_id, 'f-123');
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
  assert.deepEqual(buildFilterParams({ status: '', severity: '' }), {});
  assert.deepEqual(buildFilterParams({ status: 'open' }), { status: 'open' });
  assert.deepEqual(
    buildFilterParams({ status: 'acknowledged', severity: 'urgent' }),
    { status: 'acknowledged', severity: 'urgent' },
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
  assert.equal(shouldShowEmptyState({ items: [{ id: 'f1' }] }), false);
});


test('Summary total: sums all four states (no fabrication)', () => {
  assert.equal(summaryTotal(null), 0);
  assert.equal(summaryTotal({ open: 2, acknowledged: 1, escalated: 0, resolved: 5 }), 8);
});


test('Export URLs: documented server endpoints (no blobs)', () => {
  assert.equal(csvExportPath(), '/api/v1/wearables/workbench/flags/export.csv');
  assert.equal(ndjsonExportPath(), '/api/v1/wearables/workbench/flags/export.ndjson');
  // Sanity: blob URLs would start with 'blob:' — these MUST be server paths.
  assert.ok(csvExportPath().startsWith('/api/'));
  assert.ok(ndjsonExportPath().startsWith('/api/'));
});


test('Note-required guard: blank notes are rejected', () => {
  assert.equal(noteRequiredValid(''), false);
  assert.equal(noteRequiredValid('  '), false);
  assert.equal(noteRequiredValid(null), false);
  assert.equal(noteRequiredValid(undefined), false);
  assert.equal(noteRequiredValid('Reviewed device sync'), true);
});


// ── Source-grep contract ────────────────────────────────────────────────────


function pagesMonitorSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-monitor.js'), 'utf8');
}


test('Source contract: pages-monitor wires the wearables-workbench tab', () => {
  const src = pagesMonitorSrc();
  // The new tab id must be in the validTabs set.
  assert.ok(src.includes("'wearables-workbench'"));
  // Render path must invoke the workbench renderer.
  assert.ok(src.includes('renderWorkbench'));
  // pgMonitor must call the audit ping at mount.
  assert.ok(src.includes("postWearablesWorkbenchAuditEvent"));
  // Acknowledge / escalate / resolve helpers must exist.
  assert.ok(src.includes('_workbenchAcknowledge'));
  assert.ok(src.includes('_workbenchEscalate'));
  assert.ok(src.includes('_workbenchResolve'));
  // Drill-out helpers must navigate to patient profile + AE Hub.
  assert.ok(src.includes('_workbenchOpenPatient'));
  assert.ok(src.includes('_workbenchOpenAe'));
});


test('Source contract: empty-state copy is honest (no AI happy-talk)', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('No alert flags pending review.'));
  assert.ok(src.includes('Empty queue does not mean clinically cleared'));
  // We must NOT have invented "your clinic is doing great" style copy
  // anywhere in the workbench surface.
  assert.equal(/your clinic is doing great/i.test(src), false);
});


test('Source contract: workbench loader has localStorage-fallback honesty', () => {
  const src = pagesMonitorSrc();
  // The loader must seed an honest empty payload (zeros) when the API
  // returns nothing — never fabricate alert rows on offline.
  assert.ok(src.includes('open: 0'));
  assert.ok(src.includes('items: []'));
});


function apiSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'api.js'), 'utf8');
}


test('Source contract: api.js exposes the workbench helpers', () => {
  const src = apiSrc();
  assert.ok(src.includes('wearablesWorkbenchListFlags'));
  assert.ok(src.includes('wearablesWorkbenchSummary'));
  assert.ok(src.includes('wearablesWorkbenchAcknowledge'));
  assert.ok(src.includes('wearablesWorkbenchEscalate'));
  assert.ok(src.includes('wearablesWorkbenchResolve'));
  assert.ok(src.includes('wearablesWorkbenchExportCsvUrl'));
  assert.ok(src.includes('wearablesWorkbenchExportNdjsonUrl'));
  assert.ok(src.includes('postWearablesWorkbenchAuditEvent'));
});
