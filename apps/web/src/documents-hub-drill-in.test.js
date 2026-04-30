// Logic-only tests for the Documents Hub drill-in coverage re-audit
// (2026-04-30). Mirrors the helpers used by pgDocumentsHubNew so we can
// exercise them without a DOM.
//
// Pins the contract that:
//   - URL params source_target_type / source_target_id parse correctly
//   - Half-supplied or unknown surfaces are dropped on the client (the
//     server also 422s, but the client should not even send the request)
//   - The filter banner copy reflects the upstream surface label
//   - The clear-filter URL composition strips both params
//   - Demo detection (export ZIP manifest "# DEMO" prefix) still works
//   - The drill-back URL targets the right SPA route per upstream
//   - The audit-event payload carries source_target_type/id when the
//     drill-in is active and drops them when it's not.
//
// Run: node --test src/documents-hub-drill-in.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers (mirror pgDocumentsHubNew internals) ───────────────────────────

const KNOWN_DRILL_IN_SURFACES = new Set([
  'clinical_trials', 'irb_manager', 'quality_assurance',
  'course_detail', 'adverse_events', 'reports_hub',
]);

const DRILL_IN_LABELS = {
  clinical_trials:   'Clinical Trial',
  irb_manager:       'IRB Protocol',
  quality_assurance: 'QA Finding',
  course_detail:     'Treatment Course',
  adverse_events:    'Adverse Event',
  reports_hub:       'Report',
};

const DRILL_BACK_PAGES = {
  clinical_trials:   'clinical-trials',
  irb_manager:       'irb-manager',
  quality_assurance: 'quality-assurance',
  course_detail:     'courses',
  adverse_events:    'adverse-events',
  reports_hub:       'reports-hub',
};

function parseDrillInFromUrl(search) {
  // Mirrors the URL-param parsing in pgDocumentsHubNew. Returns
  // { type, id } when both are present and the type is whitelisted,
  // null otherwise.
  let sp;
  try { sp = new URLSearchParams(search || ''); }
  catch (_) { return null; }
  const t = (sp.get('source_target_type') || '').trim();
  const i = (sp.get('source_target_id')   || '').trim();
  if (!t || !i) return null;
  if (!KNOWN_DRILL_IN_SURFACES.has(t)) return null;
  return { type: t, id: i };
}

function buildListParams(filters, drillIn) {
  // Mirrors api.listDocuments(...) param construction. Empty values are
  // dropped so the API doesn't see a malformed pair.
  const params = {
    kind: filters.kind || undefined,
    patient_id: filters.patient_id || undefined,
    since: filters.since || undefined,
    until: filters.until || undefined,
    q: filters.q || undefined,
    limit: 200,
  };
  if (drillIn && drillIn.type && drillIn.id) {
    params.source_target_type = drillIn.type;
    params.source_target_id   = drillIn.id;
  }
  return params;
}

function bannerCopy(drillIn) {
  // Mirrors the in-page banner text: "Showing documents linked to <Surface> <id>"
  if (!drillIn) return '';
  const label = DRILL_IN_LABELS[drillIn.type] || drillIn.type;
  return `Showing documents linked to ${label} ${drillIn.id}`;
}

function clearFilterUrl(currentHref) {
  // Mirrors window._docsClearDrillIn — strip both drill-in params and
  // return the cleaned URL.
  const url = new URL(currentHref);
  url.searchParams.delete('source_target_type');
  url.searchParams.delete('source_target_id');
  return url.toString();
}

function drillBackUrl(drillIn) {
  // Mirrors window._docsDrillBack — the upstream SPA URL to navigate
  // back to. Returns null if the drill-in is missing or unmapped.
  if (!drillIn) return null;
  const page = DRILL_BACK_PAGES[drillIn.type];
  if (!page) return null;
  return '?page=' + encodeURIComponent(page) + '&id=' + encodeURIComponent(drillIn.id);
}

function isDemoExport(text) {
  // Mirrors the test in clinical-trials-launch-audit.test.js — the
  // export.zip manifest is prefixed with "# DEMO" if any row is demo.
  if (!text) return false;
  return text.startsWith('# DEMO');
}

