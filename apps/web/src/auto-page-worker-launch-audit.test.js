// Logic-only tests for the Auto-Page Worker launch-audit (2026-05-01).
//
// Closes the real-time half of the Care Team Coverage launch loop (#357).
// Care Team Coverage shipped the data model + manual page-on-call;
// THIS PR ships the background worker that scans SLA breaches every 60s
// and fires the same page-oncall handler the manual button uses.
//
// Pins the Auto-Page Worker page panel contract against silent fakes:
//
//   - Status payload composition is correct (running vs enabled_in_clinic
//     dots; pending / paged / errors chips read straight off the server,
//     no UI re-derivation)
//   - Honest fallback when /status is unreachable (preserves the
//     #357 "Auto-page worker: OFF" banner verbatim so reviewers know
//     why the live panel is missing instead of seeing a blank box)
//   - Admin-only Start / Stop / Tick-once CTAs (UI gate; backend gate
//     is the source of truth)
//   - Audit payload composition for view + polling_tick + start/stop
//     /tick-once UI clicks
//   - Source-grep contract: pages-knowledge.js wires the live panel,
//     api.js exposes the helpers, audit_trail backend whitelists the
//     surface
//
// Run: node --test src/auto-page-worker-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-knowledge.js) ──


function buildAutoPageAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.target_id) out.target_id = String(extra.target_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function shouldShowAdminCtas(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'supervisor' || r === 'regulator';
}

function workerPanelMode(workerStatus, summary) {
  if (!workerStatus) {
    const enabled = (summary && Number(summary.auto_page_enabled_surfaces)) || 0;
    return enabled === 0 ? 'fallback_off' : 'fallback_enabled_unreachable';
  }
  if (workerStatus.enabled_in_clinic) return 'live_enabled';
  return 'live_disabled';
}

function readStatusPending(s) {
  const v = Number(s?.breaches_pending_now || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readStatusPagedLastHour(s) {
  const v = Number(s?.paged_last_hour || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readStatusErrorsLastHour(s) {
  const v = Number(s?.errors_last_hour || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function lastTickHHMMSS(s) {
  if (!s || !s.last_tick_at) return '—';
  try {
    return new Date(s.last_tick_at).toISOString().slice(11, 19) + ' UTC';
  } catch (_e) {
    return '—';
  }
}


// ── Audit payload composition ──────────────────────────────────────────────


test('Audit payload: view ping has no target_id', () => {
  const p = buildAutoPageAuditPayload('view');
  assert.deepEqual(p, { event: 'view' });
});

test('Audit payload: polling_tick ping has no target_id', () => {
  const p = buildAutoPageAuditPayload('polling_tick');
  assert.deepEqual(p, { event: 'polling_tick' });
});

test('Audit payload: start_clicked_ui ping carries no target', () => {
  const p = buildAutoPageAuditPayload('start_clicked_ui');
  assert.deepEqual(p, { event: 'start_clicked_ui' });
});

test('Audit payload: notes are truncated to 480 chars', () => {
  const long = 'x'.repeat(500);
  const p = buildAutoPageAuditPayload('view', { note: long });
  assert.equal(p.note.length, 480);
});

test('Audit payload: using_demo_data is preserved as true', () => {
  const p = buildAutoPageAuditPayload('view', { using_demo_data: true });
  assert.equal(p.using_demo_data, true);
});


// ── Admin gate ─────────────────────────────────────────────────────────────


test('Admin CTAs: shown for admin / supervisor / regulator', () => {
  assert.equal(shouldShowAdminCtas('admin'), true);
  assert.equal(shouldShowAdminCtas('ADMIN'), true);
  assert.equal(shouldShowAdminCtas('supervisor'), true);
  assert.equal(shouldShowAdminCtas('regulator'), true);
});

test('Admin CTAs: hidden for clinician / patient / guest / undefined', () => {
  assert.equal(shouldShowAdminCtas('clinician'), false);
  assert.equal(shouldShowAdminCtas('patient'), false);
  assert.equal(shouldShowAdminCtas('guest'), false);
  assert.equal(shouldShowAdminCtas(undefined), false);
  assert.equal(shouldShowAdminCtas(null), false);
});


// ── Panel mode selection ───────────────────────────────────────────────────


test('Panel: fallback_off when worker status null + 0 enabled surfaces', () => {
  assert.equal(
    workerPanelMode(null, { auto_page_enabled_surfaces: 0 }),
    'fallback_off'
  );
});

test('Panel: fallback_enabled_unreachable when worker status null but >=1 enabled', () => {
  assert.equal(
    workerPanelMode(null, { auto_page_enabled_surfaces: 2 }),
    'fallback_enabled_unreachable'
  );
});

test('Panel: live_enabled when status surface returns enabled_in_clinic=true', () => {
  assert.equal(
    workerPanelMode({ enabled_in_clinic: true }, { auto_page_enabled_surfaces: 0 }),
    'live_enabled'
  );
});

test('Panel: live_disabled when status surface returns enabled_in_clinic=false', () => {
  assert.equal(
    workerPanelMode({ enabled_in_clinic: false }, { auto_page_enabled_surfaces: 0 }),
    'live_disabled'
  );
});


// ── Status counter helpers (no NaN leaks into UI) ──────────────────────────


test('Status: missing fields default to 0 — no NaN leaks into UI', () => {
  assert.equal(readStatusPending({}), 0);
  assert.equal(readStatusPending(null), 0);
  assert.equal(readStatusPending({ breaches_pending_now: 'lots' }), 0);
  assert.equal(readStatusPending({ breaches_pending_now: -3 }), 0);

  assert.equal(readStatusPagedLastHour({}), 0);
  assert.equal(readStatusPagedLastHour(null), 0);

  assert.equal(readStatusErrorsLastHour({}), 0);
  assert.equal(readStatusErrorsLastHour(null), 0);
});

test('Status: read straight off server — no UI re-derivation', () => {
  const s = {
    breaches_pending_now: 7,
    paged_last_hour: 3,
    errors_last_hour: 1,
  };
  assert.equal(readStatusPending(s), 7);
  assert.equal(readStatusPagedLastHour(s), 3);
  assert.equal(readStatusErrorsLastHour(s), 1);
});


// ── Last-tick timestamp formatting ─────────────────────────────────────────


test('Last-tick: null status → em-dash', () => {
  assert.equal(lastTickHHMMSS(null), '—');
  assert.equal(lastTickHHMMSS({}), '—');
});

test('Last-tick: ISO timestamp → HH:MM:SS UTC', () => {
  const out = lastTickHHMMSS({ last_tick_at: '2026-05-01T12:34:56.789Z' });
  assert.equal(out, '12:34:56 UTC');
});

test('Last-tick: malformed ISO → em-dash (no NaN: NaN: NaN UTC leak)', () => {
  const out = lastTickHHMMSS({ last_tick_at: 'not-a-date' });
  assert.equal(out, '—');
});


// ── Source-grep contract ───────────────────────────────────────────────────


function readSrc(rel) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, rel), 'utf8');
}


test('Source contract: pages-knowledge wires the auto-page-worker mount audit ping', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(
    src.includes('postAutoPageWorkerAuditEvent'),
    'pages-knowledge.js must call postAutoPageWorkerAuditEvent'
  );
  assert.ok(
    src.includes("event: 'view', note: 'auto-page-worker panel mounted'"),
    'pages-knowledge.js must emit a mount-time view ping'
  );
});

test('Source contract: pages-knowledge wires the live status panel', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('renderAutoPageWorkerPanel'));
  assert.ok(src.includes('autoPageWorkerStatus'));
});

test('Source contract: pages-knowledge wires admin Start / Stop / Tick-once CTAs', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('_autoPageWorkerStart'));
  assert.ok(src.includes('_autoPageWorkerStop'));
  assert.ok(src.includes('_autoPageWorkerTickOnce'));
});

