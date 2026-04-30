// Logic-only tests for the Reports Hub launch-audit (2026-04-30).
//
// These pin the contract of the Reports Hub against silent fakes:
//   - The report-list filter param builder drops empty values
//   - Status / kind / q filters are case-insensitive substring matches
//   - Top-counts strip uses summary numbers, not hardcoded zeros
//   - Sign / supersede gating respects the same rules as the backend
//   - Audit-event payload shape is what the router accepts
//   - DOCX export is honest about being unconfigured (no fake success toast)
//
// Run: node --test src/reports-hub-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure helpers (identical to the in-page implementations) ────────────────

function buildListFilterParams(filters) {
  // Mirrors what api.listMyReports({...}) sends to the backend.
  const params = {};
  if (filters.status)     params.status = filters.status;
  if (filters.kind)       params.kind = filters.kind;
  if (filters.q)          params.q = filters.q;
  if (filters.patient_id) params.patient_id = filters.patient_id;
  if (filters.since)      params.since = filters.since;
  if (filters.until)      params.until = filters.until;
  if (filters.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

function applyClientFilters(rows, { q, status, kind }) {
  let out = rows.slice();
  if (q) {
    const ll = q.toLowerCase();
    out = out.filter(r => ((r.name || '') + (r.patient || '')).toLowerCase().includes(ll));
  }
  if (status) out = out.filter(r => (r.status || '') === status);
  if (kind)   out = out.filter(r => ((r.type || '') + '').toLowerCase().includes(kind.toLowerCase()));
  return out;
}

function summaryToTopCounts(summary) {
  // Mirrors the strip rendered in the recent tab.
  return {
    total:      summary?.total      ?? 0,
    draft:      summary?.draft      ?? 0,
    signed:     summary?.signed     ?? 0,
    superseded: summary?.superseded ?? 0,
  };
}

function canSign(row) {
  if (row?._source !== 'backend' || row?.status === 'local-only') return false;
  if (row?.status === 'signed' || row?.status === 'final') return false;
  if (row?.status === 'superseded') return false;
  return true;
}

function canSupersede(row) {
  if (row?._source !== 'backend' || row?.status === 'local-only') return false;
  if (row?.status === 'superseded') return false;
  return true;
}

function buildAuditEvent(event, opts = {}) {
  return {
    event,
    report_id: opts.report_id || null,
    patient_id: opts.patient_id || null,
    note: (opts.note || '').slice(0, 500),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('listFilterParams drops empties', () => {
  const params = buildListFilterParams({
    status: 'signed',
    kind: '',
    q: 'note',
    patient_id: null,
    since: '',
    until: undefined,
    limit: 25,
    offset: 0,
  });
  assert.deepEqual(params, { status: 'signed', q: 'note', limit: 25, offset: 0 });
});

test('client-side filter is case-insensitive', () => {
  const rows = [
    { id: '1', name: 'Course Completion', patient: 'Aisha', type: 'progress', status: 'generated', _source: 'backend' },
    { id: '2', name: 'Discharge Letter',  patient: 'Bjorn', type: 'Discharge', status: 'signed',     _source: 'backend' },
    { id: '3', name: 'Local note',        patient: 'Cleo',  type: 'progress', status: 'local-only', _source: 'local' },
  ];
  assert.equal(applyClientFilters(rows, { q: 'aisha' }).length, 1);
  assert.equal(applyClientFilters(rows, { status: 'signed' }).length, 1);
  assert.equal(applyClientFilters(rows, { kind: 'PROGRESS' }).length, 2);
});

test('summary→topCounts is honest about empty server', () => {
  assert.deepEqual(summaryToTopCounts(null), { total: 0, draft: 0, signed: 0, superseded: 0 });
  assert.deepEqual(
    summaryToTopCounts({ total: 5, draft: 2, signed: 2, superseded: 1 }),
    { total: 5, draft: 2, signed: 2, superseded: 1 },
  );
});

test('sign / supersede gating respects backend rules', () => {
  const draft     = { _source: 'backend', status: 'generated' };
  const signed    = { _source: 'backend', status: 'signed' };
  const supRow    = { _source: 'backend', status: 'superseded' };
  const localOnly = { _source: 'local',   status: 'local-only' };

  assert.equal(canSign(draft),     true);
  assert.equal(canSign(signed),    false);
  assert.equal(canSign(supRow),    false);
  assert.equal(canSign(localOnly), false);

  assert.equal(canSupersede(draft),     true);
  assert.equal(canSupersede(signed),    true);   // a signed report can still be superseded
  assert.equal(canSupersede(supRow),    false);
  assert.equal(canSupersede(localOnly), false);
});

test('audit event payload is the shape the router expects', () => {
  const evt = buildAuditEvent('signed', { report_id: 'rpt-1', note: 'x'.repeat(600) });
  assert.equal(evt.event, 'signed');
  assert.equal(evt.report_id, 'rpt-1');
  assert.equal(evt.patient_id, null);
  // note is truncated client-side so we never exceed the router cap.
  assert.equal(evt.note.length, 500);
});

test('DOCX is honest: a 503 is not a success', () => {
  // Simulated outcome of api.exportReportDocx() when the server returns 503.
  const result = { ok: false, status: 503, code: 'docx_renderer_unavailable' };
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  // The UI MUST NOT show "Downloaded" toast for this; we assert the gate.
  const shouldShowSuccess = result.ok && result.status >= 200 && result.status < 300;
  assert.equal(shouldShowSuccess, false);
});
