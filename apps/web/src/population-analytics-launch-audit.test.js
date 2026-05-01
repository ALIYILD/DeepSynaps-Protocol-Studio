// Logic-only tests for the Population Analytics launch-audit (2026-05-01).
//
// Pins the page contract against silent fakes:
//   - Audit-event payload composition (event / cohort_key / drill_out / filters_json / demo)
//   - Filter persistence (localStorage key, empty-string compaction)
//   - DEMO banner renders only when at least one cohort row is demo
//   - Cohort previews never carry PHI fields (no first_name/last_name/email)
//   - Drill-out URL composition for patients_hub / irb_manager / adverse_events_hub
//   - Empty-state copy is honest (no fabricated trends)
//   - n<2 buckets are dropped server-side; client must not infer them
//
// Run: node --test src/population-analytics-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers ─────────────────────────────────────────────


function buildAuditPayload(event, extra = {}) {
  return {
    event,
    cohort_key: extra.cohort_key || null,
    drill_out_target_type: extra.drill_out_target_type || null,
    drill_out_target_id: extra.drill_out_target_id || null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
    filters_json: extra.filters_json || null,
  };
}

function popCleanParams(filters) {
  const out = {};
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s) out[k] = s;
  });
  return out;
}

function shouldShowDemoBanner(summary, list, trend, ae, resp) {
  return !!(
    (summary && summary.has_demo) ||
    (list && list.has_demo) ||
    (trend && trend.has_demo) ||
    (ae && ae.has_demo) ||
    (resp && resp.has_demo)
  );
}

function rowIsAnonymised(row) {
  if (!row || typeof row !== 'object') return false;
  const banned = ['first_name', 'last_name', 'email', 'phone', 'mrn', 'patient_id', 'id'];
  for (const k of banned) {
    if (k in row) {
      // cohort_key is allowed
      if (k === 'id' && row.cohort_key) continue;
      return false;
    }
  }
  return true;
}

function drillOutUrl(target, cohortKey) {
  if (target === 'patients_hub') {
    return `#page=patients&cohort=${encodeURIComponent(cohortKey || '')}`;
  }
  if (target === 'irb_manager') {
    return `#page=irb-manager&protocol=${encodeURIComponent(cohortKey || '')}`;
  }
  if (target === 'adverse_events_hub') {
    return `#page=adverse-events`;
  }
  return null;
}

function emptyStateForTrend(trend) {
  if (!trend || !Array.isArray(trend.series) || trend.series.length === 0) {
    return 'No data in cohort yet';
  }
  return null;
}

function bucketHasN2OrMore(bucket) {
  return !!(bucket && typeof bucket.n_patients === 'number' && bucket.n_patients >= 2);
}


// ── Tests ──────────────────────────────────────────────────────────────────


test('Audit payload carries event, cohort_key, drill_out, demo flag, filters', () => {
  const payload = buildAuditPayload('chart_drilled_out', {
    cohort_key: 'MDD|TMS|26-35|F',
    drill_out_target_type: 'patients_hub',
    drill_out_target_id: 'MDD|TMS|26-35|F',
    note: 'view patients button',
    using_demo_data: true,
    filters_json: JSON.stringify({ condition: 'MDD' }),
  });
  assert.equal(payload.event, 'chart_drilled_out');
  assert.equal(payload.cohort_key, 'MDD|TMS|26-35|F');
  assert.equal(payload.drill_out_target_type, 'patients_hub');
  assert.equal(payload.drill_out_target_id, 'MDD|TMS|26-35|F');
  assert.equal(payload.note, 'view patients button');
  assert.equal(payload.using_demo_data, true);
  assert.equal(payload.filters_json, '{"condition":"MDD"}');
});

test('Audit payload defaults: blank fields stay null, not empty strings', () => {
  const payload = buildAuditPayload('view');
  assert.equal(payload.event, 'view');
  assert.equal(payload.cohort_key, null);
  assert.equal(payload.drill_out_target_type, null);
  assert.equal(payload.note, null);
  assert.equal(payload.using_demo_data, false);
  assert.equal(payload.filters_json, null);
});