test('Source contract: pages-knowledge preserves the #357 OFF fallback verbatim', () => {
  const src = readSrc('pages-knowledge.js');
  // #357's banner text is the contract reviewers grep for. Keep it.
  assert.ok(src.includes('Auto-page worker: OFF'));
});

test('Source contract: pages-knowledge polls the worker status every 30s', () => {
  const src = readSrc('pages-knowledge.js');
  // The same 30s coverage poll piggybacks the worker polling_tick ping.
  assert.ok(src.includes("event: 'polling_tick'"));
  assert.ok(src.includes('30000'));
});

test('Source contract: api.js exposes the auto-page-worker helpers', () => {
  const src = readSrc('api.js');
  for (const helper of [
    'autoPageWorkerStatus',
    'autoPageWorkerStart',
    'autoPageWorkerStop',
    'autoPageWorkerTickOnce',
    'postAutoPageWorkerAuditEvent',
  ]) {
    assert.ok(src.includes(helper), `api.js missing helper: ${helper}`);
  }
});

test('Source contract: api.js routes to the auto-page-worker endpoints', () => {
  const src = readSrc('api.js');
  for (const ep of [
    '/api/v1/auto-page-worker/status',
    '/api/v1/auto-page-worker/start',
    '/api/v1/auto-page-worker/stop',
    '/api/v1/auto-page-worker/tick-once',
    '/api/v1/auto-page-worker/audit-events',
  ]) {
    assert.ok(src.includes(ep), `api.js missing endpoint: ${ep}`);
  }
});

test('Source contract: pages-knowledge does NOT silently claim "sent" delivery', () => {
  // Honest delivery contract — the worker NEVER says "sent" without a real
  // adapter 2xx confirmation. The panel must never hardcode "sent".
  const src = readSrc('pages-knowledge.js');
  // Find the renderAutoPageWorkerPanel function body and assert no
  // hardcoded "sent" string lives in it.
  const start = src.indexOf('function renderAutoPageWorkerPanel');
  const end = src.indexOf('function renderTopCounts');
  assert.ok(start > 0 && end > start, 'panel function not found in source');
  const body = src.slice(start, end);
  assert.equal(/['"]sent['"]/.test(body), false, 'panel body must not hardcode "sent" delivery status');
});
