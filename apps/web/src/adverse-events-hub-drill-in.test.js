// Logic-only tests for the Adverse Events Hub drill-in coverage launch
// audit (2026-05-01). Mirrors the helpers used by pgAdverseEvents so we
// can exercise them without a DOM.
//
// Pins the contract that:
//   - URL params source_target_type / source_target_id parse correctly,
//     plus the legacy ?patient_id= / ?course_id= / ?trial_id= /
//     ?protocol_id= shapes that upstream surfaces emit.
//   - Half-supplied or unknown surfaces are dropped on the client (the
//     server also 422s, but the client should not even send the request).
//   - The filter banner copy reflects the upstream surface label.
//   - The clear-filter URL composition strips every drill-in param.
//   - Demo detection (export.csv "# DEMO" prefix, export.ndjson
//     {"_meta":"DEMO"} first-line) still works.
//   - The drill-back URL targets the right SPA route per upstream surface.
//   - The audit-event payload carries source_target_type/id when the
//     drill-in is active and drops them when it's not.
//   - The list-params shape is the one the backend expects: drill-in
//     surfaces map to scalar filters (patient_id / course_id / trial_id).
//
// Run: node --test src/adverse-events-hub-drill-in.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers (mirror pgAdverseEvents internals) ─────────────────────────────

const KNOWN_DRILL_IN_SURFACES = new Set([
  'patient_profile', 'course_detail', 'clinical_trials',
  'irb_manager', 'quality_assurance', 'documents_hub', 'reports_hub',
]);

const DRILL_IN_LABELS = {
  patient_profile:   'Patient',
  course_detail:     'Treatment Course',
  clinical_trials:   'Clinical Trial',
  irb_manager:       'IRB Protocol',
  quality_assurance: 'QA Finding',
  documents_hub:     'Document',
  reports_hub:       'Report',
};

const DRILL_BACK_PAGES = {
  patient_profile:   'patient-profile',
  course_detail:     'courses',
  clinical_trials:   'clinical-trials',
  irb_manager:       'irb-manager',
  quality_assurance: 'quality-assurance',
  documents_hub:     'documents-hub',
  reports_hub:       'reports-hub',
};

function parseDrillInFromUrl(search) {
  // Mirrors the URL-param parsing in pgAdverseEvents. Returns
  // { type, id } when both are present and the type is whitelisted (or
  // when the legacy single-key shapes are present), null otherwise.
  let sp;
  try { sp = new URLSearchParams(search || ''); }
  catch (_) { return null; }
  const rawType = (sp.get('source_target_type') || '').trim();
  const rawId   = (sp.get('source_target_id')   || '').trim();
  if (rawType && rawId && KNOWN_DRILL_IN_SURFACES.has(rawType)) {
    return { type: rawType, id: rawId };
  }
  if (sp.get('patient_id'))  return { type: 'patient_profile',   id: sp.get('patient_id') };
  if (sp.get('course_id'))   return { type: 'course_detail',     id: sp.get('course_id')  };
  if (sp.get('trial_id'))    return { type: 'clinical_trials',   id: sp.get('trial_id')   };
  if (sp.get('protocol_id')) return { type: 'irb_manager',       id: sp.get('protocol_id')};
  return null;
}

function buildListParams(filters, drillIn) {
  // Mirrors api.listAdverseEvents(...) param construction. Empty values
  // are dropped so the API doesn't see a malformed pair.
  const params = {};
  if (filters.severity)    params.severity    = filters.severity;
  if (filters.body_system) params.body_system = filters.body_system;
  if (filters.status)      params.status      = filters.status;
  if (filters.expected)    params.expected    = filters.expected;
  if (filters.sae === true)        params.sae        = 'true';
  if (filters.reportable === true) params.reportable = 'true';
  if (filters.q)        params.q     = filters.q;
  if (filters.since)    params.since = filters.since;
  if (filters.until)    params.until = filters.until;
  if (drillIn && drillIn.type && drillIn.id) {
    if (drillIn.type === 'patient_profile')   params.patient_id = drillIn.id;
    else if (drillIn.type === 'course_detail') params.course_id  = drillIn.id;
    else if (drillIn.type === 'clinical_trials') params.trial_id = drillIn.id;
    // Other surfaces don't have a direct AE column today; the audit
    // record preserves the path but the list shows clinic scope.
  }
  return params;
}

function bannerCopy(drillIn) {
  if (!drillIn) return '';
  const label = DRILL_IN_LABELS[drillIn.type] || drillIn.type;
  return `Showing AEs linked to ${label} ${drillIn.id}`;
}

function clearFilterUrl(currentHref) {
  const url = new URL(currentHref);
  ['source_target_type', 'source_target_id', 'patient_id', 'course_id', 'trial_id', 'protocol_id']
    .forEach(k => url.searchParams.delete(k));
  return url.toString();
}

function drillBackUrl(drillIn) {
  if (!drillIn) return null;
  const page = DRILL_BACK_PAGES[drillIn.type];
  if (!page) return null;
  return '?page=' + encodeURIComponent(page) + '&id=' + encodeURIComponent(drillIn.id);
}

