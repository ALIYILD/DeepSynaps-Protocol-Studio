// Logic-only tests for the Clinician Inbox / Notifications Hub
// launch-audit (2026-05-01).
//
// Pins the inbox page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs item-
//     scoped events vs polling ticks vs export pings)
//   - DEMO banner renders only when server returns is_demo_view=true
//   - Honest empty state — "Inbox clear — no high-priority items
//     pending. Nice work." — renders when the server returns zero items
//     (no AI-fabricated rows)
//   - Filter helpers strip blanks before posting to the server
//   - Note-required actions reject blank input
//   - Drill-out URL targets a real surface page id (no broken nav)
//   - Export URL targets the documented server endpoint, not a blob
//   - Summary unread count comes from server.high_priority_unread, not
//     a UI re-derivation
//   - Source-grep contract: pages-inbox.js wires the audit ping at mount
//     and the polling tick; api.js exposes the inbox helpers; app.js
//     registers the `clinician-inbox` and `inbox` cases plus a NAV entry
//
// Run: node --test src/clinician-inbox-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note. We mirror the small
// pure helpers here (rather than import pages-inbox.js) because that
// module pulls in helpers.js which touches `window` at module-load
// time — same pattern the wearables-workbench-launch-audit test follows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-inbox.js) ──────


function buildInboxAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.item_event_id) out.item_event_id = String(extra.item_event_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildInboxFilterParams(filters) {
  const params = {};
  if (filters?.surface) params.surface = filters.surface;
  if (filters?.patient_id) params.patient_id = filters.patient_id;
  if (filters?.status) params.status = filters.status;
  if (filters?.since) params.since = filters.since;
  if (filters?.until) params.until = filters.until;
  return params;
}

function shouldShowInboxDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

function shouldShowInboxEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

function inboxNoteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function inboxSummaryHonestUnreadCount(serverSummaryResp) {
  if (!serverSummaryResp) return 0;
  const v = Number(serverSummaryResp.high_priority_unread || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

const SURFACE_DRILL_OUT_PAGE = {
  patient_messages: 'patient-messages',
  adherence_events: 'adherence-events',
  home_program_tasks: 'home-program-tasks',
  wearables: 'patient-wearables',
  wearables_workbench: 'monitor',
  adverse_events_hub: 'adverse-events-hub',
  quality_assurance: 'quality-assurance',
  course_detail: 'course-detail',
  patient_profile: 'patient-profile',
};

function inboxDrillOutPageFor(surface) {
  return SURFACE_DRILL_OUT_PAGE[surface] || null;
}

function inboxBuildDrillOutUrl(item) {
  const page = inboxDrillOutPageFor(item?.surface);
  if (!page) return null;
  if (item?.patient_id) {
    return `?page=${page}&patient_id=${encodeURIComponent(item.patient_id)}`;
  }
  return `?page=${page}`;
}

function inboxExportCsvPath() {
  return '/api/v1/clinician-inbox/export.csv';
}


// ── Audit payload composition ──────────────────────────────────────────────


test('Audit payload: view ping has no item_event_id', () => {
  const p = buildInboxAuditPayload('view', { note: 'inbox mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.item_event_id, undefined);
  assert.equal(p.note, 'inbox mount');
});

test('Audit payload: item-scoped event includes item_event_id', () => {
  const p = buildInboxAuditPayload('item_opened', { item_event_id: 'evt-123', note: 'opened detail' });
  assert.equal(p.event, 'item_opened');
  assert.equal(p.item_event_id, 'evt-123');
  assert.equal(p.note, 'opened detail');
});

test('Audit payload: using_demo_data only set when truthy', () => {
  assert.equal(buildInboxAuditPayload('view', {}).using_demo_data, undefined);
  assert.equal(buildInboxAuditPayload('view', { using_demo_data: true }).using_demo_data, true);
});

test('Audit payload: note is truncated at 480 chars', () => {
  const long = 'x'.repeat(2000);
  const p = buildInboxAuditPayload('view', { note: long });
  assert.equal(p.note.length, 480);
});


// ── Filter params ──────────────────────────────────────────────────────────


test('Filter params: blanks are dropped', () => {
  assert.deepEqual(buildInboxFilterParams({}), {});
  assert.deepEqual(buildInboxFilterParams({ surface: '', status: '', patient_id: '' }), {});
  assert.deepEqual(buildInboxFilterParams({ surface: 'patient_messages' }), { surface: 'patient_messages' });
  assert.deepEqual(
    buildInboxFilterParams({ surface: 'wearables', status: 'unread', patient_id: 'p1' }),
    { surface: 'wearables', status: 'unread', patient_id: 'p1' },
  );
});

test('Filter params: since/until passed through verbatim', () => {
  assert.deepEqual(
    buildInboxFilterParams({ since: '2026-04-23', until: '2026-04-30' }),
    { since: '2026-04-23', until: '2026-04-30' },
  );
});


// ── Demo banner / empty state ──────────────────────────────────────────────


test('Demo banner: only on server is_demo_view=true', () => {
  assert.equal(shouldShowInboxDemoBanner(null), false);
  assert.equal(shouldShowInboxDemoBanner({ is_demo_view: false, items: [] }), false);
  assert.equal(shouldShowInboxDemoBanner({ is_demo_view: true, items: [] }), true);
});

test('Empty state: rendered when server returns zero rows (no AI fakes)', () => {
  assert.equal(shouldShowInboxEmptyState(null), true);
  assert.equal(shouldShowInboxEmptyState({ items: [] }), true);
  assert.equal(shouldShowInboxEmptyState({ items: [{ event_id: 'e1' }] }), false);
});


// ── Note-required guard ────────────────────────────────────────────────────


test('Note-required guard: blank notes are rejected', () => {
  assert.equal(inboxNoteRequiredValid(''), false);
  assert.equal(inboxNoteRequiredValid('  '), false);
  assert.equal(inboxNoteRequiredValid(null), false);
  assert.equal(inboxNoteRequiredValid(undefined), false);
  assert.equal(inboxNoteRequiredValid('Triaged after morning huddle.'), true);
});


// ── Summary count ──────────────────────────────────────────────────────────


test('Summary unread: read straight off server, no UI math', () => {
  assert.equal(inboxSummaryHonestUnreadCount(null), 0);
  assert.equal(inboxSummaryHonestUnreadCount({ high_priority_unread: 0 }), 0);
  assert.equal(inboxSummaryHonestUnreadCount({ high_priority_unread: 5 }), 5);
  // Sanity: a negative number must not pass through.
  assert.equal(inboxSummaryHonestUnreadCount({ high_priority_unread: -1 }), 0);
  // Sanity: NaN / non-numeric must not pass through.
  assert.equal(inboxSummaryHonestUnreadCount({ high_priority_unread: 'lots' }), 0);
});


// ── Drill-out wiring ───────────────────────────────────────────────────────


test('Drill-out: known surfaces map to a real page id', () => {
  assert.equal(inboxDrillOutPageFor('patient_messages'), 'patient-messages');
  assert.equal(inboxDrillOutPageFor('adherence_events'), 'adherence-events');
  assert.equal(inboxDrillOutPageFor('home_program_tasks'), 'home-program-tasks');
  assert.equal(inboxDrillOutPageFor('wearables'), 'patient-wearables');
  assert.equal(inboxDrillOutPageFor('wearables_workbench'), 'monitor');
  assert.equal(inboxDrillOutPageFor('adverse_events_hub'), 'adverse-events-hub');
});

test('Drill-out: unknown surface returns null (no fake nav)', () => {
  assert.equal(inboxDrillOutPageFor('made_up_surface'), null);
  assert.equal(inboxDrillOutPageFor(''), null);
  assert.equal(inboxDrillOutPageFor(null), null);
});

test('Drill-out URL: includes patient_id when present', () => {
  const u = inboxBuildDrillOutUrl({ surface: 'adherence_events', patient_id: 'p1' });
  assert.ok(u.includes('page=adherence-events'));
  assert.ok(u.includes('patient_id=p1'));
});

test('Drill-out URL: omits patient_id when absent', () => {
  const u = inboxBuildDrillOutUrl({ surface: 'adverse_events_hub' });
  assert.ok(u.includes('page=adverse-events-hub'));
  assert.equal(u.includes('patient_id'), false);
});


// ── Export URL ─────────────────────────────────────────────────────────────


test('Export URL: documented server endpoint (no blobs)', () => {
  assert.equal(inboxExportCsvPath(), '/api/v1/clinician-inbox/export.csv');
  assert.ok(inboxExportCsvPath().startsWith('/api/'));
});


// ── Source-grep contract ───────────────────────────────────────────────────


function readSrc(rel) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, rel), 'utf8');
}


test('Source contract: pages-inbox wires the audit ping at mount', () => {
  const src = readSrc('pages-inbox.js');
  assert.ok(src.includes("postClinicianInboxAuditEvent"));
  assert.ok(src.includes("buildInboxAuditPayload('view'"));
});

test('Source contract: pages-inbox wires the polling tick', () => {
  const src = readSrc('pages-inbox.js');
  // 30s real-time poll documented in the page header
  assert.ok(src.includes('30_000') || src.includes('30000'));
  assert.ok(src.includes("polling_tick"));
});

test('Source contract: pages-inbox renders honest empty state copy', () => {
  const src = readSrc('pages-inbox.js');
  assert.ok(src.includes('Inbox clear'));
  // No AI happy-talk snuck in
  assert.equal(/your clinic is doing great/i.test(src), false);
  assert.equal(/AI scored/i.test(src), false);
});

test('Source contract: pages-inbox keeps drill-out map in lockstep with the test', () => {
  // The drill-out map in the page must match the mirror in this file —
  // otherwise the contract drifts silently.
  const src = readSrc('pages-inbox.js');
  for (const [surface, page] of Object.entries(SURFACE_DRILL_OUT_PAGE)) {
    assert.ok(
      src.includes(`${surface}: '${page}'`),
      `pages-inbox.js drill-out map missing or drifted for surface=${surface} → ${page}`,
    );
  }
});

test('Source contract: api.js exposes the inbox helpers', () => {
  const src = readSrc('api.js');
  assert.ok(src.includes('clinicianInboxListItems'));
  assert.ok(src.includes('clinicianInboxSummary'));
  assert.ok(src.includes('clinicianInboxGetItem'));
  assert.ok(src.includes('clinicianInboxAcknowledge'));
  assert.ok(src.includes('clinicianInboxBulkAcknowledge'));
  assert.ok(src.includes('clinicianInboxExportCsvUrl'));
  assert.ok(src.includes('postClinicianInboxAuditEvent'));
});

test('Source contract: app.js registers clinician-inbox and inbox routes', () => {
  const src = readSrc('app.js');
  assert.ok(src.includes("case 'clinician-inbox'"));
  assert.ok(src.includes("case 'inbox'"));
  assert.ok(src.includes('pgClinicianInbox'));
  assert.ok(src.includes('loadInbox'));
});

test('Source contract: app.js NAV has an Inbox entry', () => {
  const src = readSrc('app.js');
  // The NAV entry id is `clinician-inbox` (the canonical route id).
  assert.ok(src.includes("id: 'clinician-inbox'"));
});