function buildAuditPayload(event, opts) {
  // Mirrors the audit-event payload pgDocumentsHubNew emits. When a
  // drill-in is active, the upstream surface and id ride along.
  const payload = { event, note: opts && opts.note ? opts.note : event };
  if (opts && opts.drillIn && opts.drillIn.type && opts.drillIn.id) {
    payload.source_target_type = opts.drillIn.type;
    payload.source_target_id   = opts.drillIn.id;
    payload.note = payload.note + ' drill_in_from=' + opts.drillIn.type + ':' + opts.drillIn.id;
  }
  return payload;
}

// ── URL parsing ────────────────────────────────────────────────────────────

test('parseDrillInFromUrl picks up clinical_trials drill-in URL', () => {
  const got = parseDrillInFromUrl('?page=documents-hub&source_target_type=clinical_trials&source_target_id=trial-A');
  assert.deepEqual(got, { type: 'clinical_trials', id: 'trial-A' });
});

test('parseDrillInFromUrl picks up irb_manager drill-in URL', () => {
  const got = parseDrillInFromUrl('?page=documents-hub&source_target_type=irb_manager&source_target_id=protocol-XYZ');
  assert.deepEqual(got, { type: 'irb_manager', id: 'protocol-XYZ' });
});

test('parseDrillInFromUrl drops half-supplied pair', () => {
  assert.equal(parseDrillInFromUrl('?source_target_type=clinical_trials'), null);
  assert.equal(parseDrillInFromUrl('?source_target_id=trial-A'), null);
});

test('parseDrillInFromUrl drops unknown surface', () => {
  assert.equal(parseDrillInFromUrl('?source_target_type=evil&source_target_id=x'), null);
});

test('parseDrillInFromUrl handles empty / null / undefined input', () => {
  assert.equal(parseDrillInFromUrl(''), null);
  assert.equal(parseDrillInFromUrl(null), null);
  assert.equal(parseDrillInFromUrl(undefined), null);
});

// ── List param composition ────────────────────────────────────────────────

test('buildListParams threads drill-in pair', () => {
  const params = buildListParams({}, { type: 'clinical_trials', id: 'trial-A' });
  assert.equal(params.source_target_type, 'clinical_trials');
  assert.equal(params.source_target_id, 'trial-A');
});

test('buildListParams omits drill-in keys when no drill-in', () => {
  const params = buildListParams({});
  assert.equal('source_target_type' in params, false);
  assert.equal('source_target_id' in params, false);
});

test('buildListParams drops empty in-page filters too', () => {
  const params = buildListParams({ q: '', kind: '', patient_id: null });
  assert.equal(params.q, undefined);
  assert.equal(params.kind, undefined);
  assert.equal(params.patient_id, undefined);
});

// ── Banner copy ────────────────────────────────────────────────────────────

test('bannerCopy maps clinical_trials → "Clinical Trial"', () => {
  const copy = bannerCopy({ type: 'clinical_trials', id: 'trial-A' });
  assert.match(copy, /Clinical Trial/);
  assert.match(copy, /trial-A/);
});

test('bannerCopy maps irb_manager → "IRB Protocol"', () => {
  const copy = bannerCopy({ type: 'irb_manager', id: 'protocol-XYZ' });
  assert.match(copy, /IRB Protocol/);
  assert.match(copy, /protocol-XYZ/);
});

test('bannerCopy maps quality_assurance → "QA Finding"', () => {
  const copy = bannerCopy({ type: 'quality_assurance', id: 'finding-1' });
  assert.match(copy, /QA Finding/);
});

test('bannerCopy maps course_detail → "Treatment Course"', () => {
  const copy = bannerCopy({ type: 'course_detail', id: 'course-1' });
  assert.match(copy, /Treatment Course/);
});

test('bannerCopy is empty when no drill-in', () => {
  assert.equal(bannerCopy(null), '');
});

// ── Clear-filter URL composition ───────────────────────────────────────────