function isCsvDemoExport(text) {
  if (!text) return false;
  return text.startsWith('# DEMO');
}

function isNdjsonDemoExport(text) {
  if (!text) return false;
  const firstLine = text.split('\n')[0] || '';
  if (!firstLine.trim().startsWith('{')) return false;
  try {
    const parsed = JSON.parse(firstLine);
    return parsed && parsed._meta === 'DEMO';
  } catch (_) {
    return false;
  }
}

function buildAuditPayload(event, opts) {
  const payload = { event, note: opts && opts.note ? opts.note : event };
  if (opts && opts.drillIn && opts.drillIn.type && opts.drillIn.id) {
    payload.source_target_type = opts.drillIn.type;
    payload.source_target_id   = opts.drillIn.id;
  }
  return payload;
}

// ── URL parsing ────────────────────────────────────────────────────────────

test('parseDrillInFromUrl picks up patient_profile via source_target_*', () => {
  const got = parseDrillInFromUrl('?page=adverse-events&source_target_type=patient_profile&source_target_id=p-1');
  assert.deepEqual(got, { type: 'patient_profile', id: 'p-1' });
});

test('parseDrillInFromUrl picks up course_detail via legacy course_id', () => {
  const got = parseDrillInFromUrl('?page=adverse-events&course_id=c-1');
  assert.deepEqual(got, { type: 'course_detail', id: 'c-1' });
});

test('parseDrillInFromUrl picks up clinical_trials via legacy trial_id', () => {
  const got = parseDrillInFromUrl('?page=adverse-events&trial_id=t-1');
  assert.deepEqual(got, { type: 'clinical_trials', id: 't-1' });
});

test('parseDrillInFromUrl picks up patient_profile via legacy patient_id', () => {
  const got = parseDrillInFromUrl('?page=adverse-events&patient_id=p-1');
  assert.deepEqual(got, { type: 'patient_profile', id: 'p-1' });
});

test('parseDrillInFromUrl picks up irb_manager via legacy protocol_id', () => {
  const got = parseDrillInFromUrl('?page=adverse-events&protocol_id=irb-99');
  assert.deepEqual(got, { type: 'irb_manager', id: 'irb-99' });
});

test('parseDrillInFromUrl drops half-supplied source_target pair', () => {
  assert.equal(parseDrillInFromUrl('?source_target_type=patient_profile'), null);
  assert.equal(parseDrillInFromUrl('?source_target_id=p-1'), null);
});

test('parseDrillInFromUrl drops unknown surface', () => {
  assert.equal(parseDrillInFromUrl('?source_target_type=evil&source_target_id=x'), null);
});

test('parseDrillInFromUrl handles empty/null/undefined input', () => {
  assert.equal(parseDrillInFromUrl(''), null);
  assert.equal(parseDrillInFromUrl(null), null);
  assert.equal(parseDrillInFromUrl(undefined), null);
});

// ── List param composition ────────────────────────────────────────────────

test('buildListParams threads patient_profile drill-in to patient_id', () => {
  const params = buildListParams({}, { type: 'patient_profile', id: 'p-1' });
  assert.equal(params.patient_id, 'p-1');
  assert.equal('source_target_type' in params, false);
});

test('buildListParams threads course_detail drill-in to course_id', () => {
  const params = buildListParams({}, { type: 'course_detail', id: 'c-1' });
  assert.equal(params.course_id, 'c-1');
});

test('buildListParams threads clinical_trials drill-in to trial_id', () => {
  const params = buildListParams({}, { type: 'clinical_trials', id: 't-1' });
  assert.equal(params.trial_id, 't-1');
});

test('buildListParams omits scalar drill-in keys when no drill-in', () => {
  const params = buildListParams({});
  assert.equal('patient_id' in params, false);
  assert.equal('course_id' in params, false);
  assert.equal('trial_id' in params, false);
});

test('buildListParams drops empty in-page filters', () => {
  const params = buildListParams({ severity: '', body_system: null, q: '' });
  assert.equal(params.severity, undefined);
  assert.equal(params.body_system, undefined);
  assert.equal(params.q, undefined);
});

test('buildListParams keeps SAE-only and reportable-only flags', () => {
  const params = buildListParams({ sae: true, reportable: true });
  assert.equal(params.sae, 'true');
  assert.equal(params.reportable, 'true');
});

// ── Banner copy ────────────────────────────────────────────────────────────

test('bannerCopy maps patient_profile → "Patient"', () => {
  const copy = bannerCopy({ type: 'patient_profile', id: 'p-1' });
  assert.match(copy, /Patient/);
  assert.match(copy, /p-1/);
});

test('bannerCopy maps course_detail → "Treatment Course"', () => {
  const copy = bannerCopy({ type: 'course_detail', id: 'c-1' });
  assert.match(copy, /Treatment Course/);
});

test('bannerCopy maps clinical_trials → "Clinical Trial"', () => {
  const copy = bannerCopy({ type: 'clinical_trials', id: 't-1' });
  assert.match(copy, /Clinical Trial/);
});

test('bannerCopy is empty when no drill-in', () => {
  assert.equal(bannerCopy(null), '');
});

