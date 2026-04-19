// Logic-only tests for the Reports Hub Analytics tab wiring.
// Run: node --test src/reports-hub-analytics.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors the KPI derivation in pgReportsHubNew's Analytics branch. Keep this
// in sync with the source if aggregateOutcomes() response shape changes.
function deriveAnalyticsKpis(agg) {
  const respRate = agg?.responder_rate_pct != null ? Math.round(agg.responder_rate_pct) + '%' : '—';
  const phqDrop  = agg?.avg_phq9_drop != null
    ? (agg.avg_phq9_drop > 0 ? '−' : '+') + Math.abs(Math.round(agg.avg_phq9_drop * 10) / 10)
    : '—';
  const completion = agg?.assessment_completion_pct != null
    ? Math.round(agg.assessment_completion_pct) + '%'
    : '—';
  const overdue = agg?.assessments_overdue_count != null ? agg.assessments_overdue_count : '—';
  return { respRate, phqDrop, completion, overdue };
}

test('aggregateOutcomes → KPI strings handle a healthy clinic', () => {
  const kpi = deriveAnalyticsKpis({
    responder_rate_pct: 67.4,
    avg_phq9_drop: 7.3,
    assessment_completion_pct: 82.1,
    assessments_overdue_count: 3,
    courses_with_outcomes: 24,
    responders: 16,
  });
  assert.equal(kpi.respRate,   '67%');
  assert.equal(kpi.phqDrop,    '−7.3');
  assert.equal(kpi.completion, '82%');
  assert.equal(kpi.overdue,    3);
});

test('aggregateOutcomes → KPI strings handle an empty clinic (all null)', () => {
  const kpi = deriveAnalyticsKpis({});
  assert.equal(kpi.respRate,   '—');
  assert.equal(kpi.phqDrop,    '—');
  assert.equal(kpi.completion, '—');
  assert.equal(kpi.overdue,    '—');
});

test('PHQ-9 Δ flips sign correctly for a worsening case', () => {
  const kpi = deriveAnalyticsKpis({ avg_phq9_drop: -2.1 });
  assert.equal(kpi.phqDrop, '+2.1');
});

// Mirrors the courses-by-condition aggregation.
function condCounts(courses) {
  const out = {};
  courses.forEach(c => {
    const k = (c.condition_slug || c.condition || '').toLowerCase();
    if (!k) return;
    out[k] = (out[k] || 0) + 1;
  });
  return Object.entries(out)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug, n]) => ({
      slug, n,
      pct: courses.length ? Math.round(n / courses.length * 100) : 0,
    }));
}

test('condCounts ranks by frequency and computes percentages', () => {
  const courses = [
    { condition_slug: 'mdd' },
    { condition_slug: 'mdd' },
    { condition_slug: 'mdd' },
    { condition_slug: 'ptsd' },
    { condition: 'Anxiety' },
    { condition_slug: null },
  ];
  const rows = condCounts(courses);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].slug, 'mdd');
  assert.equal(rows[0].n,    3);
  assert.equal(rows[0].pct,  50);     // 3 / 6
  assert.equal(rows.find(r => r.slug === 'anxiety').n, 1);
});

test('condCounts returns empty array when no courses carry a condition', () => {
  assert.deepEqual(condCounts([]), []);
  assert.deepEqual(condCounts([{ id: 'c1' }, { id: 'c2' }]), []);
});

// Mirrors the CSV row builder used by the Export tab.
function buildCsv(header, rows) {
  const quote = s => /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  return [header.join(','), ...rows.map(r => r.map(quote).join(','))].join('\n');
}

test('CSV builder quotes cells that contain commas, quotes, or newlines', () => {
  const out = buildCsv(
    ['id', 'note'],
    [
      ['a', 'plain text'],
      ['b', 'has, comma'],
      ['c', 'has "quotes"'],
      ['d', 'line\nbreak'],
    ],
  );
  const lines = out.split('\n');
  assert.equal(lines[0], 'id,note');
  assert.equal(lines[1], 'a,plain text');
  assert.equal(lines[2], 'b,"has, comma"');
  assert.equal(lines[3], 'c,"has ""quotes"""');
  // Newline inside a quoted field: the raw blob contains a real newline.
  assert.ok(out.includes('d,"line\nbreak"'));
});
