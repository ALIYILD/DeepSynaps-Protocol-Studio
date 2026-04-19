/**
 * Pure-logic tests for the patient-facing Assessments page helpers.
 *
 * These mirror the shared helpers exported from patient-dashboard-helpers.js
 * (classifyAssessmentStatus, scoreContext, draft storage, demoAssessmentSeed).
 * No DOM access — runs cleanly under plain `node --test`.
 *
 * Run from apps/web/:
 *   node --test src/patient-assessments-wiring.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAssessmentStatus,
  scoreContext,
  draftStorageKey,
  loadDraft,
  saveDraft,
  clearDraft,
  demoAssessmentSeed,
} from './patient-dashboard-helpers.js';

// ── Fake in-memory storage for draft tests ────────────────────────────────
function _mockStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

// ── classifyAssessmentStatus ──────────────────────────────────────────────

test('classifyAssessmentStatus: explicit "completed" status wins', () => {
  assert.equal(classifyAssessmentStatus({ status: 'completed' }), 'completed');
  assert.equal(classifyAssessmentStatus({ status: 'done' }),      'completed');
  assert.equal(classifyAssessmentStatus({ status: 'submitted' }), 'completed');
});

test('classifyAssessmentStatus: in-progress variants', () => {
  assert.equal(classifyAssessmentStatus({ status: 'in_progress' }), 'in-progress');
  assert.equal(classifyAssessmentStatus({ status: 'in-progress' }), 'in-progress');
  assert.equal(classifyAssessmentStatus({ status: 'started' }),     'in-progress');
  assert.equal(classifyAssessmentStatus({ status: 'partial' }),     'in-progress');
});

test('classifyAssessmentStatus: completed_at/administered_at implies completed', () => {
  assert.equal(classifyAssessmentStatus({ completed_at: '2026-04-10' }), 'completed');
  assert.equal(classifyAssessmentStatus({ administered_at: '2026-04-10' }), 'completed');
});

test('classifyAssessmentStatus: due vs upcoming is date-based against `now`', () => {
  const now = Date.parse('2026-04-19T12:00:00Z');
  assert.equal(classifyAssessmentStatus({ due_date: '2026-04-19T08:00:00Z' }, now), 'due');
  assert.equal(classifyAssessmentStatus({ due_date: '2026-04-22T08:00:00Z' }, now), 'upcoming');
});

test('classifyAssessmentStatus: fallback for empty row is "due"', () => {
  assert.equal(classifyAssessmentStatus({}), 'due');
  assert.equal(classifyAssessmentStatus(null), 'due');
});

// ── scoreContext ──────────────────────────────────────────────────────────

test('scoreContext: returns null when score missing or no meta', () => {
  assert.equal(scoreContext(null, 5),                       null);
  assert.equal(scoreContext({ scoreRanges: [] }, 5),        null);
  assert.equal(scoreContext({ scoreRanges: [{max:4,label:'Minimal',note:''}] }, null), null);
  assert.equal(scoreContext({ scoreRanges: [{max:4,label:'Minimal',note:''}] }, ''),   null);
});

test('scoreContext: PHQ-9-like bands return friendly { label, note }', () => {
  const meta = {
    scoreRanges: [
      { max: 4,  label: 'Minimal',           note: 'Little to no symptoms' },
      { max: 9,  label: 'Mild',              note: 'Mild mood changes' },
      { max: 14, label: 'Moderate',          note: 'Noticeable' },
      { max: 19, label: 'Moderately severe', note: 'Significant' },
      { max: 99, label: 'Severe',            note: 'High burden' },
    ],
  };
  assert.deepEqual(scoreContext(meta, 0),  { label: 'Minimal',           note: 'Little to no symptoms' });
  assert.deepEqual(scoreContext(meta, 9),  { label: 'Mild',              note: 'Mild mood changes' });
  assert.deepEqual(scoreContext(meta, 10), { label: 'Moderate',          note: 'Noticeable' });
  assert.deepEqual(scoreContext(meta, 19), { label: 'Moderately severe', note: 'Significant' });
  assert.deepEqual(scoreContext(meta, 27), { label: 'Severe',            note: 'High burden' });
});

test('scoreContext: NaN / non-numeric score returns null', () => {
  const meta = { scoreRanges: [{ max: 4, label: 'Minimal', note: '' }] };
  assert.equal(scoreContext(meta, 'abc'), null);
  assert.equal(scoreContext(meta, Infinity), null);
});

// ── draft storage ────────────────────────────────────────────────────────

test('draftStorageKey: prefixed by ds_assess_draft_', () => {
  assert.equal(draftStorageKey('abc-123'), 'ds_assess_draft_abc-123');
});

test('saveDraft + loadDraft: round-trip answers + savedAt', () => {
  const s = _mockStorage();
  const ok = saveDraft('assess-1', [0, 1, 2, null], s);
  assert.equal(ok, true);
  const out = loadDraft('assess-1', s);
  assert.ok(out, 'should load what was saved');
  assert.deepEqual(out.answers, [0, 1, 2, null]);
  assert.ok(out.savedAt, 'savedAt stamped');
});

test('loadDraft: missing key → null; malformed JSON → null', () => {
  const s1 = _mockStorage();
  assert.equal(loadDraft('none', s1), null);
  const s2 = _mockStorage({ 'ds_assess_draft_xx': '{not-json' });
  assert.equal(loadDraft('xx', s2), null);
  const s3 = _mockStorage({ 'ds_assess_draft_yy': '{"foo":"bar"}' });
  assert.equal(loadDraft('yy', s3), null); // missing `answers`
});

test('clearDraft: removes key', () => {
  const s = _mockStorage();
  saveDraft('assess-2', { 0: 3 }, s);
  assert.ok(loadDraft('assess-2', s));
  clearDraft('assess-2', s);
  assert.equal(loadDraft('assess-2', s), null);
});

// ── demoAssessmentSeed ───────────────────────────────────────────────────

test('demoAssessmentSeed: returns exactly 3 rows in the expected order', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const rows = demoAssessmentSeed(now);
  assert.equal(rows.length, 3);
  // Row 0 = PHQ-9 due today
  assert.equal(rows[0].template_id, 'phq9');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].due_date, new Date(now).toISOString());
  // Row 1 = PHQ-9 completed yesterday, score 9 (→ Mild band)
  assert.equal(rows[1].template_id, 'phq9');
  assert.equal(rows[1].status, 'completed');
  assert.equal(rows[1].score, 9);
  // Row 2 = GAD-7 upcoming in 3 days
  assert.equal(rows[2].template_id, 'gad7');
  assert.equal(rows[2].status, 'scheduled');
  assert.equal(rows[2].due_date, new Date(now + 3 * 86400000).toISOString());
});

test('demoAssessmentSeed: every row is tagged _demo so render can show the chip', () => {
  const rows = demoAssessmentSeed();
  for (const r of rows) assert.equal(r._demo, true);
});

test('demoAssessmentSeed: rows round-trip through classifyAssessmentStatus correctly', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const rows = demoAssessmentSeed(now);
  assert.equal(classifyAssessmentStatus(rows[0], now), 'due');
  assert.equal(classifyAssessmentStatus(rows[1], now), 'completed');
  assert.equal(classifyAssessmentStatus(rows[2], now), 'upcoming');
});
