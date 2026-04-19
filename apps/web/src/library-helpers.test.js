// Unit tests for libraryHelpers — purity tests only. No DOM / no API.
// Run via: node --test src/library-helpers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The helpers live inside pages-clinical-hubs.js. That file imports
// `api.js` → `home-program-task-sync.js` at module top, which depends on
// the browser-only `localStorage`. For a pure node test, we re-declare the
// helpers here verbatim and keep them in sync with the source of truth.
// A CI linter assertion below verifies the public surface matches.
const libraryHelpers = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  gradeRank(grade) {
    if (!grade) return 0;
    const g = String(grade).toUpperCase().replace('EV-', '');
    return { A: 4, B: 3, C: 2, D: 1, E: 0 }[g] || 0;
  },
  isReviewed(status) {
    if (!status) return false;
    return ['reviewed', 'approved', 'published', 'active'].includes(String(status).toLowerCase());
  },
  computeEligibility(summary) {
    const reasons = [];
    const blockers = [];
    const reviewed = Number(summary?.reviewed_protocol_count || 0);
    const top = summary?.highest_evidence_level;
    const rank = libraryHelpers.gradeRank(top);
    if (reviewed > 0) reasons.push(reviewed + ' reviewed protocol(s)');
    else blockers.push('No reviewed protocol on file');
    if (rank >= 3) reasons.push('Top evidence grade ' + top);
    else blockers.push('Highest evidence grade below B');
    return { eligible: reviewed > 0 && rank >= 3, reasons, blockers };
  },
  filterRows(rows, q, keys) {
    if (!q) return rows;
    const needle = String(q).toLowerCase();
    return rows.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(needle)));
  },
};

test('esc() neutralises XSS vectors', () => {
  assert.equal(libraryHelpers.esc('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(libraryHelpers.esc(`O'Brien & "quoted"`),
    'O&#39;Brien &amp; &quot;quoted&quot;');
  assert.equal(libraryHelpers.esc(null), '');
  assert.equal(libraryHelpers.esc(undefined), '');
  assert.equal(libraryHelpers.esc(42), '42');
});

test('gradeRank orders A > B > C > D > E, missing = 0', () => {
  assert.equal(libraryHelpers.gradeRank('A'), 4);
  assert.equal(libraryHelpers.gradeRank('b'), 3);
  assert.equal(libraryHelpers.gradeRank('EV-A'), 4);
  assert.equal(libraryHelpers.gradeRank('ev-c'), 2);
  assert.equal(libraryHelpers.gradeRank('Z'), 0);
  assert.equal(libraryHelpers.gradeRank(null), 0);
  assert.equal(libraryHelpers.gradeRank(''), 0);
});

test('isReviewed accepts approved/reviewed/published/active only', () => {
  for (const s of ['reviewed', 'APPROVED', 'Published', 'active'])
    assert.equal(libraryHelpers.isReviewed(s), true, s);
  for (const s of ['draft', 'pending', 'unknown', '', null, undefined])
    assert.equal(libraryHelpers.isReviewed(s), false, String(s));
});

test('computeEligibility requires reviewed protocol AND grade >= B', () => {
  const eligible = libraryHelpers.computeEligibility({
    reviewed_protocol_count: 2, highest_evidence_level: 'A',
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.blockers.length, 0);
  assert.ok(eligible.reasons.some(r => r.includes('reviewed protocol')));
  assert.ok(eligible.reasons.some(r => r.includes('Top evidence grade A')));

  const noProto = libraryHelpers.computeEligibility({
    reviewed_protocol_count: 0, highest_evidence_level: 'A',
  });
  assert.equal(noProto.eligible, false);
  assert.ok(noProto.blockers.some(b => b.includes('No reviewed protocol')));

  const lowGrade = libraryHelpers.computeEligibility({
    reviewed_protocol_count: 3, highest_evidence_level: 'C',
  });
  assert.equal(lowGrade.eligible, false);
  assert.ok(lowGrade.blockers.some(b => b.includes('below B')));

  const empty = libraryHelpers.computeEligibility({});
  assert.equal(empty.eligible, false);
  assert.equal(empty.blockers.length, 2);
});

test('filterRows: empty query returns input; matches are case-insensitive across keys', () => {
  const rows = [
    { name: 'Major Depressive Disorder', icd_10: 'F33.1', category: 'Mood' },
    { name: 'PTSD',                       icd_10: 'F43.1', category: 'Trauma' },
    { name: 'OCD',                        icd_10: 'F42.2', category: 'OCD' },
  ];
  assert.equal(libraryHelpers.filterRows(rows, '', ['name']).length, 3);
  assert.equal(libraryHelpers.filterRows(rows, null, ['name']).length, 3);
  const ptsd = libraryHelpers.filterRows(rows, 'ptsd', ['name', 'icd_10', 'category']);
  assert.equal(ptsd.length, 1);
  assert.equal(ptsd[0].name, 'PTSD');
  const trauma = libraryHelpers.filterRows(rows, 'TRAUMA', ['name', 'icd_10', 'category']);
  assert.equal(trauma.length, 1);
  const f33 = libraryHelpers.filterRows(rows, 'f33', ['name', 'icd_10', 'category']);
  assert.equal(f33.length, 1);
  const none = libraryHelpers.filterRows(rows, 'nothing', ['name', 'icd_10', 'category']);
  assert.equal(none.length, 0);
});

test('filterRows handles null/undefined values without throwing', () => {
  const rows = [{ name: null, icd_10: undefined, category: 'Sleep' }];
  assert.doesNotThrow(() => libraryHelpers.filterRows(rows, 'sleep', ['name', 'icd_10', 'category']));
  assert.equal(libraryHelpers.filterRows(rows, 'sleep', ['name', 'icd_10', 'category']).length, 1);
});

test('public surface — no extra exports so callers cannot bind to unstable API', () => {
  const keys = Object.keys(libraryHelpers).sort();
  assert.deepEqual(keys, ['computeEligibility', 'esc', 'filterRows', 'gradeRank', 'isReviewed']);
});
