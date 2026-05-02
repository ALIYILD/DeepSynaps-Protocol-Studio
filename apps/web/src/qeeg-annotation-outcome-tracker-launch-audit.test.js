// Logic-only tests for the QEEG-ANN2 qEEG Annotation Resolution
// Outcome Tracker launch-audit (2026-05-02).
//
// Surface contract pinned by this suite:
//   - api.js exposes 5 helpers under /api/v1/qeeg-annotation-outcome-tracker/.
//   - QEEG-ANN2 helpers placed BEFORE QEEG-ANN1 in api.js (per the
//     spec's slice-boundary ordering).
//   - pages-brainmap.js exports renderQeegAnnotationOutcomeTrackerSection
//     plus pure helpers (buildQeegAnnotationOutcomeKpiTiles, etc).
//
// Run: node --test src/qeeg-annotation-outcome-tracker-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import {
  buildQeegAnnotationOutcomeKpiTiles,
  evidenceGapBadgeTone,
  qeegAnn2OutcomeTrackerEmpty,
  buildQeegAnn2BacklogRowMarkup,
  buildQeegAnn2FlagTypeRows,
  buildQeegAnn2TopCreators,
  buildQeegAnn2TopResolvers,
  qeegAnn2WindowOptions,
  loadQeegAnn2OutcomeTrackerData,
  renderQeegAnnotationOutcomeTrackerSection,
  _QEEG_ANN2_INTERNALS,
} from './pages-brainmap.js';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PATH = path.join(__dirname, 'api.js');
const PAGE_PATH = path.join(__dirname, 'pages-brainmap.js');


// ── 1. KPI tiles render shape ─────────────────────────────────────────────


test('section renders 6 KPI tiles with correct labels', () => {
  const summary = {
    total_annotations: 12,
    outcome_pct: {
      resolved_within_sla: 60.0,
      resolved_late: 20.0,
      still_open_overdue: 20.0,
    },
    median_days_to_resolve: 4.5,
    p90_days_to_resolve: 9.2,
    evidence_gap_open_overdue_count: 2,
  };
  const tiles = buildQeegAnnotationOutcomeKpiTiles(summary);
  assert.equal(tiles.length, 6);
  assert.equal(tiles[0].label, 'Total annotations');
  assert.equal(tiles[0].value, 12);
  assert.equal(tiles[1].label, '% resolved within SLA');
  assert.equal(tiles[1].value, '60%');
  assert.equal(tiles[2].label, '% resolved late');
  assert.equal(tiles[3].label, 'Median days to resolve');
  assert.equal(tiles[3].value, '4.5d');
  assert.equal(tiles[4].label, 'P90 days to resolve');
  assert.equal(tiles[4].value, '9.2d');
  assert.equal(tiles[5].label, 'Evidence-gap overdue');
  assert.equal(tiles[5].value, 2);
});


test('median + p90 tiles render em-dash when null', () => {
  const tiles = buildQeegAnnotationOutcomeKpiTiles({
    total_annotations: 0,
    median_days_to_resolve: null,
    p90_days_to_resolve: null,
    evidence_gap_open_overdue_count: 0,
  });
  assert.equal(tiles[3].value, '—');
  assert.equal(tiles[4].value, '—');
});


// ── 2. Empty state ────────────────────────────────────────────────────────


test('empty state when summary is empty / null', () => {
  assert.equal(qeegAnn2OutcomeTrackerEmpty({ total_annotations: 0 }), true);
  assert.equal(qeegAnn2OutcomeTrackerEmpty(null), true);
  assert.equal(qeegAnn2OutcomeTrackerEmpty(undefined), true);
  assert.equal(qeegAnn2OutcomeTrackerEmpty({ total_annotations: 5 }), false);
});


// ── 3. Evidence-gap red badge ─────────────────────────────────────────────


test('evidence_gap badge tone is rose when count > 0', () => {
  assert.equal(evidenceGapBadgeTone(1), 'rose');
  assert.equal(evidenceGapBadgeTone(99), 'rose');
});


test('evidence_gap badge tone is muted when count is 0 or invalid', () => {
  assert.equal(evidenceGapBadgeTone(0), 'muted');
  assert.equal(evidenceGapBadgeTone(null), 'muted');
  assert.equal(evidenceGapBadgeTone(undefined), 'muted');
  assert.equal(evidenceGapBadgeTone('nan'), 'muted');
});


// ── 4. Flag-type breakdown table ──────────────────────────────────────────


test('flag-type breakdown rows preserve all backend fields', () => {
  const rows = buildQeegAnn2FlagTypeRows({
    evidence_gap: {
      total: 5,
      resolved_within_sla: 3,
      resolved_late: 1,
      still_open_overdue: 1,
      still_open_grace: 0,
      median_days_to_resolve: 6,
    },
    clinically_significant: {
      total: 2,
      resolved_within_sla: 2,
      resolved_late: 0,
      still_open_overdue: 0,
      still_open_grace: 0,
      median_days_to_resolve: 1.5,
    },
  });
  assert.equal(rows.length, 2);
  // Sorted alphabetically.
  assert.equal(rows[0].flag_type, 'clinically_significant');
  assert.equal(rows[1].flag_type, 'evidence_gap');
  assert.equal(rows[1].total, 5);
  assert.equal(rows[1].still_open_overdue, 1);
});


