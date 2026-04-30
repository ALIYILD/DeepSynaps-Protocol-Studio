// Logic-only tests for the Clinical Trials launch-audit (2026-04-30).
//
// These pin the contract of the Clinical Trials hub against silent fakes:
//   - The trial-list filter param builder drops empty values
//   - Top counts use the API summary shape, not hardcoded zeros
//   - Drill-out URL composition (IRB protocol / patients-hub / documents-hub
//     / adverse-events / reports-hub)
//   - Demo detection (UI banner + export prefix)
//   - Audit-event payload shape is what the router accepts
//   - Closed trial immutability is enforced client-side too
//   - Trials are NOT reopenable client-side (matches server contract)
//
// Run: node --test src/clinical-trials-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure helpers (mirror the in-page implementations) ─────────────────────

function buildListFilterParams(filters) {
  // Mirrors what api.listClinicalTrials({...}) sends to the backend.
  // Empty / null / undefined values are dropped so they don't pollute the
  // server-side filter.
  const params = {};
  if (filters.status)            params.status = filters.status;
  if (filters.phase)             params.phase = filters.phase;
  if (filters.site_id)           params.site_id = filters.site_id;
  if (filters.pi_user_id)        params.pi_user_id = filters.pi_user_id;
  if (filters.nct_number)        params.nct_number = filters.nct_number;
  if (filters.irb_protocol_id)   params.irb_protocol_id = filters.irb_protocol_id;
  if (filters.q)                 params.q = filters.q;
  if (filters.since)             params.since = filters.since;
  if (filters.until)             params.until = filters.until;
  if (filters.limit  != null && filters.limit  !== '') params.limit  = filters.limit;
  if (filters.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

function summaryToTopCounts(summary) {
  // Mirrors the strip rendered above the trial list.
  return {
    total:            summary?.total            ?? 0,
    active:           summary?.active           ?? 0,
    recruiting:       summary?.recruiting       ?? 0,
    paused:           summary?.paused           ?? 0,
    closed:           summary?.closed           ?? 0,
    completed:        summary?.completed        ?? 0,
    terminated:       summary?.terminated       ?? 0,
    planning:         summary?.planning         ?? 0,
    enrollment_open:  summary?.enrollment_open  ?? 0,
    sae_flagged:      summary?.sae_flagged      ?? 0,
    pending_irb:      summary?.pending_irb      ?? 0,
    demo_rows:        summary?.demo_rows        ?? 0,
  };
}

function drillOutUrl(target, ids) {
  // Cross-surface drill-out targets:
  //   - irb_manager       → IRB protocol detail (?protocol_id=…)
  //   - patients          → patients-hub filtered by trial_id
  //   - documents         → documents-hub filtered by source_target
  //   - adverse_events    → adverse-events filtered by trial_id
  //   - reports           → reports-hub filtered by trial_id
  if (!ids || (!ids.trial_id && !ids.protocol_id)) return null;
  const t = ids.trial_id ? encodeURIComponent(ids.trial_id) : '';
  const p = ids.protocol_id ? encodeURIComponent(ids.protocol_id) : '';
  if (target === 'irb_manager') {
    if (!p) return null;
    return `?page=irb-manager&protocol_id=${p}`;
  }
  if (target === 'patients') {
    if (!t) return null;
    return `?page=patients-hub&trial_id=${t}`;
  }
  if (target === 'documents') {
    if (!t) return null;
    return `?page=documents-hub&source_target_type=clinical_trials&source_target_id=${t}`;
  }
  if (target === 'adverse_events') {
    if (!t) return null;
    return `?page=adverse-events&trial_id=${t}`;
  }
  if (target === 'reports') {
    if (!t) return null;
    return `?page=reports-hub&trial_id=${t}`;
  }
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
    trial_id: opts.trial_id || null,
    note: (opts.note || '').slice(0, 500),
    using_demo_data: !!opts.using_demo_data,
  };
}

function canEditTrial(row) {
  // Closed/completed/terminated trials are immutable in-place.
  if (!row) return false;
  if (['closed', 'completed', 'terminated'].includes(row.status)) return false;
  return true;
}

function canCloseTrial(row) {
  if (!row) return false;
  if (['closed', 'completed', 'terminated'].includes(row.status)) return false;
  return true;
}

function canReopenTrial(row) {
  // Trials are explicitly NOT reopenable — distinct from IRB protocols.
  // This is the documented contract; reopen would re-introduce statistical
  // ambiguity. Operators must register a new trial if the study restarts.
  return false;
}

function canPauseTrial(row) {
  if (!row) return false;
  if (['closed', 'completed', 'terminated', 'paused', 'planning'].includes(row.status)) return false;
  return true;
}

function canResumeTrial(row) {
  return row && row.status === 'paused';
}

function canEnroll(row) {
  if (!row) return false;
  // Enrollment requires open status (recruiting/active). planning and paused
  // and terminal states block.
  return row.status === 'recruiting' || row.status === 'active';
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('listFilterParams drops empties', () => {
  const params = buildListFilterParams({
    status: 'active',
    phase: '',
    pi_user_id: null,
    nct_number: 'NCT11111111',
    site_id: '',
    q: 'theta',
    since: '',
    until: undefined,
    limit: 25,
    offset: 0,
  });
  assert.deepEqual(params, {
    status: 'active',
    nct_number: 'NCT11111111',
    q: 'theta',
    limit: 25,
    offset: 0,
  });
});

test('summary→topCounts is honest about empty server', () => {
  assert.deepEqual(summaryToTopCounts(null), {
    total: 0,
    active: 0,
    recruiting: 0,
    paused: 0,
    closed: 0,
    completed: 0,
    terminated: 0,
    planning: 0,
    enrollment_open: 0,
    sae_flagged: 0,
    pending_irb: 0,
    demo_rows: 0,
  });
  assert.deepEqual(
    summaryToTopCounts({
      total: 8,
      active: 3,
      recruiting: 2,
      paused: 1,
      closed: 1,
      completed: 1,
      terminated: 0,
      planning: 0,
      enrollment_open: 5,
      sae_flagged: 1,
      pending_irb: 1,
      demo_rows: 0,
    }),
    {
      total: 8,
      active: 3,
      recruiting: 2,
      paused: 1,
      closed: 1,
      completed: 1,
      terminated: 0,
      planning: 0,
      enrollment_open: 5,
      sae_flagged: 1,
      pending_irb: 1,
      demo_rows: 0,
    },
  );
});

test('drillOutUrl composes encoded ids for each surface', () => {
  // The filter handoff is the regulator-credible loop: a trial drills into
  // IRB protocol / patients / documents / AEs / reports without losing identity.
  assert.equal(
    drillOutUrl('irb_manager', { protocol_id: 'p 1' }),
    '?page=irb-manager&protocol_id=p%201',
  );
  assert.equal(
    drillOutUrl('patients', { trial_id: 't 9' }),
    '?page=patients-hub&trial_id=t%209',
  );
  assert.equal(
    drillOutUrl('documents', { trial_id: 't1' }),
    '?page=documents-hub&source_target_type=clinical_trials&source_target_id=t1',
  );
  assert.equal(
    drillOutUrl('adverse_events', { trial_id: 't1' }),
    '?page=adverse-events&trial_id=t1',
  );
  assert.equal(
    drillOutUrl('reports', { trial_id: 't1' }),
    '?page=reports-hub&trial_id=t1',
  );
  assert.equal(drillOutUrl('patients', null), null);
  assert.equal(drillOutUrl('patients', {}), null);
  assert.equal(drillOutUrl('irb_manager', { trial_id: 't1' }), null);
  assert.equal(drillOutUrl('unknown', { trial_id: 't1' }), null);
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
  assert.equal(isDemoExportText('{"id":"1"}\n{"id":"2"}\n'), false);
});

test('audit event shape matches /audit-events router contract', () => {
  // Backend router accepts: event (string, ≤120), trial_id (≤64),
  // note (≤1024), using_demo_data (bool). Our builder must round-trip.
  const ev = buildAuditEvent('filter_changed', {
    trial_id: 'trial-1',
    note: 'status=active',
    using_demo_data: false,
  });
  assert.deepEqual(ev, {
    event: 'filter_changed',
    trial_id: 'trial-1',
    note: 'status=active',
    using_demo_data: false,
  });

  // Note truncation honours the 500-char client cap that mirrors the
  // server-side note slice.
  const longNote = 'a'.repeat(900);
  const ev2 = buildAuditEvent('list_viewed', { note: longNote });
  assert.equal(ev2.note.length, 500);

  // Defaults are honest — no fake trial_id when missing.
  const ev3 = buildAuditEvent('page_loaded');
  assert.equal(ev3.trial_id, null);
  assert.equal(ev3.using_demo_data, false);
});

test('terminal trials are immutable client-side too', () => {
  const planning   = { status: 'planning' };
  const recruiting = { status: 'recruiting' };
  const active     = { status: 'active' };
  const paused     = { status: 'paused' };
  const closed     = { status: 'closed' };
  const completed  = { status: 'completed' };
  const terminated = { status: 'terminated' };

  assert.equal(canEditTrial(planning),   true);
  assert.equal(canEditTrial(recruiting), true);
  assert.equal(canEditTrial(active),     true);
  assert.equal(canEditTrial(paused),     true);
  assert.equal(canEditTrial(closed),     false);
  assert.equal(canEditTrial(completed),  false);
  assert.equal(canEditTrial(terminated), false);

  assert.equal(canCloseTrial(active), true);
  assert.equal(canCloseTrial(closed), false);

  // No reopen — distinct from IRB protocols, which DO reopen.
  assert.equal(canReopenTrial(closed),    false);
  assert.equal(canReopenTrial(completed), false);
  assert.equal(canReopenTrial(active),    false);

  assert.equal(canPauseTrial(recruiting), true);
  assert.equal(canPauseTrial(active),     true);
  assert.equal(canPauseTrial(planning),   false);
  assert.equal(canPauseTrial(paused),     false);
  assert.equal(canPauseTrial(closed),     false);

  assert.equal(canResumeTrial(paused), true);
  assert.equal(canResumeTrial(active), false);

  assert.equal(canEnroll(recruiting), true);
  assert.equal(canEnroll(active),     true);
  assert.equal(canEnroll(planning),   false);
  assert.equal(canEnroll(paused),     false);
  assert.equal(canEnroll(closed),     false);
});

test('filter encoding round-trips through URLSearchParams', () => {
  const params = buildListFilterParams({
    status: 'active',
    phase: 'iii',
    nct_number: 'NCT12345678',
    q: 'iTBS for TRD',
  });
  const qs = new URLSearchParams(params).toString();
  assert.match(qs, /status=active/);
  assert.match(qs, /phase=iii/);
  assert.match(qs, /nct_number=NCT12345678/);
  // %20 OR + are both valid space encodings; URLSearchParams uses +.
  assert.ok(
    qs.includes('q=iTBS+for+TRD') || qs.includes('q=iTBS%20for%20TRD'),
    `expected encoded q in: ${qs}`,
  );
});
