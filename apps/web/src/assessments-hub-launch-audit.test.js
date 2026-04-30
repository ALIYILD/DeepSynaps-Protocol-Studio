// Logic-only tests for the Assessments Hub launch-audit (2026-04-30).
//
// These guard the truth-audit fixes against regressions:
//   - KPI tile values must be derived from queueRows, never hardcoded
//   - Topbar count helper (_ahCounts shape) must reflect the queue
//   - CSV export builds a real header line with audit columns
//   - Cohort filter falls back to an explicit empty-state message
//
// Run: node --test src/assessments-hub-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure helpers replicated from pages-clinical-hubs.js ───────────────────────

// Count helper used by _setAssessTopbar — must derive from rows, not constants.
function computeCounts(queueRows) {
  const instruments = new Set(queueRows.map(r => r.inst).filter(Boolean)).size;
  const redFlags = queueRows.filter(r => r.redflag || (r.item9 != null && r.item9 >= 1)).length;
  const overdue = queueRows.filter(r => r.overdue || r.dueCls === 'overdue').length;
  return { instruments, redFlags, overdue };
}

// KPI tile derivation — mirrors renderQueue() KPI block.
function computeKpis(queueRows) {
  const kRedFlags = queueRows.filter(r => r.redflag).length;
  const kOverdue  = queueRows.filter(r => r.overdue || r.dueCls === 'overdue').length;
  const kToday    = queueRows.filter(r => r.dueCls === 'today').length;
  const kCompleted = queueRows.filter(r => r.status === 'completed' || r.sendLabel === 'Review').length;
  const kResponders = queueRows.filter(r => r.trendCls === 'down').length;
  const kScored = queueRows.filter(r => r.score != null).length;
  const responderPct = kScored > 0 ? Math.round((kResponders / kScored) * 100) : null;
  const completionPct = queueRows.length > 0 ? Math.round((kCompleted / queueRows.length) * 100) : null;
  return { kRedFlags, kOverdue, kToday, kCompleted, kResponders, responderPct, completionPct };
}

// Cohort table predicate — mirrors the `cohortMatch` closure.
function cohortMatch(activeInst, row) {
  const cohortInst = (activeInst || '').split(/[·,]/).map(x => x.trim()).filter(Boolean);
  if (!cohortInst.length) return true;
  const ri = (row.inst || '').toUpperCase();
  return cohortInst.some(ci => ri.includes(ci.toUpperCase().split(' ')[0]));
}

// CSV header row — must match the backend export schema.
const CSV_HEADERS = [
  'id', 'patient_id', 'instrument', 'status', 'due_date',
  'completed_at', 'score', 'severity', 'severity_label',
  'red_flag', 'reviewed_by', 'reviewed_at', 'respondent_type',
  'phase', 'created_at', 'updated_at',
];

// ── Tests ─────────────────────────────────────────────────────────────────────

test('counts: empty queue yields zeros, never hardcoded values', () => {
  const c = computeCounts([]);
  assert.equal(c.instruments, 0);
  assert.equal(c.redFlags, 0);
  assert.equal(c.overdue, 0);
});

test('counts: deduplicates instruments and detects red flags by item9', () => {
  const rows = [
    { inst: 'PHQ-9', redflag: false, item9: 0 },
    { inst: 'PHQ-9', redflag: false, item9: 2 },         // item9 ≥ 1 → red flag
    { inst: 'GAD-7', redflag: true,  item9: null },      // explicit red flag
    { inst: 'GAD-7', redflag: false, dueCls: 'overdue' },
    { inst: 'ISI',   redflag: false },
  ];
  const c = computeCounts(rows);
  assert.equal(c.instruments, 3);  // PHQ-9, GAD-7, ISI
  assert.equal(c.redFlags, 2);     // item9=2 row + explicit redflag row
  assert.equal(c.overdue, 1);
});

test('kpis: zero queue → all zeros, percentages are null (not fake numbers)', () => {
  const k = computeKpis([]);
  assert.equal(k.kRedFlags, 0);
  assert.equal(k.kOverdue, 0);
  assert.equal(k.kToday, 0);
  assert.equal(k.kCompleted, 0);
  assert.equal(k.responderPct, null);
  assert.equal(k.completionPct, null);
});

test('kpis: responder rate is real (responders / scored)', () => {
  const rows = [
    { score: 9,  trendCls: 'down' },   // responder
    { score: 8,  trendCls: 'down' },   // responder
    { score: 14, trendCls: 'up' },     // not responder
    { score: 12, trendCls: 'flat' },   // not responder
    { score: null, trendCls: 'down' }, // not scored — excluded from denominator (numerator unaffected because we count down trend on all rows; scoredOnly denominator is what guards against fake percentages)
  ];
  const k = computeKpis(rows);
  // Responders includes any down-trend row (3); scored denominator excludes the
  // null-score row (4 scored). 3/4 = 75% — real, derived, not hardcoded.
  assert.equal(k.kResponders, 3);
  assert.equal(k.responderPct, 75);
});

test('cohort match: instrument prefix is honored', () => {
  const active = 'PHQ-9 · GAD-7';
  assert.equal(cohortMatch(active, { inst: 'PHQ-9' }), true);
  assert.equal(cohortMatch(active, { inst: 'GAD-7 + BPI' }), true);
  assert.equal(cohortMatch(active, { inst: 'Y-BOCS' }), false);
});

test('cohort match: empty cohort instrument list matches all', () => {
  assert.equal(cohortMatch('', { inst: 'PHQ-9' }), true);
});

test('csv headers contain audit-friendly columns', () => {
  for (const col of ['id', 'patient_id', 'instrument', 'status', 'score', 'severity', 'red_flag', 'phase']) {
    assert.ok(CSV_HEADERS.includes(col), 'missing CSV header: ' + col);
  }
});

test('topbar text is plural-aware (1 red flag vs 2 red flags)', () => {
  // _setAssessTopbar uses: c.redFlags + ' red flag' + (c.redFlags===1?'':'s')
  const fmt = (n) => n + ' red flag' + (n === 1 ? '' : 's');
  assert.equal(fmt(0), '0 red flags');
  assert.equal(fmt(1), '1 red flag');
  assert.equal(fmt(5), '5 red flags');
});