test('flag-type breakdown returns empty array on null input', () => {
  assert.deepEqual(buildQeegAnn2FlagTypeRows(null), []);
  assert.deepEqual(buildQeegAnn2FlagTypeRows(undefined), []);
});


// ── 5. Overdue backlog rendering + pagination ─────────────────────────────


test('backlog row markup escapes user content', () => {
  const item = {
    annotation_id: 'a1',
    days_open: 42.3,
    flag_type: 'evidence_gap',
    creator_user_id: 'clin-x',
    creator_name: '<b>injection</b>',
    created_at: '2026-04-01T00:00:00Z',
    body: '<script>alert(1)</script>',
  };
  const markup = buildQeegAnn2BacklogRowMarkup(item);
  assert.match(markup, /42\.3d/);
  assert.match(markup, /evidence_gap/);
  // Both injection attempts must be HTML-escaped.
  assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('<b>injection</b>'));
});


test('overdue backlog respects page_size in loader call', async () => {
  const calls = [];
  const fakeApi = {
    fetchQeegAnnotationOutcomeSummary: async (p) => {
      calls.push(['summary', p]);
      return { total_annotations: 3 };
    },
    fetchQeegAnnotationCreatorSummary: async (p) => {
      calls.push(['creators', p]);
      return { items: [] };
    },
    fetchQeegAnnotationResolverLatencySummary: async (p) => {
      calls.push(['resolvers', p]);
      return { items: [] };
    },
    fetchQeegAnnotationBacklog: async (p) => {
      calls.push(['backlog', p]);
      return { items: [] };
    },
  };
  await loadQeegAnn2OutcomeTrackerData(fakeApi, {
    windowDays: 90,
    slaDays: 14,
    page: 2,
  });
  const backlogCall = calls.find((c) => c[0] === 'backlog');
  assert.ok(backlogCall);
  assert.equal(backlogCall[1].page, 2);
  assert.equal(backlogCall[1].include_grace, false);
  assert.equal(backlogCall[1].window_days, 90);
});


// ── 6. Top-creators leaderboard ───────────────────────────────────────────


test('top creators sorted by total_created desc, capped at 5', () => {
  const items = [
    { creator_user_id: 'c1', total_created: 3 },
    { creator_user_id: 'c2', total_created: 7 },
    { creator_user_id: 'c3', total_created: 5 },
    { creator_user_id: 'c4', total_created: 1 },
    { creator_user_id: 'c5', total_created: 9 },
    { creator_user_id: 'c6', total_created: 2 },
    { creator_user_id: 'c7', total_created: 4 },
  ];
  const top = buildQeegAnn2TopCreators(items, 5);
  assert.equal(top.length, 5);
  assert.equal(top[0].creator_user_id, 'c5');
  assert.equal(top[1].creator_user_id, 'c2');
  // Assert ordering invariant.
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i - 1].total_created >= top[i].total_created);
  }
});


// ── 7. Top-resolvers leaderboard ──────────────────────────────────────────


test('top resolvers sorted by median_days_to_resolve asc (fastest first)', () => {
  const items = [
    { resolver_user_id: 'r1', median_days_to_resolve: 8 },
    { resolver_user_id: 'r2', median_days_to_resolve: 2 },
    { resolver_user_id: 'r3', median_days_to_resolve: 5 },
  ];
  const top = buildQeegAnn2TopResolvers(items, 5);
  assert.equal(top[0].resolver_user_id, 'r2');
  assert.equal(top[1].resolver_user_id, 'r3');
  assert.equal(top[2].resolver_user_id, 'r1');
});


// ── 8. Weekly trend chart ─────────────────────────────────────────────────


test('weekly trend buckets carry created/resolved/abandoned per week', async () => {
  const fakeApi = {
    fetchQeegAnnotationOutcomeSummary: async () => ({
      total_annotations: 5,
      outcome_counts: {},
      outcome_pct: {},
      by_flag_type: {},
      trend_buckets: [
        { week_start: '2026-04-01T00:00:00Z', created: 3, resolved: 2, abandoned: 0 },
        { week_start: '2026-04-08T00:00:00Z', created: 5, resolved: 4, abandoned: 1 },
      ],
      evidence_gap_open_overdue_count: 0,
    }),
    fetchQeegAnnotationCreatorSummary: async () => ({ items: [] }),
    fetchQeegAnnotationResolverLatencySummary: async () => ({ items: [] }),
    fetchQeegAnnotationBacklog: async () => ({ items: [] }),
  };
  const out = await renderQeegAnnotationOutcomeTrackerSection({
    apiClient: fakeApi,
  });
  assert.equal(out.error, null);
  assert.match(out.markup, /Weekly trend/);
  assert.match(out.markup, /trend-bar/);
});