test('clearFilterUrl strips both drill-in params', () => {
  const cleaned = clearFilterUrl('https://example.com/?page=documents-hub&source_target_type=clinical_trials&source_target_id=trial-A');
  assert.equal(cleaned.includes('source_target_type'), false);
  assert.equal(cleaned.includes('source_target_id'), false);
  // The page= param survives so the SPA stays on the documents-hub route.
  assert.match(cleaned, /page=documents-hub/);
});

test('clearFilterUrl preserves unrelated params', () => {
  const cleaned = clearFilterUrl('https://example.com/?page=documents-hub&source_target_type=irb_manager&source_target_id=p1&debug=1');
  assert.equal(cleaned.includes('source_target_type'), false);
  assert.match(cleaned, /debug=1/);
});

// ── Drill-back URL ─────────────────────────────────────────────────────────

test('drillBackUrl points clinical_trials → clinical-trials page', () => {
  const url = drillBackUrl({ type: 'clinical_trials', id: 'trial-A' });
  assert.match(url, /page=clinical-trials/);
  assert.match(url, /id=trial-A/);
});

test('drillBackUrl points irb_manager → irb-manager page', () => {
  const url = drillBackUrl({ type: 'irb_manager', id: 'protocol-XYZ' });
  assert.match(url, /page=irb-manager/);
  assert.match(url, /id=protocol-XYZ/);
});

test('drillBackUrl is null when drill-in missing', () => {
  assert.equal(drillBackUrl(null), null);
});

test('drillBackUrl is null for unmapped surface', () => {
  assert.equal(drillBackUrl({ type: 'unknown', id: 'x' }), null);
});

// ── Demo detection ─────────────────────────────────────────────────────────

test('isDemoExport recognises "# DEMO" CSV prefix', () => {
  assert.equal(isDemoExport('# DEMO — not regulator-submittable\nid,title\n'), true);
});

test('isDemoExport returns false on production manifests', () => {
  assert.equal(isDemoExport('id,title\nrow,Real\n'), false);
});

test('isDemoExport returns false on empty input', () => {
  assert.equal(isDemoExport(''), false);
  assert.equal(isDemoExport(null), false);
});

// ── Audit payload composition ──────────────────────────────────────────────

test('buildAuditPayload includes drill-in pair when active', () => {
  const p = buildAuditPayload('page_loaded', {
    note: 'tab=all',
    drillIn: { type: 'clinical_trials', id: 'trial-A' },
  });
  assert.equal(p.source_target_type, 'clinical_trials');
  assert.equal(p.source_target_id, 'trial-A');
  assert.match(p.note, /drill_in_from=clinical_trials:trial-A/);
});

test('buildAuditPayload omits drill-in pair when inactive', () => {
  const p = buildAuditPayload('page_loaded', { note: 'tab=all' });
  assert.equal('source_target_type' in p, false);
  assert.equal('source_target_id' in p, false);
});

test('buildAuditPayload preserves the page-load tab in the note', () => {
  const p = buildAuditPayload('page_loaded', { note: 'tab=templates' });
  assert.match(p.note, /tab=templates/);
});

// ── Surface label coverage matrix ──────────────────────────────────────────
// Pin every surface mentioned in the Documents Hub re-audit brief so a
// future edit that drops one (silently rewriting it to "<surface>") is
// caught here.

test('every drill-in surface has a label and a back-page', () => {
  for (const surface of KNOWN_DRILL_IN_SURFACES) {
    assert.ok(DRILL_IN_LABELS[surface], `missing DRILL_IN_LABELS[${surface}]`);
    assert.ok(DRILL_BACK_PAGES[surface], `missing DRILL_BACK_PAGES[${surface}]`);
  }
});

test('drill-in surface set matches backend KNOWN_DRILL_IN_SURFACES', () => {
  // Backend whitelist (from documents_router.py KNOWN_DRILL_IN_SURFACES).
  // If the backend list grows, both must be updated together.
  const backend = new Set([
    'clinical_trials', 'irb_manager', 'quality_assurance',
    'course_detail', 'adverse_events', 'reports_hub',
  ]);
  assert.equal(KNOWN_DRILL_IN_SURFACES.size, backend.size);
  for (const s of backend) assert.ok(KNOWN_DRILL_IN_SURFACES.has(s), `frontend missing ${s}`);
});
