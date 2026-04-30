// Logic-only tests for the IRB Manager launch-audit (2026-04-30).
//
// These pin the contract of the IRB Manager page against silent fakes:
//   - The protocol-list filter param builder drops empty values
//   - Top-counts strip uses summary numbers, not hardcoded zeros
//   - Drill-out URL composition (patients-hub / documents-hub / adverse-events)
//   - Demo detection (UI banner + export prefix)
//   - Audit-event payload shape is what the router accepts
//   - Closed protocol immutability is enforced client-side in addition to API
//
// Run: node --test src/irb-manager-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure helpers (mirror the in-page implementations) ─────────────────────

function buildListFilterParams(filters) {
  // Mirrors what api.listIrbProtocols({...}) sends to the backend.
  // Empty / null / undefined values are dropped so they don't pollute the
  // server-side filter (the backend ignores them but it keeps URLs honest).
  const params = {};
  if (filters.status)      params.status = filters.status;
  if (filters.phase)       params.phase = filters.phase;
  if (filters.risk_level)  params.risk_level = filters.risk_level;
  if (filters.pi_user_id)  params.pi_user_id = filters.pi_user_id;
  if (filters.q)           params.q = filters.q;
  if (filters.since)       params.since = filters.since;
  if (filters.until)       params.until = filters.until;
  if (filters.limit  != null && filters.limit  !== '') params.limit  = filters.limit;
  if (filters.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

function summaryToTopCounts(summary) {
  // Mirrors the strip rendered above the protocol list.
  return {
    total:           summary?.total           ?? 0,
    active:          summary?.active          ?? 0,
    pending:         summary?.pending         ?? 0,
    closed:          summary?.closed          ?? 0,
    amendments_due:  summary?.amendments_due  ?? 0,
    expiring_30d:    summary?.expiring_within_30d ?? 0,
    expired:         summary?.expired         ?? 0,
  };
}

function drillOutUrl(target, protocolId) {
  // Cross-surface drill-out targets:
  //   - enrolled patients → patients-hub filtered by protocol_id
  //   - consent docs       → documents-hub filtered by source_target
  //   - adverse events     → adverse-events filtered by protocol_id
  if (!protocolId) return null;
  const p = encodeURIComponent(protocolId);
  if (target === 'patients')        return `?page=patients-hub&protocol_id=${p}`;
  if (target === 'documents')       return `?page=documents-hub&source_target_type=irb_manager&source_target_id=${p}`;
  if (target === 'adverse_events')  return `?page=adverse-events&protocol_id=${p}`;
  return null;
}

function isDemoExportText(text) {
  // CSV exports are prefixed with `# DEMO …` when any row is demo. The first
  // line of an NDJSON export is `{"_meta":"DEMO", …}` in the same case.
  if (!text) return false;
  if (text.startsWith('# DEMO')) return true;
  const firstLine = (text.split('\n').find(l => l.trim().length > 0) || '').trim();
  if (firstLine.startsWith('{')) {
    try {
      const obj = JSON.parse(firstLine);
      if (obj && obj._meta === 'DEMO') return true;
    } catch (_) {}
  }
  return false;
}

function buildAuditEvent(event, opts = {}) {
  return {
    event,
    protocol_id: opts.protocol_id || null,
    note: (opts.note || '').slice(0, 500),
    using_demo_data: !!opts.using_demo_data,
  };
}

function canEditProtocol(row) {
  // Closed protocols are immutable in-place — match the backend's 409 rule.
  if (!row) return false;
  if (row.status === 'closed') return false;
  return true;
}

function canCloseProtocol(row) {
  if (!row) return false;
  if (row.status === 'closed') return false;
  return true;
}

function canReopenProtocol(row) {
  return row && row.status === 'closed';
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('listFilterParams drops empties', () => {
  const params = buildListFilterParams({
    status: 'active',
    phase: '',
    risk_level: 'minimal',
    pi_user_id: null,
    q: 'theta',
    since: '',
    until: undefined,
    limit: 25,
    offset: 0,
  });
  assert.deepEqual(params, {
    status: 'active',
    risk_level: 'minimal',
    q: 'theta',
    limit: 25,
    offset: 0,
  });
});

test('summary→topCounts is honest about empty server', () => {
  assert.deepEqual(summaryToTopCounts(null), {
    total: 0,
    active: 0,
    pending: 0,
    closed: 0,
    amendments_due: 0,
    expiring_30d: 0,
    expired: 0,
  });
  assert.deepEqual(
    summaryToTopCounts({
      total: 8,
      active: 4,
      pending: 2,
      closed: 2,
      amendments_due: 1,
      expiring_within_30d: 1,
      expired: 0,
    }),
    {
      total: 8,
      active: 4,
      pending: 2,
      closed: 2,
      amendments_due: 1,
      expiring_30d: 1,
      expired: 0,
    },
  );
});

test('drillOutUrl composes encoded protocol_id for each surface', () => {
  // The filter handoff is the regulator-credible loop: a protocol drills
  // into patients/documents/adverse-events without losing identity.
  assert.equal(
    drillOutUrl('patients', 'p 1'),
    '?page=patients-hub&protocol_id=p%201',
  );
  assert.equal(
    drillOutUrl('documents', 'p1'),
    '?page=documents-hub&source_target_type=irb_manager&source_target_id=p1',
  );
  assert.equal(
    drillOutUrl('adverse_events', 'p1'),
    '?page=adverse-events&protocol_id=p1',
  );
  assert.equal(drillOutUrl('patients', null), null);
  assert.equal(drillOutUrl('unknown', 'p1'), null);
});

test('demo detection covers CSV and NDJSON exports', () => {
  assert.equal(isDemoExportText(''), false);
  assert.equal(isDemoExportText('id,title\n123,foo'), false);
  assert.equal(
    isDemoExportText('# DEMO — at least one row…\nid,title\n1,a'),
    true,
  );
  assert.equal(
    isDemoExportText('{"_meta":"DEMO","warning":"demo"}\n{"id":"1"}\n'),
    true,
  );
  assert.equal(
    isDemoExportText('{"id":"1"}\n{"id":"2"}\n'),
    false,
  );
});

test('audit event shape matches /audit-events router contract', () => {
  // Backend router accepts: event (string, ≤120), protocol_id (≤64),
  // note (≤1024), using_demo_data (bool). Our builder must round-trip.
  const ev = buildAuditEvent('filter_changed', {
    protocol_id: 'proto-1',
    note: 'status=active',
    using_demo_data: false,
  });
  assert.deepEqual(ev, {
    event: 'filter_changed',
    protocol_id: 'proto-1',
    note: 'status=active',
    using_demo_data: false,
  });

  // Note truncation honours the 500-char client cap that mirrors the
  // server-side note slice in the router.
  const longNote = 'a'.repeat(900);
  const ev2 = buildAuditEvent('list_viewed', { note: longNote });
  assert.equal(ev2.note.length, 500);

  // Defaults are honest — no fake protocol_id when missing.
  const ev3 = buildAuditEvent('page_loaded');
  assert.equal(ev3.protocol_id, null);
  assert.equal(ev3.using_demo_data, false);
});

test('closed protocols are immutable client-side too', () => {
  const open    = { status: 'active' };
  const pending = { status: 'pending' };
  const closed  = { status: 'closed' };

  assert.equal(canEditProtocol(open),    true);
  assert.equal(canEditProtocol(pending), true);
  assert.equal(canEditProtocol(closed),  false);

  assert.equal(canCloseProtocol(open),    true);
  assert.equal(canCloseProtocol(closed),  false);

  assert.equal(canReopenProtocol(closed), true);
  assert.equal(canReopenProtocol(open),   false);
});

test('filter encoding round-trips through URLSearchParams', () => {
  const params = buildListFilterParams({
    status: 'active',
    phase: 'iii',
    q: 'iTBS for TRD',
  });
  const qs = new URLSearchParams(params).toString();
  // URLSearchParams should percent-encode the space + value, not lose data.
  assert.match(qs, /status=active/);
  assert.match(qs, /phase=iii/);
  // %20 OR + are both valid space encodings; URLSearchParams uses +.
  assert.ok(qs.includes('q=iTBS+for+TRD') || qs.includes('q=iTBS%20for%20TRD'),
    `expected encoded q in: ${qs}`);
});