// ── 9. Window selector triggers re-fetch ──────────────────────────────────


test('window selector value triggers re-fetch with the new window_days', async () => {
  const calls = [];
  const fakeApi = {
    fetchQeegAnnotationOutcomeSummary: async (p) => {
      calls.push(p);
      return { total_annotations: 0 };
    },
    fetchQeegAnnotationCreatorSummary: async () => ({ items: [] }),
    fetchQeegAnnotationResolverLatencySummary: async () => ({ items: [] }),
    fetchQeegAnnotationBacklog: async () => ({ items: [] }),
  };
  await loadQeegAnn2OutcomeTrackerData(fakeApi, { windowDays: 30 });
  await loadQeegAnn2OutcomeTrackerData(fakeApi, { windowDays: 365 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].window_days, 30);
  assert.equal(calls[1].window_days, 365);
});


test('window options match the bounded backend allowlist', () => {
  const opts = qeegAnn2WindowOptions();
  assert.deepEqual(opts, [30, 90, 180, 365]);
});


// ── 10. Audit-events surface name ─────────────────────────────────────────


test('audit-events surface name matches backend SURFACE constant', () => {
  assert.equal(_QEEG_ANN2_INTERNALS.SURFACE, 'qeeg_annotation_outcome_tracker');
});


// ── 11. Error state on 500 ────────────────────────────────────────────────


test('error state returns when summary load fails (apiClient returns null)', async () => {
  const fakeApi = {
    fetchQeegAnnotationOutcomeSummary: async () => null,
    fetchQeegAnnotationCreatorSummary: async () => null,
    fetchQeegAnnotationResolverLatencySummary: async () => null,
    fetchQeegAnnotationBacklog: async () => null,
  };
  const out = await renderQeegAnnotationOutcomeTrackerSection({
    apiClient: fakeApi,
  });
  assert.equal(out.error, 'load_failed');
  assert.match(out.markup, /failed to load/);
});


// ── 12. Empty backlog state ───────────────────────────────────────────────


test('empty backlog renders the no-overdue helper text', async () => {
  const fakeApi = {
    fetchQeegAnnotationOutcomeSummary: async () => ({
      total_annotations: 1,
      outcome_counts: {},
      outcome_pct: {},
      by_flag_type: {},
      trend_buckets: [],
      evidence_gap_open_overdue_count: 0,
    }),
    fetchQeegAnnotationCreatorSummary: async () => ({ items: [] }),
    fetchQeegAnnotationResolverLatencySummary: async () => ({ items: [] }),
    fetchQeegAnnotationBacklog: async () => ({ items: [] }),
  };
  const out = await renderQeegAnnotationOutcomeTrackerSection({
    apiClient: fakeApi,
  });
  assert.match(out.markup, /No overdue annotations/);
});


// ── 13. api.js slice anchors + helpers ────────────────────────────────────


test('api.js carries QEEG-ANN2 header + slice-boundary sentinel', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /QEEG-ANN2 Annotation Outcome Tracker launch-audit/);
  assert.match(apiSrc, /QEEG-ANN2 SLICE BOUNDARY/);
  const helpers = [
    'fetchQeegAnnotationOutcomeSummary',
    'fetchQeegAnnotationCreatorSummary',
    'fetchQeegAnnotationResolverLatencySummary',
    'fetchQeegAnnotationBacklog',
    'fetchQeegAnnotationOutcomeAuditEvents',
  ];
  for (const h of helpers) {
    assert.match(apiSrc, new RegExp(h));
  }
});


// ── 14. Slice ordering (QEEG-ANN2 BEFORE QEEG-ANN1) ───────────────────────


test('QEEG-ANN2 slice anchors land BEFORE QEEG-ANN1 slice in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const ann2Header = apiSrc.indexOf(
    'QEEG-ANN2 Annotation Outcome Tracker launch-audit',
  );
  const ann1Header = apiSrc.indexOf(
    'QEEG-ANN1 Brain Map Annotations launch-audit',
  );
  assert.ok(ann2Header > 0, 'QEEG-ANN2 header should exist');
  assert.ok(ann1Header > 0, 'QEEG-ANN1 header should exist');
  assert.ok(
    ann2Header < ann1Header,
    'QEEG-ANN2 helpers must be placed BEFORE QEEG-ANN1 to keep the QEEG-ANN1 slice-boundary clean',
  );
});


// ── 15. pages-brainmap.js renderer integration ────────────────────────────


test('pages-brainmap.js carries renderQeegAnnotationOutcomeTrackerSection renderer', () => {
  const pgSrc = fs.readFileSync(PAGE_PATH, 'utf8');
  assert.match(pgSrc, /renderQeegAnnotationOutcomeTrackerSection/);
  assert.match(pgSrc, /buildQeegAnnotationOutcomeKpiTiles/);
  assert.match(pgSrc, /qeeg_annotation_outcome_tracker/);
});