// ── Clear-filter URL composition ───────────────────────────────────────────

test('clearFilterUrl strips the canonical source_target pair', () => {
  const cleaned = clearFilterUrl('https://example.com/?page=adverse-events&source_target_type=patient_profile&source_target_id=p-1');
  assert.equal(cleaned.includes('source_target_type'), false);
  assert.equal(cleaned.includes('source_target_id'), false);
  assert.match(cleaned, /page=adverse-events/);
});

test('clearFilterUrl strips legacy patient_id / course_id / trial_id', () => {
  const cleaned = clearFilterUrl('https://example.com/?page=adverse-events&patient_id=p-1&course_id=c-1&trial_id=t-1&protocol_id=ir-1');
  assert.equal(cleaned.includes('patient_id'), false);
  assert.equal(cleaned.includes('course_id'), false);
  assert.equal(cleaned.includes('trial_id'), false);
  assert.equal(cleaned.includes('protocol_id'), false);
  assert.match(cleaned, /page=adverse-events/);
});

test('clearFilterUrl preserves unrelated params', () => {
  const cleaned = clearFilterUrl('https://example.com/?page=adverse-events&patient_id=p-1&debug=1');
  assert.equal(cleaned.includes('patient_id'), false);
  assert.match(cleaned, /debug=1/);
});

// ── Drill-back URL ─────────────────────────────────────────────────────────

test('drillBackUrl points patient_profile → patient-profile page', () => {
  const url = drillBackUrl({ type: 'patient_profile', id: 'p-1' });
  assert.match(url, /page=patient-profile/);
  assert.match(url, /id=p-1/);
});

test('drillBackUrl points course_detail → courses page', () => {
  const url = drillBackUrl({ type: 'course_detail', id: 'c-1' });
  assert.match(url, /page=courses/);
  assert.match(url, /id=c-1/);
});

test('drillBackUrl points clinical_trials → clinical-trials page', () => {
  const url = drillBackUrl({ type: 'clinical_trials', id: 't-1' });
  assert.match(url, /page=clinical-trials/);
  assert.match(url, /id=t-1/);
});

test('drillBackUrl is null when drill-in missing', () => {
  assert.equal(drillBackUrl(null), null);
});

test('drillBackUrl is null for unmapped surface', () => {
  assert.equal(drillBackUrl({ type: 'unknown', id: 'x' }), null);
});

// ── DEMO detection ─────────────────────────────────────────────────────────

test('isCsvDemoExport recognises "# DEMO" CSV prefix', () => {
  assert.equal(isCsvDemoExport('# DEMO — not regulator-submittable\nid,reported_at\n'), true);
});

test('isCsvDemoExport returns false on production manifests', () => {
  assert.equal(isCsvDemoExport('id,reported_at\nrow,2025-01-01\n'), false);
});

test('isNdjsonDemoExport recognises {"_meta":"DEMO"} first line', () => {
  const body = '{"_meta":"DEMO","warning":"x"}\n{"id":"a"}\n';
  assert.equal(isNdjsonDemoExport(body), true);
});

test('isNdjsonDemoExport returns false on plain ndjson', () => {
  const body = '{"id":"a"}\n{"id":"b"}\n';
  assert.equal(isNdjsonDemoExport(body), false);
});

// ── Audit payload composition ──────────────────────────────────────────────

test('buildAuditPayload includes drill-in pair when active', () => {
  const p = buildAuditPayload('view', {
    note: 'mount',
    drillIn: { type: 'patient_profile', id: 'p-1' },
  });
  assert.equal(p.source_target_type, 'patient_profile');
  assert.equal(p.source_target_id, 'p-1');
});

test('buildAuditPayload omits drill-in pair when inactive', () => {
  const p = buildAuditPayload('view', { note: 'mount' });
  assert.equal('source_target_type' in p, false);
  assert.equal('source_target_id' in p, false);
});

test('buildAuditPayload preserves the event note', () => {
  const p = buildAuditPayload('export_csv', { note: 'rows=12' });
  assert.match(p.note, /rows=12/);
});

// ── Surface coverage matrix ────────────────────────────────────────────────

test('every drill-in surface has a label and a back-page', () => {
  for (const surface of KNOWN_DRILL_IN_SURFACES) {
    assert.ok(DRILL_IN_LABELS[surface], `missing DRILL_IN_LABELS[${surface}]`);
    assert.ok(DRILL_BACK_PAGES[surface], `missing DRILL_BACK_PAGES[${surface}]`);
  }
});

test('drill-in surface set matches backend KNOWN_DRILL_IN_SURFACES', () => {
  // Backend whitelist (from adverse_events_router.py KNOWN_DRILL_IN_SURFACES).
  // If the backend list grows, both must be updated together.
  const backend = new Set([
    'patient_profile', 'course_detail', 'clinical_trials',
    'irb_manager', 'quality_assurance', 'documents_hub', 'reports_hub',
  ]);
  assert.equal(KNOWN_DRILL_IN_SURFACES.size, backend.size);
  for (const s of backend) assert.ok(KNOWN_DRILL_IN_SURFACES.has(s), `frontend missing ${s}`);
});