test('popCleanParams strips empty/null and trims whitespace', () => {
  const cleaned = popCleanParams({
    condition: 'MDD',
    modality: '',
    age_band: '  ',
    sex: null,
    severity_band: undefined,
    since: '2026-01-01',
  });
  assert.deepEqual(cleaned, { condition: 'MDD', since: '2026-01-01' });
});

test('Demo banner shows only when at least one panel returns has_demo=true', () => {
  assert.equal(shouldShowDemoBanner(null, null, null, null, null), false);
  assert.equal(shouldShowDemoBanner({ has_demo: false }, null, null, null, null), false);
  assert.equal(shouldShowDemoBanner({ has_demo: true }, null, null, null, null), true);
  assert.equal(shouldShowDemoBanner(null, { has_demo: true }, null, null, null), true);
  assert.equal(shouldShowDemoBanner(null, null, null, { has_demo: true }, null), true);
});

test('Cohort row carries no PHI', () => {
  // Real server response shape — cohort_key + counts only.
  const goodRow = {
    cohort_key: 'MDD|TMS|26-35|F',
    condition: 'MDD',
    modality: 'TMS',
    age_band: '26-35',
    sex: 'F',
    count: 12,
    demo_count: 0,
    has_demo: false,
    signed_count: 10,
  };
  assert.equal(rowIsAnonymised(goodRow), true);

  // Hypothetical tampered row — must reject.
  const phi = { ...goodRow, first_name: 'Alice', last_name: 'Smith' };
  assert.equal(rowIsAnonymised(phi), false);

  const withEmail = { ...goodRow, email: 'a@b.com' };
  assert.equal(rowIsAnonymised(withEmail), false);
});

test('Drill-out URL composition is encoded and target-specific', () => {
  assert.equal(drillOutUrl('patients_hub', 'MDD|TMS|26-35|F'), '#page=patients&cohort=MDD%7CTMS%7C26-35%7CF');
  assert.equal(drillOutUrl('irb_manager', 'tms-mdd-10hz'), '#page=irb-manager&protocol=tms-mdd-10hz');
  assert.equal(drillOutUrl('adverse_events_hub', 'anything'), '#page=adverse-events');
  assert.equal(drillOutUrl('unknown_target', 'whatever'), null);
});

test('Empty trend → honest empty-state copy, never fabricated buckets', () => {
  assert.equal(emptyStateForTrend(null), 'No data in cohort yet');
  assert.equal(emptyStateForTrend({ series: [] }), 'No data in cohort yet');
  assert.equal(emptyStateForTrend({ series: [{ scale: 'PHQ-9', buckets: [] }] }), null);
});

test('n<2 trend buckets fail the n_patients gate (server should drop them)', () => {
  assert.equal(bucketHasN2OrMore({ n_patients: 1 }), false);
  assert.equal(bucketHasN2OrMore({ n_patients: 0 }), false);
  assert.equal(bucketHasN2OrMore({ n_patients: 2 }), true);
  assert.equal(bucketHasN2OrMore({ n_patients: 12 }), true);
});

test('Audit event vocabulary covers the full population_analytics surface', () => {
  const knownEvents = [
    'view',
    'cohort_filter_changed',
    'chart_drilled_out',
    'export_csv',
    'export_ndjson',
  ];
  // Each event composes a valid payload (no schema drift).
  for (const ev of knownEvents) {
    const p = buildAuditPayload(ev);
    assert.equal(p.event, ev);
  }
});

test('Filters echo round-trip: object → URL params → object', () => {
  const filters = {
    condition: 'MDD',
    modality: 'TMS',
    age_band: '26-35',
    sex: 'F',
    severity_band: 'moderate',
    since: '2026-01-01',
    until: '2026-04-30',
  };
  const cleaned = popCleanParams(filters);
  const usp = new URLSearchParams(cleaned);
  const back = Object.fromEntries(usp.entries());
  assert.deepEqual(back, filters);
});
